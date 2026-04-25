import { runManualUpdateCommand } from "../../update/flow.js";
import { errorResult, successResult } from "../results.js";

export const updateCommand = {
  name: "update",
  descriptionKey: "commands.descriptions.update",
  usage: "/update check",
  args: [
    { value: "check", descriptionKey: "commands.args.updateCheck" },
    { value: "install", descriptionKey: "commands.args.updateInstall" },
  ],
  async execute({ arg, context }) {
    const { i18n } = context;
    if (arg && !["check", "install"].includes(arg)) {
      return errorResult(i18n.t("commands.errors.usageUpdate"), i18n);
    }

    const message = await runManualUpdateCommand(context, {
      install: arg === "install",
    });
    return successResult(message);
  },
};
