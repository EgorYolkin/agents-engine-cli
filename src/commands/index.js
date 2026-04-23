import chalk from "chalk";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  backupFile,
  loadConfig,
  parseConfigValue,
  saveConfig,
  saveConfigPatch,
} from "../config/loader.js";
import { openSessionBrowser } from "../history/browser.js";
import { aggregateSessionSummaries, formatTokenCount } from "../history/metrics.js";
import { listSessions, loadSession } from "../history/session.js";
import { printMushCard } from "../ui/mush-card.js";
import { runSetupScreen, selectProviderAndModel } from "../ui/scenes/setup.js";
import { createThemeTemplate } from "../ui/theme.js";

export const DOT_CHOICES = [
  "✦", "⌁", "⁛", "⧉", "⬩", "✲", "✧", "✺", "⋆", "❈", "❯", "⊞", "⚬", "⁝", "⊹", "▰", "▱", "◈", "❖", "◬", "⬢", "⧇", "✬", "✫", "☄", "☾", "☽", "❂", "✵", "➱", "⚙", "⚯", "⑇", "♾", "⚡", "✿", "✽", "❀", "❦", "✥", "╾", "╼", "⁖", "▓", "▒", "░", "⟦", "⟧", "❮", "ᗢ", "⚆", "ꕤ", "ೃ", "༄", "✾", "❁", "❃", "❄", "❅", "❆", "❉", "❊", "❋", "✱", "✳", "✴", "✶", "✷", "✸", "✹", "✻", "✼", "✩", "✪", "✭", "✮", "✯", "✰", "⁕", "⁗", "⁘", "⁙", "⁚", "⁜", "⁞", "⍟", "⊛", "⊜", "⊝", "⊟", "⊠", "⊡", "⋇", "⋈", "⋉", "⋊", "⋋", "⋌", "⋍", "⋎", "⋏", "⋐", "⋑", "⋒", "⋓", "⋔", "⋕", "⋖", "⋗", "⋘", "⋙", "⋚", "⋛", "⋜", "⋝", "⋞", "⋟"
];

export const COMMANDS = [
  {
    name: "think",
    descriptionKey: "commands.descriptions.think",
    args: [
      { value: "off", descriptionKey: "commands.args.off" },
      { value: "minimal", descriptionKey: "commands.args.minimal" },
      { value: "low", descriptionKey: "commands.args.low" },
      { value: "medium", descriptionKey: "commands.args.medium" },
      { value: "high", descriptionKey: "commands.args.high" },
      { value: "xhigh", descriptionKey: "commands.args.xhigh" }
    ]
  },
  { name: "config", descriptionKey: "commands.descriptions.config" },
  { name: "provider", descriptionKey: "commands.descriptions.provider" },
  { name: "model", descriptionKey: "commands.descriptions.model" },
  { name: "profile", descriptionKey: "commands.descriptions.profile" },
  { name: "prompt", descriptionKey: "commands.descriptions.prompt" },
  { name: "resume", descriptionKey: "commands.descriptions.resume" },
  { name: "card", descriptionKey: "commands.descriptions.card" },
  { name: "usage", descriptionKey: "commands.descriptions.usage" },
  {
    name: "debug",
    descriptionKey: "commands.descriptions.debug",
    args: [
      { value: "on", descriptionKey: "commands.args.on" },
      { value: "off", descriptionKey: "commands.args.offToggle" },
    ]
  },
  { name: "inittheme", descriptionKey: "commands.descriptions.inittheme" },
  { name: "onboard", descriptionKey: "commands.descriptions.onboard" },
  { name: "statusbar", descriptionKey: "commands.descriptions.statusbar" },
  {
    name: "dot",
    descriptionKey: "commands.descriptions.dot",
    args: DOT_CHOICES.map((dot) => ({
      value: dot,
      descriptionKey: "commands.args.dot"
    }))
  }
];

export function getSuggestions(buffer, i18n) {
  if (!buffer.startsWith("/")) return [];

  const withoutSlash = buffer.slice(1);
  const spaceIdx = withoutSlash.indexOf(" ");

  if (spaceIdx === -1) {
    return COMMANDS.filter((command) => command.name.startsWith(withoutSlash)).map(
      (command) => ({
        label: `/${command.name}`,
        description: i18n?.raw(command.descriptionKey) ?? command.descriptionKey,
        complete: `/${command.name} `
      }),
    );
  }

  const cmdName = withoutSlash.slice(0, spaceIdx);
  const argPrefix = withoutSlash.slice(spaceIdx + 1);
  const command = COMMANDS.find((entry) => entry.name === cmdName);
  if (!command?.args) return [];

  return command.args
    .filter((arg) => arg.value.startsWith(argPrefix))
    .map((arg) => ({
      label: arg.value,
      description: i18n?.raw(arg.descriptionKey) ?? arg.descriptionKey,
      complete: `/${cmdName} ${arg.value}`
    }));
}

const EFFORT_MAP = {
  off: null,
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh"
};

function successResult(message) {
  return { handled: true, message };
}

function renderedResult() {
  return { handled: true, rendered: true };
}

function errorResult(message, i18n) {
  return {
    handled: true,
    message: `${i18n.t("commands.messages.errorPrefix")} ${message}`,
  };
}

function getPromptLayerPath(layer, config, i18n) {
  switch (layer) {
    case "system":
      return config.paths.systemPromptFile;
    case "profile":
      return config.paths.profilePromptFile(config.activeProfile);
    case "provider":
      return config.paths.providerPromptFile(config.activeProvider);
    case "project":
      return config.paths.projectPromptFile;
    default:
      throw new Error(i18n.t("commands.errors.unknownPromptLayer", { layer }));
  }
}

async function openEditor(filePath, editor, i18n) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const child = spawn(editor, [filePath], { stdio: "inherit" });

  await new Promise((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(i18n.t("commands.errors.editorExited", { editor, code })),
      );
    });
    child.on("error", reject);
  });
}

function formatConfigView(config, runtimeOverrides) {
  return JSON.stringify(
    {
      active_provider: config.activeProvider,
      active_model: config.activeModel,
      active_profile: config.activeProfile,
      thinking: runtimeOverrides.thinkingLevel ?? config.thinkingLevel,
      prompt_layers: config.promptStack.layers.map((layer) => layer.source),
      config_file: config.paths.configFile,
    },
    null,
    2,
  );
}

function renderStatsCard(context, rows) {
  process.stdout.write("\n");
  printMushCard(context, rows);
}

function formatCwd(cwd) {
  const home = os.homedir();
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function renderUsageTemplate(template, values) {
  return template
    .replaceAll("{model}", values.model)
    .replaceAll("{project}", values.project)
    .replaceAll("{sessions}", values.sessions)
    .replaceAll("{messages}", values.messages)
    .replaceAll("{messages_ua}", values.messagesUa)
    .replaceAll("{input_tokens}", values.inputTokens)
    .replaceAll("{output_tokens}", values.outputTokens)
    .replaceAll("{total_tokens}", values.totalTokens)
    .split("\n")
    .map((line) => ({ text: line }));
}

export async function executeCommand(text, context) {
  const { i18n } = context;
  const [rawCmd, ...argParts] = text.slice(1).trim().split(/\s+/);
  const arg = argParts[0] ?? "";
  const config = await loadConfig({
    cwd: context.cwd,
    runtimeOverrides: context.runtimeOverrides
  });

  switch (rawCmd) {
    case "think": {
      const level = Object.keys(EFFORT_MAP).includes(arg) ? arg : "medium";
      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        thinkingLevel: level
      };

      const effort = EFFORT_MAP[level];
      const display = effort ? chalk.cyan(level) : chalk.dim("off");
      return successResult(
        i18n.t("commands.messages.thinkingSet", {
          tick: chalk.green("✓"),
          level: display
        }).replace(`${chalk.green("✓")} `, ""),
      );
    }
    case "dot": {
      const dot = DOT_CHOICES.includes(arg) ? arg : "⬢";
      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        config: {
          ...(context.runtimeOverrides.config ?? {}),
          ui: {
            ...(context.runtimeOverrides.config?.ui ?? {}),
            message_dot: dot
          }
        }
      };

      await saveConfigPatch("ui.message_dot", dot, {
        cwd: context.cwd,
        homeDir: os.homedir()
      });

      return successResult(i18n.t("commands.messages.dotSet", { dot }));
    }
    case "statusbar": {
      const prompt = argParts.join(" ").trim();
      if (!prompt) {
        return errorResult(i18n.t("commands.errors.usageStatusbar"), i18n);
      }

      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        config: {
          ...(context.runtimeOverrides.config ?? {}),
          ui: {
            ...(context.runtimeOverrides.config?.ui ?? {}),
            statusbar_prompt: prompt
          }
        }
      };

      await saveConfigPatch("ui.statusbar_prompt", prompt, {
        cwd: context.cwd,
        homeDir: os.homedir()
      });

      return successResult(i18n.t("commands.messages.statusbarSet", { prompt }));
    }
    case "debug": {
      const nextValue =
        arg === "on"
          ? true
          : arg === "off"
            ? false
            : !(context.runtimeOverrides.debug ?? false);

      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        debug: nextValue,
      };

      return successResult(
        i18n.t("commands.messages.debugSet", {
          mode: nextValue ? "on" : "off",
        }),
      );
    }
    case "config": {
      const sub = argParts[0] ?? "show";

      if (sub === "show") {
        return successResult(formatConfigView(config, context.runtimeOverrides));
      }

      if (sub === "set") {
        const targetPath = argParts[1];
        const rawValue = argParts.slice(2).join(" ");
        if (!targetPath || !rawValue) {
          return errorResult(i18n.t("commands.errors.usageConfigSet"), i18n);
        }

        const next = await saveConfigPatch(
          targetPath,
          parseConfigValue(rawValue),
          {
            cwd: context.cwd,
            homeDir: os.homedir()
          },
        );

        context.config = {
          ...config,
          ...next
        };

        return successResult(i18n.t("commands.messages.configUpdated", { path: targetPath }));
      }

      if (sub === "save") {
        const activeProvider =
          context.runtimeOverrides.providerId ?? config.activeProvider;

        const next = {
          ...config,
          active_provider: activeProvider,
          active_model: context.runtimeOverrides.model ?? config.activeModel,
          active_profile: context.runtimeOverrides.profile ?? config.activeProfile,
          reasoning: {
            ...config.reasoning,
            default_effort:
              context.runtimeOverrides.thinkingLevel ?? config.thinkingLevel
          },
          providers: {
            ...config.providers,
            [activeProvider]: {
              ...config.providers[activeProvider],
              model: context.runtimeOverrides.model ?? config.activeModel
            }
          }
        };

        await saveConfig(next, config.paths);
        context.runtimeOverrides = {};
        return successResult(
          i18n.t("commands.messages.configSaved", {
            path: config.paths.configFile
          }),
        );
      }

      return errorResult(
        i18n.t("commands.errors.unknownConfigSubcommand", {
          subcommand: sub
        }),
        i18n,
      );
    }
    case "provider": {
      if (argParts[0] !== "use" || !argParts[1]) {
        return errorResult(i18n.t("commands.errors.usageProviderUse"), i18n);
      }

      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        providerId: argParts[1]
      };
      return successResult(
        i18n.t("commands.messages.providerSet", { providerId: argParts[1] }),
      );
    }
    case "model": {
      if (argParts.length > 0 && argParts[0] !== "use") {
        return errorResult(i18n.t("commands.errors.usageModelUse"), i18n);
      }

      let selection;
      try {
        selection = await selectProviderAndModel(context);
      } catch (error) {
        return errorResult(error.message, i18n);
      }

      if (!selection) {
        return renderedResult();
      }

      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        providerId: selection.providerId,
        model: selection.model,
        config: {
          ...(context.runtimeOverrides.config ?? {}),
          auth: {
            ...(context.runtimeOverrides.config?.auth ?? {}),
            ...(selection.authPatch ?? {}),
          },
        },
      };

      if (selection.authPatch) {
        await saveConfig(
          {
            ...config,
            auth: {
              ...config.auth,
              ...selection.authPatch,
            },
          },
          config.paths,
        );
      }

      return successResult(
        i18n.t("commands.messages.modelSet", {
          model: `${selection.providerId}/${selection.model}`,
        }),
      );
    }
    case "profile": {
      if (argParts[0] !== "use" || !argParts[1]) {
        return errorResult(i18n.t("commands.errors.usageProfileUse"), i18n);
      }

      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        profile: argParts[1],
        config: {
          active_profile: argParts[1]
        }
      };
      return successResult(
        i18n.t("commands.messages.profileSet", { profile: argParts[1] }),
      );
    }
    case "prompt": {
      const sub = argParts[0] ?? "show";
      const layer = argParts[1] ?? "system";
      const filePath = getPromptLayerPath(layer, config, i18n);

      if (sub === "show") {
        const content = await fs.readFile(filePath, "utf8").catch(() => "");
        return successResult(
          `${i18n.t("commands.messages.promptHeader", { layer })}\n${content}`.trimEnd(),
        );
      }

      if (sub === "edit") {
        const editor = config.ui.editor || process.env.EDITOR || "vi";
        await backupFile(filePath, config.paths);
        await openEditor(filePath, editor, i18n);
        return successResult(i18n.t("commands.messages.promptEdited", { layer }));
      }

      if (sub === "reset") {
        const sourcePath = getPromptLayerPath(
          layer,
          await loadConfig({ cwd: context.cwd }),
          i18n,
        );
        const defaultText =
          layer === "system"
            ? "You are Mr. Mush.\nBe direct, precise, and pragmatic.\nPrefer concrete implementation details over generic advice.\n"
            : layer === "profile"
              ? "Default profile:\n- Keep answers concise.\n- Explain tradeoffs when they affect implementation.\n"
              : layer === "provider"
                ? `Provider guidance: prefer ${config.activeProvider} compatible instructions.\n`
                : "";

        await backupFile(filePath, config.paths);
        await fs.mkdir(path.dirname(sourcePath), { recursive: true });
        await fs.writeFile(filePath, defaultText, "utf8");
        return successResult(i18n.t("commands.messages.promptReset", { layer }));
      }

      return errorResult(
        i18n.t("commands.errors.unknownPromptSubcommand", {
          subcommand: sub
        }),
        i18n,
      );
    }
    case "resume": {
      const historyDir = context.config.paths.historyDir;
      const theme = context.ui?.theme ?? {};
      process.stdout.write("\n");
      const session = await openSessionBrowser(historyDir, theme);
      if (!session) return successResult("Resume cancelled.");

      // Load messages into current session context for the chat loop to pick up
      context.resumedSession = session;
      return successResult(i18n.t("commands.messages.sessionResumed", { title: session.meta?.title ?? session.id }));
    }
    case "card": {
      process.stdout.write("\n");
      printMushCard(context);
      return successResult("Card rendered.");
    }
    case "usage": {
      const historyDir = context.config?.paths?.historyDir ?? config.paths.historyDir;
      const sessions = await listSessions(historyDir);
      const loaded = await Promise.all(sessions.map((session) => loadSession(historyDir, session.id)));
      const totals = aggregateSessionSummaries(loaded.map((session) => session.meta ?? {}));
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
    }
    case "onboard": {
      context.runtimeOverrides = {};
      context.config = await runSetupScreen(context);
      return successResult(
        i18n.t("commands.messages.onboardCompleted", {
          providerId: context.config.activeProvider,
          model: context.config.activeModel,
          routerProviderId: context.config.orchestrator?.router_provider,
        }),
      );
    }
    case "inittheme": {
      const filePath = config.paths.projectThemeFile;
      try {
        await fs.access(filePath);
        return errorResult(
          i18n.t("commands.errors.themeAlreadyExists", { path: filePath }),
          i18n,
        );
      } catch (error) {
        if (error?.code !== "ENOENT") {
          throw error;
        }
      }

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, createThemeTemplate(i18n), "utf8");
      return successResult(
        i18n.t("commands.messages.themeInitialized", { path: filePath }),
      );
    }
    default:
      return errorResult(i18n.t("commands.messages.unknownCommand", { command: rawCmd }), i18n);
  }
}
