import test from "node:test";
import assert from "node:assert";
import { openaiProvider } from "../../src/providers/openai.js";
import child_process from "node:child_process";

test("OpenAI Provider (CLI wrapper)", async (t) => {
  const originalExecFile = child_process.execFile;
  const originalSpawn = child_process.spawn;

  t.afterEach(() => {
    child_process.execFile = originalExecFile;
    child_process.spawn = originalSpawn;
  });

  await t.test("fetchModels()", async () => {
    const mockFunc = (cmd, args, callback) => {
      assert.strictEqual(cmd, "codex");
      assert.deepStrictEqual(args, ["debug", "models"]);
      const mockOutput = JSON.stringify({
        models: [
          { slug: "gpt-4", display_name: "GPT-4" },
          { slug: "hidden-model", visibility: "hidden" },
        ],
      });
      callback(null, mockOutput, "");
    };
    mockFunc[Symbol.for("nodejs.util.promisify.custom")] = async () => {
      return {
        stdout: JSON.stringify({
          models: [
            { slug: "gpt-4", display_name: "GPT-4" },
            { slug: "hidden-model", visibility: "hidden" },
          ],
        }),
        stderr: "",
      };
    };
    child_process.execFile = mockFunc;

    const models = await openaiProvider.fetchModels();
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].value, "gpt-4");
  });

  await t.test("isAvailable() returns true when codex is installed", async () => {
    child_process.execFile = (cmd, args, callback) => {
      callback(null, "v1.0.0", "");
    };
    const available = await openaiProvider.isAvailable();
    assert.strictEqual(available, true);
  });

  await t.test("isAvailable() returns false when codex is missing", async () => {
    child_process.execFile = (cmd, args, callback) => {
      callback(new Error("ENOENT"), "", "");
    };
    const available = await openaiProvider.isAvailable();
    assert.strictEqual(available, false);
  });
});
