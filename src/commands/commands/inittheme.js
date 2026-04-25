import fs from "node:fs/promises";
import path from "node:path";
import { createThemeTemplate } from "../../ui/theme.js";
import { errorResult, successResult } from "../results.js";

export const initThemeCommand = {
  name: "inittheme",
  descriptionKey: "commands.descriptions.inittheme",
  usage: "/inittheme",
  async execute({ context, config }) {
    const { i18n } = context;
    const filePath = config.paths.projectThemeFile;
    try {
      await fs.access(filePath);
      return errorResult(
        i18n.t("commands.errors.themeAlreadyExists", { path: filePath }),
        i18n,
      );
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, createThemeTemplate(i18n), "utf8");
    return successResult(
      i18n.t("commands.messages.themeInitialized", { path: filePath }),
    );
  },
};
