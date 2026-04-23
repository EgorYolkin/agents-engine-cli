import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const TREE_SITTER_WASM_PATH = require.resolve("web-tree-sitter/tree-sitter.wasm");

export const SUPPORTED_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".py"];

export const LANGUAGE_QUERIES = Object.freeze({
  javascript: [
    "(function_declaration name: (identifier) @symbol.name) @symbol.function",
    "(generator_function_declaration name: (identifier) @symbol.name) @symbol.function",
    "(class_declaration name: (identifier) @symbol.name) @symbol.class",
    "(lexical_declaration (variable_declarator name: (identifier) @symbol.name)) @symbol.variable",
    "(variable_declaration (variable_declarator name: (identifier) @symbol.name)) @symbol.variable",
    "(import_statement source: (string (string_fragment) @symbol.name)) @symbol.import",
  ].join("\n"),
  typescript: [
    "(function_declaration name: (identifier) @symbol.name) @symbol.function",
    "(generator_function_declaration name: (identifier) @symbol.name) @symbol.function",
    "(class_declaration name: (type_identifier) @symbol.name) @symbol.class",
    "(class_declaration name: (identifier) @symbol.name) @symbol.class",
    "(lexical_declaration (variable_declarator name: (identifier) @symbol.name)) @symbol.variable",
    "(variable_declaration (variable_declarator name: (identifier) @symbol.name)) @symbol.variable",
    "(import_statement source: (string (string_fragment) @symbol.name)) @symbol.import",
  ].join("\n"),
  python: [
    "(function_definition name: (identifier) @symbol.name) @symbol.function",
    "(class_definition name: (identifier) @symbol.name) @symbol.class",
    "(assignment left: (identifier) @symbol.name) @symbol.variable",
    "(import_statement (dotted_name) @symbol.name) @symbol.import",
    "(import_from_statement module_name: (dotted_name) @symbol.name) @symbol.import",
  ].join("\n"),
});

const LANGUAGE_REGISTRY = Object.freeze({
  ".js": {
    id: "javascript",
    wasmPath: require.resolve("tree-sitter-javascript/tree-sitter-javascript.wasm"),
  },
  ".mjs": {
    id: "javascript",
    wasmPath: require.resolve("tree-sitter-javascript/tree-sitter-javascript.wasm"),
  },
  ".cjs": {
    id: "javascript",
    wasmPath: require.resolve("tree-sitter-javascript/tree-sitter-javascript.wasm"),
  },
  ".ts": {
    id: "typescript",
    wasmPath: require.resolve("tree-sitter-typescript/tree-sitter-typescript.wasm"),
  },
  ".tsx": {
    id: "typescript",
    wasmPath: require.resolve("tree-sitter-typescript/tree-sitter-tsx.wasm"),
  },
  ".py": {
    id: "python",
    wasmPath: require.resolve("tree-sitter-python/tree-sitter-python.wasm"),
  },
});

export function getTreeSitterWasmPath() {
  return TREE_SITTER_WASM_PATH;
}

export function getLanguageDefinition(filePath) {
  return LANGUAGE_REGISTRY[path.extname(filePath).toLowerCase()] ?? null;
}

export function getLanguageQuery(languageId) {
  return LANGUAGE_QUERIES[languageId] ?? "";
}
