import test from "node:test";
import assert from "node:assert/strict";
import { userConfigSchema } from "../../src/config/schema.js";

// ─── MCP server config ──────────────────────────────────────────────────────

test("accepts MCP stdio server config", () => {
  const result = userConfigSchema.safeParse({
    mcp: {
      servers: {
        ctx7: {
          enabled: true,
          transport: "stdio",
          command: "npx",
          args: ["-y", "@context7/mcp"],
        },
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.mcp.servers.ctx7.transport, "stdio");
  assert.equal(result.data.mcp.servers.ctx7.command, "npx");
});

test("accepts MCP http server config", () => {
  const result = userConfigSchema.safeParse({
    mcp: {
      servers: {
        remote: {
          enabled: true,
          transport: "http",
          url: "https://mcp.example.com",
        },
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.mcp.servers.remote.url, "https://mcp.example.com");
});

test("accepts MCP server with startup_timeout_sec", () => {
  const result = userConfigSchema.safeParse({
    mcp: {
      servers: {
        slow: {
          enabled: true,
          transport: "stdio",
          command: "cmd",
          startup_timeout_sec: 60,
        },
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.mcp.servers.slow.startup_timeout_sec, 60);
});

test("accepts MCP server with env vars", () => {
  const result = userConfigSchema.safeParse({
    mcp: {
      servers: {
        srv: {
          enabled: true,
          transport: "stdio",
          command: "cmd",
          env: { KEY: "value" },
        },
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.mcp.servers.srv.env.KEY, "value");
});

test("MCP server with enabled explicitly set", () => {
  const result = userConfigSchema.safeParse({
    mcp: {
      servers: {
        srv: {
          enabled: false,
          transport: "stdio",
          command: "cmd",
        },
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(result.data.mcp.servers.srv.enabled, false);
});

// ─── Schema strictness ───────────────────────────────────────────────────────

test("rejects extra top-level fields", () => {
  const result = userConfigSchema.safeParse({
    unknown_field: "value",
  });
  assert.equal(result.success, false);
});

test("rejects extra fields in MCP server", () => {
  const result = userConfigSchema.safeParse({
    mcp: {
      servers: {
        srv: {
          transport: "stdio",
          command: "cmd",
          unknown_prop: "value",
        },
      },
    },
  });
  assert.equal(result.success, false);
});

// ─── Defaults ────────────────────────────────────────────────────────────────

test("empty config passes with defaults", () => {
  const result = userConfigSchema.safeParse({});
  assert.equal(result.success, true);
});

test("mcp defaults when not specified", () => {
  const result = userConfigSchema.safeParse({});
  assert.equal(result.success, true);
  // mcp may be undefined or have empty servers depending on schema defaults
  const servers = result.data.mcp?.servers ?? {};
  assert.equal(Object.keys(servers).length, 0);
});

// ─── Multiple servers ────────────────────────────────────────────────────────

test("accepts multiple MCP servers", () => {
  const result = userConfigSchema.safeParse({
    mcp: {
      servers: {
        serverA: { transport: "stdio", command: "cmd-a" },
        serverB: { transport: "http", url: "https://b.example.com" },
        serverC: { transport: "stdio", command: "cmd-c", enabled: false },
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(Object.keys(result.data.mcp.servers).length, 3);
  assert.equal(result.data.mcp.servers.serverC.enabled, false);
});
