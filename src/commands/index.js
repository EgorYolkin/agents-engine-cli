import { loadConfig } from "../config/loader.js";
import { createCommandManager } from "./manager.js";

export const commandManager = createCommandManager();

export function getSuggestions(buffer, i18n) {
  return commandManager.getSuggestions(buffer, i18n);
}

export function getUsageHint(buffer) {
  return commandManager.getUsageHint(buffer);
}

export async function executeCommand(text, context) {
  const [rawCmd = "", ...argParts] = text.slice(1).trim().split(/\s+/);
  const config = await loadConfig({
    cwd: context.cwd,
    runtimeOverrides: context.runtimeOverrides,
  });

  return commandManager.execute(rawCmd, {
    raw: text,
    args: argParts,
    arg: argParts[0] ?? "",
    context,
    config,
  });
}
