import test from "node:test";
import assert from "node:assert/strict";

import { isReadOnlyBashCommand } from "../../src/tools/policy.js";

test("read-only: pwd is read-only", () => {
  assert.equal(isReadOnlyBashCommand("pwd"), true);
});

test("read-only: ls is read-only", () => {
  assert.equal(isReadOnlyBashCommand("ls -la"), true);
});

test("read-only: cat is read-only", () => {
  assert.equal(isReadOnlyBashCommand("cat file.txt"), true);
});

test("read-only: find without -exec is read-only", () => {
  assert.equal(isReadOnlyBashCommand("find src -name '*.js'"), true);
});

test("read-only: find with -exec is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("find . -exec rm {} +"), false);
  assert.equal(isReadOnlyBashCommand("find . -execdir echo {} ;"), false);
});

test("read-only: git status/diff/log are read-only", () => {
  assert.equal(isReadOnlyBashCommand("git status"), true);
  assert.equal(isReadOnlyBashCommand("git diff HEAD"), true);
  assert.equal(isReadOnlyBashCommand("git log --oneline -5"), true);
});

test("read-only: git push/commit are NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("git push"), false);
  assert.equal(isReadOnlyBashCommand("git commit -m test"), false);
});

test("read-only: sed without -i is read-only", () => {
  assert.equal(isReadOnlyBashCommand("sed 's/foo/bar/' file.txt"), true);
});

test("read-only: sed -i is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("sed -i 's/foo/bar/' file.txt"), false);
});

test("read-only: sed -ni is NOT read-only (combined flags)", () => {
  assert.equal(isReadOnlyBashCommand("sed -ni 's/foo/bar/' file.txt"), false);
});

test("read-only: pipe with all read-only segments", () => {
  assert.equal(
    isReadOnlyBashCommand("find src -name '*.js' | head -20"),
    true,
  );
});

test("read-only: pipe with non-read-only segment is NOT read-only", () => {
  assert.equal(
    isReadOnlyBashCommand("cat file.txt | rm -rf /tmp/test"),
    false,
  );
});

test("read-only: empty string is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand(""), false);
});

test("read-only: rm is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("rm -rf /tmp/test"), false);
});

test("read-only: echo is read-only", () => {
  assert.equal(isReadOnlyBashCommand("echo hello"), true);
});
