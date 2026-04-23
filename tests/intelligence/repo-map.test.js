import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { buildRepoMap } from "../../src/intelligence/repo-map.js";
import { buildRepoMapAnswer } from "../../src/intelligence/index.js";

test("buildRepoMap formats compact repository summary within budget", async () => {
  const fixtureDir = path.resolve("tests/intelligence/fixtures/sample-repo");
  const text = await buildRepoMap(fixtureDir, {
    tokenBudget: 120,
    deniedPaths: [],
    maxFiles: 20,
  });

  assert.match(text, /Repository map:/);
  assert.match(text, /alpha\.js/);
  assert.match(text, /fn alpha\(\) \[export\]/);
  assert.match(text, /class AlphaService \[export\]/);
  assert.doesNotMatch(text, /import /);
  assert.doesNotMatch(text, /const const /);
  assert.doesNotMatch(text, /import import /);
  assert.doesNotMatch(text, /internalValue/);
  assert.ok(Math.ceil(text.length / 4) <= 120);
});

test("buildRepoMapAnswer returns concise summary for project map prompts", () => {
  const repoMapText = [
    "Repository map context:",
    "This is a generated high-level map of the current repository.",
    "",
    "Repository map:",
    "",
    "src/config/loader.js",
    "  fn loadConfig() [export]",
    "  fn resolvePromptStack() [export]",
    "",
    "src/providers/index.js",
    "  fn getProvider() [export]",
    "",
    "src/ui/scenes/chat.js",
    "  fn runChatScreen() [export]",
    "",
    "src/orchestrator/action-selector.js",
    "  fn selectAction() [export]",
  ].join("\n");

  const answer = buildRepoMapAnswer(repoMapText, "что это за проект? какая его карта?", {
    cwd: path.resolve("."),
    name: "mr-mush",
    isCli: true,
    isEsm: true,
  });

  assert.match(answer, /Это проект mr-mush/i);
  assert.match(answer, /Ключевые зоны:/);
  assert.match(answer, /Краткая карта:/);
  assert.match(answer, /`src\/config\/loader\.js`/);
  assert.ok(answer.length < 2500);
});
