import fs from "node:fs/promises";
import { appendMessage, readIndex, readMessages, sessionFilePath, writeIndex } from "./store.js";
import { aggregateMessagesMetrics, extractUsageTotals, mergeSessionMetaWithMetrics } from "./metrics.js";

function generateId() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${rand}`;
}

export function generateTitle(firstMessage) {
  const text = firstMessage.trim().replace(/\s+/g, " ");
  if (text.length <= 60) return text;
  const truncated = text.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}

export async function createSession(historyDir, { provider, model } = {}) {
  const id = generateId();
  const now = new Date().toISOString();
  const filePath = sessionFilePath(historyDir, id);
  await fs.writeFile(filePath, "", "utf8");

  const index = await readIndex(`${historyDir}/index.json`);
  index[id] = {
    id,
    title: null,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    userMessages: 0,
    assistantMessages: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    durationMs: 0,
    provider: provider ?? null,
    model: model ?? null,
  };
  await writeIndex(`${historyDir}/index.json`, index);

  return { id, filePath };
}

export async function loadSession(historyDir, sessionId) {
  const filePath = sessionFilePath(historyDir, sessionId);
  const messages = await readMessages(filePath);
  const index = await readIndex(`${historyDir}/index.json`);
  const meta = index[sessionId] ?? null;
  const computed = aggregateMessagesMetrics(messages);
  return {
    id: sessionId,
    filePath,
    messages,
    meta: mergeSessionMetaWithMetrics(meta ?? {}, computed),
  };
}

export async function listSessions(historyDir) {
  const index = await readIndex(`${historyDir}/index.json`);
  return Object.values(index).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteSession(historyDir, sessionId) {
  const filePath = sessionFilePath(historyDir, sessionId);
  try {
    await fs.unlink(filePath);
  } catch {
    // file may not exist
  }
  const index = await readIndex(`${historyDir}/index.json`);
  delete index[sessionId];
  await writeIndex(`${historyDir}/index.json`, index);
}

export async function updateSessionMeta(historyDir, sessionId, patch) {
  const index = await readIndex(`${historyDir}/index.json`);
  if (!index[sessionId]) return;
  index[sessionId] = { ...index[sessionId], ...patch, updatedAt: new Date().toISOString() };
  await writeIndex(`${historyDir}/index.json`, index);
}

export async function recordMessage(historyDir, sessionId, message) {
  const filePath = sessionFilePath(historyDir, sessionId);
  await appendMessage(filePath, { ...message, timestamp: new Date().toISOString() });

  const index = await readIndex(`${historyDir}/index.json`);
  if (index[sessionId]) {
    const updatedAt = new Date().toISOString();
    const usage = extractUsageTotals(message.usage);
    index[sessionId].messageCount = (index[sessionId].messageCount ?? 0) + 1;
    index[sessionId].updatedAt = updatedAt;
    index[sessionId].userMessages = (index[sessionId].userMessages ?? 0) + (message.role === "user" ? 1 : 0);
    index[sessionId].assistantMessages = (index[sessionId].assistantMessages ?? 0) + (message.role === "assistant" ? 1 : 0);
    index[sessionId].inputTokens = (index[sessionId].inputTokens ?? 0) + usage.inputTokens;
    index[sessionId].outputTokens = (index[sessionId].outputTokens ?? 0) + usage.outputTokens;
    index[sessionId].totalTokens = (index[sessionId].totalTokens ?? 0) + usage.totalTokens;
    index[sessionId].durationMs = Math.max(
      0,
      new Date(updatedAt).getTime() - new Date(index[sessionId].createdAt).getTime(),
    );
    if (!index[sessionId].title && message.role === "user") {
      index[sessionId].title = generateTitle(message.content);
    }
    await writeIndex(`${historyDir}/index.json`, index);
  }
}
