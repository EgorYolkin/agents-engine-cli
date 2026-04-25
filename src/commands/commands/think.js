import chalk from "chalk";
import { successResult } from "../results.js";

const EFFORT_MAP = {
  off: null,
  minimal: "low",
  low: "low",
  medium: "medium",
  high: "high",
  xhigh: "xhigh",
};

export const thinkCommand = {
  name: "think",
  descriptionKey: "commands.descriptions.think",
  usage: "/think medium",
  args: [
    { value: "off", descriptionKey: "commands.args.off" },
    { value: "minimal", descriptionKey: "commands.args.minimal" },
    { value: "low", descriptionKey: "commands.args.low" },
    { value: "medium", descriptionKey: "commands.args.medium" },
    { value: "high", descriptionKey: "commands.args.high" },
    { value: "xhigh", descriptionKey: "commands.args.xhigh" },
  ],
  async execute({ arg, context }) {
    const { i18n } = context;
    const level = Object.keys(EFFORT_MAP).includes(arg) ? arg : "medium";
    context.runtimeOverrides = {
      ...context.runtimeOverrides,
      thinkingLevel: level,
    };

    const effort = EFFORT_MAP[level];
    const display = effort ? chalk.cyan(level) : chalk.dim("off");
    return successResult(
      i18n
        .t("commands.messages.thinkingSet", {
          tick: chalk.green("✓"),
          level: display,
        })
        .replace(`${chalk.green("✓")} `, ""),
    );
  },
};
