import chalk from "chalk";

function color(theme, name, fallback = chalk.white) {
  return theme.colors?.[name] ?? fallback;
}

function frameWidth() {
  const columns = process.stdout.columns || 96;
  return Math.max(6, columns - 4);
}

function visibleLength(value) {
  return stripAnsi(value).reduce((width, char) => width + charWidth(char), 0);
}

function stripAnsi(value) {
  return [...String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")];
}

function charWidth(char) {
  const codePoint = char.codePointAt(0);
  if (!codePoint) return 0;
  if (codePoint === 0) return 0;
  if (codePoint < 32 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (codePoint >= 0x300 && codePoint <= 0x36f) return 0;
  if (
    (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2329 && codePoint <= 0x232a) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
  ) {
    return 2;
  }
  return 1;
}

function sliceToWidth(value, width) {
  let currentWidth = 0;
  let result = "";

  for (const char of String(value)) {
    const nextWidth = charWidth(char);
    if (currentWidth + nextWidth > width) break;
    result += char;
    currentWidth += nextWidth;
  }

  return result;
}

function fitText(value, width) {
  const length = visibleLength(value);
  if (length <= width) return value + " ".repeat(width - length);
  if (width <= 1) return " ".repeat(width);
  const ellipsis = "…";
  const truncated = sliceToWidth(value, width - visibleLength(ellipsis));
  return `${truncated}${ellipsis}${" ".repeat(Math.max(0, width - visibleLength(truncated) - visibleLength(ellipsis)))}`;
}

function leadingWhitespace(value) {
  const match = value.match(/^ */);
  return match ? match[0].length : 0;
}

function shiftBlockLeft(lines, targetOffset) {
  const currentOffset = Math.min(...lines.map((line) => leadingWhitespace(line)));
  const shift = Math.max(0, currentOffset - Math.max(0, targetOffset));

  return lines.map((line) => {
    const removable = Math.min(leadingWhitespace(line), shift);
    const shifted = line.slice(removable);
    return fitText(shifted, visibleLength(line));
  });
}

function trimRight(value) {
  return String(value).replace(/[ \t]+$/g, "");
}

export function buildCardLines(context, rows = []) {
  const theme = context.ui?.theme ?? {};
  const frame = theme.symbols?.frame ?? {};
  const horizontal = frame.horizontal ?? "─";
  const topLeft = frame.topLeft ?? "╭";
  const bottomLeft = frame.bottomLeft ?? "╰";
  const vertical = frame.vertical ?? "│";
  const border = color(theme, "border", chalk.dim);
  const accent = color(theme, "accent", chalk.magenta);
  const width = frameWidth();
  const contentWidth = Math.max(1, width - 4);
  const titleText = fitText(` ${theme.layout?.splashTitle ?? "MR. MUSH"}`, contentWidth);
  const splash = theme.layout?.splash ?? [];
  const artRows = shiftBlockLeft(splash.map((line) => fitText(line, contentWidth)), 2);
  const footerRow = rows.at(-1) ?? null;
  const bodyRows = footerRow ? rows.slice(0, -1) : rows;

  const lines = [border(`${topLeft}${horizontal}`) + accent(trimRight(titleText))];

  const cardRows = [
    { text: "" },
    ...artRows.map((line) => ({ text: line, paint: accent })),
    { text: "" },
    ...bodyRows.map((row) => ({
      paint: row.paint ?? color(theme, "muted", chalk.dim),
      text: fitText(row.text, contentWidth),
    })),
  ];

  for (const row of cardRows) {
    const text = trimRight(row.text);
    lines.push(border(vertical) + (row.paint ? row.paint(text) : text));
  }

  const footerText = footerRow ? trimRight(fitText(footerRow.text, contentWidth)) : "";
  const footerPaint = footerRow?.paint ?? color(theme, "muted", chalk.dim);
  lines.push(border(`${bottomLeft}${horizontal}`) + (footerText ? footerPaint(footerText) : ""));
  return lines;
}

export function buildMushCardFrame(context, rows = []) {
  const lines = buildCardLines(context, rows);
  return {
    text: `${lines.join("\n")}\n\n`,
    blockHeight: lines.length + 1,
    cursorUpLines: lines.length + 1,
  };
}

export function printMushCard(context, rows = []) {
  process.stdout.write(buildMushCardFrame(context, rows).text);
}
