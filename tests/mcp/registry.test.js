import test from "node:test";
import assert from "node:assert/strict";

import { createMcpRegistry } from "../../src/mcp/registry.js";

const mockTools = [
  { name: "search", description: "Search for docs", inputSchema: { type: "object", properties: { query: { type: "string" } } } },
  { name: "fetch", description: "Fetch a URL", inputSchema: { type: "object", properties: { url: { type: "string" } } } },
];

test("register adds server and indexes tools", () => {
  const registry = createMcpRegistry();
  registry.register("ctx7", {}, null, {}, mockTools);

  assert.equal(registry.hasTools(), true);
  assert.equal(registry.getAllTools().length, 2);
  assert.equal(registry.getAllServers().length, 1);

  const server = registry.getServer("ctx7");
  assert.equal(server.id, "ctx7");
  assert.equal(server.status, "connected");
  assert.equal(server.tools.length, 2);
});

test("qualifyToolName produces correct format", () => {
  const registry = createMcpRegistry();
  assert.equal(registry.qualifyToolName("ctx7", "search"), "mcp__ctx7__search");
});

test("findTool returns the correct tool entry", () => {
  const registry = createMcpRegistry();
  registry.register("ctx7", {}, null, {}, mockTools);

  const tool = registry.findTool("mcp__ctx7__search");
  assert.notEqual(tool, null);
  assert.equal(tool.serverId, "ctx7");
  assert.equal(tool.originalName, "search");
  assert.equal(tool.name, "mcp__ctx7__search");
});

test("findTool returns null for unknown tool", () => {
  const registry = createMcpRegistry();
  assert.equal(registry.findTool("mcp__unknown__foo"), null);
});

test("getClientForTool returns client and entry", () => {
  const registry = createMcpRegistry();
  const mockClient = { close: async () => {} };
  registry.register("ctx7", mockClient, null, {}, mockTools);

  const result = registry.getClientForTool("mcp__ctx7__search");
  assert.notEqual(result, null);
  assert.equal(result.client, mockClient);
  assert.equal(result.entry.originalName, "search");
});

test("getClientForTool returns null if server is in error state", () => {
  const registry = createMcpRegistry();
  registry.registerError("broken", "connection failed");

  assert.equal(registry.getClientForTool("mcp__broken__foo"), null);
});

test("registerError tracks failed servers", () => {
  const registry = createMcpRegistry();
  registry.registerError("broken", "timeout");

  const server = registry.getServer("broken");
  assert.equal(server.status, "error");
  assert.equal(server.error, "timeout");
  assert.equal(server.tools.length, 0);
});

test("unregister removes server and its tools", () => {
  const registry = createMcpRegistry();
  registry.register("ctx7", {}, null, {}, mockTools);
  assert.equal(registry.hasTools(), true);

  registry.unregister("ctx7");
  assert.equal(registry.hasTools(), false);
  assert.equal(registry.getAllServers().length, 0);
  assert.equal(registry.findTool("mcp__ctx7__search"), null);
});

test("multiple servers have separate tool namespaces", () => {
  const registry = createMcpRegistry();
  registry.register("serverA", {}, null, {}, [
    { name: "search", description: "A search", inputSchema: {} },
  ]);
  registry.register("serverB", {}, null, {}, [
    { name: "search", description: "B search", inputSchema: {} },
  ]);

  assert.equal(registry.getAllTools().length, 2);

  const toolA = registry.findTool("mcp__serverA__search");
  const toolB = registry.findTool("mcp__serverB__search");
  assert.notEqual(toolA, null);
  assert.notEqual(toolB, null);
  assert.equal(toolA.serverId, "serverA");
  assert.equal(toolB.serverId, "serverB");
});

test("clear removes everything", () => {
  const registry = createMcpRegistry();
  registry.register("ctx7", {}, null, {}, mockTools);
  registry.registerError("broken", "err");

  registry.clear();
  assert.equal(registry.hasTools(), false);
  assert.equal(registry.getAllServers().length, 0);
});
