import chalk from "chalk";

function shouldAutoApproveTools(env = process.env) {
  const value = env.MRMUSH_AUTO_APPROVE_TOOLS;
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

const BASH_OPTIONS = [
  { value: "once", label: "Run once" },
  { value: "always", label: "Always allow in this project" },
  { value: "reject", label: "Reject" },
];

const WRITE_OPTIONS = [
  { value: "write", label: "Write file" },
  { value: "reject", label: "Reject" },
];

function splitPreviewLines(lines, maxPreviewLines = 12) {
  if (lines.length <= maxPreviewLines) return { head: lines, tail: [] };

  const headCount = Math.ceil(maxPreviewLines / 2);
  const tailCount = Math.floor(maxPreviewLines / 2);
  return {
    head: lines.slice(0, headCount),
    tail: lines.slice(-tailCount),
  };
}

function buildDiffLines(existingContent, content) {
  const nextLines = content.split("\n");
  if (existingContent === null) {
    return nextLines.map((line) => ({ type: "added", text: `+ ${line}` }));
  }

  const previousLines = existingContent.split("\n");
  let prefixLength = 0;
  while (
    prefixLength < previousLines.length &&
    prefixLength < nextLines.length &&
    previousLines[prefixLength] === nextLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousLines.length - prefixLength &&
    suffixLength < nextLines.length - prefixLength &&
    previousLines[previousLines.length - 1 - suffixLength] ===
      nextLines[nextLines.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const removed = previousLines
    .slice(prefixLength, previousLines.length - suffixLength)
    .map((line) => ({ type: "removed", text: `- ${line}` }));
  const added = nextLines
    .slice(prefixLength, nextLines.length - suffixLength)
    .map((line) => ({ type: "added", text: `+ ${line}` }));

  return [...removed, ...added];
}

function paintDiffLine(line) {
  if (line.type === "added") return chalk.green(`   ${line.text}`);
  if (line.type === "removed") return chalk.red(`   ${line.text}`);
  return chalk.dim(`   ${line.text}`);
}

function render({ title, bodyLines, options, selectedIdx, rerender = false }) {
  const headerLines = ["⬢  mr. mush", `   ${title}`];
  const approvalBlockLines = headerLines.length + bodyLines.length + 2 + options.length;
  if (rerender) {
    process.stdout.write(`\x1b[${approvalBlockLines}A`);
  }
  process.stdout.write("\r\x1b[J");
  process.stdout.write(`\n${chalk.hex("#a855f7")(headerLines[0])}\n`);
  process.stdout.write(`${chalk.dim(headerLines[1])}\n`);
  process.stdout.write(`${bodyLines.join("\n")}\n\n`);

  options.forEach((option, index) => {
    const pointer = index === selectedIdx ? chalk.hex("#a855f7")("❯") : " ";
    const label = index === selectedIdx ? chalk.bold(option.label) : option.label;
    process.stdout.write(`${pointer} ${label}\n`);
  });

  return approvalBlockLines;
}

function clear(renderedLines) {
  process.stdout.write(`\x1b[${renderedLines}A\r\x1b[J`);
}

export async function requestBashApproval(cmd) {
  if (shouldAutoApproveTools()) return "always";

  return new Promise((resolve) => {
    let selectedIdx = 0;
    let hasRendered = false;
    let renderedLines = 0;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function cleanup(result) {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      clear(renderedLines);
      resolve(result);
    }

    function onData(key) {
      if (key === "\x03" || key === "\x1b") {
        cleanup("reject");
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup(BASH_OPTIONS[selectedIdx].value);
        return;
      }
      if (key === "\x1b[A") {
        selectedIdx = (selectedIdx - 1 + BASH_OPTIONS.length) % BASH_OPTIONS.length;
        renderedLines = render({
          title: "wants to run",
          bodyLines: [chalk.dim(`  ${cmd}`)],
          options: BASH_OPTIONS,
          selectedIdx,
          rerender: hasRendered,
        });
        hasRendered = true;
        return;
      }
      if (key === "\x1b[B") {
        selectedIdx = (selectedIdx + 1) % BASH_OPTIONS.length;
        renderedLines = render({
          title: "wants to run",
          bodyLines: [chalk.dim(`  ${cmd}`)],
          options: BASH_OPTIONS,
          selectedIdx,
          rerender: hasRendered,
        });
        hasRendered = true;
      }
    }

    process.stdin.on("data", onData);
    renderedLines = render({
      title: "wants to run",
      bodyLines: [chalk.dim(`  ${cmd}`)],
      options: BASH_OPTIONS,
      selectedIdx,
    });
    hasRendered = true;
  });
}

export async function requestWriteApproval({ path, content, existingContent = null }) {
  if (shouldAutoApproveTools()) return "write";

  return new Promise((resolve) => {
    let selectedIdx = 0;
    let hasRendered = false;
    let renderedLines = 0;
    const preview = splitPreviewLines(buildDiffLines(existingContent, content));
    const bodyLines = [
      chalk.dim(`   Path: ${path}`),
      chalk.dim(`   ${existingContent === null ? "Mode: create" : "Mode: overwrite"}`),
      chalk.dim(`   Bytes: ${Buffer.byteLength(content, "utf8")}`),
      "",
      chalk.bold("   Preview:"),
      ...preview.head.map(paintDiffLine),
      ...(preview.tail.length > 0
        ? [chalk.dim("   ..."), ...preview.tail.map(paintDiffLine)]
        : []),
    ];

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function cleanup(result) {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      clear(renderedLines);
      resolve(result);
    }

    function onData(key) {
      if (key === "\x03" || key === "\x1b") {
        cleanup("reject");
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup(WRITE_OPTIONS[selectedIdx].value);
        return;
      }
      if (key === "\x1b[A") {
        selectedIdx = (selectedIdx - 1 + WRITE_OPTIONS.length) % WRITE_OPTIONS.length;
        renderedLines = render({
          title: "wants to write a file",
          bodyLines,
          options: WRITE_OPTIONS,
          selectedIdx,
          rerender: hasRendered,
        });
        hasRendered = true;
        return;
      }
      if (key === "\x1b[B") {
        selectedIdx = (selectedIdx + 1) % WRITE_OPTIONS.length;
        renderedLines = render({
          title: "wants to write a file",
          bodyLines,
          options: WRITE_OPTIONS,
          selectedIdx,
          rerender: hasRendered,
        });
        hasRendered = true;
      }
    }

    process.stdin.on("data", onData);
    renderedLines = render({
      title: "wants to write a file",
      bodyLines,
      options: WRITE_OPTIONS,
      selectedIdx,
    });
    hasRendered = true;
  });
}
