import { errorResult, successResult } from "../results.js";

export const providerCommand = {
  name: "provider",
  descriptionKey: "commands.descriptions.provider",
  usage: "/provider use openai",
  args: [{ value: "use", descriptionKey: "commands.args.use" }],
  async execute({ args, context }) {
    const { i18n } = context;
    if (args[0] !== "use" || !args[1]) {
      return errorResult(i18n.t("commands.errors.usageProviderUse"), i18n);
    }

    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      providerId: args[1],
    };
    return successResult(
      i18n.t("commands.messages.providerSet", { providerId: args[1] }),
    );
  },
};
