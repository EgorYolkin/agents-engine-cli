import test from "node:test";
import assert from "node:assert/strict";
import { createMcpRegistry } from "../../src/mcp/registry.js";

// ─── Duplicate registration ──────────────────────────────────────────────────

test("register same server ID twice overwrites", () => {
  const registry = createMcpRegistry();
  registry.register("srv", {}, null, {}, [
    { name: "old_tool", description: "old", inputSchema: {} },
  ]);
  registry.register("srv", {}, null, {}, [
    { name: "new_tool", description: "new", inputSchema: {} },
  ]);

  assert.equal(registry.getAllTools().length, 1);
  assert.equal(registry.getAllTools()[0].originalName, "new_tool");
  assert.notEqual(registry.findTool("mcp__srv__new_tool"), null);
  assert.equal(registry.findTool("mcp__srv__old_tool"), null);
});

// ─── Empty tools ─────────────────────────────────────────────────────────────

test("register with empty tools array", () => {
  const registry = createMcpRegistry();
  registry.register("srv", {}, null, {}, []);
  assert.equal(registry.hasTools(), false);
  assert.equal(registry.getAllServers().length, 1);
});

test("register with null tools", () => {
  const registry = createMcpRegistry();
  registry.register("srv", {}, null, {}, null);
  assert.equal(registry.hasTools(), false);
});

// ─── Partial name matching ───────────────────────────────────────────────────

test("findTool does not match partial names", () => {
  const registry = createMcpRegistry();
  registry.register("ctx7", {}, null, {}, [
    { name: "search", description: "x", inputSchema: {} },
  ]);

  assert.equal(registry.findTool("mcp__ctx7__sea"), null);
  assert.equal(registry.findTool("mcp__ctx7__search_extra"), null);
  assert.equal(registry.findTool("mcp__ctx7__"), null);
  assert.equal(registry.findTool("ctx7__search"), null);
  assert.equal(registry.findTool("mcp__ctx7"), null);
});

// ─── After unregister ────────────────────────────────────────────────────────

test("getClientForTool returns null after unregister", () => {
  const registry = createMcpRegistry();
  const client = { close: async () => {} };
  registry.register("srv", client, null, {}, [
    { name: "tool", description: "x", inputSchema: {} },
  ]);

  assert.notEqual(registry.getClientForTool("mcp__srv__tool"), null);
  registry.unregister("srv");
  assert.equal(registry.getClientForTool("mcp__srv__tool"), null);
});

// ─── Error state ─────────────────────────────────────────────────────────────

test("getClientForTool returns null for error server", () => {
  const registry = createMcpRegistry();
  registry.registerError("broken", "timeout");
  assert.equal(registry.getClientForTool("mcp__broken__tool"), null);
});

test("getServer returns error state", () => {
  const registry = createMcpRegistry();
  registry.registerError("broken", "connection refused");
  const server = registry.getServer("broken");
  assert.equal(server.status, "error");
  assert.equal(server.error, "connection refused");
  assert.deepEqual(server.tools, []);
});

// ─── Tool name collision across servers ──────────────────────────────────────

test("same tool name on different servers are namespaced", () => {
  const registry = createMcpRegistry();
  registry.register("serverA", {}, null, {}, [
    { name: "search", description: "A", inputSchema: {} },
  ]);
  registry.register("serverB", {}, null, {}, [
    { name: "search", description: "B", inputSchema: {} },
  ]);

  const toolA = registry.findTool("mcp__serverA__search");
  const toolB = registry.findTool("mcp__serverB__search");
  assert.notEqual(toolA, null);
  assert.notEqual(toolB, null);
  assert.equal(toolA.serverId, "serverA");
  assert.equal(toolB.serverId, "serverB");
  assert.equal(toolA.description, "A");
  assert.equal(toolB.description, "B");
});

// ─── Multiple tools per server ───────────────────────────────────────────────

test("server with multiple tools indexes all", () => {
  const registry = createMcpRegistry();
  registry.register("srv", {}, null, {}, [
    { name: "a", description: "A", inputSchema: {} },
    { name: "b", description: "B", inputSchema: {} },
    { name: "c", description: "C", inputSchema: {} },
  ]);

  assert.equal(registry.getAllTools().length, 3);
  assert.notEqual(registry.findTool("mcp__srv__a"), null);
  assert.notEqual(registry.findTool("mcp__srv__b"), null);
  assert.notEqual(registry.findTool("mcp__srv__c"), null);
});

// ─── Clear ───────────────────────────────────────────────────────────────────

test("clear removes all servers and tools", () => {
  const registry = createMcpRegistry();
  registry.register("a", {}, null, {}, [{ name: "t", description: "", inputSchema: {} }]);
  registry.register("b", {}, null, {}, [{ name: "u", description: "", inputSchema: {} }]);
  registry.registerError("c", "err");

  registry.clear();
  assert.equal(registry.hasTools(), false);
  assert.equal(registry.getAllServers().length, 0);
  assert.equal(registry.findTool("mcp__a__t"), null);
});

// ─── Server version and capabilities ─────────────────────────────────────────

test("register stores server version and capabilities", () => {
  const registry = createMcpRegistry();
  const version = { name: "test-server", version: "1.0.0" };
  const capabilities = { tools: { listChanged: true } };
  registry.register("srv", {}, version, capabilities, []);

  const server = registry.getServer("srv");
  assert.deepEqual(server.serverVersion, version);
  assert.deepEqual(server.serverCapabilities, capabilities);
});
