import { successResult } from "../results.js";
import { saveConfigPatch } from "../../config/loader.js";

export const experimentsCommand = {
  name: "experiments",
  descriptionKey: "commands.descriptions.experiments",
  usage: "/experiments [on|off|status]",
  args: [
    { value: "on", descriptionKey: "commands.args.on" },
    { value: "off", descriptionKey: "commands.args.offToggle" },
    { value: "status", descriptionKey: "commands.args.status" },
  ],
  async execute({ arg, context }) {
    const { i18n } = context;
    const current = context.config.experiments?.paraphrase ?? false;

    let nextValue;
    if (arg === "on") {
      nextValue = true;
    } else if (arg === "off") {
      nextValue = false;
    } else if (arg === "status") {
      return successResult(
        `Experiments: ${current ? "on" : "off"}\n  paraphrase: ${current ? "on" : "off"}`,
      );
    } else {
      nextValue = !current;
    }

    // Persist to config file
    await saveConfigPatch("experiments.paraphrase", nextValue, {
      cwd: context.cwd,
    });

    context.config = {
      ...context.config,
      experiments: {
        ...(context.config.experiments ?? {}),
        paraphrase: nextValue,
      },
    };

    return successResult(
      `Experiments ${nextValue ? "on" : "off"} (paraphrase: ${nextValue ? "on" : "off"})`,
    );
  },
};
