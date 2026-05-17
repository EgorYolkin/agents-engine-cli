import test from "node:test";
import assert from "node:assert/strict";

import {
  filterSearchSelectOptions,
} from "../src/ui/components/search-select.js";

const options = [
  { value: "openai", label: "OpenAI", description: "default: gpt-5.4" },
  { value: "anthropic", label: "Anthropic", description: "default: claude-sonnet" },
  { value: "google", label: "Google", description: "gemini-2.5-pro" },
  { value: "deepseek", label: "DeepSeek", description: "deepseek-chat" },
];

test("filterSearchSelectOptions keeps original order for empty query", () => {
  assert.deepEqual(filterSearchSelectOptions(options, ""), options);
});

test("filterSearchSelectOptions prefers prefix matches", () => {
  const result = filterSearchSelectOptions(options, "go");
  assert.equal(result[0]?.value, "google");
});

test("filterSearchSelectOptions matches descriptions too", () => {
  const result = filterSearchSelectOptions(options, "gemini");
  assert.equal(result[0]?.value, "google");
});

test("filterSearchSelectOptions prefers exact value matches", () => {
  const result = filterSearchSelectOptions(options, "openai");
  assert.equal(result[0]?.value, "openai");
});
