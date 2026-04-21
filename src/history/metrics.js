export function extractUsageTotals(usage) {
  if (!usage) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  }

  const totalTokens =
    usage.total_tokens ??
    usage.totalTokens ??
    usage.totalTokenCount ??
    usage.total_tokens_count;
  const inputTokens =
    usage.input_tokens ??
    usage.prompt_tokens ??
    usage.inputTokens ??
    usage.promptTokenCount ??
    usage.inputTokenCount ??
    0;
  const outputTokens =
    usage.output_tokens ??
    usage.completion_tokens ??
    usage.outputTokens ??
    usage.candidatesTokenCount ??
    usage.outputTokenCount ??
    0;

  return {
    inputTokens,
    outputTokens,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : inputTokens + outputTokens,
  };
}

export function aggregateMessagesMetrics(messages = []) {
  const startedAt = messages[0]?.timestamp ?? null;
  const endedAt = messages[messages.length - 1]?.timestamp ?? startedAt;
  let userMessages = 0;
  let assistantMessages = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;

  for (const message of messages) {
    if (message.role === "user") userMessages += 1;
    if (message.role === "assistant") assistantMessages += 1;
    const usage = extractUsageTotals(message.usage);
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    totalTokens += usage.totalTokens;
  }

  return {
    startedAt,
    endedAt,
    durationMs:
      startedAt && endedAt
        ? Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime())
        : 0,
    messageCount: messages.length,
    userMessages,
    assistantMessages,
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

export function mergeSessionMetaWithMetrics(meta = {}, metrics = {}) {
  return {
    id: meta.id ?? null,
    title: meta.title ?? null,
    provider: meta.provider ?? null,
    model: meta.model ?? null,
    createdAt: meta.createdAt ?? metrics.startedAt ?? null,
    updatedAt: meta.updatedAt ?? metrics.endedAt ?? meta.createdAt ?? null,
    messageCount: meta.messageCount ?? metrics.messageCount ?? 0,
    userMessages: meta.userMessages ?? metrics.userMessages ?? 0,
    assistantMessages: meta.assistantMessages ?? metrics.assistantMessages ?? 0,
    inputTokens: meta.inputTokens ?? metrics.inputTokens ?? 0,
    outputTokens: meta.outputTokens ?? metrics.outputTokens ?? 0,
    totalTokens: meta.totalTokens ?? metrics.totalTokens ?? 0,
    durationMs: meta.durationMs ?? metrics.durationMs ?? 0,
  };
}

export function aggregateSessionSummaries(summaries = []) {
  return summaries.reduce(
    (acc, summary) => ({
      sessionCount: acc.sessionCount + 1,
      messageCount: acc.messageCount + (summary.messageCount ?? 0),
      userMessages: acc.userMessages + (summary.userMessages ?? 0),
      assistantMessages: acc.assistantMessages + (summary.assistantMessages ?? 0),
      inputTokens: acc.inputTokens + (summary.inputTokens ?? 0),
      outputTokens: acc.outputTokens + (summary.outputTokens ?? 0),
      totalTokens: acc.totalTokens + (summary.totalTokens ?? 0),
      durationMs: acc.durationMs + (summary.durationMs ?? 0),
    }),
    {
      sessionCount: 0,
      messageCount: 0,
      userMessages: 0,
      assistantMessages: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      durationMs: 0,
    },
  );
}

export function formatTokenCount(value) {
  if (!Number.isFinite(value)) return "–";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}m`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "0m";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
