import chalk from "chalk";

// ─── Theme accessors ──────────────────────────────────────────────────────────

export function activeTheme(context) {
  return context.ui?.theme ?? {};
}

export function color(theme, name, fallback = chalk.white) {
  return theme.colors?.[name] ?? fallback;
}

// Centralised dot-symbol resolution — eliminates the repeated triple-fallback:
//   context.config.ui?.message_dot ?? theme.symbols?.messageDot ?? "⬢"
export function resolveSymbol(context) {
  const theme = activeTheme(context);
  return context.config?.ui?.message_dot ?? theme.symbols?.messageDot ?? "⬢";
}
