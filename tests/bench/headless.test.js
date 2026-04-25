import test from "node:test";
import assert from "node:assert/strict";

import { normalizeHeadlessOptions } from "../../src/bench/headless.js";

test("normalizeHeadlessOptions extracts provider and model from Harbor-style model spec", () => {
  const options = normalizeHeadlessOptions({
    provider: null,
    model: "ollama/qwen2.5-coder:7b",
    cwd: "/workspace",
    instruction: "fix the task",
  });

  assert.equal(options.providerId, "ollama");
  assert.equal(options.model, "qwen2.5-coder:7b");
  assert.equal(options.cwd, "/workspace");
  assert.equal(options.instruction, "fix the task");
});

test("normalizeHeadlessOptions keeps explicit provider and raw model unchanged", () => {
  const options = normalizeHeadlessOptions({
    provider: "ollama",
    model: "qwen2.5-coder:7b",
    cwd: "/workspace",
    instruction: "fix the task",
  });

  assert.equal(options.providerId, "ollama");
  assert.equal(options.model, "qwen2.5-coder:7b");
});
