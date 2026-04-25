import os from "node:os";
import { saveConfigPatch } from "../../config/loader.js";
import { errorResult, successResult } from "../results.js";

export const statusbarCommand = {
  name: "statusbar",
  descriptionKey: "commands.descriptions.statusbar",
  usage: "/statusbar {folder} | {model} | {thinking}",
  async execute({ args, context }) {
    const { i18n } = context;
    const prompt = args.join(" ").trim();
    if (!prompt) {
      return errorResult(i18n.t("commands.errors.usageStatusbar"), i18n);
    }

    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      config: {
        ...(context.runtimeOverrides.config ?? {}),
        ui: {
          ...(context.runtimeOverrides.config?.ui ?? {}),
          statusbar_prompt: prompt,
        },
      },
    };

    await saveConfigPatch("ui.statusbar_prompt", prompt, {
      cwd: context.cwd,
      homeDir: os.homedir(),
    });

    return successResult(i18n.t("commands.messages.statusbarSet", { prompt }));
  },
};
