import os from "node:os";
import {
  parseConfigValue,
  saveConfig,
  saveConfigPatch,
} from "../../config/loader.js";
import { formatConfigView } from "../helpers.js";
import { errorResult, successResult } from "../results.js";

export const configCommand = {
  name: "config",
  descriptionKey: "commands.descriptions.config",
  usage: "/config show",
  args: [
    { value: "show", descriptionKey: "commands.args.configShow" },
    { value: "set", descriptionKey: "commands.args.configSet" },
    { value: "save", descriptionKey: "commands.args.configSave" },
  ],
  async execute({ args, context, config }) {
    const { i18n } = context;
    const sub = args[0] ?? "show";

    if (sub === "show") {
      return successResult(formatConfigView(config, context.runtimeOverrides));
    }

    if (sub === "set") {
      const targetPath = args[1];
      const rawValue = args.slice(2).join(" ");
      if (!targetPath || !rawValue) {
        return errorResult(i18n.t("commands.errors.usageConfigSet"), i18n);
      }

      const next = await saveConfigPatch(
        targetPath,
        parseConfigValue(rawValue),
        {
          cwd: context.cwd,
          homeDir: os.homedir(),
        },
      );

      context.config = {
        ...config,
        ...next,
      };

      return successResult(
        i18n.t("commands.messages.configUpdated", { path: targetPath }),
      );
    }

    if (sub === "save") {
      const activeProvider =
        context.runtimeOverrides.providerId ?? config.activeProvider;

      const next = {
        ...config,
        active_provider: activeProvider,
        active_model: context.runtimeOverrides.model ?? config.activeModel,
        active_profile:
          context.runtimeOverrides.profile ?? config.activeProfile,
        reasoning: {
          ...config.reasoning,
          default_effort:
            context.runtimeOverrides.thinkingLevel ?? config.thinkingLevel,
        },
        providers: {
          ...config.providers,
          [activeProvider]: {
            ...config.providers[activeProvider],
            model: context.runtimeOverrides.model ?? config.activeModel,
          },
        },
      };

      await saveConfig(next, config.paths);
      context.runtimeOverrides = {};
      return successResult(
        i18n.t("commands.messages.configSaved", {
          path: config.paths.configFile,
        }),
      );
    }

    return errorResult(
      i18n.t("commands.errors.unknownConfigSubcommand", {
        subcommand: sub,
      }),
      i18n,
    );
  },
};
