import os from "node:os";
import { saveConfigPatch } from "../../config/loader.js";
import { DOT_CHOICES } from "../../ui/symbols.js";
import { successResult } from "../results.js";

export const dotCommand = {
  name: "dot",
  descriptionKey: "commands.descriptions.dot",
  usage: "/dot ⬢",
  args: DOT_CHOICES.map((dot) => ({
    value: dot,
    descriptionKey: "commands.args.dot",
  })),
  async execute({ arg, context }) {
    const { i18n } = context;
    const dot = DOT_CHOICES.includes(arg) ? arg : "⬢";
    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      config: {
        ...(context.runtimeOverrides.config ?? {}),
        ui: {
          ...(context.runtimeOverrides.config?.ui ?? {}),
          message_dot: dot,
        },
      },
    };

    await saveConfigPatch("ui.message_dot", dot, {
      cwd: context.cwd,
      homeDir: os.homedir(),
    });

    return successResult(i18n.t("commands.messages.dotSet", { dot }));
  },
};
