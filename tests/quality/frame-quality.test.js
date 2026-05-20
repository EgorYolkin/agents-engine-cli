import test from "node:test";
import assert from "node:assert/strict";
import { createTerminalEventMeta } from "../../src/ui/components/frame.js";

// ─── Bash tool ───────────────────────────────────────────────────────────────

test("bash: command with stdout", () => {
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "ls" } },
    { stdout: "file1.txt\nfile2.txt\n", exit_code: 0 },
  );
  assert.notEqual(meta, null);
  assert.equal(meta.kind, "terminal_event");
  assert.ok(meta.text.includes("❯ ls"));
  assert.ok(meta.text.includes("file1.txt"));
});

test("bash: command with stderr", () => {
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "bad-cmd" } },
    { stderr: "command not found", exit_code: 127 },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("command not found"));
});

test("bash: command with both stdout and stderr", () => {
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "cmd" } },
    { stdout: "output", stderr: "warning", exit_code: 0 },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("output"));
  assert.ok(meta.text.includes("warning"));
});

test("bash: empty output shows exit code", () => {
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "true" } },
    { exit_code: 0 },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("exit code: 0"));
});

test("bash: blocked command", () => {
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "rm -rf /" } },
    { blocked: true },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("command blocked"));
});

// ─── Bash compaction ─────────────────────────────────────────────────────────

test("bash: >2 lines are compacted (canExpand=true)", () => {
  const stdout = "line1\nline2\nline3\nline4";
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "cat big" } },
    { stdout, exit_code: 0 },
  );
  assert.equal(meta.canExpand, true);
  assert.equal(meta.expanded, false);
  // Should only show 2 lines in collapsed text
  const lines = meta.text.split("\n");
  assert.ok(lines.length <= 3); // cmd + 2 output lines
});

test("bash: <=2 lines are NOT compacted (canExpand=false)", () => {
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "echo hi" } },
    { stdout: "hi", exit_code: 0 },
  );
  assert.equal(meta.canExpand, false);
});

test("bash: lines >60 chars are truncated", () => {
  const longLine = "x".repeat(100);
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "echo" } },
    { stdout: longLine, exit_code: 0 },
  );
  assert.ok(meta.text.includes("..."));
  assert.ok(meta.text.length < longLine.length + 20);
});

test("bash: fullText preserves all lines", () => {
  const stdout = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n");
  const meta = createTerminalEventMeta(
    { name: "bash", args: { cmd: "cat" } },
    { stdout, exit_code: 0 },
  );
  assert.ok(meta.fullText.includes("line9"));
});

// ─── write_file tool ─────────────────────────────────────────────────────────

test("write_file: success", () => {
  const meta = createTerminalEventMeta(
    { name: "write_file", args: { path: "src/index.js", content: "hello" } },
    { written: 5 },
  );
  assert.notEqual(meta, null);
  assert.equal(meta.kind, "terminal_event");
  assert.ok(meta.text.includes("write_file src/index.js"));
  assert.ok(meta.text.includes("written: 5 bytes"));
  assert.equal(meta.canExpand, false);
});

test("write_file: error", () => {
  const meta = createTerminalEventMeta(
    { name: "write_file", args: { path: "/forbidden", content: "x" } },
    { error: "permission denied" },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("permission denied"));
});

// ─── MCP tool ────────────────────────────────────────────────────────────────

test("MCP tool: with args and success result", () => {
  const meta = createTerminalEventMeta(
    { name: "mcp__ctx7__search", args: { query: "react hooks" } },
    { content: [{ type: "text", text: "line1\nline2\nline3" }], isError: false },
  );
  assert.notEqual(meta, null);
  assert.equal(meta.kind, "tool_event");
  assert.equal(meta.title, "mcp:ctx7:search");
  assert.ok(meta.text.includes("query=react hooks"));
  assert.ok(meta.text.includes("→ 3 lines"));
});

test("MCP tool: empty args", () => {
  const meta = createTerminalEventMeta(
    { name: "mcp__srv__list", args: {} },
    { content: [{ type: "text", text: "ok" }], isError: false },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("→ 1 lines"));
});

test("MCP tool: error result", () => {
  const meta = createTerminalEventMeta(
    { name: "mcp__srv__tool", args: { x: 1 } },
    { content: [], isError: true },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("error"));
});

test("MCP tool: arg value >50 chars is truncated", () => {
  const longVal = "a".repeat(100);
  const meta = createTerminalEventMeta(
    { name: "mcp__srv__tool", args: { query: longVal } },
    { content: [{ type: "text", text: "ok" }], isError: false },
  );
  assert.notEqual(meta, null);
  assert.ok(!meta.text.includes(longVal));
  assert.ok(meta.text.includes("..."));
});

test("MCP tool: non-string arg is JSON-stringified", () => {
  const meta = createTerminalEventMeta(
    { name: "mcp__srv__tool", args: { count: 42, enabled: true } },
    { content: [{ type: "text", text: "ok" }], isError: false },
  );
  assert.notEqual(meta, null);
  assert.ok(meta.text.includes("count=42"));
  assert.ok(meta.text.includes("enabled=true"));
});

test("MCP tool: multiple content items counted", () => {
  const meta = createTerminalEventMeta(
    { name: "mcp__srv__tool", args: {} },
    {
      content: [
        { type: "text", text: "a\nb" },
        { type: "text", text: "c\nd\ne" },
      ],
      isError: false,
    },
  );
  assert.ok(meta.text.includes("→ 5 lines"));
});

test("MCP tool: non-text content items ignored in count", () => {
  const meta = createTerminalEventMeta(
    { name: "mcp__srv__tool", args: {} },
    {
      content: [
        { type: "text", text: "a\nb" },
        { type: "image", data: "base64..." },
      ],
      isError: false,
    },
  );
  assert.ok(meta.text.includes("→ 2 lines"));
});

// ─── Unknown / null ──────────────────────────────────────────────────────────

test("unknown tool returns null", () => {
  const meta = createTerminalEventMeta(
    { name: "unknown_tool", args: {} },
    {},
  );
  assert.equal(meta, null);
});

test("null toolCall returns null", () => {
  const meta = createTerminalEventMeta(null, {});
  assert.equal(meta, null);
});
