import test from "node:test";
import assert from "node:assert";
import nock from "nock";
import { googleProvider } from "../../src/providers/google.js";

test("Google Provider", async (t) => {
  t.afterEach(() => {
    nock.cleanAll();
  });

  const mockConfig = {
    auth: { google: { api_key: "test-key", env_key: "GEMINI_API_KEY" } },
    activeModel: "gemini-test",
    i18n: { t: (key) => key },
  };

  await t.test("fetchModels()", async () => {
    nock("https://generativelanguage.googleapis.com")
      .get("/v1beta/models")
      .query({ key: "test-key" })
      .reply(200, {
        models: [
          { name: "models/gemini-2.5-pro", supportedGenerationMethods: ["generateContent"] },
          { name: "models/gemini-2.5-pro-vision", supportedGenerationMethods: [] }, // Filtered out
        ],
      });

    const models = await googleProvider.fetchModels(mockConfig);
    assert.strictEqual(models.length, 1);
    assert.strictEqual(models[0].value, "gemini-2.5-pro");
  });

  await t.test("exec() non-streaming", async () => {
    nock("https://generativelanguage.googleapis.com")
      .post("/v1beta/models/gemini-test:generateContent")
      .query({ key: "test-key" })
      .reply(200, {
        candidates: [{ content: { parts: [{ text: "Hello Gemini" }] } }],
        usageMetadata: { totalTokenCount: 10 },
      });

    const res = await googleProvider.exec(mockConfig, "Hi");
    assert.strictEqual(res.text, "Hello Gemini");
    assert.strictEqual(res.usage.totalTokenCount, 10);
  });

  await t.test("exec() streaming", async () => {
    nock("https://generativelanguage.googleapis.com")
      .post("/v1beta/models/gemini-test:streamGenerateContent")
      .query({ key: "test-key", alt: "sse" })
      .reply(200, 
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n' +
        'data: {"candidates":[{"content":{"parts":[{"text":"streaming"}]}}], "usageMetadata": {"totalTokenCount": 5}}\n\n',
        { "Content-Type": "text/event-stream" }
      );

    let streamResult = "";
    const res = await googleProvider.exec(mockConfig, "Hi", {}, null, {
      onToken: (token) => {
        streamResult += token;
      }
    });

    assert.strictEqual(streamResult, "Hello streaming");
    assert.strictEqual(res.text, "Hello streaming");
    assert.strictEqual(res.usage.totalTokenCount, 5);
  });

  await t.test("exec() missing API key", async () => {
    const configWithoutKey = {
      auth: { google: { env_key: "NON_EXISTENT_KEY" } },
      i18n: mockConfig.i18n
    };
    await assert.rejects(
      googleProvider.exec(configWithoutKey, "Hi"),
      /providers\.google\.missingEnv/
    );
  });
});
