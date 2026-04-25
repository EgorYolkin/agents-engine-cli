import { openAiCompatibleChat } from "./openai-compatible.js";

const BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODELS = [
  { value: "deepseek-chat", label: "deepseek-chat" },
  { value: "deepseek-reasoner", label: "deepseek-reasoner" },
];

export const deepseekProvider = {
  id: "deepseek",
  labelKey: "providers.deepseek.label",
  source: "api",
  binary: "env",
  defaultModel: "deepseek-chat",
  capabilities: { toolCalling: true },

  getAuthRequirements(resolvedConfig) {
    return resolvedConfig.auth.deepseek;
  },

  async isAvailable(resolvedConfig = null) {
    const envKey = resolvedConfig?.auth?.deepseek?.env_key ?? "DEEPSEEK_API_KEY";
    const configuredApiKey = resolvedConfig?.auth?.deepseek?.api_key;
    return Boolean(configuredApiKey || process.env[envKey]);
  },

  async fetchModels(resolvedConfig = null) {
    const envKey = resolvedConfig?.auth?.deepseek?.env_key ?? "DEEPSEEK_API_KEY";
    const i18n = resolvedConfig?.i18n ?? null;
    const apiKey = resolvedConfig?.auth?.deepseek?.api_key ?? process.env[envKey];
    if (!apiKey) {
      const message = i18n
        ? i18n.t("providers.deepseek.missingEnv", { envKey })
        : `Environment variable ${envKey} is not set`;
      throw new Error(message);
    }

    return DEFAULT_MODELS;
  },

  async exec(resolvedConfig, prompt, runtimeOverrides = {}, signal = null, options = {}) {
    const model = runtimeOverrides.model ?? resolvedConfig.activeModel;
    const envKey = resolvedConfig.auth.deepseek.env_key;
    const apiKey = resolvedConfig.auth.deepseek.api_key ?? process.env[envKey];
    if (!apiKey) {
      throw new Error(
        resolvedConfig.i18n.t("providers.deepseek.missingEnv", { envKey }),
      );
    }

    return openAiCompatibleChat({
      baseUrl: BASE_URL,
      providerName: "DeepSeek",
      apiKey,
      model,
      prompt,
      promptStack: resolvedConfig.promptStack,
      messages: options.messages ?? null,
      signal,
      onToken: options.onToken,
      tools: options.tools ?? null,
    });
  },
};
