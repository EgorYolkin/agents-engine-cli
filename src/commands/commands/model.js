import { saveConfig } from "../../config/loader.js";
import { selectProviderAndModel } from "../../ui/scenes/setup.js";
import { errorResult, renderedResult, successResult } from "../results.js";

export const modelCommand = {
  name: "model",
  descriptionKey: "commands.descriptions.model",
  usage: "/model",
  async execute({ args, context, config }) {
    const { i18n } = context;
    if (args.length > 0) {
      return errorResult(i18n.t("commands.errors.usageModelUse"), i18n);
    }

    let selection;
    try {
      selection = await selectProviderAndModel(context);
    } catch (error) {
      return errorResult(error.message, i18n);
    }

    if (!selection) {
      return renderedResult();
    }

    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      providerId: selection.providerId,
      model: selection.model,
      config: {
        ...(context.runtimeOverrides.config ?? {}),
        auth: {
          ...(context.runtimeOverrides.config?.auth ?? {}),
          ...(selection.authPatch ?? {}),
        },
      },
    };

    const nextConfig = await saveConfig(
      {
        ...config,
        active_provider: selection.providerId,
        active_model: selection.model,
        auth: {
          ...config.auth,
          ...(selection.authPatch ?? {}),
        },
        providers: {
          ...config.providers,
          [selection.providerId]: {
            ...config.providers[selection.providerId],
            model: selection.model,
          },
        },
      },
      config.paths,
    );
    context.config = {
      ...config,
      ...nextConfig,
      activeProvider: selection.providerId,
      activeModel: selection.model,
    };

    return successResult(
      i18n.t("commands.messages.modelSet", {
        model: `${selection.providerId}/${selection.model}`,
      }),
    );
  },
};
