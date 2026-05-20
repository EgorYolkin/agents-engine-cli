import test from "node:test";
import assert from "node:assert/strict";
import { parseToolCall } from "../../src/tools/parser.js";

// ─── MCP tool names ──────────────────────────────────────────────────────────

test("MCP tool with nested __ in tool name", () => {
  const text = '```agents-tool\n{"name":"mcp__server__deep__tool","args":{"x":1}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.equal(result.call.name, "mcp__server__deep__tool");
});

test("MCP tool with empty args", () => {
  const text = '```agents-tool\n{"name":"mcp__ctx7__list","args":{}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.call.args, {});
});

test("MCP tool with nested object args", () => {
  const text = '```agents-tool\n{"name":"mcp__srv__tool","args":{"filters":{"type":"js","max":10}}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.call.args, { filters: { type: "js", max: 10 } });
});

test("MCP tool with array args", () => {
  const text = '```agents-tool\n{"name":"mcp__srv__tool","args":{"tags":["a","b"],"count":3}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.deepEqual(result.call.args, { tags: ["a", "b"], count: 3 });
});

// ─── Multiple tool blocks ────────────────────────────────────────────────────

test("parses first tool block when multiple present", () => {
  const text = '```agents-tool\n{"name":"bash","args":{"cmd":"ls"}}\n```\n\n```agents-tool\n{"name":"bash","args":{"cmd":"pwd"}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.equal(result.call.args.cmd, "ls");
});

// ─── Whitespace handling ─────────────────────────────────────────────────────

test("tool block with extra whitespace around JSON", () => {
  const text = '```agents-tool\n  \n  {"name":"bash","args":{"cmd":"ls"}}  \n  \n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.equal(result.call.args.cmd, "ls");
});

test("tool block with Windows-style line endings", () => {
  const text = '```agents-tool\r\n{"name":"bash","args":{"cmd":"ls"}}\r\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
});

// ─── Type validation ─────────────────────────────────────────────────────────

test("name as number returns error", () => {
  const text = '```agents-tool\n{"name":123,"args":{}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  assert.match(result.error, /name must be a string/);
});

test("name as null returns error", () => {
  const text = '```agents-tool\n{"name":null,"args":{}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  assert.match(result.error, /name must be a string/);
});

test("name as array returns error", () => {
  const text = '```agents-tool\n{"name":["bash"],"args":{}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  assert.match(result.error, /name must be a string/);
});

test("args as string returns error", () => {
  const text = '```agents-tool\n{"name":"bash","args":"cmd"}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  assert.match(result.error, /args must be an object/);
});

test("args as array returns error (arrays are objects in JS, so bash.cmd check fires)", () => {
  const text = '```agents-tool\n{"name":"bash","args":["cmd"]}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  // typeof [] === "object" in JS, so args check passes, then bash.cmd check fails
  assert.match(result.error, /bash\.cmd must be a non-empty string/);
});

test("args as null returns error", () => {
  const text = '```agents-tool\n{"name":"bash","args":null}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  assert.match(result.error, /args must be an object/);
});

test("missing name field returns error", () => {
  const text = '```agents-tool\n{"args":{"cmd":"ls"}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  assert.match(result.error, /name must be a string/);
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

test("empty string returns null", () => {
  assert.equal(parseToolCall(""), null);
});

test("no tool block returns null", () => {
  assert.equal(parseToolCall("just text"), null);
});

test("tool block with no closing fence returns null (regex requires closing fence)", () => {
  const text = '```agents-tool\n{"name":"bash","args":{"cmd":"ls"}}';
  const result = parseToolCall(text);
  assert.equal(result, null);
});

test("JSON array at top level returns error (arrays are objects, name check fires)", () => {
  const text = '```agents-tool\n[1,2,3]\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  // typeof [] === "object" in JS, so object check passes, then name check fails
  assert.match(result.error, /name must be a string/);
});

test("JSON string at top level returns error", () => {
  const text = '```agents-tool\n"hello"\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, false);
  assert.match(result.error, /must be a JSON object/);
});

// ─── Unicode ─────────────────────────────────────────────────────────────────

test("unicode in MCP tool args", () => {
  const text = '```agents-tool\n{"name":"mcp__srv__search","args":{"query":"привет мир"}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.equal(result.call.args.query, "привет мир");
});

test("unicode in bash cmd", () => {
  const text = '```agents-tool\n{"name":"bash","args":{"cmd":"echo こんにちは"}}\n```';
  const result = parseToolCall(text);
  assert.equal(result.ok, true);
  assert.equal(result.call.args.cmd, "echo こんにちは");
});
