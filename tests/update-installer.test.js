import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { INSTALL_ARGS, INSTALL_COMMAND, installUpdate } from "../src/update/installer.js";
import { INSTALL_SOURCE } from "../src/update/checker.js";

function createSpawnMock(exitCode, calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", exitCode));
    return child;
  };
}

test("installUpdate resolves success on exit code 0", async () => {
  const calls = [];
  const result = await installUpdate({
    spawnImpl: createSpawnMock(0, calls),
  });

  assert.equal(result.success, true);
  assert.equal(result.code, 0);
  assert.equal(calls[0].command, INSTALL_COMMAND);
  assert.deepEqual(calls[0].args, INSTALL_ARGS);
  assert.deepEqual(calls[0].args, ["install", "-g", INSTALL_SOURCE]);
  assert.equal(calls[0].options.stdio, "inherit");
  assert.equal(calls[0].options.shell, false);
});

test("installUpdate resolves failure on non-zero exit code", async () => {
  const calls = [];
  const result = await installUpdate({
    spawnImpl: createSpawnMock(1, calls),
  });

  assert.equal(result.success, false);
  assert.equal(result.code, 1);
  assert.equal(calls[0].command, "npm");
});
