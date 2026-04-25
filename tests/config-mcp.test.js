import test from "node:test";
import assert from "node:assert/strict";

import { userConfigSchema } from "../src/config/schema.js";

test("userConfigSchema accepts MCP stdio cwd and startup timeout", () => {
  const parsed = userConfigSchema.parse({
    mcp: {
      servers: {
        "mcp-vars": {
          enabled: true,
          transport: "stdio",
          command: "npx",
          args: ["-y", "mcp-vars"],
          cwd: "/Users/egoryolkin/code/mcp-vars",
          startup_timeout_sec: 60,
        },
      },
    },
  });

  assert.deepEqual(parsed.mcp.servers["mcp-vars"], {
    enabled: true,
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-vars"],
    cwd: "/Users/egoryolkin/code/mcp-vars",
    startup_timeout_sec: 60,
    env: {},
  });
});
