import test from "node:test";
import assert from "node:assert/strict";

import {
  getEnabledMcpServers,
  getMcpServerById,
  getMcpServerIds,
  validateMcpServer,
} from "./servers.js";

const stdioServer = {
  enabled: true,
  transport: "stdio",
  command: "npx",
  args: ["-y", "@upstash/context7-mcp"],
  cwd: "/tmp/context7",
  startup_timeout_sec: 60,
  env: {},
};

const httpServer = {
  enabled: true,
  transport: "http",
  url: "http://localhost:8080/mcp",
  env: {},
};

test("getEnabledMcpServers returns only enabled MCP servers", () => {
  const config = {
    mcp: {
      servers: {
        context7: { ...stdioServer },
        github: {
          enabled: false,
          transport: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: {},
        },
      },
    },
  };

  assert.deepEqual(getEnabledMcpServers(config), [
    {
      id: "context7",
      enabled: true,
      transport: "stdio",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      cwd: "/tmp/context7",
      startup_timeout_sec: 60,
      url: undefined,
      env: {},
    },
  ]);
});

test("getEnabledMcpServers returns empty array when no servers configured", () => {
  assert.deepEqual(getEnabledMcpServers({}), []);
  assert.deepEqual(getEnabledMcpServers({ mcp: {} }), []);
});

test("getMcpServerById returns the server if enabled", () => {
  const config = { mcp: { servers: { ctx7: { ...stdioServer } } } };

  const result = getMcpServerById(config, "ctx7");
  assert.notEqual(result, null);
  assert.equal(result.id, "ctx7");
  assert.equal(result.command, "npx");
});

test("getMcpServerById returns null if server does not exist", () => {
  assert.equal(getMcpServerById({ mcp: { servers: {} } }, "nonexistent"), null);
});

test("getMcpServerById returns null if server is disabled", () => {
  const config = {
    mcp: {
      servers: {
        disabledServer: { ...stdioServer, enabled: false },
      },
    },
  };
  assert.equal(getMcpServerById(config, "disabledServer"), null);
});

test("getMcpServerIds returns all server ids regardless of enabled state", () => {
  const config = {
    mcp: {
      servers: {
        alpha: { enabled: true },
        beta: { enabled: false },
      },
    },
  };

  assert.deepEqual(getMcpServerIds(config), ["alpha", "beta"]);
});

test("getMcpServerIds returns empty array when no servers", () => {
  assert.deepEqual(getMcpServerIds({}), []);
  assert.deepEqual(getMcpServerIds({ mcp: {} }), []);
});

test("validateMcpServer passes for valid stdio server", () => {
  assert.deepEqual(validateMcpServer(stdioServer), { valid: true, errors: [] });
});

test("validateMcpServer passes for valid http server", () => {
  assert.deepEqual(validateMcpServer(httpServer), { valid: true, errors: [] });
});

test("validateMcpServer fails for stdio server without command", () => {
  const result = validateMcpServer({ transport: "stdio", command: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("validateMcpServer fails for http server without url", () => {
  const result = validateMcpServer({ transport: "http", url: "" });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("validateMcpServer fails for unsupported transport", () => {
  const result = validateMcpServer({ transport: "websocket" });
  assert.equal(result.valid, false);
  assert.ok(result.errors[0].includes("unsupported transport"));
});
