import test from "node:test";
import assert from "node:assert/strict";

import { getEnabledMcpServers } from "../../src/mcp/servers.js";

test("getEnabledMcpServers returns only enabled MCP servers", () => {
  const config = {
    mcp: {
      servers: {
        context7: {
          enabled: true,
          transport: "stdio",
          command: "npx",
          args: ["-y", "@upstash/context7-mcp"],
          env: {},
        },
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
      url: undefined,
      env: {},
    },
  ]);
});
