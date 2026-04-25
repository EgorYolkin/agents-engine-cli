import fs from "node:fs/promises";
import path from "node:path";
import {
  backupFile,
  loadConfig,
} from "../../config/loader.js";
import {
  getPromptLayerPath,
  openEditor,
  PROMPT_LAYERS,
} from "../helpers.js";
import { errorResult, successResult } from "../results.js";

const PROMPT_ACTIONS = [
  { value: "show", descriptionKey: "commands.args.promptShow" },
  { value: "edit", descriptionKey: "commands.args.promptEdit" },
  { value: "reset", descriptionKey: "commands.args.promptReset" },
];

export const promptCommand = {
  name: "prompt",
  descriptionKey: "commands.descriptions.prompt",
  usage: "/prompt show system",
  suggestArgs(tokens) {
    return tokens.length <= 1 ? PROMPT_ACTIONS : PROMPT_LAYERS;
  },
  async execute({ args, context, config }) {
    const { i18n } = context;
    const sub = args[0] ?? "show";
    const layer = args[1] ?? "system";
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
        subcommand: sub,
      }),
      i18n,
    );
  },
};
