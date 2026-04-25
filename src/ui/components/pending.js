import chalk from "chalk";
import { DOT_CHOICES } from "../symbols.js";
import { activeTheme, color } from "./theme.js";

// ─── Pending / thinking animation ─────────────────────────────────────────────

const PENDING_SUFFIXES = [".", "..", "...", ".."];

export function formatPendingLine(context, frameIndex) {
  const theme = activeTheme(context);
  const muted = color(theme, "muted", chalk.dim);
  const marker = DOT_CHOICES[frameIndex % DOT_CHOICES.length] ?? "⬢";
  const suffix = PENDING_SUFFIXES[frameIndex % PENDING_SUFFIXES.length];
  return muted(`${marker} Mushing${suffix}`);
}
