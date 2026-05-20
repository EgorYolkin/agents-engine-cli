import { loadConfig } from "../config/loader.js";
import { createCommandManager } from "./manager.js";

let _commandManager = null;
function getCommandManager() {
  if (!_commandManager) {
    _commandManager = createCommandManager();
  }
  return _commandManager;
}

export function getSuggestions(buffer, i18n) {
  return getCommandManager().getSuggestions(buffer, i18n);
}

export function getUsageHint(buffer) {
  return getCommandManager().getUsageHint(buffer);
}

export async function executeCommand(text, context) {
  const [rawCmd = "", ...argParts] = text.slice(1).trim().split(/\s+/);
  const config = await loadConfig({
    cwd: context.cwd,
    runtimeOverrides: context.runtimeOverrides,
  });

  return getCommandManager().execute(rawCmd, {
    raw: text,
    args: argParts,
    arg: argParts[0] ?? "",
    context,
    config,
  });
}
