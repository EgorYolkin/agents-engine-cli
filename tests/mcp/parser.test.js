import test from "node:test";
import assert from "node:assert/strict";

import { parseToolCall } from "../../src/tools/parser.js";

test("parseToolCall passes through MCP tool names", () => {
  const text = [
    "Let me search for that.",
    "```agents-tool",
    '{"name":"mcp__ctx7__search","args":{"query":"react hooks"}}',
    "```",
  ].join("\n");

  const result = parseToolCall(text);
  assert.notEqual(result, null);
  assert.equal(result.ok, true);
  assert.equal(result.call.name, "mcp__ctx7__search");
  assert.deepEqual(result.call.args, { query: "react hooks" });
  assert.equal(result.before, "Let me search for that.");
});

test("parseToolCall rejects non-mcp unknown tools", () => {
  const text = [
    "```agents-tool",
    '{"name":"unknown_tool","args":{"key":"value"}}',
    "```",
  ].join("\n");

  const result = parseToolCall(text);
  assert.notEqual(result, null);
  assert.equal(result.ok, false);
  assert.ok(result.error.includes("Unsupported tool"));
});

test("parseToolCall handles MCP tool with complex args", () => {
  const text = [
    "```agents-tool",
    '{"name":"mcp__github__create_issue","args":{"title":"Bug","body":"Details here","labels":["bug"]}}',
    "```",
  ].join("\n");

  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.equal(result.call.name, "mcp__github__create_issue");
  assert.deepEqual(result.call.args, {
    title: "Bug",
    body: "Details here",
    labels: ["bug"],
  });
});
