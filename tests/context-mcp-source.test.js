import test from "node:test";
import assert from "node:assert/strict";

import { CONTEXT_SOURCES } from "../src/context/sources.js";

function getMcpSource() {
  return CONTEXT_SOURCES.find((s) => s.id === "mcp-servers");
}

test("mcp-servers source exists in CONTEXT_SOURCES", () => {
  const source = getMcpSource();
  assert.notEqual(source, null);
  assert.equal(source.priority, "normal");
});

test("mcp-servers returns null when no MCP servers configured", async () => {
  const source = getMcpSource();
  const result = await source.fetch({ config: {} });
  assert.equal(result, null);
});

test("mcp-servers returns null when no enabled servers", async () => {
  const source = getMcpSource();
  const config = {
    mcp: {
      servers: {
        disabled: { enabled: false, transport: "stdio", command: "echo" },
      },
    },
  };
  const result = await source.fetch({ config });
  assert.equal(result, null);
});

test("mcp-servers formats stdio server correctly", async () => {
  const source = getMcpSource();
  const config = {
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
  };
  const result = await source.fetch({ config });
  assert.notEqual(result, null);
  assert.equal(result.id, "mcp-servers");
  assert.ok(result.content.includes("ctx7"));
  assert.ok(result.content.includes("stdio"));
  assert.ok(result.content.includes("npx -y @context7/mcp"));
  assert.ok(result.content.includes("## MCP Servers"));
});

test("mcp-servers formats http server correctly", async () => {
  const source = getMcpSource();
  const config = {
    mcp: {
      servers: {
        remote: {
          enabled: true,
          transport: "http",
          url: "https://mcp.example.com",
        },
      },
    },
  };
  const result = await source.fetch({ config });
  assert.notEqual(result, null);
  assert.ok(result.content.includes("remote"));
  assert.ok(result.content.includes("http"));
  assert.ok(result.content.includes("https://mcp.example.com"));
});

test("mcp-servers lists multiple enabled servers", async () => {
  const source = getMcpSource();
  const config = {
    mcp: {
      servers: {
        serverA: { enabled: true, transport: "stdio", command: "cmd-a" },
        serverB: { enabled: true, transport: "http", url: "https://b.example.com" },
        serverC: { enabled: false, transport: "stdio", command: "cmd-c" },
      },
    },
  };
  const result = await source.fetch({ config });
  assert.notEqual(result, null);
  assert.ok(result.content.includes("serverA"));
  assert.ok(result.content.includes("serverB"));
  assert.ok(!result.content.includes("serverC"));
});
