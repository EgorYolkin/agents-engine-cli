import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as p from "@clack/prompts";
import {
  PROVIDERS,
  getProvider,
  getProviderLabel,
} from "../../providers/index.js";
import { builtInConfig } from "../../config/schema.js";
import {
  bootstrapConfig,
  loadConfig,
  saveConfig,
  saveState,
} from "../../config/loader.js";
import { resetTerminalSurface } from "../components/terminal.js";

export { resetTerminalSurface };

const execFileAsync = promisify(execFile);

const onCancel = (i18n) => {
  p.cancel(i18n.t("setup.cancelled"));
  process.exit(0);
};

async function isBinaryInstalled(bin) {
  try {
    await execFileAsync("which", [bin]);
    return true;
  } catch {
    return false;
  }
}

async function buildProviderOptions(i18n) {
  const results = await Promise.all(
    PROVIDERS.map(async (provider) => {
      // Env-based API providers stay selectable: setup asks for and saves a token.
      const available =
        provider.binary === "env"
          ? true
          : provider.source === "api"
            ? await (provider.isAvailable?.() ?? Promise.resolve(false))
            : await isBinaryInstalled(provider.binary);
      const unavailableSuffix = !available
        ? i18n.t("providers.notInstalledSuffix")
        : null;

      return {
        value: provider.id,
        label: available
          ? getProviderLabel(provider, i18n)
          : `${getProviderLabel(provider, i18n)} (${unavailableSuffix})`,
        disabled: !available,
      };
    }),
  );
  return results;
}

function getDefaultRouterModel(providerId) {
  switch (providerId) {
    case "anthropic":
      return "claude-haiku-4-5-20251001";
    case "openai":
      return "gpt-4o-mini";
    case "google":
      return "gemini-2.5-flash";
    case "deepseek":
      return "deepseek-chat";
    default:
      return getProvider(providerId).defaultModel;
  }
}

function getAuthConfig(context, providerId) {
  return {
    ...(builtInConfig.auth?.[providerId] ?? {}),
    ...(context.config?.auth?.[providerId] ?? {}),
  };
}

async function promptApiKey(context, provider, authConfig) {
  if (provider.binary !== "env") return null;

  const { i18n } = context;
  const envKey = authConfig.env_key;
  const envValue = process.env[envKey];
  const configuredValue = authConfig.api_key;

  if (envValue) {
    const source = await p.select({
      message: i18n.t("setup.prompts.apiKeySource", { envKey }),
      options: [
        {
          value: "env",
          label: i18n.t("setup.options.useEnvToken", { envKey }),
        },
        {
          value: "new",
          label: i18n.t("setup.options.enterNewToken"),
        },
      ],
    });
    if (p.isCancel(source)) return null;
    if (source === "env") return { source: "env", apiKey: undefined };
  } else if (configuredValue) {
    return { source: "config", apiKey: configuredValue };
  }

  const apiKey = await p.password({
    message: i18n.t("setup.prompts.apiKey", {
      provider: getProviderLabel(provider, i18n),
    }),
    validate(value) {
      return value?.trim()
        ? undefined
        : i18n.t("setup.errors.apiKeyRequired");
    },
  });
  if (p.isCancel(apiKey)) return null;

  return { source: "config", apiKey: apiKey.trim() };
}

function buildResolvedConfig(context, providerId, authConfig, apiKeySelection) {
  return {
    ...(context.config ?? builtInConfig),
    i18n: context.i18n,
    auth: {
      ...(context.config?.auth ?? builtInConfig.auth),
      [providerId]: {
        ...authConfig,
        ...(apiKeySelection?.source === "config"
          ? { api_key: apiKeySelection.apiKey }
          : {}),
        ...(apiKeySelection?.source === "env"
          ? { api_key: undefined }
          : {}),
      },
    },
  };
}

function buildAuthPatch(providerId, authConfig, apiKeySelection) {
  if (!apiKeySelection) return null;
  return {
    [providerId]: {
      ...authConfig,
      api_key:
        apiKeySelection.source === "env"
          ? undefined
          : apiKeySelection.apiKey,
    },
  };
}

async function selectModelForProvider(
  context,
  providerId,
  {
    messageKey = "setup.prompts.model",
    exitOnCancel = false,
  } = {},
) {
  const { i18n } = context;
  const provider = getProvider(providerId, i18n);
  const authConfig = getAuthConfig(context, providerId);
  const apiKeySelection = await promptApiKey(context, provider, authConfig);
  if (apiKeySelection === null && provider.binary === "env") {
    if (exitOnCancel) onCancel(i18n);
    resetTerminalSurface();
    return null;
  }

  const modelOptions = await provider.fetchModels(
    buildResolvedConfig(context, providerId, authConfig, apiKeySelection),
  );
  const model = await p.select({
    message: i18n.t(messageKey),
    options: modelOptions,
  });
  if (p.isCancel(model)) {
    if (exitOnCancel) onCancel(i18n);
    resetTerminalSurface();
    return null;
  }

  resetTerminalSurface();
  return {
    providerId,
    model,
    authPatch: buildAuthPatch(providerId, authConfig, apiKeySelection),
  };
}

export async function selectProviderAndModel(
  context,
  { exitOnCancel = false } = {},
) {
  const { i18n } = context;
  const providerOptions = await buildProviderOptions(i18n);

  const available = providerOptions.filter((option) => !option.disabled);
  if (available.length === 0) {
    throw new Error(
      i18n.t("setup.errors.noSupportedCli", {
        binaries: PROVIDERS.map((provider) => provider.binary).join(", "),
      }),
    );
  }

  const providerId = await p.select({
    message: i18n.t("setup.prompts.provider"),
    options: providerOptions,
  });
  if (p.isCancel(providerId)) {
    if (exitOnCancel) onCancel(i18n);
    resetTerminalSurface();
    return null;
  }

  const modelSelection = await selectModelForProvider(
    context,
    providerId,
    {
      messageKey: "setup.prompts.model",
      exitOnCancel,
    },
  );
  if (!modelSelection) return null;

  return {
    providerId,
    model: modelSelection.model,
    availableProviderIds: available.map((item) => item.value),
    authPatch: modelSelection.authPatch,
  };
}

export async function selectRouterProviderAndModel(
  context,
  availableProviderIds,
  { exitOnCancel = false } = {},
) {
  const { i18n } = context;
  const providerOptions = availableProviderIds.map((providerId) => ({
    value: providerId,
    label: getProviderLabel(getProvider(providerId, i18n), i18n),
  }));
  const currentRouterProvider =
    context.config?.orchestrator?.router_provider
    ?? builtInConfig.orchestrator.router_provider;

  const routerProviderId = await p.select({
    message: i18n.t("setup.prompts.routerProvider"),
    options: providerOptions,
    initialValue: providerOptions.some((option) => option.value === currentRouterProvider)
      ? currentRouterProvider
      : providerOptions[0]?.value,
  });
  if (p.isCancel(routerProviderId)) {
    if (exitOnCancel) onCancel(i18n);
    resetTerminalSurface();
    return null;
  }

  const modelSelection = await selectModelForProvider(
    context,
    routerProviderId,
    {
      messageKey: "setup.prompts.routerModel",
      exitOnCancel,
    },
  );
  if (!modelSelection) return null;

  return {
    routerProviderId,
    routerModel: modelSelection.model ?? getDefaultRouterModel(routerProviderId),
    authPatch: modelSelection.authPatch,
  };
}

export async function runSetupScreen(context) {
  const { i18n, cwd, runtimeOverrides } = context;
  let selection;
  let routerSelection;

  try {
    selection = await selectProviderAndModel(context, { exitOnCancel: true });
    routerSelection = await selectRouterProviderAndModel(
      context,
      selection.availableProviderIds,
      { exitOnCancel: true },
    );
  } catch (err) {
    p.log.error(err.message);
    process.exit(1);
  }

  const { providerId, model, availableProviderIds, authPatch } = selection;
  const {
    routerProviderId,
    routerModel,
    authPatch: routerAuthPatch,
  } = routerSelection;

  const detectedProviders = availableProviderIds.map((providerIdValue) => {
    const provider = getProvider(providerIdValue, i18n);
    return { id: provider.id, defaultModel: provider.defaultModel };
  });
  const paths = await bootstrapConfig({ cwd, detectedProviders });
  const baseConfig = await loadConfig({ cwd, runtimeOverrides });
  const nextConfig = {
    ...baseConfig,
    active_provider: providerId,
    active_model: model,
    auth: {
      ...baseConfig.auth,
      ...(authPatch ?? {}),
      ...(routerAuthPatch ?? {}),
    },
    orchestrator: {
      ...baseConfig.orchestrator,
      router_provider: routerProviderId,
      router_model: routerModel,
    },
    providers: {
      ...baseConfig.providers,
      [providerId]: {
        ...baseConfig.providers[providerId],
        model,
      },
      [routerProviderId]: {
        ...baseConfig.providers[routerProviderId],
        model:
          baseConfig.providers[routerProviderId]?.model
          ?? getDefaultRouterModel(routerProviderId),
      },
    },
  };

  await saveConfig(nextConfig, paths);
  await saveState(
    {
      ...baseConfig.state,
      schemaVersion: nextConfig.schema_version,
      lastUsedProvider: providerId,
      lastUsedModel: model,
      lastUsedProfile: nextConfig.active_profile,
      bootstrapCompletedAt: new Date().toISOString(),
    },
    paths,
  );
  return loadConfig({ cwd, runtimeOverrides });
}
