import chalk from "chalk";
import { fitText, wrapText } from "./layout.js";
import { activeTheme, color, resolveSymbol } from "./theme.js";

function normalizeListItem(item) {
  if (typeof item === "string") {
    return { title: item };
  }

  return {
    title: item.title ?? item.name ?? item.id ?? "Untitled",
    description: item.description ?? item.summary ?? "",
    detail: item.detail ?? item.value ?? item.status ?? "",
    marker: item.marker ?? item.symbol ?? "•",
    muted: item.muted ?? false,
  };
}

function buildItemLines(item, width) {
  const title = String(item.title);
  const detail = item.detail ? String(item.detail) : "";
  const head = detail ? `${title}  ${detail}` : title;
  const lines = wrapText(head, width, "  ");

  if (item.description) {
    lines.push(...wrapText(String(item.description), width, "  "));
  }

  return lines.length > 0 ? lines : [""];
}

export function buildChatListFrame(
  title,
  items,
  context,
  { emptyText = "No items", maxItems = null } = {},
) {
  const theme = activeTheme(context);
  const symbol = resolveSymbol(context);
  const accent = color(theme, "accent", chalk.magenta);
  const muted = color(theme, "muted", chalk.dim);
  const contentWidth = Math.max(1, (process.stdout.columns || 80) - 4);
  const visibleItems = Number.isInteger(maxItems)
    ? items.slice(0, Math.max(0, maxItems))
    : items;
  const remainingCount = items.length - visibleItems.length;
  const lines = [`${accent(`${symbol}\u00A0${title}`)}`];

  if (items.length === 0) {
    lines.push(`${muted("  ")}${muted(emptyText)}`);
  }

  lines.push("");
  for (const rawItem of visibleItems) {
    const item = normalizeListItem(rawItem);
    const paint = item.muted ? muted : chalk.white;
    const marker = muted(`  ${item.marker} `);
    const itemLines = buildItemLines(item, Math.max(1, contentWidth - 4));
    lines.push(
      `${marker}${paint(fitText(itemLines[0] ?? "", contentWidth - 4))}`.trimEnd(),
    );

    for (let index = 1; index < itemLines.length; index += 1) {
      lines.push(
        `${muted("    ")}${muted(fitText(itemLines[index], contentWidth - 4))}`.trimEnd(),
      );
    }
  }

  if (remainingCount > 0) {
    lines.push(`${muted("  ")}${muted(`+${remainingCount} more`)}`);
  }

  return {
    text: `${lines.join("\n")}\n\n`,
    blockHeight: lines.length + 1,
    cursorUpLines: lines.length + 1,
  };
}
