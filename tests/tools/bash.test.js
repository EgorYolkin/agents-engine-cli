import test from "node:test";
import assert from "node:assert";
import { runBashCommand } from "../../src/tools/bash.js";

test("Bash tool execution", async (t) => {
  await t.test("executes basic commands", async () => {
    const res = await runBashCommand({ argv: ["bash", "-c", "echo 'hello world'"], cmd: "echo 'hello world'", timeoutMs: 5000, maxOutputChars: 1000 });
    assert.strictEqual(res.exit_code, 0);
    assert.strictEqual(res.stdout, "hello world\n");
    assert.strictEqual(res.stderr, "");
    assert.strictEqual(res.truncated, false);
  });

  await t.test("captures stderr and non-zero exit codes", async () => {
    const res = await runBashCommand({ argv: ["bash", "-c", "ls /nonexistent-dir-123"], cmd: "ls /nonexistent-dir-123", timeoutMs: 5000, maxOutputChars: 1000 });
    assert.notStrictEqual(res.exit_code, 0);
    assert.ok(res.stderr.includes("No such file or directory") || res.stderr.includes("nonexistent-dir-123"));
  });

  await t.test("times out long running commands", async () => {
    const res = await runBashCommand({ argv: ["bash", "-c", "sleep 2"], cmd: "sleep 2", timeoutMs: 100, maxOutputChars: 1000 });
    assert.strictEqual(res.exit_code, null);
  });

  await t.test("truncates large output", async () => {
    const res = await runBashCommand({ argv: ["bash", "-c", "node -e 'console.log(\"a\".repeat(10000))'"], cmd: "node -e ...", timeoutMs: 5000, maxOutputChars: 1024 });
    assert.strictEqual(res.truncated, true);
    assert.ok(res.stdout.length <= 1024 + 100);
  });
});
