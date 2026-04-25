import test from "node:test";
import assert from "node:assert/strict";

import { resolveOllamaBaseUrl } from "../../src/providers/ollama.js";

test("resolveOllamaBaseUrl prefers explicit Mr. Mush override", () => {
  const baseUrl = resolveOllamaBaseUrl({
    MRMUSH_OLLAMA_BASE_URL: "http://host.docker.internal:11434",
    OLLAMA_HOST: "http://localhost:11434",
  });

  assert.equal(baseUrl, "http://host.docker.internal:11434");
});

test("resolveOllamaBaseUrl falls back to Ollama host env", () => {
  const baseUrl = resolveOllamaBaseUrl({
    OLLAMA_HOST: "http://192.168.1.20:11434",
  });

  assert.equal(baseUrl, "http://192.168.1.20:11434");
});

test("resolveOllamaBaseUrl uses localhost default when env is absent", () => {
  const baseUrl = resolveOllamaBaseUrl({});
  assert.equal(baseUrl, "http://localhost:11434");
});
