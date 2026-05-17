import { getProvider } from "../../providers/index.js";
import { promptSearchSelect } from "../../ui/components/search-select.js";
import { saveConfig } from "../../config/loader.js";
import { errorResult, renderedResult, successResult } from "../results.js";

export const modelCommand = {
  name: "model",
  descriptionKey: "commands.descriptions.model",
  usage: "/model",
  async execute({ context, config }) {
    const { i18n } = context;
    const providerId =
      context.runtimeOverrides.providerId ?? config.activeProvider;
    const currentModel =
      context.runtimeOverrides.model ?? config.activeModel;
    const provider = getProvider(providerId, i18n);

    let modelOptions;
    try {
      modelOptions = await provider.fetchModels(config);
    } catch (error) {
      return errorResult(error.message, i18n);
    }

    const selected = await promptSearchSelect(
      i18n.t("switch.prompts.value", { target: "Model" }),
      modelOptions,
      context.ui?.theme ?? {},
      {
        initialQuery: currentModel,
      },
    );

    if (selected === null) return renderedResult();

    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      providerId,
      model: selected,
    };

    const nextConfig = await saveConfig(
      {
        ...config,
        active_provider: providerId,
        active_model: selected,
        providers: {
          ...config.providers,
          [providerId]: {
            ...config.providers[providerId],
            model: selected,
          },
        },
      },
      config.paths,
    );
    context.config = {
      ...config,
      ...nextConfig,
      activeProvider: providerId,
      activeModel: selected,
    };

    return successResult(
      i18n.t("commands.messages.modelSet", {
        model: `${providerId}/${selected}`,
      }),
    );
  },
};
