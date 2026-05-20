import { openAiCompatibleChat } from "./openai-compatible.js";

const BASE_URL = "https://token-plan-sgp.xiaomimimo.com";

const THINKING_CONFIG_BY_LEVEL = {
  off: { thinking: { type: "disabled" } },
  minimal: {
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  },
  low: {
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  },
  medium: {
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  },
  high: {
    reasoning_effort: "high",
    thinking: { type: "enabled" },
  },
  xhigh: {
    reasoning_effort: "max",
    thinking: { type: "enabled" },
  },
};

export const xiaomimimoProvider = {
  id: "xiaomimimo",
  labelKey: "providers.xiaomimimo.label",
  source: "api",
  binary: "env",
  defaultModel: "mimo-v2.5",
  capabilities: { toolCalling: "dynamic" },

  getAuthRequirements(resolvedConfig) {
    return resolvedConfig.auth.xiaomimimo;
  },

  async isAvailable(resolvedConfig = null) {
    const envKey =
      resolvedConfig?.auth?.xiaomimimo?.env_key ?? "XIAOMIMIMO_API_KEY";
    const configuredApiKey = resolvedConfig?.auth?.xiaomimimo?.api_key;
    return Boolean(configuredApiKey || process.env[envKey]);
  },

  async fetchModels(resolvedConfig = null) {
    const envKey =
      resolvedConfig?.auth?.xiaomimimo?.env_key ?? "XIAOMIMIMO_API_KEY";
    const i18n = resolvedConfig?.i18n ?? null;
    const apiKey =
      resolvedConfig?.auth?.xiaomimimo?.api_key ?? process.env[envKey];
    if (!apiKey) {
      const message = i18n
        ? i18n.t("providers.xiaomimimo.missingEnv", { envKey })
        : `Environment variable ${envKey} is not set`;
      throw new Error(message);
    }

    const res = await fetch(`${BASE_URL}/v1/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new Error(
        bodyText
          ? `XiaomiMiMo: ${res.status} ${bodyText}`
          : `XiaomiMiMo: HTTP ${res.status}`,
      );
    }

    const data = await res.json();
    const models = Array.isArray(data?.data) ? data.data : [];

    return models
      .map((model) => ({
        value: model.id,
        label: model.id,
      }))
      .filter((model) => Boolean(model.value));
  },

  async supportsToolCalling(modelName) {
    return modelName !== "deepseek-reasoner";
  },

  async exec(
    resolvedConfig,
    prompt,
    runtimeOverrides = {},
    signal = null,
    options = {},
  ) {
    const model = runtimeOverrides.model ?? resolvedConfig.activeModel;
    const thinkingLevel =
      runtimeOverrides.thinkingLevel ?? resolvedConfig.thinkingLevel ?? "medium";
    const envKey = resolvedConfig.auth.xiaomimimo.env_key;
    const apiKey =
      resolvedConfig.auth.xiaomimimo.api_key ?? process.env[envKey];
    if (!apiKey) {
      throw new Error(
        resolvedConfig.i18n.t("providers.xiaomimimo.missingEnv", { envKey }),
      );
    }

    return openAiCompatibleChat({
      baseUrl: BASE_URL,
      providerName: "XiaomiMiMo",
      apiKey,
      model,
      prompt,
      promptStack: resolvedConfig.promptStack,
      messages: options.messages ?? null,
      signal,
      onToken: options.onToken,
      tools: options.tools ?? null,
      requestBodyExtras:
        THINKING_CONFIG_BY_LEVEL[thinkingLevel] ??
        THINKING_CONFIG_BY_LEVEL.medium,
    });
  },
};
