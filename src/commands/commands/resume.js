import { openSessionBrowser } from "../../history/browser.js";
import { successResult } from "../results.js";

export const resumeCommand = {
  name: "resume",
  descriptionKey: "commands.descriptions.resume",
  usage: "/resume",
  async execute({ context }) {
    const { i18n } = context;
    const historyDir = context.config.paths.historyDir;
    const theme = context.ui?.theme ?? {};
    process.stdout.write("\n");
    const session = await openSessionBrowser(historyDir, theme);
    if (!session) return successResult("Resume cancelled.");

    context.resumedSession = session;
    return successResult(
      i18n.t("commands.messages.sessionResumed", {
        title: session.meta?.title ?? session.id,
      }),
    );
  },
};
