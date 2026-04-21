import chalk from "chalk";
import { getSuggestions } from "../commands/index.js";

function frameWidth() {
  const columns = process.stdout.columns || 96;
  return Math.max(6, Math.min(columns - 1, 92));
}

function createRenderState() {
  return { cursorUpLines: 0, blockHeight: 0 };
}

function resetRenderState(state) {
  if (!state) return;
  state.cursorUpLines = 0;
  state.blockHeight = 0;
}

function fitLine(value, width) {
  if (value.length <= width) return value + " ".repeat(width - value.length);
  if (width <= 1) return " ".repeat(width);
  return value.slice(0, width - 1) + "…";
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getCursorLocation(buffer, cursorIndex) {
  const lines = buffer.split("\n");
  let offset = 0;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineEnd = offset + line.length;
    if (cursorIndex <= lineEnd) {
      return { lineIndex, column: cursorIndex - offset };
    }
    offset = lineEnd + 1;
  }

  const lastLine = lines[lines.length - 1] ?? "";
  return { lineIndex: lines.length - 1, column: lastLine.length };
}

function getLineStartIndex(buffer, targetLineIndex) {
  const lines = buffer.split("\n");
  let offset = 0;
  for (let lineIndex = 0; lineIndex < Math.min(targetLineIndex, lines.length); lineIndex += 1) {
    offset += lines[lineIndex].length + 1;
  }
  return offset;
}

function moveCursorVertical(buffer, cursorIndex, direction) {
  const lines = buffer.split("\n");
  const { lineIndex, column } = getCursorLocation(buffer, cursorIndex);
  const nextLineIndex = lineIndex + direction;
  if (nextLineIndex < 0 || nextLineIndex >= lines.length) {
    return { moved: false, cursorIndex };
  }

  const nextLine = lines[nextLineIndex] ?? "";
  const nextColumn = Math.min(column, nextLine.length);
  return {
    moved: true,
    cursorIndex: getLineStartIndex(buffer, nextLineIndex) + nextColumn,
  };
}

function insertAt(buffer, cursorIndex, text) {
  return buffer.slice(0, cursorIndex) + text + buffer.slice(cursorIndex);
}

function deleteRange(buffer, start, end) {
  return buffer.slice(0, start) + buffer.slice(end);
}

function deletePreviousWordAt(buffer, cursorIndex) {
  const before = buffer.slice(0, cursorIndex).replace(/[^\s]*\s*$/, "");
  return {
    buffer: before + buffer.slice(cursorIndex),
    cursorIndex: before.length,
  };
}

function moveCursorWordLeft(buffer, cursorIndex) {
  let index = cursorIndex;
  while (index > 0 && /\s/.test(buffer[index - 1])) index -= 1;
  while (index > 0 && !/\s/.test(buffer[index - 1])) index -= 1;
  return index;
}

function moveCursorWordRight(buffer, cursorIndex) {
  let index = cursorIndex;
  while (index < buffer.length && /\s/.test(buffer[index])) index += 1;
  while (index < buffer.length && !/\s/.test(buffer[index])) index += 1;
  return index;
}

function moveCursorLineStart(buffer, cursorIndex) {
  return getLineStartIndex(buffer, getCursorLocation(buffer, cursorIndex).lineIndex);
}

function moveCursorLineEnd(buffer, cursorIndex) {
  const { lineIndex } = getCursorLocation(buffer, cursorIndex);
  const lineStart = getLineStartIndex(buffer, lineIndex);
  const line = buffer.split("\n")[lineIndex] ?? "";
  return lineStart + line.length;
}

function isSubmitKey(key) {
  return key === "\r";
}

function isNewlineKey(key) {
  return key === "\x0a"
    || key === "\x1b[13;2u"
    || key === "\x1b[13;2~"
    || key === "\x1b[27;2;13~";
}

function isArrowUp(key) {
  return key === "\x1b[A";
}

function isArrowDown(key) {
  return key === "\x1b[B";
}

function isArrowLeft(key) {
  return key === "\x1b[D";
}

function isArrowRight(key) {
  return key === "\x1b[C";
}

function isWordLeft(key) {
  return key === "\x1bb" || key === "\x1b[1;3D" || key === "\x1b[1;5D";
}

function isWordRight(key) {
  return key === "\x1bf" || key === "\x1b[1;3C" || key === "\x1b[1;5C";
}

function isLineStartKey(key) {
  return key === "\x01" || key === "\x1b[H" || key === "\x1bOH" || key === "\x1b[1~" || key === "\x1b[1;9D";
}

function isLineEndKey(key) {
  return key === "\x05" || key === "\x1b[F" || key === "\x1bOF" || key === "\x1b[4~" || key === "\x1b[1;9C";
}

function visibleLineSlice(line, width, cursorColumn) {
  if (width <= 0) return { display: "", visibleCursorColumn: 0 };
  if (line.length <= width) {
    return {
      display: line + " ".repeat(width - line.length),
      visibleCursorColumn: cursorColumn,
    };
  }

  const start = clamp(cursorColumn - width + 1, 0, Math.max(0, line.length - width));
  const visible = line.slice(start, start + width);
  return {
    display: visible + " ".repeat(Math.max(0, width - visible.length)),
    visibleCursorColumn: clamp(cursorColumn - start, 0, width),
  };
}

function renderStatusbar(status, width) {
  if (!status) return null;
  const template = status.template ?? "{folder} | {model} | {thinking} | {tokens}";
  return template
    .replaceAll("{folder}", status.folder ?? "–")
    .replaceAll("{model}", status.model ?? "–")
    .replaceAll("{thinking}", status.thinking ?? "–")
    .replaceAll("{tokens}", status.tokens ?? "–")
    .replaceAll("{messages}", status.messages ?? "–")
    .replaceAll("{session_tokens}", status.sessionTokens ?? "–")
    .replaceAll("{session_time}", status.sessionTime ?? "–")
    .slice(0, Math.max(0, width));
}

export function renderInputBox(buffer, suggestions = [], selectedIdx = 0, theme = {}, state = createRenderState(), status = null, cursorIndex = buffer.length) {
  const bufferLines = buffer.split("\n");
  const bufferLineCount = bufferLines.length;
  const cursor = getCursorLocation(buffer, cursorIndex);
  const activeSuggestions = bufferLineCount === 1 ? suggestions : [];
  const maxSuggestions = Math.max(1, theme?.layout?.maxSuggestions ?? 8);
  const suggestionWindowStart = Math.min(
    Math.max(0, selectedIdx - Math.floor(maxSuggestions / 2)),
    Math.max(0, activeSuggestions.length - maxSuggestions),
  );
  const visibleSuggestions = activeSuggestions.slice(
    suggestionWindowStart,
    suggestionWindowStart + maxSuggestions,
  );
  const suggestionCount = visibleSuggestions.length;
  const prompt = theme?.symbols?.prompt ?? "❯";
  const promptColor = theme?.colors?.input ?? chalk.cyan;
  const muted = theme?.colors?.muted ?? chalk.dim;
  const borderColor = theme?.colors?.border ?? chalk.dim;
  const frame = theme?.symbols?.frame ?? {};
  const topLeft = frame.topLeft ?? "╭";
  const topRight = frame.topRight ?? "╮";
  const bottomLeft = frame.bottomLeft ?? "╰";
  const bottomRight = frame.bottomRight ?? "╯";
  const horizontal = frame.horizontal ?? "─";
  const vertical = frame.vertical ?? "│";
  const padding = " ".repeat(theme?.layout?.inputPaddingX ?? 0);
  const width = frameWidth();
  const innerWidth = width - 2;

  if (state.cursorUpLines > 0) {
    process.stdout.write(`\x1b[${state.cursorUpLines}A`);
  }
  process.stdout.write("\r\x1b[J");
  process.stdout.write(borderColor(topLeft + horizontal.repeat(width - 2) + topRight) + "\n");

  for (let index = 0; index < bufferLineCount; index += 1) {
    if (index > 0) process.stdout.write("\n");
    const prefix =
      index === 0
        ? `${borderColor(vertical)} ${padding}${promptColor(prompt)} `
        : `${borderColor(vertical)} ${padding}${muted("  ")}`;
    const contentWidth = Math.max(0, width - (4 + padding.length) - 1);
    const { display: content } = index === cursor.lineIndex
      ? visibleLineSlice(bufferLines[index], contentWidth, cursor.column)
      : { display: fitLine(bufferLines[index], contentWidth) };
    const line = prefix + content;
    const plainPrefixLength = 4 + padding.length;
    const plainLength = plainPrefixLength + content.length;
    process.stdout.write(line + " ".repeat(Math.max(0, width - 1 - plainLength)) + borderColor(vertical));
  }

  for (let index = 0; index < suggestionCount; index += 1) {
    const suggestion = visibleSuggestions[index];
    const absoluteIndex = suggestionWindowStart + index;
    const selected = absoluteIndex === selectedIdx;
    const labelWidth = Math.max(4, Math.min(14, Math.floor((width - 6) / 2)));
    const label = fitLine(suggestion.label, labelWidth);
    const descriptionWidth = Math.max(0, width - 6 - labelWidth - 2);
    const description = chalk.dim(fitLine(suggestion.description, descriptionWidth));

    process.stdout.write("\n");
    if (selected) {
      process.stdout.write(
        `${borderColor(vertical)} ${padding}` + chalk.cyan("▸ ") + chalk.bold(label) + "  " + description,
      );
      continue;
    }

    process.stdout.write(`${borderColor(vertical)} ${padding}  ` + chalk.dim(label) + "  " + description);
  }

  if (activeSuggestions.length > suggestionCount) {
    process.stdout.write("\n");
    const from = suggestionWindowStart + 1;
    const to = suggestionWindowStart + suggestionCount;
    const summary = chalk.dim(`${from}-${to}/${activeSuggestions.length}`);
    process.stdout.write(`${borderColor(vertical)} ${padding}  ${summary}`);
  }

  const statusbar = renderStatusbar(status, width - 2);
  const statusLineCount = statusbar ? 1 : 0;

  process.stdout.write("\n");
  process.stdout.write(borderColor(bottomLeft + horizontal.repeat(width - 2) + bottomRight));

  if (statusbar) {
    process.stdout.write("\n");
    process.stdout.write(chalk.dim(`  ${fitLine(statusbar, width - 2)}`));
  }

  const extraSummaryLine = activeSuggestions.length > suggestionCount ? 1 : 0;
  if (suggestionCount > 0) {
    process.stdout.write(`\x1b[${suggestionCount + extraSummaryLine + statusLineCount + 1}A`);
  } else {
    process.stdout.write(`\x1b[${statusLineCount + 1}A`);
  }

  const linesUpFromLast = Math.max(0, (bufferLineCount - 1) - cursor.lineIndex);
  if (linesUpFromLast > 0) {
    process.stdout.write(`\x1b[${linesUpFromLast}A`);
  }

  const currentLineWidth = Math.max(0, width - (4 + padding.length) - 1);
  const { visibleCursorColumn } = visibleLineSlice(
    bufferLines[cursor.lineIndex] ?? "",
    currentLineWidth,
    cursor.column,
  );
  process.stdout.write(`\r\x1b[${padding.length + 4 + visibleCursorColumn}C`);

  state.cursorUpLines = cursor.lineIndex + 1;
  state.blockHeight = 1 + bufferLineCount + suggestionCount + extraSummaryLine + 1 + statusLineCount;
  return state;
}

export function clearRenderedInputBox(state) {
  if (state?.cursorUpLines > 0) {
    process.stdout.write(`\x1b[${state.cursorUpLines}A`);
  }
  process.stdout.write("\r\x1b[J");
  resetRenderState(state);
}

function deletePreviousWord(buffer) {
  return buffer.replace(/[^\s]*\s*$/, "");
}

export function promptInput(i18n, theme, initialBuffer = "", status = null, onResize = null, promptHistory = []) {
  const renderState = createRenderState();

  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let buffer = initialBuffer;
    let cursorIndex = buffer.length;
    let suggestions = [];
    let selectedIdx = 0;
    // History navigation: -1 = not navigating (current input), 0..n-1 = index into history (newest first)
    let historyIdx = -1;
    let savedBuffer = "";

    function rerender() {
      renderInputBox(buffer, suggestions, selectedIdx, theme, renderState, status, cursorIndex);
    }

    function updateSuggestions() {
      suggestions = getSuggestions(buffer, i18n);
      selectedIdx = 0;
    }

    function leaveHistoryNavigation() {
      if (historyIdx === -1) return;
      historyIdx = -1;
    }

    function resetAndRerender() {
      resetRenderState(renderState);
      rerender();
    }

    function handleResize() {
      if (onResize) {
        onResize(resetAndRerender);
        return;
      }
      resetAndRerender();
    }

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.removeListener("resize", handleResize);
    }

    function onData(key) {
      if (key === "\x03") {
        process.stdout.write("\r\x1b[J\n");
        cleanup();
        process.exit(0);
      }

      if (isSubmitKey(key)) {
        clearRenderedInputBox(renderState);
        cleanup();
        resolve(buffer);
        return;
      }

      if (isNewlineKey(key)) {
        leaveHistoryNavigation();
        buffer = insertAt(buffer, cursorIndex, "\n");
        cursorIndex += 1;
        suggestions = [];
        selectedIdx = 0;
        rerender();
        return;
      }

      if (key === "\x09") {
        if (suggestions.length > 0 && !buffer.includes("\n")) {
          buffer = suggestions[selectedIdx].complete;
          cursorIndex = buffer.length;
          updateSuggestions();
          rerender();
        }
        return;
      }

      if (key === "\x7f" || key === "\b") {
        if (cursorIndex > 0) {
          leaveHistoryNavigation();
          buffer = deleteRange(buffer, cursorIndex - 1, cursorIndex);
          cursorIndex -= 1;
          updateSuggestions();
          rerender();
        }
        return;
      }

      if (key === "\x1b\x7f" || key === "\x17") {
        if (cursorIndex > 0) {
          leaveHistoryNavigation();
          const next = deletePreviousWordAt(buffer, cursorIndex);
          buffer = next.buffer;
          cursorIndex = next.cursorIndex;
          updateSuggestions();
          rerender();
        }
        return;
      }

      if (key === "\x15" || key === "\x1b[3;9~") {
        if (buffer.length > 0) {
          leaveHistoryNavigation();
          buffer = "";
          cursorIndex = 0;
          suggestions = [];
          selectedIdx = 0;
          rerender();
        }
        return;
      }

      if (isArrowUp(key)) {
        const moved = moveCursorVertical(buffer, cursorIndex, -1);
        if (moved.moved) {
          cursorIndex = moved.cursorIndex;
          rerender();
        } else if (promptHistory.length > 0) {
          if (historyIdx === -1) savedBuffer = buffer;
          historyIdx = Math.min(historyIdx + 1, promptHistory.length - 1);
          buffer = promptHistory[historyIdx];
          cursorIndex = buffer.length;
          suggestions = [];
          rerender();
        }
        return;
      }

      if (isArrowDown(key)) {
        const moved = moveCursorVertical(buffer, cursorIndex, 1);
        if (moved.moved) {
          cursorIndex = moved.cursorIndex;
          rerender();
        } else if (historyIdx >= 0) {
          historyIdx -= 1;
          buffer = historyIdx === -1 ? savedBuffer : promptHistory[historyIdx];
          cursorIndex = buffer.length;
          suggestions = [];
          rerender();
        }
        return;
      }

      if (isArrowLeft(key)) {
        cursorIndex = Math.max(0, cursorIndex - 1);
        rerender();
        return;
      }

      if (isArrowRight(key)) {
        cursorIndex = Math.min(buffer.length, cursorIndex + 1);
        rerender();
        return;
      }

      if (isWordLeft(key)) {
        cursorIndex = moveCursorWordLeft(buffer, cursorIndex);
        rerender();
        return;
      }

      if (isWordRight(key)) {
        cursorIndex = moveCursorWordRight(buffer, cursorIndex);
        rerender();
        return;
      }

      if (isLineStartKey(key)) {
        cursorIndex = moveCursorLineStart(buffer, cursorIndex);
        rerender();
        return;
      }

      if (isLineEndKey(key)) {
        cursorIndex = moveCursorLineEnd(buffer, cursorIndex);
        rerender();
        return;
      }

      if (key.startsWith("\x1b")) return;

      leaveHistoryNavigation();
      buffer = insertAt(buffer, cursorIndex, key);
      cursorIndex += key.length;
      updateSuggestions();
      rerender();
    }

    process.stdin.on("data", onData);
    process.stdout.on("resize", handleResize);
    resetAndRerender();
  });
}

export function createPassiveInputBuffer(i18n, theme, { onEscape = null, status = null, autoResize = true } = {}) {
  let buffer = "";
  const renderState = createRenderState();
  let cursorIndex = 0;

  function render() {
    renderInputBox(buffer, [], 0, theme, renderState, status, cursorIndex);
  }

  function onData(key) {
    if (key === "\x03") {
      process.stdout.write("\r\x1b[J\n");
      process.exit(0);
    }

    if (key === "\x1b" && onEscape) {
      onEscape();
      return;
    }

    if (isSubmitKey(key) || isNewlineKey(key)) return;

    if (key === "\x7f" || key === "\b") {
      if (cursorIndex > 0) {
        buffer = deleteRange(buffer, cursorIndex - 1, cursorIndex);
        cursorIndex -= 1;
        render();
      }
      return;
    }

    if (key === "\x1b\x7f" || key === "\x17") {
      const next = deletePreviousWordAt(buffer, cursorIndex);
      buffer = next.buffer;
      cursorIndex = next.cursorIndex;
      render();
      return;
    }

    if (key === "\x15" || key === "\x1b[3;9~") {
      buffer = "";
      cursorIndex = 0;
      render();
      return;
    }

    if (isArrowLeft(key)) {
      cursorIndex = Math.max(0, cursorIndex - 1);
      render();
      return;
    }

    if (isArrowRight(key)) {
      cursorIndex = Math.min(buffer.length, cursorIndex + 1);
      render();
      return;
    }

    if (isWordLeft(key)) {
      cursorIndex = moveCursorWordLeft(buffer, cursorIndex);
      render();
      return;
    }

    if (isWordRight(key)) {
      cursorIndex = moveCursorWordRight(buffer, cursorIndex);
      render();
      return;
    }

    if (isLineStartKey(key)) {
      cursorIndex = moveCursorLineStart(buffer, cursorIndex);
      render();
      return;
    }

    if (isLineEndKey(key)) {
      cursorIndex = moveCursorLineEnd(buffer, cursorIndex);
      render();
      return;
    }

    if (isArrowUp(key) || isArrowDown(key)) {
      const moved = moveCursorVertical(buffer, cursorIndex, isArrowUp(key) ? -1 : 1);
      if (moved.moved) {
        cursorIndex = moved.cursorIndex;
        render();
      }
      return;
    }

    if (key.startsWith("\x1b")) return;

    buffer = insertAt(buffer, cursorIndex, key);
    cursorIndex += key.length;
    render();
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", onData);
  if (autoResize) {
    process.stdout.on("resize", render);
  }
  render();

  return {
    render,
    getMetrics() {
      return { ...renderState };
    },
    resetMetrics() {
      resetRenderState(renderState);
    },
    getBuffer() {
      return buffer;
    },
    stop() {
      process.stdin.removeListener("data", onData);
      if (autoResize) {
        process.stdout.removeListener("resize", render);
      }
      process.stdin.setRawMode(false);
      process.stdin.pause();
      return buffer;
    },
    clear() {
      clearRenderedInputBox(renderState);
    },
  };
}
