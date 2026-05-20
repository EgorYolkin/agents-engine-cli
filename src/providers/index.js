import fs from "node:fs/promises";
import path from "node:path";
import { openaiProvider } from "./openai.js";
import { anthropicProvider } from "./anthropic.js";
import { googleProvider } from "./google.js";
import { deepseekProvider } from "./deepseek.js";
import { ollamaProvider } from "./ollama.js";
import { lmstudioProvider } from "./lmstudio.js";
import { modelscopeProvider } from "./modelscope.js";
import { xiaomimimoProvider } from "./xiaomimimo.js";

export const PROVIDERS = [openaiProvider, anthropicProvider, googleProvider, deepseekProvider, ollamaProvider, lmstudioProvider, modelscopeProvider, xiaomimimoProvider];

function wrapProviderExec(provider) {
  const originalExec = provider.exec;
  provider.exec = async function (resolvedConfig, prompt, runtimeOverrides = {}, signal = null, options = {}) {
    const isDebug = runtimeOverrides?.debug !== undefined
      ? runtimeOverrides.debug
      : !!process.env.MRMUSH_DEBUG;

    if (!isDebug) {
      return originalExec.call(this, resolvedConfig, prompt, runtimeOverrides, signal, options);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logId = Math.random().toString(36).substring(2, 7);
    const logFileName = `prompt_${timestamp}_${logId}.json`;
    const cwd = resolvedConfig?.paths?.cwd ?? process.cwd();
    const logDir = path.join(cwd, ".mush", "debug", "logs");

    const requestData = {
      timestamp: new Date().toISOString(),
      providerId: provider.id,
      prompt,
      runtimeOverrides,
      options,
      promptStack: resolvedConfig?.promptStack ?? null,
      activeModel: runtimeOverrides.model ?? resolvedConfig?.activeModel ?? provider.defaultModel,
    };

    if (resolvedConfig) {
      requestData.config = {
        active_provider: resolvedConfig.active_provider ?? resolvedConfig.activeProvider,
        active_model: resolvedConfig.active_model ?? resolvedConfig.activeModel,
        active_profile: resolvedConfig.active_profile ?? resolvedConfig.activeProfile,
        reasoning: resolvedConfig.reasoning,
        ui: resolvedConfig.ui,
        tools: resolvedConfig.tools,
        intelligence: resolvedConfig.intelligence,
      };
    }

    let result;
    let error = null;
    const startTime = Date.now();
    try {
      result = await originalExec.call(this, resolvedConfig, prompt, runtimeOverrides, signal, options);
      return result;
    } catch (err) {
      error = {
        message: err.message,
        stack: err.stack,
        code: err.code,
      };
      throw err;
    } finally {
      const durationMs = Date.now() - startTime;
      const logData = {
        ...requestData,
        durationMs,
        response: result ?? null,
        error,
      };

      try {
        await fs.mkdir(logDir, { recursive: true });
        const logPath = path.join(logDir, logFileName);
        await fs.writeFile(logPath, JSON.stringify(logData, null, 2), "utf8");
      } catch (logErr) {
        if (process.env.MRMUSH_DEBUG) {
          process.stderr.write(`[debug-logger] Failed to write log: ${logErr.message}\n`);
        }
      }
    }
  };
}

for (const provider of PROVIDERS) {
  wrapProviderExec(provider);
}


export function hasProvider(id) {
  return PROVIDERS.some((provider) => provider.id === id);
}

export function getProvider(id, i18n) {
  const provider = PROVIDERS.find((p) => p.id === id);
  if (!provider) {
    if (i18n) {
      throw new Error(i18n.t("errors.unknownProvider", { id }));
    }
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}

export function getProviderLabel(provider, i18n) {
  if (provider.labelKey) return i18n.t(provider.labelKey);
  return provider.label ?? provider.id;
}
