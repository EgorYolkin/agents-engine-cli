import test from "node:test";
import assert from "node:assert/strict";

import {
  getAllToolDefinitions,
  getMcpToolDefinitions,
  isMcpTool,
  TOOL_DEFINITIONS,
} from "../../src/tools/definitions.js";
import { createMcpRegistry } from "../../src/mcp/registry.js";

test("TOOL_DEFINITIONS contains bash and write_file", () => {
  const names = TOOL_DEFINITIONS.map((t) => t.name);
  assert.ok(names.includes("bash"));
  assert.ok(names.includes("write_file"));
});

test("isMcpTool returns true for mcp__ prefixed names", () => {
  assert.equal(isMcpTool("mcp__ctx7__search"), true);
  assert.equal(isMcpTool("mcp__server__tool"), true);
});

test("isMcpTool returns false for built-in tools", () => {
  assert.equal(isMcpTool("bash"), false);
  assert.equal(isMcpTool("write_file"), false);
  assert.equal(isMcpTool("mcptool"), false);
});

test("getMcpToolDefinitions returns empty when no registry", () => {
  assert.deepEqual(getMcpToolDefinitions(null), []);
});

test("getMcpToolDefinitions returns empty when no tools", () => {
  const registry = createMcpRegistry();
  assert.deepEqual(getMcpToolDefinitions(registry), []);
});

test("getMcpToolDefinitions converts registry tools to definitions", () => {
  const registry = createMcpRegistry();
  registry.register("ctx7", {}, null, {}, [
    { name: "search", description: "Search docs", inputSchema: { type: "object" } },
  ]);

  const defs = getMcpToolDefinitions(registry);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].name, "mcp__ctx7__search");
  assert.ok(defs[0].description.includes("[MCP:ctx7]"));
  assert.ok(defs[0].description.includes("Search docs"));
});

test("getAllToolDefinitions merges built-in and MCP tools", () => {
  const registry = createMcpRegistry();
  registry.register("srv", {}, null, {}, [
    { name: "do_thing", description: "Does a thing", inputSchema: {} },
  ]);

  const all = getAllToolDefinitions(registry);
  assert.equal(all.length, TOOL_DEFINITIONS.length + 1);

  const names = all.map((t) => t.name);
  assert.ok(names.includes("bash"));
  assert.ok(names.includes("write_file"));
  assert.ok(names.includes("mcp__srv__do_thing"));
});

test("getAllToolDefinitions returns only built-in when registry is null", () => {
  const all = getAllToolDefinitions(null);
  assert.equal(all.length, TOOL_DEFINITIONS.length);
});
