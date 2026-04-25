import os from "node:os";
import process from "node:process";

import { bootstrapConfig, loadConfig } from "../config/loader.js";
import { createI18n, resolveRuntimeLocale } from "../i18n/index.js";
import { hasProvider, getProvider } from "../providers/index.js";
import { runProviderWithTools } from "../tools/orchestrator.js";

function splitHarborModelSpec(model) {
  if (!model || !model.includes("/")) {
    return { providerId: null, model };
  }

  const [maybeProvider, ...rest] = model.split("/");
  if (!hasProvider(maybeProvider) || rest.length === 0) {
    return { providerId: null, model };
  }

  return {
    providerId: maybeProvider,
    model: rest.join("/"),
  };
}

export function normalizeHeadlessOptions(options) {
  const {
    cwd = process.cwd(),
    homeDir = os.homedir(),
    instruction,
    provider = null,
    model = null,
    profile = null,
    thinkingLevel = null,
    autoApproveTools = true,
  } = options;

  if (!instruction || !String(instruction).trim()) {
    throw new Error("instruction is required");
  }

  const trimmedInstruction = String(instruction).trim();
  const explicitProvider = provider ? String(provider).trim() : null;
  const explicitModel = model ? String(model).trim() : null;
  const parsed = explicitProvider ? { providerId: null, model: explicitModel } : splitHarborModelSpec(explicitModel);

  return {
    cwd,
    homeDir,
    instruction: trimmedInstruction,
    providerId: explicitProvider ?? parsed.providerId,
    model: explicitProvider ? explicitModel : parsed.model,
    profile,
    thinkingLevel,
    autoApproveTools: Boolean(autoApproveTools),
  };
}

export async function runHeadlessTask(options) {
  const normalized = normalizeHeadlessOptions(options);
  const { locale } = resolveRuntimeLocale();
  const i18n = createI18n({ locale, cwd: normalized.cwd });
  const provider = normalized.providerId ? getProvider(normalized.providerId, i18n) : null;
  const previousAutoApprove = process.env.MRMUSH_AUTO_APPROVE_TOOLS;

  if (normalized.autoApproveTools) {
    process.env.MRMUSH_AUTO_APPROVE_TOOLS = "1";
  }

  try {
    await bootstrapConfig({
      cwd: normalized.cwd,
      homeDir: normalized.homeDir,
      detectedProviders: provider ? [provider] : [],
    });

    const config = await loadConfig({
      cwd: normalized.cwd,
      homeDir: normalized.homeDir,
      runtimeOverrides: {
        ...(normalized.providerId ? { providerId: normalized.providerId } : {}),
        ...(normalized.model ? { model: normalized.model } : {}),
        ...(normalized.profile ? { profile: normalized.profile } : {}),
        ...(normalized.thinkingLevel ? { thinkingLevel: normalized.thinkingLevel } : {}),
      },
    });
    const resolvedProvider = getProvider(config.activeProvider, i18n);

    const response = await runProviderWithTools({
      provider: resolvedProvider,
      config,
      prompt: normalized.instruction,
      runtimeOverrides: {
        providerId: config.activeProvider,
        model: config.activeModel,
        profile: config.activeProfile,
        thinkingLevel: config.thinkingLevel,
      },
      signal: null,
      context: {
        cwd: normalized.cwd,
        i18n,
      },
    });

    return {
      ok: true,
      provider: config.activeProvider,
      model: config.activeModel,
      thinkingLevel: config.thinkingLevel,
      text: response.text ?? "",
      usage: response.usage ?? null,
    };
  } finally {
    if (previousAutoApprove == null) {
      delete process.env.MRMUSH_AUTO_APPROVE_TOOLS;
    } else {
      process.env.MRMUSH_AUTO_APPROVE_TOOLS = previousAutoApprove;
    }
  }
}
