import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import nock from "nock";
import { getProvider } from "../../src/providers/index.js";

test("Provider Debug Logging Wrapper", async (t) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mush-test-"));

  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const mockConfig = {
    paths: {
      cwd: tempDir,
    },
    auth: { google: { api_key: "test-key", env_key: "GEMINI_API_KEY" } },
    activeModel: "test-model",
    promptStack: { text: "system prompt" },
    i18n: { t: (key) => key },
  };

  const provider = getProvider("google");

  t.afterEach(() => {
    nock.cleanAll();
  });

  await t.test("when debug is disabled, does not write log files", async () => {
    nock("https://generativelanguage.googleapis.com")
      .post("/v1beta/models/test-model:generateContent")
      .query(true)
      .reply(200, {
        candidates: [{ content: { parts: [{ text: "normal response" }] } }],
      });

    const res = await provider.exec(mockConfig, "test prompt", { debug: false });
    assert.strictEqual(res.text, "normal response");

    // Check that log dir is empty or does not exist
    const logDir = path.join(tempDir, ".mush", "debug", "logs");
    let dirExists = true;
    try {
      await fs.access(logDir);
    } catch {
      dirExists = false;
    }
    assert.strictEqual(dirExists, false);
  });

  await t.test("when debug is enabled, writes prompt log file with all context", async () => {
    nock("https://generativelanguage.googleapis.com")
      .post("/v1beta/models/test-model-override:generateContent")
      .query(true)
      .reply(200, {
        candidates: [{ content: { parts: [{ text: "debug response" }] } }],
        usageMetadata: { totalTokenCount: 15 },
      });

    const runtimeOverrides = { debug: true, model: "test-model-override" };
    const options = { messages: [{ role: "user", content: "test prompt" }] };

    const res = await provider.exec(mockConfig, "test prompt", runtimeOverrides, null, options);
    assert.strictEqual(res.text, "debug response");

    const logDir = path.join(tempDir, ".mush", "debug", "logs");
    const files = await fs.readdir(logDir);
    assert.strictEqual(files.length, 1);
    assert.match(files[0], /^prompt_.*\.json$/);

    const logContent = JSON.parse(await fs.readFile(path.join(logDir, files[0]), "utf8"));
    assert.strictEqual(logContent.providerId, "google");
    assert.strictEqual(logContent.prompt, "test prompt");
    assert.deepStrictEqual(logContent.runtimeOverrides, runtimeOverrides);
    assert.deepStrictEqual(logContent.options, options);
    assert.deepStrictEqual(logContent.promptStack, mockConfig.promptStack);
    assert.strictEqual(logContent.response.text, "debug response");
    assert.strictEqual(logContent.response.usage.totalTokenCount, 15);
    assert.ok(typeof logContent.durationMs === "number");
    assert.strictEqual(logContent.error, null);
  });

  await t.test("when execution fails, logs the error and throws it", async () => {
    nock("https://generativelanguage.googleapis.com")
      .post("/v1beta/models/test-model:generateContent")
      .query(true)
      .reply(500, "Internal Server Error");

    const logDir = path.join(tempDir, ".mush", "debug", "logs");
    // Clear old logs
    await fs.rm(logDir, { recursive: true, force: true });

    await assert.rejects(
      provider.exec(mockConfig, "fail prompt", { debug: true }),
      /Google Gemini: HTTP 500/
    );

    const files = await fs.readdir(logDir);
    assert.strictEqual(files.length, 1);
    const logContent = JSON.parse(await fs.readFile(path.join(logDir, files[0]), "utf8"));
    assert.strictEqual(logContent.providerId, "google");
    assert.strictEqual(logContent.prompt, "fail prompt");
    assert.ok(logContent.error);
    assert.match(logContent.error.message, /Google Gemini: HTTP 500/);
    assert.strictEqual(logContent.response, null);
  });
});
