import test from "node:test";
import assert from "node:assert/strict";

import { parseToolCall } from "../../src/tools/parser.js";
import { isMcpTool, getMcpToolDefinitions, getAllToolDefinitions, TOOL_DEFINITIONS } from "../../src/tools/definitions.js";
import { createMcpRegistry } from "../../src/mcp/registry.js";
import { createTerminalEventMeta } from "../../src/ui/components/frame.js";
import { CONTEXT_SOURCES, filterSourcesByIntent } from "../../src/context/sources.js";

// ─── Parser → MCP dispatch chain ─────────────────────────────────────────────

test("parseToolCall → isMcpTool chain for MCP tool", () => {
  const text = '```agents-tool\n{"name":"mcp__ctx7__search","args":{"query":"react"}}\n```';
  const parsed = parseToolCall(text);
  assert.equal(parsed.ok, true);
  assert.equal(isMcpTool(parsed.call.name), true);
});

test("parseToolCall → isMcpTool chain for bash tool", () => {
  const text = '```agents-tool\n{"name":"bash","args":{"cmd":"ls"}}\n```';
  const parsed = parseToolCall(text);
  assert.equal(parsed.ok, true);
  assert.equal(isMcpTool(parsed.call.name), false);
});

// ─── Registry → Tool definitions ─────────────────────────────────────────────

test("getAllToolDefinitions includes MCP tools from registry", () => {
  const registry = createMcpRegistry();
  registry.register("ctx7", {}, null, {}, [
    { name: "search", description: "Search docs", inputSchema: { type: "object" } },
    { name: "query", description: "Query docs", inputSchema: { type: "object" } },
  ]);

  const all = getAllToolDefinitions(registry);
  const names = all.map((t) => t.name);

  assert.ok(names.includes("bash"));
  assert.ok(names.includes("write_file"));
  assert.ok(names.includes("mcp__ctx7__search"));
  assert.ok(names.includes("mcp__ctx7__query"));
  assert.equal(all.length, TOOL_DEFINITIONS.length + 2);
});

test("getAllToolDefinitions with null registry returns only built-in", () => {
  const all = getAllToolDefinitions(null);
  assert.equal(all.length, TOOL_DEFINITIONS.length);
});

// ─── MCP tool metadata → kind ────────────────────────────────────────────────

test("createTerminalEventMeta for MCP tool returns tool_event kind", () => {
  const meta = createTerminalEventMeta(
    { name: "mcp__ctx7__search", args: { query: "react" } },
    { content: [{ type: "text", text: "result" }], isError: false },
  );
  assert.equal(meta.kind, "tool_event");
  assert.equal(meta.title, "mcp:ctx7:search");
});

test("createTerminalEventMeta for bash returns terminal_event kind", () => {
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "ls" } },
    { stdout: "file.txt", exit_code: 0 },
  );
  assert.equal(meta.kind, "terminal_event");
});

// ─── Context sources ─────────────────────────────────────────────────────────

test("mcp-servers source is included in all domain intents", () => {
  const domains = ["devops", "backend", "frontend", "analysis"];
  for (const domain of domains) {
    const sources = filterSourcesByIntent(domain);
    const ids = sources.map((s) => s.id);
    assert.ok(
      ids.includes("mcp-servers"),
      `mcp-servers missing from ${domain} intent`,
    );
  }
});

test("CONTEXT_SOURCES has mcp-servers entry", () => {
  const source = CONTEXT_SOURCES.find((s) => s.id === "mcp-servers");
  assert.notEqual(source, null);
  assert.equal(source.priority, "normal");
});

// ─── Registry → getClientForTool ─────────────────────────────────────────────

test("registry getClientForTool returns correct client for parsed MCP tool", () => {
  const registry = createMcpRegistry();
  const client = { callTool: async () => ({}) };
  registry.register("ctx7", client, null, {}, [
    { name: "search", description: "x", inputSchema: {} },
  ]);

  const text = '```agents-tool\n{"name":"mcp__ctx7__search","args":{"query":"react"}}\n```';
  const parsed = parseToolCall(text);
  const match = registry.getClientForTool(parsed.call.name);

  assert.notEqual(match, null);
  assert.equal(match.client, client);
  assert.equal(match.entry.originalName, "search");
});

// ─── Tool definition format ──────────────────────────────────────────────────

test("MCP tool definitions have correct format", () => {
  const registry = createMcpRegistry();
  registry.register("srv", {}, null, {}, [
    { name: "tool", description: "A tool", inputSchema: { type: "object", properties: { q: { type: "string" } } } },
  ]);

  const defs = getMcpToolDefinitions(registry);
  assert.equal(defs.length, 1);
  assert.equal(defs[0].name, "mcp__srv__tool");
  assert.ok(defs[0].description.includes("[MCP:srv]"));
  assert.ok(defs[0].description.includes("A tool"));
  assert.equal(defs[0].parameters.type, "object");
  assert.notEqual(defs[0].parameters.properties.q, null);
});
