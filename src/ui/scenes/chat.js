import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import { getProvider } from "../../providers/index.js";
import { createPassiveInputBuffer, promptInput } from "../input.js";
import { DOT_CHOICES, executeCommand } from "../../commands/index.js";
import { loadConfig, saveState } from "../../config/loader.js";
import { runProviderWithTools } from "../../tools/orchestrator.js";
import { createSession, recordMessage } from "../../history/session.js";
import { formatDuration, formatTokenCount } from "../../history/metrics.js";
import { printMushCard } from "../mush-card.js";

// ─── Layout ───────────────────────────────────────────────────────────────────

function activeTheme(context) {
  return context.ui?.theme ?? {};
}

function color(theme, name, fallback = chalk.white) {
  return theme.colors?.[name] ?? fallback;
}

function frameWidth() {
  const columns = process.stdout.columns || 96;
  return Math.max(6, Math.min(columns - 1, 92));
}

function wrapText(text, width, indent) {
  const rows = [];
  const maxWidth = Math.max(1, width);

  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      rows.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      if (word.length > maxWidth) {
        if (line) {
          rows.push(line);
          line = "";
        }

        for (let start = 0; start < word.length; start += maxWidth) {
          const chunk = word.slice(start, start + maxWidth);
          if (chunk.length === maxWidth || start + maxWidth < word.length) {
            rows.push(`${indent}${chunk}`);
          } else {
            line = `${indent}${chunk}`;
          }
        }
        continue;
      }

      const next = line ? `${line} ${word}` : word;
      if (next.length > maxWidth && line) {
        rows.push(line);
        line = `${indent}${word}`;
      } else {
        line = next;
      }
    }
    rows.push(line);
  }

  return rows;
}

function visibleLength(value) {
  return value.length;
}

function fitText(value, width) {
  const length = visibleLength(value);
  if (length <= width) return value + " ".repeat(width - length);
  if (width <= 1) return " ".repeat(width);
  return `${value.slice(0, width - 1)}…`;
}

function formatCwd(cwd) {
  const home = os.homedir();
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function formatFolder(cwd) {
  return path.basename(cwd) || cwd;
}

function extractTotalTokens(usage) {
  if (!usage) return null;
  const direct =
    usage.total_tokens ??
    usage.totalTokens ??
    usage.totalTokenCount ??
    usage.total_tokens_count;
  if (Number.isFinite(direct)) return direct;

  const input =
    usage.input_tokens ??
    usage.prompt_tokens ??
    usage.inputTokens ??
    usage.promptTokenCount ??
    usage.inputTokenCount;
  const output =
    usage.output_tokens ??
    usage.completion_tokens ??
    usage.outputTokens ??
    usage.candidatesTokenCount ??
    usage.outputTokenCount;

  if (Number.isFinite(input) || Number.isFinite(output)) {
    return (input ?? 0) + (output ?? 0);
  }

  return null;
}

function formatUsage(usage) {
  return formatTokenCount(extractTotalTokens(usage));
}

function inputStatus(context, tokens) {
  const startedAt = context.currentSessionMeta?.createdAt ?? context.currentSessionStartedAt ?? null;
  const sessionDurationMs = startedAt
    ? Math.max(0, Date.now() - new Date(startedAt).getTime())
    : 0;
  return {
    folder: formatFolder(context.cwd ?? process.cwd()),
    model: context.runtimeOverrides.model ?? context.config.activeModel,
    thinking:
      context.runtimeOverrides.thinkingLevel ??
      context.config.thinkingLevel ??
      "medium",
    tokens,
    messages: String(context.currentSessionMetrics?.messageCount ?? 0),
    sessionTokens: formatTokenCount(context.currentSessionMetrics?.totalTokens ?? 0),
    sessionTime: formatDuration(sessionDurationMs),
    template:
      context.runtimeOverrides.config?.ui?.statusbar_prompt ??
      context.config.ui?.statusbar_prompt,
  };
}

const PENDING_SUFFIXES = [".", "..", "...", ".."];

function formatPendingLine(context, frameIndex) {
  const theme = activeTheme(context);
  const muted = color(theme, "muted", chalk.dim);
  const marker = DOT_CHOICES[frameIndex % DOT_CHOICES.length] ?? "⬢";
  const suffix = PENDING_SUFFIXES[frameIndex % PENDING_SUFFIXES.length];
  return muted(`${marker} Mushing${suffix}`);
}

function splash(context) {
  const model = context.runtimeOverrides.model ?? context.config.activeModel;
  const level = context.runtimeOverrides.thinkingLevel ?? context.config.thinkingLevel ?? "medium";
  const provider = context.runtimeOverrides.providerId ?? context.config.activeProvider;
  const cwd = formatCwd(context.cwd ?? process.cwd());
  const theme = activeTheme(context);
  const dot = context.config.ui?.message_dot ?? theme.symbols?.messageDot ?? "⬢";
  const muted = color(theme, "muted", chalk.dim);
  const appVersion = context.appVersion ?? "–";

  printMushCard(context, [
    { text: `${dot}  ${provider}/${model} ( ${level} effort )`, paint: muted },
    { text: `${dot}  ${cwd}`, paint: muted },
    { text: `${dot}  v${appVersion}`, paint: muted },
  ]);
}

// ─── Messages — вне рамки ─────────────────────────────────────────────────────

function buildMessageLines(text, width) {
  const lines = [];

  for (const rawLine of text.split("\n")) {
    const fence = rawLine.match(/^```(\w+)?\s*$/);
    if (fence) continue;

    const wrapped = wrapText(rawLine, width, "");
    if (wrapped.length === 0) {
      lines.push("");
      continue;
    }

    lines.push(...wrapped);
  }

  return lines.length > 0 ? lines : [""];
}

function normalizeCompareText(text) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function printUserMessage(text, context) {
  const theme = activeTheme(context);
  const symbol = context.config.ui?.message_dot ?? theme.symbols?.messageDot ?? "⬢";
  const bodyLines = buildMessageLines(text, Math.max(1, (process.stdout.columns || 80) - 4));
  const white = chalk.white;

  process.stdout.write(`${white("╭─")}\n`);
  process.stdout.write(`${white(`${symbol}\u00A0${bodyLines[0] ?? ""}`)}\n`);
  for (let index = 1; index < bodyLines.length; index += 1) {
    process.stdout.write(`${white(`  ${bodyLines[index]}`)}\n`);
  }
  process.stdout.write(`${white("╰─")}\n`);
  return bodyLines.length + 2;
}

function printAiMessage(text, context) {
  const theme = activeTheme(context);
  const symbol = context.config.ui?.message_dot ?? theme.symbols?.messageDot ?? "⬢";
  const accent = color(theme, "accent", chalk.magenta);
  const name = theme.layout?.agentName ?? "mr. mush";
  const railPrefix = "│ ";
  const contentWidth = Math.max(1, (process.stdout.columns || 80) - railPrefix.length - 1);
  const bodyLines = buildMessageLines(text, contentWidth);

  process.stdout.write(`${accent("╭─")}\n`);
  process.stdout.write(`${accent(`${symbol}\u00A0${name}`)}\n`);
  for (const line of bodyLines) {
    const padded = line + " ".repeat(Math.max(0, contentWidth - visibleLength(line)));
    process.stdout.write(`${accent("│ ")}${chalk.white(padded)}\n`);
  }
  process.stdout.write(`${accent("╰─")}\n`);
  return bodyLines.length + 3;
}

function highlightCodeLine(line) {
  return line
    .replace(/\b(const|let|var|function|return|if|else|for|while|import|from|export|class|async|await|def|print|in|try|except)\b/g, (match) => chalk.hex("#c084fc")(match))
    .replace(/(["'`])([^"'`]*)(\1)/g, (match) => chalk.green(match))
    .replace(/\b(\d+)\b/g, (match) => chalk.yellow(match));
}

function printMessageBody(text, { prefix, width }) {
  let inCode = false;
  let count = 0;

  for (const rawLine of text.split("\n")) {
    const fence = rawLine.match(/^```(\w+)?\s*$/);
    if (fence) {
      inCode = !inCode;
      continue;
    }

    if (inCode) {
      process.stdout.write(`${prefix}${chalk.dim("│ ")}${highlightCodeLine(rawLine)}\n`);
      count += 1;
      continue;
    }

    const lines = wrapText(rawLine, width, "");
    for (const line of lines) {
      process.stdout.write(`${prefix}${line}\n`);
      count += 1;
    }
  }

  return count;
}

function buildMessagesFromTranscript(promptStack, transcript, currentPrompt) {
  const messages = [];
  if (promptStack?.text) {
    messages.push({ role: "system", content: promptStack.text });
  }
  for (const entry of transcript) {
    messages.push({ role: entry.role === "assistant" ? "assistant" : "user", content: entry.text });
  }
  messages.push({ role: "user", content: currentPrompt });
  return messages;
}

// ─── Main loop ────────────────────────────────────────────────────────────────

export async function runChatScreen(context) {
  const { i18n } = context;
  const transcript = [];
  let queuedInput = "";
  let lastTokens = "–";
  let passiveInput = null;
  let resizeHandler = null;

  // Create a new history session
  const historyDir = context.config.paths.historyDir;
  const providerId = context.runtimeOverrides.providerId ?? context.config.activeProvider;
  const model = context.runtimeOverrides.model ?? context.config.activeModel;
  let currentSession = null;
  try {
    currentSession = await createSession(historyDir, { provider: providerId, model });
    context.currentSession = currentSession;
    context.currentSessionMeta = {
      id: currentSession.id,
      createdAt: new Date().toISOString(),
      provider: providerId,
      model,
      messageCount: 0,
      totalTokens: 0,
    };
    context.currentSessionStartedAt = context.currentSessionMeta.createdAt;
    context.currentSessionMetrics = { messageCount: 0, totalTokens: 0 };
  } catch {
    // history unavailable — continue without persistence
  }

  function teardownViewport() {
    if (resizeHandler) {
      process.stdout.removeListener("resize", resizeHandler);
      resizeHandler = null;
    }
  }

  function setupViewport() {
    process.stdout.write("\x1b[H\x1b[J");
  }

  function renderTranscriptEntry(entry) {
    if (entry.role === "user") {
      printUserMessage(entry.text, context);
    } else {
      printAiMessage(entry.text, context);
    }
    process.stdout.write("\n");
  }

  function redrawScreen({ pendingLine = "", streamingText = "", renderInput = null } = {}) {
    process.stdout.write("\x1b[H\x1b[J");
    process.stdout.write("\n");
    splash(context);

    for (const entry of transcript) {
      renderTranscriptEntry(entry);
    }

    if (pendingLine) {
      process.stdout.write(`${pendingLine}\n`);
    }

    if (streamingText) {
      printAiMessage(streamingText, context);
      process.stdout.write("\n");
    }

    if (renderInput) {
      renderInput();
    }
  }

  setupViewport();
  redrawScreen();

  try {
    while (true) {
    const providerId = context.runtimeOverrides.providerId ?? context.config.activeProvider;
    const model = context.runtimeOverrides.model ?? context.config.activeModel;
    const provider = getProvider(providerId, i18n);

    let text;
    try {
      text = (
        await promptInput(
          i18n,
          activeTheme(context),
          queuedInput,
          inputStatus(context, lastTokens),
          (renderInput) => redrawScreen({ renderInput }),
          [...transcript].filter((e) => e.role === "user").map((e) => e.text).reverse(),
        )
      ).trim();
      queuedInput = "";
    } catch {
      break;
    }

    if (!text) {
      continue;
    }

    // Команды
    if (text.startsWith("/")) {
      transcript.push({ role: "user", text });
      context.currentSessionMetrics = {
        ...(context.currentSessionMetrics ?? { messageCount: 0, totalTokens: 0 }),
        messageCount: (context.currentSessionMetrics?.messageCount ?? 0) + 1,
        totalTokens: context.currentSessionMetrics?.totalTokens ?? 0,
      };
      if (currentSession) {
        recordMessage(historyDir, currentSession.id, { role: "user", content: text }).catch(() => {});
      }
      redrawScreen();
      const commandResult = await executeCommand(text, context);
      context.config = await loadConfig({
        cwd: context.cwd,
        runtimeOverrides: context.runtimeOverrides,
      });
      if (context.resumedSession) {
        const resumed = context.resumedSession;
        context.resumedSession = null;
        currentSession = { id: resumed.id, filePath: resumed.filePath };
        context.currentSession = currentSession;
        context.currentSessionMeta = resumed.meta ?? null;
        context.currentSessionStartedAt = resumed.meta?.createdAt ?? null;
        context.currentSessionMetrics = {
          messageCount: resumed.meta?.messageCount ?? 0,
          totalTokens: resumed.meta?.totalTokens ?? 0,
        };
        transcript.splice(0, transcript.length, ...resumed.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, text: m.content })));
        redrawScreen();
      } else {
        if (commandResult?.rendered) {
          continue;
        }
        if (commandResult?.message) {
          transcript.push({ role: "assistant", text: commandResult.message });
          context.currentSessionMetrics = {
            ...(context.currentSessionMetrics ?? { messageCount: 0, totalTokens: 0 }),
            messageCount: (context.currentSessionMetrics?.messageCount ?? 0) + 1,
            totalTokens: context.currentSessionMetrics?.totalTokens ?? 0,
          };
          if (currentSession) {
            recordMessage(historyDir, currentSession.id, {
              role: "assistant",
              content: commandResult.message,
            }).catch(() => {});
          }
        }
        redrawScreen();
      }
      continue;
    }

    transcript.push({ role: "user", text });
    context.currentSessionMetrics = {
      ...(context.currentSessionMetrics ?? { messageCount: 0, totalTokens: 0 }),
      messageCount: (context.currentSessionMetrics?.messageCount ?? 0) + 1,
      totalTokens: context.currentSessionMetrics?.totalTokens ?? 0,
    };
    if (currentSession) {
      recordMessage(historyDir, currentSession.id, { role: "user", content: text }).catch(() => {});
    }
    redrawScreen();
    const abort = new AbortController();
    const stopThinking = () => {};
    const shouldStream = provider.source !== "cli";
    let streamedText = "";
    let hasStoppedThinking = false;
    let inputVisible = false;
    let pendingFrameIndex = 0;
    let pendingAnimation = null;
    let streamRedrawTimer = null;
    let streamFrameVisible = false;

    function stopThinkingOnce() {
      if (hasStoppedThinking) return;
      stopThinking();
      hasStoppedThinking = true;
    }

    function clearVisibleInput() {
      if (!inputVisible) return;
      queuedInput = passiveInput.getBuffer();
      passiveInput.clear();
      inputVisible = false;
    }

    function redrawInputBelow() {
      if (!passiveInput) return;
      passiveInput.resetMetrics();
      passiveInput.render();
      inputVisible = true;
    }

    function renderPendingState() {
      redrawScreen({
        pendingLine: formatPendingLine(context, pendingFrameIndex),
        renderInput: inputVisible ? () => redrawInputBelow() : null,
      });
    }

    function startPendingAnimation() {
      if (pendingAnimation) return;
      renderPendingState();
      pendingAnimation = setInterval(() => {
        pendingFrameIndex += 1;
        renderPendingState();
      }, 220);
    }

    function stopPendingAnimation() {
      if (!pendingAnimation) return;
      clearInterval(pendingAnimation);
      pendingAnimation = null;
    }

    function renderStreamingState() {
      redrawScreen({
        streamingText: streamedText,
        renderInput: inputVisible ? () => redrawInputBelow() : null,
      });
      streamFrameVisible = streamedText.length > 0;
    }

    function scheduleStreamRender() {
      if (streamRedrawTimer) return;
      streamRedrawTimer = setTimeout(() => {
        streamRedrawTimer = null;
        renderStreamingState();
      }, 33);
    }

    function flushStreamRender() {
      if (streamRedrawTimer) {
        clearTimeout(streamRedrawTimer);
        streamRedrawTimer = null;
      }
      if (streamedText) {
        renderStreamingState();
      }
    }

    resizeHandler = () => {
      if (shouldStream && streamFrameVisible) {
        renderStreamingState();
        return;
      }
      renderPendingState();
    };

    let response;
    try {
      passiveInput = createPassiveInputBuffer(i18n, activeTheme(context), {
        onEscape: () => abort.abort(),
        status: inputStatus(context, lastTokens),
        autoResize: false,
      });
      inputVisible = true;
      process.stdout.on("resize", resizeHandler);
      startPendingAnimation();
      const messages = buildMessagesFromTranscript(context.config.promptStack, transcript, text);
      response = await runProviderWithTools({
        provider,
        config: context.config,
        prompt: text,
        messages,
        runtimeOverrides: context.runtimeOverrides,
        signal: abort.signal,
        context,
        onToken: shouldStream
          ? (token) => {
              stopPendingAnimation();
              stopThinkingOnce();
              streamedText += token;
              scheduleStreamRender();
            }
          : null,
        beforeApproval: () => {
          stopPendingAnimation();
          if (passiveInput) {
            clearVisibleInput();
            queuedInput = passiveInput.stop();
            passiveInput = null;
          }
        },
        afterApproval: () => {
          startPendingAnimation();
          if (!passiveInput) {
            passiveInput = createPassiveInputBuffer(i18n, activeTheme(context), {
              onEscape: () => abort.abort(),
              status: inputStatus(context, lastTokens),
              autoResize: false,
            });
            inputVisible = true;
          }
          redrawInputBelow();
        },
        beforeToolCall: () => {},
      });
      lastTokens = formatUsage(response.usage);
      await saveState({
        ...context.config.state,
        schemaVersion: context.config.schema_version,
        lastUsedProvider: providerId,
        lastUsedModel: model,
        lastUsedProfile: context.runtimeOverrides.profile ?? context.config.activeProfile,
        lastPromptAt: new Date().toISOString(),
      }, context.config.paths);
    } catch (err) {
      stopPendingAnimation();
      if (streamRedrawTimer) {
        clearTimeout(streamRedrawTimer);
        streamRedrawTimer = null;
      }
      if (resizeHandler) {
        process.stdout.removeListener("resize", resizeHandler);
        resizeHandler = null;
      }
      stopThinkingOnce();
      if (passiveInput) {
        queuedInput = passiveInput.stop();
        passiveInput = null;
        inputVisible = false;
      }
      if (abort.signal.aborted) {
        process.stdout.write(
          "\r\x1b[J\n  " + chalk.dim(i18n.t("chat.messages.aborted")) + "\n",
        );
      } else {
        process.stdout.write(
          "\n  " +
            chalk.red(
              i18n.t("chat.errors.requestFailed", { message: err.message }),
            ) +
            "\n",
        );
      }
      continue;
    }

    if (resizeHandler) {
      process.stdout.removeListener("resize", resizeHandler);
      resizeHandler = null;
    }
    stopPendingAnimation();
    flushStreamRender();
    stopThinkingOnce();
    if (shouldStream) {
      if (passiveInput) {
        queuedInput = passiveInput.stop();
        passiveInput = null;
        inputVisible = false;
      }
      const assistantText = response.text || streamedText;
      if (assistantText) {
        transcript.push({ role: "assistant", text: assistantText });
        context.currentSessionMetrics = {
          ...(context.currentSessionMetrics ?? { messageCount: 0, totalTokens: 0 }),
          messageCount: (context.currentSessionMetrics?.messageCount ?? 0) + 1,
          totalTokens: (context.currentSessionMetrics?.totalTokens ?? 0) + (extractTotalTokens(response.usage) ?? 0),
        };
        if (currentSession) {
          recordMessage(historyDir, currentSession.id, { role: "assistant", content: assistantText, usage: response.usage ?? null }).catch(() => {});
        }
        redrawScreen();
      }
    } else {
      process.stdout.write("\x1b[1A\r\x1b[2K");
      transcript.push({ role: "assistant", text: response.text });
      context.currentSessionMetrics = {
        ...(context.currentSessionMetrics ?? { messageCount: 0, totalTokens: 0 }),
        messageCount: (context.currentSessionMetrics?.messageCount ?? 0) + 1,
        totalTokens: (context.currentSessionMetrics?.totalTokens ?? 0) + (extractTotalTokens(response.usage) ?? 0),
      };
      if (currentSession) {
        recordMessage(historyDir, currentSession.id, { role: "assistant", content: response.text, usage: response.usage ?? null }).catch(() => {});
      }
      redrawScreen();
    }
    process.stdout.write("\n");
  }
  } finally {
    teardownViewport();
  }
}
