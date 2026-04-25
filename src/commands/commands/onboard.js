import { runSetupScreen } from "../../ui/scenes/setup.js";
import { successResult } from "../results.js";

export const onboardCommand = {
  name: "onboard",
  descriptionKey: "commands.descriptions.onboard",
  usage: "/onboard",
  async execute({ context }) {
    const { i18n } = context;
    context.runtimeOverrides = {};
    context.config = await runSetupScreen(context);
    return successResult(
      i18n.t("commands.messages.onboardCompleted", {
        providerId: context.config.activeProvider,
        model: context.config.activeModel,
        routerProviderId: context.config.orchestrator?.router_provider,
      }),
    );
  },
};
