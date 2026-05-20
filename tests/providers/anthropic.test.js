import test from "node:test";
import assert from "node:assert";
import { anthropicProvider } from "../../src/providers/anthropic.js";
import child_process from "node:child_process";

test("Anthropic Provider (CLI wrapper)", async (t) => {
  const originalExecFile = child_process.execFile;
  const originalSpawn = child_process.spawn;

  t.afterEach(() => {
    child_process.execFile = originalExecFile;
    child_process.spawn = originalSpawn;
  });

  await t.test("fetchModels() returns static list", async () => {
    const models = await anthropicProvider.fetchModels();
    assert.ok(models.length > 0);
    assert.strictEqual(models[0].value, "claude-opus-4-6");
  });

  await t.test("isAvailable() returns true when claude is installed", async () => {
    child_process.execFile = (cmd, args, callback) => {
      assert.strictEqual(cmd, "claude");
      callback(null, "v1.0.0", "");
    };
    const available = await anthropicProvider.isAvailable();
    assert.strictEqual(available, true);
  });

  await t.test("isAvailable() returns false when claude is missing", async () => {
    child_process.execFile = (cmd, args, callback) => {
      callback(new Error("ENOENT"), "", "");
    };
    const available = await anthropicProvider.isAvailable();
    assert.strictEqual(available, false);
  });
});
