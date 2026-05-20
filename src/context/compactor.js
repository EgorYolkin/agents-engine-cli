import { getProvider } from "../providers/index.js";
import { saveArtifact } from "./artifact-store.js";

/**
 * L1: Offload
 * If an individual message's content is larger than 500 tokens,
 * it is offloaded: in Warm memory we only keep the summary, while
 * the database retains the full content.
 */
export function compactL1(artifact, fastEstimateTokensFn) {
  const contentTokens = fastEstimateTokensFn(artifact.content);
  if (contentTokens > 500) {
    const summaryText = artifact.summary || (artifact.content.slice(0, 150) + "...");
    return {
      ...artifact,
      content: summaryText,
      offloaded: true,
      tokens: fastEstimateTokensFn(summaryText)
    };
  }
  return artifact;
}

/**
 * L2: Compact
 * Retains only the last 4 messages (Hot-zone) in full text.
 * Earlier messages are replaced by their summaries.
 */
export function compactL2(transcript, fastEstimateTokensFn) {
  if (!Array.isArray(transcript) || transcript.length <= 4) {
    return { transcript, compacted: false };
  }

  let compacted = false;
  const result = [];
  const hotStartIndex = transcript.length - 4;

  for (let i = 0; i < transcript.length; i++) {
    const entry = transcript[i];
    if (i < hotStartIndex) {
      if (!entry.offloaded) {
        const summaryText = entry.summary || (entry.content.slice(0, 150) + "...");
        result.push({
          ...entry,
          content: summaryText,
          offloaded: true,
          tokens: fastEstimateTokensFn(summaryText)
        });
        compacted = true;
      } else {
        result.push(entry);
      }
    } else {
      result.push(entry);
    }
  }

  return { transcript: result, compacted };
}

/**
 * L3: Summarize
 * Triggers an async background LLM summarization call for messages older than the last 4 (last 2 full dialogue turns).
 * Once completed, calls onComplete callback with the new consolidated summary.
 */
export async function compactL3(transcript, {
  db,
  sessionId,
  config,
  providerId,
  modelId,
  fastEstimateTokensFn,
  onComplete
}) {
  if (!Array.isArray(transcript) || transcript.length <= 4) {
    return null;
  }

  const olderMessages = transcript.slice(0, transcript.length - 4);
  const hotMessages = transcript.slice(transcript.length - 4);

  // Format conversation history for LLM
  const historyText = olderMessages
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n\n");

  const prompt = [
    "You are a compacting helper. Summarize the following dialogue history between User and Assistant into a single highly dense, concise paragraph.",
    "Preserve key facts, decisions, files mentioned, and code context. Do not use generic introductions or boilerplate.",
    "",
    "Dialogue History:",
    historyText
  ].join("\n");

  // Non-blocking background call
  const provider = getProvider(providerId);
  provider.exec(config, prompt, { model: modelId, thinkingLevel: "off" })
    .then(async (response) => {
      const summaryText = (response.text || "").trim();
      if (!summaryText) return;

      const summaryId = `summary-${Date.now()}`;
      const summaryArtifact = {
        id: summaryId,
        role: "assistant",
        content: `[Previous Context Summary]: ${summaryText}`,
        summary: `Summary of previous ${olderMessages.length} turns`,
        tokens: fastEstimateTokensFn(`[Previous Context Summary]: ${summaryText}`),
        ts: Math.floor(Date.now() / 1000),
        session_id: sessionId,
        intent: "general",
        importance: 1.0,
        offloaded: false
      };

      // Save summary artifact to Cold database
      if (db) {
        await saveArtifact(db, summaryArtifact);
      }

      // Invoke callback to update UI/scene state
      if (typeof onComplete === "function") {
        onComplete({
          summaryArtifact,
          hotMessages
        });
      }
    })
    .catch((err) => {
      console.error("[L3 Compaction Error]:", err);
    });

  return true;
}
