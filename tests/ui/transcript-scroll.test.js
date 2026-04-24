import test from "node:test";
import assert from "node:assert/strict";

import {
  clampTranscriptScrollOffset,
  getVisibleTranscriptLines,
  maxTranscriptScrollOffset,
  parseMouseWheelKey,
} from "../../src/ui/transcript-scroll.js";

test("getVisibleTranscriptLines returns the bottom window by default", () => {
  assert.deepEqual(
    getVisibleTranscriptLines(["a", "b", "c", "d"], 2, 0),
    ["c", "d"],
  );
});

test("getVisibleTranscriptLines applies offset from the bottom", () => {
  assert.deepEqual(
    getVisibleTranscriptLines(["a", "b", "c", "d", "e"], 3, 2),
    ["a", "b", "c"],
  );
});

test("clampTranscriptScrollOffset stays within available transcript", () => {
  assert.equal(maxTranscriptScrollOffset(10, 4), 6);
  assert.equal(clampTranscriptScrollOffset(-3, 10, 4), 0);
  assert.equal(clampTranscriptScrollOffset(20, 10, 4), 6);
});

test("parseMouseWheelKey recognizes SGR mouse wheel events", () => {
  assert.equal(parseMouseWheelKey("\x1b[<64;10;5M"), "up");
  assert.equal(parseMouseWheelKey("\x1b[<65;10;5M"), "down");
  assert.equal(parseMouseWheelKey("\x1b[A"), null);
});
