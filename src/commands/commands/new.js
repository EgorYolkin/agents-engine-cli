import { successResult } from "../results.js";

export const newCommand = {
  name: "new",
  descriptionKey: "commands.descriptions.new",
  usage: "/new",
  async execute({ context }) {
    const { i18n } = context;
    context.newSessionRequested = true;
    return successResult(i18n.t("commands.messages.sessionStarted"));
  },
};
