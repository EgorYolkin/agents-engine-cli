import fs from "node:fs/promises";

import { runProviderWithTools } from "../tools/orchestrator.js";

const PROMPTS_BASE_URL = new URL("../prompts/agents/", import.meta.url);

export const WORKER_REGISTRY = Object.freeze({
  devops: { systemPromptFile: "devops-agent.md", maxCalls: 12 },
  backend: { systemPromptFile: "backend-agent.md", maxCalls: 10 },
  frontend: { systemPromptFile: "frontend-agent.md", maxCalls: 10 },
  analysis: { systemPromptFile: "analysis-agent.md", maxCalls: 4 },
  general: { systemPromptFile: null, maxCalls: 8 },
});

async function readWorkerPrompt(systemPromptFile) {
  if (!systemPromptFile) return "";
  return fs.readFile(new URL(systemPromptFile, PROMPTS_BASE_URL), "utf8");
}

function buildPromptStack(basePromptStack, workerPrompt) {
  const segments = [
    basePromptStack?.text?.trim(),
    workerPrompt.trim(),
  ].filter(Boolean);

  return {
    layers: basePromptStack?.layers ?? [],
    text: segments.join("\n\n"),
  };
}

function buildWorkerMessages(promptStack, prompt) {
  const messages = [];
  if (promptStack?.text) {
    messages.push({ role: "system", content: promptStack.text });
  }
  messages.push({ role: "user", content: prompt });
  return messages;
}

function emitDebug(taskContext, message) {
  if (typeof taskContext?.onDebugEvent === "function") {
    taskContext.onDebugEvent(message);
  }
}

export async function spawnWorker(domain, taskContext) {
  const worker = WORKER_REGISTRY[domain] ?? WORKER_REGISTRY.general;
  const workerPrompt = await readWorkerPrompt(worker.systemPromptFile);
  emitDebug(
    taskContext,
    `worker: spawn domain=${domain} provider=${taskContext.provider?.id ?? "unknown"} model=${taskContext.runtimeOverrides?.model ?? taskContext.config?.activeModel} prompt=${worker.systemPromptFile ?? "<none>"} max_calls=${worker.maxCalls}`,
  );
  const workerConfig = {
    ...taskContext.config,
    tools: {
      ...taskContext.config.tools,
      bash: {
        ...taskContext.config.tools?.bash,
        max_calls: worker.maxCalls,
      },
    },
    promptStack: buildPromptStack(taskContext.config.promptStack, workerPrompt),
  };
  emitDebug(
    taskContext,
    `worker: prompt stack prepared layers=${workerConfig.promptStack?.layers?.length ?? 0} extra_system_prompt=${worker.systemPromptFile ? "yes" : "no"}`,
  );

  return runProviderWithTools({
    provider: taskContext.provider,
    config: workerConfig,
    prompt: taskContext.prompt,
    messages: buildWorkerMessages(workerConfig.promptStack, taskContext.prompt),
    runtimeOverrides: taskContext.runtimeOverrides,
    signal: taskContext.signal,
    context: {
      ...taskContext.context,
    },
    onToken: taskContext.onToken ?? null,
    beforeApproval: taskContext.beforeApproval ?? null,
    afterApproval: taskContext.afterApproval ?? null,
    beforeToolCall: taskContext.beforeToolCall ?? null,
    onAssistantToolIntent: taskContext.onAssistantToolIntent ?? null,
    onToolResult: taskContext.onToolResult ?? null,
  });
}
