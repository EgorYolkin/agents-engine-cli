import fs from "node:fs/promises";
import path from "node:path";

import { parseFileSymbols } from "./ast-parser.js";
import { SUPPORTED_EXTENSIONS } from "./languages.js";

const DEFAULT_MAX_FILES = 500;

function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

function isDeniedPath(relativePath, deniedPaths) {
  return deniedPaths.some((denied) => (
    relativePath === denied || relativePath.startsWith(`${denied}/`)
  ));
}

function symbolWeight(symbol) {
  let weight = 0;
  if (symbol.exported) weight += 20;
  if (symbol.kind === "function") weight += 10;
  if (symbol.kind === "class") weight += 9;
  if (symbol.kind === "variable") weight += 4;
  return weight;
}

function formatSymbolName(symbol) {
  if (symbol.kind === "function") {
    return `${symbol.name}()`;
  }
  if (symbol.kind === "class") {
    return symbol.name;
  }
  return symbol.name;
}

function formatSymbol(symbol) {
  const prefixMap = {
    function: "fn",
    class: "class",
    variable: "const",
    import: "import",
  };
  const prefix = prefixMap[symbol.kind] ?? symbol.kind;
  const suffix = symbol.exported ? " [export]" : "";
  return `  ${prefix} ${formatSymbolName(symbol)}`.trimEnd() + suffix;
}

function fitBlock(relativePath, symbols, currentText, tokenBudget) {
  const lines = [relativePath];
  for (const symbol of symbols) {
    lines.push(formatSymbol(symbol));
    const candidateBlock = lines.join("\n");
    const candidateText = currentText
      ? `${currentText}\n\n${candidateBlock}`
      : candidateBlock;
    if (estimateTokens(candidateText) > tokenBudget) {
      lines.pop();
      break;
    }
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

async function collectFiles(rootDir, options, currentDir = rootDir, bucket = []) {
  if (bucket.length >= options.maxFiles) return bucket;

  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const sortedEntries = entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of sortedEntries) {
    if (bucket.length >= options.maxFiles) break;

    const fullPath = path.join(currentDir, entry.name);
    const relativePath = path.relative(rootDir, fullPath).split(path.sep).join("/");
    if (!relativePath) continue;
    if (isDeniedPath(relativePath, options.deniedPaths)) continue;

    if (entry.isDirectory()) {
      await collectFiles(rootDir, options, fullPath, bucket);
      continue;
    }

    if (!SUPPORTED_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) continue;
    bucket.push(fullPath);
  }

  return bucket;
}

function selectImportantSymbols(symbols) {
  const ordered = [...symbols]
    .filter((symbol) => symbol.kind !== "import")
    .sort((left, right) => symbolWeight(right) - symbolWeight(left) || left.line - right.line);
  const exported = ordered.filter((symbol) => symbol.exported);

  if (exported.length > 0) {
    return exported.slice(0, 3);
  }

  return ordered.slice(0, 2);
}

export async function buildRepoMap(rootDir, options = {}) {
  const normalizedOptions = {
    tokenBudget: options.tokenBudget ?? 2000,
    deniedPaths: options.deniedPaths ?? [],
    maxFiles: options.maxFiles ?? DEFAULT_MAX_FILES,
  };
  const files = await collectFiles(rootDir, normalizedOptions);
  const blocks = [];

  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath).split(path.sep).join("/");
    const parsed = await parseFileSymbols(filePath);
    if (!parsed.symbols.length) continue;

    const importantSymbols = selectImportantSymbols(parsed.symbols);
    if (importantSymbols.length === 0) continue;
    blocks.push({
      relativePath,
      symbols: importantSymbols,
      weight: importantSymbols.reduce((sum, symbol) => sum + symbolWeight(symbol), 0),
    });
  }

  const orderedBlocks = blocks.sort((left, right) => (
    right.weight - left.weight || left.relativePath.localeCompare(right.relativePath)
  ));

  let text = "Repository map:";
  for (const block of orderedBlocks) {
    const fittedBlock = fitBlock(
      block.relativePath,
      block.symbols,
      text,
      normalizedOptions.tokenBudget,
    );
    if (!fittedBlock) continue;
    text = `${text}\n\n${fittedBlock}`;
  }

  return text === "Repository map:" ? "" : text;
}
