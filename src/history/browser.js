import chalk from "chalk";
import { listSessions, loadSession, deleteSession } from "./session.js";

function frameWidth() {
  const columns = process.stdout.columns || 96;
  return Math.max(40, Math.min(columns - 2, 92));
}

function fitText(value, width) {
  if (value.length <= width) return value + " ".repeat(width - value.length);
  if (width <= 1) return " ";
  return value.slice(0, width - 1) + "…";
}

function formatDate(iso) {
  if (!iso) return "–";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderBrowser(sessions, selectedIdx, scrollOffset, theme = {}) {
  const width = frameWidth();
  const innerWidth = width - 2;
  const frame = theme.symbols?.frame ?? {};
  const topLeft = frame.topLeft ?? "╭";
  const topRight = frame.topRight ?? "╮";
  const bottomLeft = frame.bottomLeft ?? "╰";
  const bottomRight = frame.bottomRight ?? "╯";
  const horizontal = frame.horizontal ?? "─";
  const vertical = frame.vertical ?? "│";
  const border = theme.colors?.border ?? chalk.dim;
  const accent = theme.colors?.accent ?? chalk.hex("#a855f7");
  const muted = theme.colors?.muted ?? chalk.dim;

  const maxVisible = Math.min(10, Math.max(1, (process.stdout.rows || 24) - 6));
  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + maxVisible);

  const lines = [];

  // Header
  const titleText = " resume session ";
  const titleFits = innerWidth >= titleText.length + 4;
  if (titleFits) {
    const ruleRight = width - 3 - titleText.length - 1;
    lines.push(
      border(topLeft + horizontal.repeat(3)) +
      accent(titleText) +
      border(horizontal.repeat(Math.max(0, ruleRight))) +
      border(topRight),
    );
  } else {
    lines.push(border(topLeft + horizontal.repeat(width - 2) + topRight));
  }

  if (sessions.length === 0) {
    lines.push(border(vertical) + muted(fitText("  no sessions yet", innerWidth)) + border(vertical));
  } else {
    // Adapt meta column width to available space: wide screens show full meta, narrow screens shrink it
    const minTitleWidth = 8;
    const maxMetaWidth = Math.min(38, Math.max(0, innerWidth - minTitleWidth - 4));

    for (let i = 0; i < visibleSessions.length; i++) {
      const session = visibleSessions[i];
      const absoluteIdx = scrollOffset + i;
      const selected = absoluteIdx === selectedIdx;
      const title = session.title ?? "(untitled)";

      // On narrow screens, drop the date; on very narrow, drop provider too
      let meta;
      if (innerWidth >= 60) {
        meta = `${session.provider ?? "?"} · ${formatDate(session.updatedAt)} · ${session.messageCount ?? 0} msgs`;
      } else if (innerWidth >= 40) {
        meta = `${session.provider ?? "?"} · ${session.messageCount ?? 0} msgs`;
      } else {
        meta = `${session.messageCount ?? 0}`;
      }

      const metaWidth = Math.min(meta.length, maxMetaWidth);
      const titleWidth = Math.max(1, innerWidth - metaWidth - 4);
      const indicator = selected ? "> " : "  ";

      const row =
        (selected ? chalk.cyan(indicator) : indicator) +
        (selected ? chalk.bold(fitText(title, titleWidth)) : muted(fitText(title, titleWidth))) +
        "  " +
        muted(fitText(meta, metaWidth));

      lines.push(border(vertical) + row + border(vertical));
    }

    if (sessions.length > maxVisible) {
      const from = scrollOffset + 1;
      const to = Math.min(scrollOffset + maxVisible, sessions.length);
      lines.push(border(vertical) + muted(fitText(`  ${from}–${to} of ${sessions.length}`, innerWidth)) + border(vertical));
    }
  }

  const hints = innerWidth >= 54
    ? "  ↑↓ navigate   enter continue   d delete   esc cancel"
    : "  ↑↓  enter  d  esc";
  lines.push(border(vertical) + muted(fitText(hints, innerWidth)) + border(vertical));
  lines.push(border(bottomLeft + horizontal.repeat(width - 2) + bottomRight));

  return lines;
}

export function openSessionBrowser(historyDir, theme = {}) {
  return new Promise((resolve) => {
    let sessions = [];
    let selectedIdx = 0;
    let scrollOffset = 0;

    function maxVisible() {
      return Math.min(10, Math.max(1, (process.stdout.rows || 24) - 8));
    }

    function clampScroll() {
      const mv = maxVisible();
      if (selectedIdx < scrollOffset) scrollOffset = selectedIdx;
      if (selectedIdx >= scrollOffset + mv) scrollOffset = selectedIdx - mv + 1;
    }

    function draw() {
      const lines = renderBrowser(sessions, selectedIdx, scrollOffset, theme);
      process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
      process.stdout.write(lines.join("\r\n") + "\r\n");
    }

    function onResize() {
      draw();
    }

    function cleanup() {
      process.stdout.write("\x1b[?25h"); // restore cursor
      process.stdout.removeListener("resize", onResize);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    }

    async function confirmDelete() {
      if (sessions.length === 0) return;
      const session = sessions[selectedIdx];
      await deleteSession(historyDir, session.id);
      sessions = await listSessions(historyDir);
      if (selectedIdx >= sessions.length) selectedIdx = Math.max(0, sessions.length - 1);
      clampScroll();
      draw();
    }

    function onData(key) {
      if (key === "\x03") {
        cleanup();
        process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
        process.exit(0);
      }

      if (key === "\x1b" || key === "q") {
        cleanup();
        process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
        resolve(null);
        return;
      }

      if (key === "\r") {
        if (sessions.length === 0) return;
        const session = sessions[selectedIdx];
        cleanup();
        process.stdout.write("\x1b[3J\x1b[2J\x1b[H");
        loadSession(historyDir, session.id).then(resolve).catch(() => resolve(null));
        return;
      }

      if (key === "\x1b[A") {
        if (selectedIdx > 0) {
          selectedIdx -= 1;
          clampScroll();
          draw();
        }
        return;
      }

      if (key === "\x1b[B") {
        if (selectedIdx < sessions.length - 1) {
          selectedIdx += 1;
          clampScroll();
          draw();
        }
        return;
      }

      if (key === "d" || key === "D") {
        confirmDelete();
        return;
      }
    }

    // Filter out empty sessions before showing
    listSessions(historyDir).then((list) => {
      sessions = list.filter((s) => (s.messageCount ?? 0) > 0);
      process.stdout.write("\x1b[?25l"); // hide cursor before first draw
      process.stdout.on("resize", onResize);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", onData);
      draw();
    });
  });
}
