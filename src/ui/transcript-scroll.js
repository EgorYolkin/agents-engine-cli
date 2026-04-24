export const MOUSE_WHEEL_UP = "up";
export const MOUSE_WHEEL_DOWN = "down";

export function parseMouseWheelKey(key) {
  const match = String(key ?? "").match(/^\x1b\[<(\d+);(\d+);(\d+)([mM])$/);
  if (!match) return null;

  const button = Number(match[1]);
  if (button === 64) return MOUSE_WHEEL_UP;
  if (button === 65) return MOUSE_WHEEL_DOWN;
  return null;
}

export function maxTranscriptScrollOffset(lineCount, viewportHeight) {
  return Math.max(0, lineCount - Math.max(1, viewportHeight));
}

export function clampTranscriptScrollOffset(offset, lineCount, viewportHeight) {
  return Math.min(
    Math.max(0, offset),
    maxTranscriptScrollOffset(lineCount, viewportHeight),
  );
}

export function getVisibleTranscriptLines(lines, viewportHeight, scrollOffset) {
  const height = Math.max(1, viewportHeight);
  const offset = clampTranscriptScrollOffset(
    scrollOffset,
    lines.length,
    height,
  );
  const end = Math.max(0, lines.length - offset);
  const start = Math.max(0, end - height);
  return lines.slice(start, end);
}
