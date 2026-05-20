import test from "node:test";
import assert from "node:assert";
import nock from "nock";
import { openAiCompatibleChat, fetchOpenAiCompatibleModels } from "../../src/providers/openai-compatible.js";

test("OpenAI Compatible Provider Base", async (t) => {
  t.afterEach(() => {
    nock.cleanAll();
  });

  const baseUrl = "https://api.example.com";

  await t.test("fetchOpenAiCompatibleModels()", async () => {
    nock(baseUrl)
      .get("/v1/models")
      .reply(200, {
        data: [{ id: "model-1" }, { id: "model-2" }],
      });

    const models = await fetchOpenAiCompatibleModels(baseUrl);
    assert.strictEqual(models.length, 2);
    assert.strictEqual(models[0].value, "model-1");
    assert.strictEqual(models[1].label, "model-2");
  });

  await t.test("openAiCompatibleChat() non-streaming", async () => {
    nock(baseUrl)
      .post("/v1/chat/completions", (body) => !body.stream)
      .reply(200, {
        choices: [
          { message: { content: "Non-streaming test" } }
        ],
        usage: { total_tokens: 42 }
      });

    const res = await openAiCompatibleChat({
      baseUrl,
      providerName: "test",
      model: "test-model",
      prompt: "Hello",
    });

    assert.strictEqual(res.text, "Non-streaming test");
    assert.strictEqual(res.usage.total_tokens, 42);
  });

  await t.test("openAiCompatibleChat() streaming", async () => {
    nock(baseUrl)
      .post("/v1/chat/completions", (body) => body.stream === true)
      .reply(200, 
        'data: {"choices":[{"delta":{"content":"Chunk 1"}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":" Chunk 2"}}], "usage": {"total_tokens": 15}}\n\n' +
        'data: [DONE]\n\n',
        { "Content-Type": "text/event-stream" }
      );

    let streamResult = "";
    const res = await openAiCompatibleChat({
      baseUrl,
      providerName: "test",
      model: "test-model",
      prompt: "Hello",
      onToken: (token) => {
        streamResult += token;
      }
    });

    assert.strictEqual(streamResult, "Chunk 1 Chunk 2");
    assert.strictEqual(res.text, "Chunk 1 Chunk 2");
    assert.strictEqual(res.usage.total_tokens, 15);
  });
});
