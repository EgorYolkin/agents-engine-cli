import { getProvider, getProviderLabel, PROVIDERS } from "../../providers/index.js";
import { promptSearchSelect } from "../../ui/components/search-select.js";
import { promptInput } from "../../ui/input.js";
import { saveConfig } from "../../config/loader.js";
import { errorResult, renderedResult, successResult } from "../results.js";

export const modelCommand = {
  name: "model",
  descriptionKey: "commands.descriptions.model",
  usage: "/model",
  async execute({ context }) {
    const { i18n } = context;
    const theme = context.ui?.theme ?? {};

    // Step 1: Select provider
    const currentProviderId =
      context.runtimeOverrides.providerId ?? context.config.activeProvider;

    const providerOptions = PROVIDERS.map((provider) => ({
      value: provider.id,
      label: getProviderLabel(provider, i18n),
      description: provider.id === currentProviderId ? "current" : (provider.defaultModel ?? ""),
    }));

    const selectedProviderId = await promptSearchSelect(
      i18n.t("switch.prompts.value", { target: "Provider" }),
      providerOptions,
      theme,
      { initialQuery: currentProviderId },
    );

    if (selectedProviderId === null) return renderedResult();

    const provider = getProvider(selectedProviderId, i18n);

    // Step 2: Try to fetch models, handle missing API key
    let modelOptions;
    try {
      const configWithProvider = {
        ...context.config,
        activeProvider: selectedProviderId,
      };
      modelOptions = await provider.fetchModels(configWithProvider);
    } catch (error) {
      const message = error.message ?? String(error);

      // If API key is missing or invalid, offer to set it
      if (message.includes("API") || message.includes("Token") || message.includes("key") || message.includes("401")) {
        const authReq = provider.getAuthRequirements?.(context.config);
        const envKey = authReq?.env_key;

        const action = await promptSearchSelect(
          i18n.t("switch.prompts.value", { target: "Action" }),
          [
            { value: "enter_key", label: "Enter API key", description: envKey ? `env: ${envKey}` : "" },
            { value: "cancel", label: "Cancel", description: "" },
          ],
          theme,
        );

        if (action === "enter_key") {
          const apiKey = await promptInput(i18n, theme, "", {
            folder: "",
            model: "",
            thinking: "",
            tokens: "",
            messages: "",
            sessionTokens: "",
            sessionTime: "",
          });

          if (!apiKey?.trim()) return renderedResult();

          // Save API key to config
          const authPath = `auth.${selectedProviderId}.api_key`;
          const updatedConfig = {
            ...context.config,
            auth: {
              ...context.config.auth,
              [selectedProviderId]: {
                ...context.config.auth?.[selectedProviderId],
                api_key: apiKey.trim(),
              },
            },
          };
          await saveConfig(updatedConfig, context.config.paths);
          context.config = updatedConfig;

          // Try fetching models again
          try {
            modelOptions = await provider.fetchModels(updatedConfig);
          } catch (retryError) {
            return errorResult(`Failed to fetch models: ${retryError.message}`);
          }
        } else {
          return renderedResult();
        }
      } else {
        return errorResult(message);
      }
    }

    // Step 3: Select model
    const currentModel = context.runtimeOverrides.model ?? context.config.activeModel;

    const selected = await promptSearchSelect(
      i18n.t("switch.prompts.value", { target: "Model" }),
      modelOptions,
      theme,
      { initialQuery: currentModel },
    );

    if (selected === null) return renderedResult();

    // Step 4: Save selection
    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      providerId: selectedProviderId,
      model: selected,
    };

    const nextConfig = await saveConfig(
      {
        ...context.config,
        active_provider: selectedProviderId,
        active_model: selected,
        providers: {
          ...context.config.providers,
          [selectedProviderId]: {
            ...context.config.providers[selectedProviderId],
            model: selected,
          },
        },
      },
      context.config.paths,
    );
    context.config = {
      ...context.config,
      ...nextConfig,
      activeProvider: selectedProviderId,
      activeModel: selected,
    };

    return successResult(
      i18n.t("commands.messages.modelSet", {
        model: `${selectedProviderId}/${selected}`,
      }),
    );
  },
};
