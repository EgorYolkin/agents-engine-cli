import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const PROMPT_LAYERS = [
  { value: "system", descriptionKey: "commands.args.promptLayerSystem" },
  { value: "profile", descriptionKey: "commands.args.promptLayerProfile" },
  { value: "provider", descriptionKey: "commands.args.promptLayerProvider" },
  { value: "project", descriptionKey: "commands.args.promptLayerProject" },
];

export function getPromptLayerPath(layer, config, i18n) {
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

export async function openEditor(filePath, editor, i18n) {
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

export function formatConfigView(config, runtimeOverrides) {
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

export function formatCwd(cwd) {
  const home = os.homedir();
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

export function renderUsageTemplate(template, values) {
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
