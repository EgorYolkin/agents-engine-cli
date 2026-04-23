import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { parseFileSymbols } from "../../src/intelligence/ast-parser.js";

test("parseFileSymbols extracts key symbols from parser.js", async () => {
  const filePath = path.resolve("src/tools/parser.js");
  const { symbols } = await parseFileSymbols(filePath);

  assert.ok(
    symbols.some((symbol) => (
      symbol.kind === "function" && symbol.name === "parseToolCall"
    )),
  );
  assert.ok(
    symbols.some((symbol) => (
      symbol.kind === "function" && symbol.name === "formatToolResultForModel"
    )),
  );
});
