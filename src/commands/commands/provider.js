import { promptSearchSelect } from "../../ui/components/search-select.js";
import { PROVIDERS, getProviderLabel } from "../../providers/index.js";
import { errorResult, renderedResult, successResult } from "../results.js";

export const providerCommand = {
  name: "provider",
  descriptionKey: "commands.descriptions.provider",
  usage: "/provider",
  async execute({ context }) {
    const { i18n } = context;

    const currentProviderId =
      context.runtimeOverrides.providerId ?? context.config.activeProvider;
    const options = PROVIDERS.map((provider) => ({
      value: provider.id,
      label: getProviderLabel(provider, i18n),
      description: provider.id === currentProviderId
        ? "current"
        : (provider.defaultModel ?? ""),
    }));

    const selected = await promptSearchSelect(
      i18n.t("switch.prompts.target"),
      options,
      context.ui?.theme ?? {},
      {
        initialQuery: currentProviderId,
      },
    );

    if (selected === null) return renderedResult();

    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      providerId: selected,
    };
    return successResult(
      i18n.t("commands.messages.providerSet", { providerId: selected }),
    );
  },
};
