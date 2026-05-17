import { successResult } from "../results.js";

export const forkCommand = {
  name: "fork",
  descriptionKey: "commands.descriptions.fork",
  usage: "/fork",
  async execute({ context }) {
    const { i18n } = context;
    context.forkSessionRequested = true;
    return successResult(i18n.t("commands.messages.sessionForked"));
  },
};
