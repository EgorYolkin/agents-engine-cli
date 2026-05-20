import test from "node:test";
import { assertSnapshot } from "../utils/snapshot.js";
import {
  buildAiMessageFrame,
  buildUserMessageFrame,
  buildToolEventFrame,
  buildTerminalEventFrame,
} from "../../src/ui/components/frame.js";
import chalk from "chalk";

// Disable chalk colors for consistent snapshot testing
chalk.level = 0;

test("UI Frames", async (t) => {
  const mockContext = {
    config: {
      ui: { theme: "default" },
    },
  };

  // Mock terminal width to ensure consistent wrapping
  const originalColumns = process.stdout.columns;
  t.afterEach(() => {
    process.stdout.columns = originalColumns;
  });

  await t.test("buildAiMessageFrame()", async () => {
    process.stdout.columns = 80;
    const text = "This is a test message from the AI.\nIt has multiple lines.";
    const frame = buildAiMessageFrame(text, mockContext);
    await assertSnapshot(frame.text, "ai-message-frame");
  });

  await t.test("buildUserMessageFrame()", async () => {
    process.stdout.columns = 80;
    const text = "Can you help me write tests?";
    const frame = buildUserMessageFrame(text, mockContext);
    await assertSnapshot(frame.text, "user-message-frame");
  });

  await t.test("buildToolEventFrame()", async () => {
    process.stdout.columns = 80;
    const title = "Writing file";
    const text = "tests/ui/frames.test.js\n2048 bytes written";
    const frame = buildToolEventFrame(title, text, mockContext);
    await assertSnapshot(frame.text, "tool-event-frame");
  });

  await t.test("buildTerminalEventFrame()", async () => {
    process.stdout.columns = 80;
    const text = "npm run test\nOutput:\nTests passed.";
    const frame = buildTerminalEventFrame(text, mockContext);
    await assertSnapshot(frame.text, "terminal-event-frame");
  });
});
