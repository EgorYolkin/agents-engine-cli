import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

/**
 * Creates a temporary directory for testing and returns its path and a cleanup function.
 */
export async function createTempDir(prefix = "mush-test-") {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const cleanup = async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };
  return { tempDir, cleanup };
}

/**
 * Intercepts process.stdout.write and process.stderr.write during the execution of a function.
 * Returns the captured output.
 */
export async function captureOutput(fn) {
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;
  let stdoutData = "";
  let stderrData = "";

  process.stdout.write = (chunk, encoding, callback) => {
    stdoutData += chunk.toString();
    if (callback) callback();
    return true;
  };

  process.stderr.write = (chunk, encoding, callback) => {
    stderrData += chunk.toString();
    if (callback) callback();
    return true;
  };

  try {
    await fn();
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }

  return { stdout: stdoutData, stderr: stderrData };
}
