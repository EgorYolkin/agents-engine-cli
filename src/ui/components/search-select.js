// Lazy import to avoid circular dependency:
// manager.js → provider.js → search-select.js → input.js → commands/index.js → manager.js
let _input = null;
async function loadInput() {
  if (!_input) {
    _input = await import("../input.js");
  }
  return _input;
}

function normalizeSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function filterSearchSelectOptions(options, query) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return options;

  const scored = options
    .map((option, index) => {
      const label = normalizeSearchText(option.label);
      const description = normalizeSearchText(option.description);
      const value = normalizeSearchText(option.value);
      const haystack = [label, description, value].filter(Boolean);
      const bestIndex = haystack.reduce((result, field) => {
        const matchIndex = field.indexOf(normalizedQuery);
        if (matchIndex === -1) return result;
        if (result === -1) return matchIndex;
        return Math.min(result, matchIndex);
      }, -1);

      if (bestIndex === -1) return null;

      const exact = label === normalizedQuery || value === normalizedQuery;
      const prefix =
        label.startsWith(normalizedQuery) || value.startsWith(normalizedQuery);

      return {
        option,
        index,
        score: [
          exact ? 3 : 0,
          prefix ? 2 : 0,
          bestIndex === 0 ? 1 : 0,
          -bestIndex,
          -label.length,
          -index,
        ],
      };
    })
    .filter(Boolean);

  scored.sort((left, right) => {
    for (let idx = 0; idx < left.score.length; idx += 1) {
      if (left.score[idx] !== right.score[idx]) {
        return right.score[idx] - left.score[idx];
      }
    }
    return 0;
  });

  return scored.map((entry) => entry.option);
}

function applySearchSelectCompletion(options, query, selectedIdx, maxResults = 8) {
  const visible = filterSearchSelectOptions(options, query).slice(0, maxResults);
  const nextIndex = Math.max(
    0,
    Math.min(selectedIdx, Math.max(0, visible.length - 1)),
  );
  const selected = visible[nextIndex] ?? null;

  if (!selected) {
    return {
      query,
      selectedIdx: 0,
      selected: null,
    };
  }

  return {
    query: selected.label,
    selectedIdx: nextIndex,
    selected,
  };
}

function isEscapeKey(key) {
  return key === "\x1b";
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
  return (
    key === "\x01"
    || key === "\x1b[H"
    || key === "\x1bOH"
    || key === "\x1b[1~"
    || key === "\x1b[1;9D"
  );
}

function isLineEndKey(key) {
  return (
    key === "\x05"
    || key === "\x1b[F"
    || key === "\x1bOF"
    || key === "\x1b[4~"
    || key === "\x1b[1;9C"
  );
}

function isDeleteKey(key) {
  return key === "\x7f" || key === "\b";
}

function isDeletePreviousWordKey(key) {
  return key === "\x1b\x7f" || key === "\x17";
}

function isDeleteForwardKey(key) {
  return key === "\x1b[3~";
}

function isDeleteNextWordKey(key) {
  return key === "\x1b[3;3~" || key === "\x1bd";
}

function isClearLineKey(key) {
  return key === "\x15" || key === "\x1b[3;9~";
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

function deleteNextWordAt(buffer, cursorIndex) {
  const after = buffer.slice(cursorIndex).replace(/^\s*[^\s]*/, "");
  return {
    buffer: buffer.slice(0, cursorIndex) + after,
    cursorIndex,
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

function moveCursorLineStart(_buffer, _cursorIndex) {
  return 0;
}

function moveCursorLineEnd(buffer) {
  return buffer.length;
}

function updateSearchSelectQuery(query, cursorIndex, mutator) {
  const next = mutator(query, cursorIndex);
  return {
    query: next.query,
    cursorIndex: next.cursorIndex,
    selectedIdx: 0,
  };
}

function deleteCharacterFromSearchSelect(query, cursorIndex) {
  if (cursorIndex <= 0) {
    return { query, cursorIndex };
  }

  return {
    query: deleteRange(query, cursorIndex - 1, cursorIndex),
    cursorIndex: cursorIndex - 1,
  };
}

function deletePreviousWordFromSearchSelect(query, cursorIndex) {
  if (cursorIndex <= 0) {
    return { query, cursorIndex };
  }

  const next = deletePreviousWordAt(query, cursorIndex);
  return {
    query: next.buffer,
    cursorIndex: next.cursorIndex,
  };
}

function clearSearchSelectQuery() {
  return { query: "", cursorIndex: 0 };
}

export async function promptSearchSelect(
  message,
  rawOptions,
  theme = {},
  {
    initialQuery = "",
    emptyText = "No matches",
    maxResults = 8,
    onKey = null,
  } = {},
) {
  const { clearRenderedInputBox, renderInputBox } = await loadInput();

  const options = rawOptions.map((option) => ({
    value: option.value,
    label: option.label ?? String(option.value),
    description: option.description ?? "",
    disabled: option.disabled ?? false,
  }));

  const availableOptions = options.filter((option) => !option.disabled);
  const renderState = { cursorUpLines: 0, blockHeight: 0, totalRenderedLines: 0 };

  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    let query = initialQuery;
    let cursorIndex = query.length;
    let selectedIdx = 0;

    function getVisibleOptions() {
      return filterSearchSelectOptions(availableOptions, query).slice(0, maxResults);
    }

    function clampSelectedIndex() {
      const visible = getVisibleOptions();
      selectedIdx = Math.max(
        0,
        Math.min(selectedIdx, Math.max(0, visible.length - 1)),
      );
      return visible;
    }

    function buildStatus() {
      const total = filterSearchSelectOptions(availableOptions, query).length;
      if (total === 0) return { generatedText: emptyText };
      return { generatedText: `${message}  ${total} match${total === 1 ? "" : "es"}` };
    }

    function rerender() {
      const visible = clampSelectedIndex();
      renderInputBox(
        query,
        visible.map((option) => ({
          label: option.label,
          description: option.description,
          complete: option.label,
        })),
        selectedIdx,
        theme,
        renderState,
        buildStatus(),
        cursorIndex,
      );
    }

    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
      process.stdout.removeListener("resize", rerender);
    }

    function finish(value) {
      clearRenderedInputBox(renderState);
      cleanup();
      resolve(value);
    }

    function onData(key) {
      if (key === "\x03") {
        clearRenderedInputBox(renderState);
        cleanup();
        process.stdout.write("\x1b[?25h\r\x1b[J\n");
        process.exit(0);
      }

      if (onKey && onKey(key, { query, cursorIndex, selectedIdx }) === true) {
        return;
      }

      if (isEscapeKey(key)) {
        finish(null);
        return;
      }

      if (isSubmitKey(key)) {
        const visible = clampSelectedIndex();
        finish(visible[selectedIdx]?.value ?? null);
        return;
      }

      if (key === "\x09") {
        const completion = applySearchSelectCompletion(
          availableOptions,
          query,
          selectedIdx,
          maxResults,
        );
        query = completion.query;
        cursorIndex = query.length;
        selectedIdx = completion.selectedIdx;
        rerender();
        return;
      }

      if (isDeleteKey(key)) {
        const next = updateSearchSelectQuery(
          query,
          cursorIndex,
          deleteCharacterFromSearchSelect,
        );
        query = next.query;
        cursorIndex = next.cursorIndex;
        selectedIdx = next.selectedIdx;
        rerender();
        return;
      }

      if (isDeletePreviousWordKey(key)) {
        const next = updateSearchSelectQuery(
          query,
          cursorIndex,
          deletePreviousWordFromSearchSelect,
        );
        query = next.query;
        cursorIndex = next.cursorIndex;
        selectedIdx = next.selectedIdx;
        rerender();
        return;
      }

      if (isDeleteForwardKey(key)) {
        if (cursorIndex < query.length) {
          query = deleteRange(query, cursorIndex, cursorIndex + 1);
          selectedIdx = 0;
          rerender();
        }
        return;
      }

      if (isDeleteNextWordKey(key)) {
        if (cursorIndex < query.length) {
          const next = deleteNextWordAt(query, cursorIndex);
          query = next.buffer;
          cursorIndex = next.cursorIndex;
          selectedIdx = 0;
          rerender();
        }
        return;
      }

      if (isClearLineKey(key)) {
        const next = updateSearchSelectQuery(
          query,
          cursorIndex,
          clearSearchSelectQuery,
        );
        query = next.query;
        cursorIndex = next.cursorIndex;
        selectedIdx = next.selectedIdx;
        rerender();
        return;
      }

      if (isArrowUp(key)) {
        selectedIdx -= 1;
        rerender();
        return;
      }

      if (isArrowDown(key)) {
        selectedIdx += 1;
        rerender();
        return;
      }

      if (isArrowLeft(key)) {
        cursorIndex = Math.max(0, cursorIndex - 1);
        rerender();
        return;
      }

      if (isArrowRight(key)) {
        cursorIndex = Math.min(query.length, cursorIndex + 1);
        rerender();
        return;
      }

      if (isWordLeft(key)) {
        cursorIndex = moveCursorWordLeft(query, cursorIndex);
        rerender();
        return;
      }

      if (isWordRight(key)) {
        cursorIndex = moveCursorWordRight(query, cursorIndex);
        rerender();
        return;
      }

      if (isLineStartKey(key)) {
        cursorIndex = moveCursorLineStart(query, cursorIndex);
        rerender();
        return;
      }

      if (isLineEndKey(key)) {
        cursorIndex = moveCursorLineEnd(query, cursorIndex);
        rerender();
        return;
      }

      if (key.startsWith("\x1b") || isNewlineKey(key)) return;

      query = `${query.slice(0, cursorIndex)}${key}${query.slice(cursorIndex)}`;
      cursorIndex += key.length;
      selectedIdx = 0;
      rerender();
    }

    process.stdin.on("data", onData);
    process.stdout.on("resize", rerender);
    rerender();
  });
}
