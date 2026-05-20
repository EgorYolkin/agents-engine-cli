import test from "node:test";
import { assertSnapshot } from "../utils/snapshot.js";
import { renderInputBox } from "../../src/ui/input.js";
import { captureOutput } from "../utils/test-env.js";
import chalk from "chalk";

chalk.level = 0;

test("UI Input Box", async (t) => {
  const originalColumns = process.stdout.columns;
  t.afterEach(() => {
    process.stdout.columns = originalColumns;
  });

  const mockTheme = {
    colors: {
      inputBorder: (x) => x,
      inputText: (x) => x,
      suggestionBg: (x) => x,
      suggestionFg: (x) => x,
      suggestionSelBg: (x) => x,
      suggestionSelFg: (x) => x,
      suggestionDesc: (x) => x,
      cursor: (x) => x,
      statusLabelBg: (x) => x,
      statusLabelFg: (x) => x,
      statusValueBg: (x) => x,
      statusValueFg: (x) => x,
    }
  };

  await t.test("renderInputBox() with basic text", async () => {
    process.stdout.columns = 80;
    const { stdout } = await captureOutput(() => {
      renderInputBox("Hello world", [], 0, mockTheme, undefined, null, 11);
    });
    await assertSnapshot(stdout, "input-box-basic");
  });

  await t.test("renderInputBox() with suggestions", async () => {
    process.stdout.columns = 80;
    const { stdout } = await captureOutput(() => {
      renderInputBox(
        "/m",
        [
          { label: "/model", description: "Switch model" },
          { label: "/mode", description: "Switch mode" },
        ],
        0,
        mockTheme,
        undefined,
        { folder: "test", model: "gpt-4", messages: 2, sessionTime: "1m", sessionTokens: "50" },
        2
      );
    });
    await assertSnapshot(stdout, "input-box-suggestions");
  });
});

