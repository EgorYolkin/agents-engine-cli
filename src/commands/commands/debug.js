import { successResult } from "../results.js";

export const debugCommand = {
  name: "debug",
  descriptionKey: "commands.descriptions.debug",
  usage: "/debug on",
  args: [
    { value: "on", descriptionKey: "commands.args.on" },
    { value: "off", descriptionKey: "commands.args.offToggle" },
  ],
  async execute({ arg, context }) {
    const { i18n } = context;
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
  },
};
