import test from "node:test";
import assert from "node:assert";
import path from "node:path";
import fs from "node:fs/promises";
import { evaluateWritePolicy, writeFile } from "../../src/tools/file-write.js";
import { createTempDir } from "../utils/test-env.js";

test("File Write Tool", async (t) => {
  await t.test("evaluateWritePolicy() accepts paths inside CWD", () => {
    const cwd = "/usr/src/app";
    const res = evaluateWritePolicy("src/index.js", cwd);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.resolved, "/usr/src/app/src/index.js");
  });

  await t.test("evaluateWritePolicy() blocks paths outside CWD", () => {
    const cwd = "/usr/src/app";
    const res = evaluateWritePolicy("../../../etc/passwd", cwd);
    assert.strictEqual(res.ok, false);
    assert.ok(res.error.includes("escapes working directory"));
  });

  await t.test("evaluateWritePolicy() blocks absolute paths outside CWD", () => {
    const cwd = "/usr/src/app";
    const res = evaluateWritePolicy("/etc/passwd", cwd);
    assert.strictEqual(res.ok, false);
    assert.ok(res.error.includes("escapes working directory"));
  });

  await t.test("evaluateWritePolicy() blocks denied patterns", () => {
    const cwd = "/usr/src/app";
    const res1 = evaluateWritePolicy(".git/config", cwd);
    assert.strictEqual(res1.ok, false);
    assert.ok(res1.error.includes(".git"));

    const res2 = evaluateWritePolicy("node_modules/pkg/index.js", cwd);
    assert.strictEqual(res2.ok, false);
    assert.ok(res2.error.includes("node_modules"));
  });

  await t.test("evaluateWritePolicy() enforces file size limit", () => {
    const cwd = "/usr/src/app";
    const config = { content: "a".repeat(1024 * 513), max_file_size_kb: 512 };
    const res = evaluateWritePolicy("test.txt", cwd, config);
    assert.strictEqual(res.ok, false);
    assert.ok(res.error.includes("exceeds max size"));
  });

  await t.test("writeFile() writes file within bounds", async () => {
    const { tempDir, cleanup } = await createTempDir();
    try {
      const res = await writeFile({ path: "test-dir/test.txt", content: "hello world", cwd: tempDir, config: {} });
      assert.strictEqual(res.written, 11);
      assert.strictEqual(res.error, undefined);
      
      const content = await fs.readFile(path.join(tempDir, "test-dir/test.txt"), "utf8");
      assert.strictEqual(content, "hello world");
    } finally {
      await cleanup();
    }
  });
});
