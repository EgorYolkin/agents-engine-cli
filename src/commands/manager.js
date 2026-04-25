import { cardCommand } from "./commands/card.js";
import { configCommand } from "./commands/config.js";
import { debugCommand } from "./commands/debug.js";
import { dotCommand } from "./commands/dot.js";
import { initThemeCommand } from "./commands/inittheme.js";
import { mcpCommand } from "./commands/mcp.js";
import { modelCommand } from "./commands/model.js";
import { onboardCommand } from "./commands/onboard.js";
import { profileCommand } from "./commands/profile.js";
import { promptCommand } from "./commands/prompt.js";
import { providerCommand } from "./commands/provider.js";
import { resumeCommand } from "./commands/resume.js";
import { statusbarCommand } from "./commands/statusbar.js";
import { thinkCommand } from "./commands/think.js";
import { updateCommand } from "./commands/update.js";
import { usageCommand } from "./commands/usage.js";
import { errorResult } from "./results.js";

const BUILT_IN_COMMANDS = [
  thinkCommand,
  configCommand,
  providerCommand,
  modelCommand,
  profileCommand,
  promptCommand,
  resumeCommand,
  cardCommand,
  usageCommand,
  updateCommand,
  debugCommand,
  initThemeCommand,
  onboardCommand,
  statusbarCommand,
  dotCommand,
  mcpCommand,
];

function localizedDescription(i18n, key) {
  return i18n?.raw?.(key) ?? i18n?.t?.(key) ?? key;
}

function buildCommandDescription(command, i18n) {
  const description = localizedDescription(i18n, command.descriptionKey);
  if (!command.usage) return description;

  return `${description} · ${command.usage}`;
}

function buildSuggestionArg(command, tokens) {
  if (typeof command.suggestArgs === "function") {
    return command.suggestArgs(tokens);
  }

  return command.args ?? [];
}

export class CommandManager {
  #commands = new Map();

  register(command) {
    if (!command?.name || typeof command.execute !== "function") {
      throw new Error("Command must define name and execute()");
    }

    if (this.#commands.has(command.name)) {
      throw new Error(`Duplicate command: ${command.name}`);
    }

    this.#commands.set(command.name, command);
    return this;
  }

  get(name) {
    return this.#commands.get(name);
  }

  list() {
    return [...this.#commands.values()];
  }

  getSuggestions(buffer, i18n) {
    if (!buffer.startsWith("/")) return [];

    const withoutSlash = buffer.slice(1);
    const spaceIdx = withoutSlash.indexOf(" ");

    if (spaceIdx === -1) {
      return this.list()
        .filter((command) => command.name.startsWith(withoutSlash))
        .map((command) => ({
          label: `/${command.name}`,
          description: buildCommandDescription(command, i18n),
          complete: `/${command.name} `,
          usage: command.usage,
        }));
    }

    const cmdName = withoutSlash.slice(0, spaceIdx);
    const argText = withoutSlash.slice(spaceIdx + 1);
    const command = this.get(cmdName);
    if (!command) return [];

    const tokens = argText.split(/\s+/);
    const argPrefix = tokens.at(-1) ?? "";
    const args = buildSuggestionArg(command, tokens);
    if (!args?.length) return [];

    return args
      .filter((arg) => arg.value.startsWith(argPrefix))
      .map((arg) => ({
        label: arg.value,
        description: localizedDescription(i18n, arg.descriptionKey),
        complete: `/${cmdName} ${tokens.slice(0, -1).concat(arg.value).join(" ")}`,
      }));
  }

  getUsageHint(buffer) {
    if (!buffer.startsWith("/") || buffer.includes("\n")) return null;

    const withoutSlash = buffer.slice(1);
    const match = withoutSlash.match(/^([^\s]+)(\s*)$/);
    if (!match) return null;

    const [, cmdName, whitespace] = match;
    const command = this.get(cmdName);
    if (!command?.usage?.startsWith(`/${cmdName}`)) return null;

    const typedPrefix = `/${cmdName}${whitespace}`;
    if (!command.usage.startsWith(typedPrefix)) return null;

    const hint = command.usage.slice(typedPrefix.length);
    return hint ? { text: hint, usage: command.usage } : null;
  }

  async execute(rawCmd, params) {
    const command = this.get(rawCmd);
    const i18n = params.context.i18n;

    if (!command) {
      return errorResult(
        i18n.t("commands.messages.unknownCommand", { command: rawCmd }),
        i18n,
      );
    }

    return command.execute({ ...params, manager: this });
  }
}

export function createCommandManager(commands = null) {
  const manager = new CommandManager();
  for (const command of commands ?? BUILT_IN_COMMANDS) {
    manager.register(command);
  }
  return manager;
}
