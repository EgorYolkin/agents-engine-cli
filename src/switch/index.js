import { promptSearchSelect } from "../ui/components/search-select.js";
import { renderInputBox } from "../ui/input.js";
import { getProvider, getProviderLabel, PROVIDERS } from "../providers/index.js";
import { PROFILE_IDS, THINKING_LEVELS } from "../config/schema.js";
import { saveConfig } from "../config/loader.js";
import { SwitchRegistry, buildSwitchSuggestions } from "./registry.js";

function createModelBlock() {
  return {
    id: "model",
    label: "Model",
    description: "Switch active model",
    getCurrentValueLabel(context, config) {
      const providerId = context.runtimeOverrides.providerId ?? config.activeProvider;
      const model = context.runtimeOverrides.model ?? config.activeModel;
      return `${providerId}/${model}`;
    },
    async getOptions(context, config) {
      const providerId = context.runtimeOverrides.providerId ?? config.activeProvider;
      const provider = getProvider(providerId, context.i18n);
      const models = await provider.fetchModels(config);
      const currentModel = context.runtimeOverrides.model ?? config.activeModel;
      return models.map((m) => ({
        value: m.value,
        label: m.label ?? m.value,
        description: m.value === currentModel ? "current" : providerId,
      }));
    },
    async apply(context, config, option) {
      const providerId = context.runtimeOverrides.providerId ?? config.activeProvider;
      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        providerId,
        model: option.value,
      };

      const nextConfig = await saveConfig(
        {
          ...config,
          active_provider: providerId,
          active_model: option.value,
          providers: {
            ...config.providers,
            [providerId]: {
              ...config.providers[providerId],
              model: option.value,
            },
          },
        },
        config.paths,
      );

      context.config = {
        ...config,
        ...nextConfig,
        activeProvider: providerId,
        activeModel: option.value,
      };

      return {
        message: context.i18n.t("commands.messages.modelSet", {
          model: `${providerId}/${option.value}`,
        }),
      };
    },
  };
}

function createThinkingBlock() {
  return {
    id: "thinking",
    label: "Thinking",
    description: "Set thinking effort level",
    getCurrentValueLabel(context, config) {
      return context.runtimeOverrides.thinkingLevel ?? config.thinkingLevel;
    },
    async getOptions(context, config) {
      const current = context.runtimeOverrides.thinkingLevel ?? config.thinkingLevel;
      return THINKING_LEVELS.map((level) => ({
        value: level,
        label: level,
        description: level === current ? "current" : "",
      }));
    },
    async apply(context, _config, option) {
      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        thinkingLevel: option.value,
      };
      return {
        message: context.i18n.t("commands.messages.thinkingSet", {
          tick: "",
          level: option.value,
        }).trim(),
      };
    },
  };
}

function createDebugBlock() {
  return {
    id: "debug",
    label: "Debug",
    description: "Toggle debug mode",
    getCurrentValueLabel(context) {
      return context.runtimeOverrides.debug ? "on" : "off";
    },
    async getOptions(context) {
      const current = context.runtimeOverrides.debug ? "on" : "off";
      return ["on", "off"].map((value) => ({
        value,
        label: value,
        description: value === current ? "current" : "",
      }));
    },
    async apply(context, _config, option) {
      const nextValue = option.value === "on";
      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        debug: nextValue,
      };
      return {
        message: context.i18n.t("commands.messages.debugSet", {
          mode: nextValue ? "on" : "off",
        }),
      };
    },
  };
}

function createProfileBlock() {
  return {
    id: "profile",
    label: "Profile",
    description: "Switch active profile",
    getCurrentValueLabel(context, config) {
      return context.runtimeOverrides.profile ?? config.activeProfile;
    },
    async getOptions(context, config) {
      const current = context.runtimeOverrides.profile ?? config.activeProfile;
      return PROFILE_IDS.map((profile) => ({
        value: profile,
        label: profile,
        description: profile === current ? "current" : "",
      }));
    },
    async apply(context, _config, option) {
      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        profile: option.value,
        config: {
          ...(context.runtimeOverrides.config ?? {}),
          active_profile: option.value,
        },
      };
      return {
        message: context.i18n.t("commands.messages.profileSet", {
          profile: option.value,
        }),
      };
    },
  };
}

function createProviderBlock() {
  return {
    id: "provider",
    label: "Provider",
    description: "Switch active provider",
    getCurrentValueLabel(context, config) {
      return context.runtimeOverrides.providerId ?? config.activeProvider;
    },
    async getOptions(context, config) {
      const current = context.runtimeOverrides.providerId ?? config.activeProvider;
      return PROVIDERS.map((provider) => ({
        value: provider.id,
        label: getProviderLabel(provider, context.i18n),
        description: provider.id === current ? "current" : (provider.defaultModel ?? ""),
      }));
    },
    async apply(context, _config, option) {
      const provider = getProvider(option.value, context.i18n);
      context.runtimeOverrides = {
        ...context.runtimeOverrides,
        providerId: provider.id,
      };
      return {
        message: context.i18n.t("commands.messages.providerSet", {
          providerId: provider.id,
        }),
      };
    },
  };
}

let builtInRegistry = null;

export function getSwitchRegistry() {
  if (builtInRegistry) return builtInRegistry;

  builtInRegistry = new SwitchRegistry()
    .register(createModelBlock())
    .register(createProviderBlock())
    .register(createThinkingBlock())
    .register(createProfileBlock())
    .register(createDebugBlock());

  return builtInRegistry;
}

export function isShiftTabKey(key) {
  return key === "\x1b[Z" || key === "\x1b[1;2Z";
}

export async function runSwitchFlow(
  context,
  config,
  {
    blockId = null,
    renderInput = null,
  } = {},
) {
  const registry = getSwitchRegistry();
  let block = blockId ? registry.get(blockId) : null;

  if (!block) {
    const selectedBlockId = await promptSearchSelect(
      context.i18n.t("switch.prompts.target"),
      buildSwitchSuggestions(registry, context, config),
      {},
      {
        onKey: (key) => {
          if (!renderInput) return false;
          if (!isShiftTabKey(key)) return false;
          renderInput();
          return true;
        },
      },
    );
    if (selectedBlockId === null) {
      renderInput?.();
      return { handled: true, rendered: true };
    }
    block = registry.get(selectedBlockId);
  }

  if (!block) {
    renderInput?.();
    return {
      handled: true,
      message: context.i18n.t("switch.errors.unknownBlock", {
        block: blockId ?? "",
      }),
    };
  }

  const options = await block.getOptions(context, config);
  if (options === null) {
    renderInput?.();
    return { handled: true, rendered: true };
  }

  if (options.length === 1 && options[0].meta) {
    renderInput?.();
    const applied = await block.apply(context, config, options[0]);
    return { handled: true, message: applied.message };
  }

  const currentValue = block.getCurrentValueLabel?.(context, config) ?? "";
  const selectedValue = await promptSearchSelect(
    context.i18n.t("switch.prompts.value", { target: block.label }),
    options,
    {},
    {
      initialQuery: currentValue,
      onKey: (key) => {
        if (!renderInput) return false;
        if (!isShiftTabKey(key)) return false;
        renderInput();
        return true;
      },
    },
  );
  renderInput?.();
  if (selectedValue === null) {
    return { handled: true, rendered: true };
  }

  const selectedOption = options.find((option) => option.value === selectedValue);
  const applied = await block.apply(context, config, selectedOption);
  return { handled: true, message: applied.message };
}

