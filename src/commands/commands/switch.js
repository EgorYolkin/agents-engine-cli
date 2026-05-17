import { errorResult } from "../results.js";
import { getSwitchRegistry, runSwitchFlow } from "../../switch/index.js";

export const switchCommand = {
  name: "switch",
  descriptionKey: "commands.descriptions.switch",
  usage: "/switch",
  suggestArgs() {
    return getSwitchRegistry().list().map((block) => ({
      value: block.id,
      descriptionKey: `switch.blocks.${block.id}`,
    }));
  },
  async execute({ args, context, config }) {
    const blockId = args[0] ?? null;
    if (blockId && !getSwitchRegistry().get(blockId)) {
      return errorResult(
        context.i18n.t("switch.errors.unknownBlock", { block: blockId }),
        context.i18n,
      );
    }
    return runSwitchFlow(context, config, { blockId });
  },
};
