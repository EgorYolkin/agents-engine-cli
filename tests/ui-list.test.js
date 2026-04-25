import test from "node:test";
import assert from "node:assert/strict";

import { buildChatListFrame } from "../src/ui/components/list.js";

const context = {
  config: { ui: { message_dot: "⬢" } },
  ui: { theme: {} },
};

test("buildChatListFrame renders string and object items", () => {
  const frame = buildChatListFrame(
    "Skills",
    [
      "api-design",
      {
        id: "mcp-server",
        description: "Local MCP server",
        status: "enabled",
      },
    ],
    context,
  );

  assert.match(frame.text, /⬢ Skills/);
  assert.match(frame.text, /api-design/);
  assert.match(frame.text, /mcp-server\s+enabled/);
  assert.match(frame.text, /Local MCP server/);
  assert.equal(frame.blockHeight, frame.cursorUpLines);
});

test("buildChatListFrame renders empty text and max item summary", () => {
  const emptyFrame = buildChatListFrame("MCP Servers", [], context, {
    emptyText: "No MCP servers",
  });
  assert.match(emptyFrame.text, /No MCP servers/);

  const limitedFrame = buildChatListFrame(
    "Items",
    ["one", "two", "three"],
    context,
    { maxItems: 2 },
  );
  assert.match(limitedFrame.text, /one/);
  assert.match(limitedFrame.text, /two/);
  assert.doesNotMatch(limitedFrame.text, /three/);
  assert.match(limitedFrame.text, /\+1 more/);
});
