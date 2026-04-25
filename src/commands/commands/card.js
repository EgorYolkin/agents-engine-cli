import { printMushCard } from "../../ui/mush-card.js";
import { successResult } from "../results.js";

export const cardCommand = {
  name: "card",
  descriptionKey: "commands.descriptions.card",
  usage: "/card",
  async execute({ context }) {
    process.stdout.write("\n");
    printMushCard(context);
    return successResult("Card rendered.");
  },
};
