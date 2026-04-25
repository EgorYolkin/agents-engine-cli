import { errorResult, successResult } from "../results.js";

export const profileCommand = {
  name: "profile",
  descriptionKey: "commands.descriptions.profile",
  usage: "/profile use default",
  args: [{ value: "use", descriptionKey: "commands.args.use" }],
  async execute({ args, context }) {
    const { i18n } = context;
    if (args[0] !== "use" || !args[1]) {
      return errorResult(i18n.t("commands.errors.usageProfileUse"), i18n);
    }

    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      profile: args[1],
      config: {
        active_profile: args[1],
      },
    };
    return successResult(
      i18n.t("commands.messages.profileSet", { profile: args[1] }),
    );
  },
};
