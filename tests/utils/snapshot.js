import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert";

/**
 * A lightweight snapshot testing utility.
 * Compares actual string output to a saved .snap file.
 * If the UPDATE_SNAPSHOTS env var is set, it overwrites the snapshot.
 */
export async function assertSnapshot(actual, snapshotName) {
  const callerDir = path.dirname(new Error().stack.split("\n")[2].match(/\((.*):\d+:\d+\)/)[1].replace("file://", ""));
  const snapshotsDir = path.join(callerDir, "__snapshots__");
  const snapshotPath = path.join(snapshotsDir, `${snapshotName}.snap`);

  await fs.mkdir(snapshotsDir, { recursive: true });

  const shouldUpdate = process.env.UPDATE_SNAPSHOTS === "1";

  if (shouldUpdate) {
    await fs.writeFile(snapshotPath, actual, "utf8");
    return;
  }

  try {
    const expected = await fs.readFile(snapshotPath, "utf8");
    assert.strictEqual(actual, expected);
  } catch (err) {
    if (err.code === "ENOENT") {
      await fs.writeFile(snapshotPath, actual, "utf8");
      console.warn(`\n[SNAPSHOT] Created new snapshot: ${snapshotName}.snap`);
    } else {
      throw err;
    }
  }
}
