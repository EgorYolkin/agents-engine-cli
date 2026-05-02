/**
 * @file Transcript compaction for context window management.
 *
 * When the conversation transcript grows beyond budget, the compactor
 * applies three strategies in order:
 *   1. Sliding window — keep only recent N user/assistant pairs
 *   2. Tool result compression — replace old tool outputs with summaries
 *   3. Summary injection — generate a summary of dropped entries (optional)
 */

import { estimateTokens } from "../context/tokenizer.js";

const DEFAULT_MAX_PAIRS = 20;

/**
 * Group transcript entries into user/assistant pairs.
 * A "pair" starts with a user message and includes all following
 * assistant messages until the next user message.
 *
 * @param {Array<{role: string, text: string, meta?: object}>} transcript
 * @returns {Array<Array<{role: string, text: string, meta?: object}>>}
 */
function groupIntoPairs(transcript) {
  const pairs = [];
  let current = null;

  for (const entry of transcript) {
    if (entry.role === "user") {
      if (current) pairs.push(current);
      current = [entry];
    } else if (current) {
      current.push(entry);
    }
  }
  if (current) pairs.push(current);

  return pairs;
}

/**
 * Compress a tool result entry into a short summary.
 * @param {object} entry
 * @returns {object}
 */
function compressToolEntry(entry) {
  if (entry.meta?.kind !== "tool_event") return entry;

  const title = entry.meta.title ?? "tool";
  const lines = (entry.text ?? "").split("\n");
  const firstLine = lines[0]?.trim() ?? "";

  let summary;
  if (title === "bash") {
    const cmd = firstLine.split("\n")[0] ?? "";
    summary = `[bash] ${cmd.slice(0, 80)}`;
  } else if (title === "write_file") {
    summary = `[write_file] ${firstLine.slice(0, 80)}`;
  } else {
    summary = `[${title}] ${firstLine.slice(0, 80)}`;
  }

  return {
    ...entry,
    text: summary,
    meta: { ...entry.meta, compressed: true },
  };
}

/**
 * Apply sliding window to keep only recent pairs.
 * Older pairs get tool results compressed.
 *
 * @param {Array<{role: string, text: string, meta?: object}>} transcript
 * @param {object} [options]
 * @param {number} [options.maxPairs] — number of recent pairs to keep in full
 * @returns {{ recent: Array, dropped: Array, compressed: boolean }}
 */
export function compactTranscript(transcript, options = {}) {
  const maxPairs = options.maxPairs ?? DEFAULT_MAX_PAIRS;

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return { recent: [], dropped: [], compressed: false };
  }

  const pairs = groupIntoPairs(transcript);

  if (pairs.length <= maxPairs) {
    return { recent: transcript, dropped: [], compressed: false };
  }

  const droppedPairs = pairs.slice(0, pairs.length - maxPairs);
  const recentPairs = pairs.slice(pairs.length - maxPairs);

  const dropped = [];
  for (const pair of droppedPairs) {
    for (const entry of pair) {
      if (entry.role === "user") {
        dropped.push(entry);
      } else {
        dropped.push(compressToolEntry(entry));
      }
    }
  }

  const recent = recentPairs.flat();

  return { recent, dropped, compressed: true };
}

/**
 * Estimate total tokens in a transcript.
 * @param {Array<{role: string, text: string}>} transcript
 * @returns {number}
 */
export function estimateTranscriptTokens(transcript) {
  if (!Array.isArray(transcript)) return 0;
  let total = 0;
  for (const entry of transcript) {
    total += estimateTokens(entry.text ?? "");
    total += 4; // role overhead
  }
  return total;
}

/**
 * Build a summary string from dropped transcript entries.
 * This is a lightweight, deterministic summary — no LLM call.
 *
 * @param {Array<{role: string, text: string, meta?: object}>} dropped
 * @returns {string}
 */
export function buildDroppedSummary(dropped) {
  if (!dropped || dropped.length === 0) return "";

  const userMessages = dropped.filter((e) => e.role === "user");
  const toolEvents = dropped.filter((e) => e.meta?.kind === "tool_event");
  const assistantMessages = dropped.filter(
    (e) => e.role === "assistant" && e.meta?.kind !== "tool_event",
  );

  const parts = [];
  parts.push(`Previous context (${userMessages.length} user messages, ${assistantMessages.length} assistant responses):`);

  if (toolEvents.length > 0) {
    const toolSummary = toolEvents
      .map((e) => {
        const title = e.meta?.title ?? "tool";
        const firstLine = (e.text ?? "").split("\n")[0]?.trim().slice(0, 60);
        return `${title}: ${firstLine}`;
      })
      .slice(0, 5)
      .join("; ");
    parts.push(`Tool usage: ${toolSummary}`);
  }

  const lastUser = userMessages.at(-1);
  if (lastUser) {
    parts.push(`Last topic: ${lastUser.text.slice(0, 100)}`);
  }

  return parts.join("\n");
}
