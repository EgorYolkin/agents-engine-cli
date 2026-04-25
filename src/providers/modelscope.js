import { openAiCompatibleChat } from "./openai-compatible.js";

const BASE_URL = "https://api-inference.modelscope.cn";
const DEFAULT_MODELS = [
  { value: "deepseek-ai/DeepSeek-V4-Pro", label: "DeepSeek V4 Pro (1M)" },
  { value: "deepseek-ai/DeepSeek-V4-Flash", label: "DeepSeek V4 Flash (1M)" },
];

export const modelscopeProvider = {
  id: "modelscope",
  labelKey: "providers.modelscope.label",
  source: "api",
  binary: "env",
  defaultModel: "deepseek-ai/DeepSeek-V4-Pro",
  capabilities: { toolCalling: true },

  getAuthRequirements(resolvedConfig) {
    return resolvedConfig.auth.modelscope;
  },

  async isAvailable(resolvedConfig = null) {
    const envKey = resolvedConfig?.auth?.modelscope?.env_key ?? "MODELSCOPE_API_KEY";
    const configuredApiKey = resolvedConfig?.auth?.modelscope?.api_key;
    return Boolean(configuredApiKey || process.env[envKey]);
  },

  async fetchModels(resolvedConfig = null) {
    const envKey = resolvedConfig?.auth?.modelscope?.env_key ?? "MODELSCOPE_API_KEY";
    const i18n = resolvedConfig?.i18n ?? null;
    const apiKey = resolvedConfig?.auth?.modelscope?.api_key ?? process.env[envKey];
    if (!apiKey) {
      const message = i18n
        ? i18n.t("providers.modelscope.missingEnv", { envKey })
        : `Environment variable ${envKey} is not set`;
      throw new Error(message);
    }

    return DEFAULT_MODELS;
  },

  async exec(resolvedConfig, prompt, runtimeOverrides = {}, signal = null, options = {}) {
    const model = runtimeOverrides.model ?? resolvedConfig.activeModel;
    const envKey = resolvedConfig.auth.modelscope.env_key;
    const apiKey = resolvedConfig.auth.modelscope.api_key ?? process.env[envKey];
    if (!apiKey) {
      throw new Error(
        resolvedConfig.i18n.t("providers.modelscope.missingEnv", { envKey }),
      );
    }

    return openAiCompatibleChat({
      baseUrl: BASE_URL,
      providerName: "ModelScope",
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
