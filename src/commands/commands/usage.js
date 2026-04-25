import {
  aggregateSessionSummaries,
  formatTokenCount,
} from "../../history/metrics.js";
import { listSessions, loadSession } from "../../history/session.js";
import { printMushCard } from "../../ui/mush-card.js";
import { formatCwd, renderUsageTemplate } from "../helpers.js";
import { renderedResult } from "../results.js";

function renderStatsCard(context, rows) {
  process.stdout.write("\n");
  printMushCard(context, rows);
}

export const usageCommand = {
  name: "usage",
  descriptionKey: "commands.descriptions.usage",
  usage: "/usage",
  async execute({ context, config }) {
    const historyDir =
      context.config?.paths?.historyDir ?? config.paths.historyDir;
    const sessions = await listSessions(historyDir);
    const loaded = await Promise.all(
      sessions.map((session) => loadSession(historyDir, session.id)),
    );
    const totals = aggregateSessionSummaries(
      loaded.map((session) => session.meta ?? {}),
    );
    const usagePrompt =
      context.runtimeOverrides?.config?.ui?.usage_prompt ??
      config.ui?.usage_prompt;
    renderStatsCard(
      context,
      renderUsageTemplate(usagePrompt, {
        model: context.runtimeOverrides?.model ?? config.activeModel ?? "–",
        project: formatCwd(context.cwd),
        sessions: String(totals.sessionCount),
        messages: String(totals.messageCount),
        messagesUa: `${totals.userMessages}/${totals.assistantMessages}`,
        inputTokens: formatTokenCount(totals.inputTokens),
        outputTokens: formatTokenCount(totals.outputTokens),
        totalTokens: formatTokenCount(totals.totalTokens),
      }),
    );
    return renderedResult();
  },
};
