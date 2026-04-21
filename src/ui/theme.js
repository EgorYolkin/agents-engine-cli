import fs from "node:fs/promises";
import process from "node:process";
import chalk from "chalk";
import figures from "figures";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { z } from "zod";
import { getAppPaths } from "../config/loader.js";

const COLOR_TOKENS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "gray",
  "grey",
  "blackBright",
  "redBright",
  "greenBright",
  "yellowBright",
  "blueBright",
  "magentaBright",
  "cyanBright",
  "whiteBright",
];

const colorTokenSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  .or(z.enum(COLOR_TOKENS));

const colorStyleSchema = z
  .object({
    fg: colorTokenSchema.optional(),
    bg: colorTokenSchema.optional(),
    bold: z.boolean().optional(),
    dim: z.boolean().optional(),
    italic: z.boolean().optional(),
    underline: z.boolean().optional(),
    inverse: z.boolean().optional(),
  })
  .strict();

const frameSchema = z
  .object({
    topLeft: z.string().min(1).optional(),
    topRight: z.string().min(1).optional(),
    bottomLeft: z.string().min(1).optional(),
    bottomRight: z.string().min(1).optional(),
    horizontal: z.string().min(1).optional(),
    vertical: z.string().min(1).optional(),
  })
  .strict();

const symbolsSchema = z
  .object({
    robot: z.string().min(1).optional(),
    messageDot: z.string().min(1).optional(),
    pointer: z.string().min(1).optional(),
    info: z.string().min(1).optional(),
    tick: z.string().min(1).optional(),
    bullet: z.string().min(1).optional(),
    divider: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
    frame: frameSchema.optional(),
  })
  .strict();

const layoutSchema = z
  .object({
    agentName: z.string().min(1).optional(),
    inputPaddingX: z.number().int().min(0).optional(),
    transcriptIndent: z.string().optional(),
    messageIndent: z.string().optional(),
    continuationIndent: z.string().optional(),
    maxSuggestions: z.number().int().positive().optional(),
    splashTitle: z.string().min(1).optional(),
    splash: z.array(z.string()).optional(),
  })
  .strict();

const animationSchema = z
  .object({
    frames: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

const themeOverrideSchema = z
  .object({
    colors: z
      .object({
        primary: colorStyleSchema.optional(),
        ai: colorStyleSchema.optional(),
        user: colorStyleSchema.optional(),
        success: colorStyleSchema.optional(),
        warning: colorStyleSchema.optional(),
        accent: colorStyleSchema.optional(),
        dim: colorStyleSchema.optional(),
        muted: colorStyleSchema.optional(),
        border: colorStyleSchema.optional(),
        input: colorStyleSchema.optional(),
        title: colorStyleSchema.optional(),
      })
      .strict()
      .optional(),
    symbols: symbolsSchema.optional(),
    layout: layoutSchema.optional(),
    animation: animationSchema.optional(),
  })
  .strict();

export const builtInThemeDefinition = Object.freeze({
  colors: {
    primary: { fg: "cyan" },
    ai: { fg: "magenta" },
    user: { fg: "blue" },
    success: { fg: "green" },
    warning: { fg: "yellow" },
    accent: { fg: "#a855f7" },
    dim: { dim: true },
    muted: { fg: "#94a3b8" },
    border: { dim: true },
    input: { fg: "#a855f7" },
    title: { fg: "#0b0f19", bg: "#a855f7", bold: true },
  },
  symbols: {
    robot: "\uf0e8",
    messageDot: "⬢",
    pointer: figures.pointer,
    info: figures.info,
    tick: figures.tick,
    bullet: figures.bullet,
    divider: "─",
    prompt: "❯",
    frame: {
      topLeft: "╭",
      topRight: "╮",
      bottomLeft: "╰",
      bottomRight: "╯",
      horizontal: "─",
      vertical: "│",
    },
  },
  layout: {
    agentName: "mr. mush",
    inputPaddingX: 0,
    transcriptIndent: "  ",
    messageIndent: "  ",
    continuationIndent: "    ",
    maxSuggestions: 8,
    splashTitle: "MR. MUSH",
    splash: [
      "      ▄▄███▄▄",
      "    ▄███▀█▀███▄",
      "    ▀█████████▀",
      "       █████",
    ],
  },
  animation: {
    frames: ["◐", "◓", "◑", "◒"],
  },
});

function mergeObjects(base, override) {
  if (override === undefined) return structuredClone(base);
  if (Array.isArray(base) || Array.isArray(override))
    return structuredClone(override);
  if (
    !base ||
    !override ||
    typeof base !== "object" ||
    typeof override !== "object"
  ) {
    return structuredClone(override);
  }

  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] =
      existing &&
      value &&
      typeof existing === "object" &&
      typeof value === "object" &&
      !Array.isArray(existing) &&
      !Array.isArray(value)
        ? mergeObjects(existing, value)
        : structuredClone(value);
  }
  return result;
}

async function readThemeFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    const parsed = parseYaml(content) ?? {};
    const result = themeOverrideSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
        return `${path}: ${issue.message}`;
      });
      throw new Error(`Invalid theme config ${filePath}\n${issues.join("\n")}`);
    }
    return result.data;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function applyColorToken(styler, token, mode = "fg") {
  if (!token) return styler;
  if (token.startsWith("#")) {
    return mode === "bg" ? styler.bgHex(token) : styler.hex(token);
  }
  if (mode === "bg") {
    const method = `bg${token[0].toUpperCase()}${token.slice(1)}`;
    return typeof styler[method] === "function" ? styler[method] : styler;
  }
  return typeof styler[token] === "function" ? styler[token] : styler;
}

function createStyler(style) {
  let styler = chalk;
  styler = applyColorToken(styler, style.fg, "fg");
  styler = applyColorToken(styler, style.bg, "bg");
  if (style.bold) styler = styler.bold;
  if (style.dim) styler = styler.dim;
  if (style.italic) styler = styler.italic;
  if (style.underline) styler = styler.underline;
  if (style.inverse) styler = styler.inverse;
  return styler;
}

export function createRuntimeTheme(themeDefinition) {
  return {
    colors: Object.fromEntries(
      Object.entries(themeDefinition.colors).map(([key, style]) => [
        key,
        createStyler(style),
      ]),
    ),
    symbols: structuredClone(themeDefinition.symbols),
    layout: structuredClone(themeDefinition.layout),
    animation: structuredClone(themeDefinition.animation),
  };
}

function buildCommentBlock(lines = []) {
  return lines.map((line) => `# ${line}`).join("\n");
}

export function createThemeTemplate(i18n) {
  const sections = [
    {
      key: "colors",
      comment: buildCommentBlock([
        i18n.t("themeTemplate.colors.title"),
        i18n.t("themeTemplate.colors.line1"),
        i18n.t("themeTemplate.colors.line2"),
      ]),
      value: stringifyYaml({ colors: builtInThemeDefinition.colors }).trimEnd(),
    },
    {
      key: "symbols",
      comment: buildCommentBlock([
        i18n.t("themeTemplate.symbols.title"),
        i18n.t("themeTemplate.symbols.line1"),
      ]),
      value: stringifyYaml({ symbols: builtInThemeDefinition.symbols }).trimEnd(),
    },
    {
      key: "layout",
      comment: buildCommentBlock([
        i18n.t("themeTemplate.layout.title"),
        i18n.t("themeTemplate.layout.line1"),
        i18n.t("themeTemplate.layout.line2"),
      ]),
      value: stringifyYaml({ layout: builtInThemeDefinition.layout }).trimEnd(),
    },
    {
      key: "animation",
      comment: buildCommentBlock([
        i18n.t("themeTemplate.animation.title"),
        i18n.t("themeTemplate.animation.line1"),
      ]),
      value: stringifyYaml({ animation: builtInThemeDefinition.animation }).trimEnd(),
    },
  ];

  return [
    buildCommentBlock([
      i18n.t("themeTemplate.header.title"),
      i18n.t("themeTemplate.header.line1"),
      i18n.t("themeTemplate.header.line2"),
      i18n.t("themeTemplate.header.line3"),
    ]),
    "",
    ...sections.flatMap((section, index) => [
      section.comment,
      section.value,
      ...(index === sections.length - 1 ? [] : [""]),
    ]),
    "",
  ].join("\n");
}

export async function loadTheme({ cwd = process.cwd(), homeDir } = {}) {
  const paths = getAppPaths(cwd, homeDir);
  const globalTheme = await readThemeFile(paths.themeFile);
  const projectTheme = await readThemeFile(paths.projectThemeFile);
  const resolved = mergeObjects(
    mergeObjects(builtInThemeDefinition, globalTheme ?? {}),
    projectTheme ?? {},
  );
  return createRuntimeTheme(resolved);
}

export const defaultTheme = createRuntimeTheme(builtInThemeDefinition);
