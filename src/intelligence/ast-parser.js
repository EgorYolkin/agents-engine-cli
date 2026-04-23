import fs from "node:fs/promises";
import path from "node:path";

import Parser from "web-tree-sitter";

import {
  getLanguageDefinition,
  getLanguageQuery,
  getTreeSitterWasmPath,
} from "./languages.js";
import { getCachedSymbols, setCachedSymbols } from "./symbol-cache.js";

let parserInitPromise = null;
const languageCache = new Map();
const queryCache = new Map();

function ensureParserRuntime() {
  if (!parserInitPromise) {
    parserInitPromise = Parser.init({
      locateFile() {
        return getTreeSitterWasmPath();
      },
    });
  }
  return parserInitPromise;
}

async function loadLanguage(filePath) {
  const definition = getLanguageDefinition(filePath);
  if (!definition) return null;

  await ensureParserRuntime();
  const cached = languageCache.get(definition.wasmPath);
  if (cached) return { definition, language: cached };

  const language = await Parser.Language.load(definition.wasmPath);
  languageCache.set(definition.wasmPath, language);
  return { definition, language };
}

function getLanguageQueryInstance(language, languageId) {
  const cached = queryCache.get(languageId);
  if (cached) return cached;

  const query = language.query(getLanguageQuery(languageId));
  queryCache.set(languageId, query);
  return query;
}

function isExported(node) {
  let current = node;
  while (current) {
    if (current.type === "export_statement" || current.type === "export_clause") {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function isTopLevelSymbol(node) {
  let current = node?.parent ?? null;
  while (current) {
    if (current.type === "program" || current.type === "module") {
      return true;
    }
    if (
      current.type === "statement_block"
      || current.type === "class_body"
      || current.type === "function_definition"
      || current.type === "function_declaration"
      || current.type === "generator_function_declaration"
      || current.type === "class_definition"
    ) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

function firstLine(text) {
  return String(text ?? "").split("\n")[0]?.trim() ?? "";
}

function buildSymbolSignature(kind, nameNode, source, definitionNode) {
  if (kind === "function") {
    const nextNamed = nameNode.nextNamedSibling;
    const params = nextNamed?.type?.includes("parameters")
      ? nextNamed.text
      : "";
    return `${nameNode.text}${params}`;
  }

  if (kind === "class") {
    return nameNode.text;
  }

  if (kind === "variable") {
    return nameNode.text;
  }

  return firstLine(definitionNode.text).replace(/\s+/g, " ");
}

function normalizeKind(captures) {
  if (captures.has("symbol.function")) return "function";
  if (captures.has("symbol.class")) return "class";
  if (captures.has("symbol.variable")) return "variable";
  if (captures.has("symbol.import")) return "import";
  return null;
}

function symbolFromMatch(match, source) {
  const captureMap = new Map(match.captures.map((capture) => [capture.name, capture.node]));
  const kind = normalizeKind(captureMap);
  const nameNode = captureMap.get("symbol.name");
  const definitionNode = captureMap.get(`symbol.${kind}`) ?? nameNode;

  if (!kind || !nameNode || !definitionNode) return null;
  if (!isTopLevelSymbol(definitionNode)) return null;

  return {
    kind,
    name: nameNode.text,
    line: (definitionNode.startPosition?.row ?? 0) + 1,
    signature: buildSymbolSignature(kind, nameNode, source, definitionNode),
    exported: isExported(definitionNode),
  };
}

function uniqueSymbols(symbols) {
  const seen = new Set();
  return symbols.filter((symbol) => {
    const key = `${symbol.kind}:${symbol.name}:${symbol.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function regexFallback(filePath, source) {
  const extension = path.extname(filePath).toLowerCase();
  const lines = source.split("\n");
  const symbols = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    let match = null;

    if (extension === ".py") {
      match = line.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*(\([^)]*\))/);
      if (match) {
        symbols.push({
          kind: "function",
          name: match[1],
          line: index + 1,
          signature: `${match[1]}${match[2] ?? "()"}`,
          exported: false,
        });
        continue;
      }

      match = line.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (match) {
        symbols.push({
          kind: "class",
          name: match[1],
          line: index + 1,
          signature: `class ${match[1]}`,
          exported: false,
        });
        continue;
      }

      match = line.match(/^(?:from\s+([A-Za-z0-9_\.]+)\s+import|import\s+([A-Za-z0-9_\.]+))/);
      if (match) {
        symbols.push({
          kind: "import",
          name: match[1] ?? match[2],
          line: index + 1,
          signature: line,
          exported: false,
        });
      }
      continue;
    }

    match = line.match(/^(export\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(\([^)]*\))/);
    if (match) {
      symbols.push({
        kind: "function",
        name: match[2],
        line: index + 1,
        signature: `${match[2]}${match[3] ?? "()"}`,
        exported: Boolean(match[1]),
      });
      continue;
    }

    match = line.match(/^(export\s+)?class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (match) {
      symbols.push({
        kind: "class",
        name: match[2],
        line: index + 1,
        signature: `class ${match[2]}`,
        exported: Boolean(match[1]),
      });
      continue;
    }

    match = line.match(/^(export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (match) {
      symbols.push({
        kind: "variable",
        name: match[2],
        line: index + 1,
        signature: match[2],
        exported: Boolean(match[1]),
      });
      continue;
    }

    match = line.match(/^import\s+.*?from\s+['"]([^'"]+)['"]/);
    if (match) {
      symbols.push({
        kind: "import",
        name: match[1],
        line: index + 1,
        signature: line,
        exported: false,
      });
    }
  }

  return uniqueSymbols(symbols);
}

export async function parseFileSymbols(filePath) {
  const stat = await fs.stat(filePath);
  const cached = getCachedSymbols(filePath, stat.mtimeMs);
  if (cached) {
    return { symbols: cached };
  }

  const source = await fs.readFile(filePath, "utf8");

  try {
    const languageBundle = await loadLanguage(filePath);
    if (!languageBundle) {
      const regexSymbols = regexFallback(filePath, source);
      return { symbols: setCachedSymbols(filePath, stat.mtimeMs, regexSymbols) };
    }

    const parser = new Parser();
    parser.setLanguage(languageBundle.language);
    const tree = parser.parse(source);
    const query = getLanguageQueryInstance(
      languageBundle.language,
      languageBundle.definition.id,
    );
    const symbols = uniqueSymbols(
      query
        .matches(tree.rootNode)
        .map((match) => symbolFromMatch(match, source))
        .filter(Boolean)
        .sort((left, right) => left.line - right.line),
    );
    parser.delete();
    tree.delete();

    return { symbols: setCachedSymbols(filePath, stat.mtimeMs, symbols) };
  } catch {
    const regexSymbols = regexFallback(filePath, source);
    return { symbols: setCachedSymbols(filePath, stat.mtimeMs, regexSymbols) };
  }
}
