import chalk from "chalk";

const OPTIONS = [
  { value: "once", label: "Run once" },
  { value: "always", label: "Always allow in this project" },
  { value: "reject", label: "Reject" },
];

const APPROVAL_BLOCK_LINES = 4 + OPTIONS.length;

function render(cmd, selectedIdx, rerender = false) {
  if (rerender) {
    process.stdout.write(`\x1b[${APPROVAL_BLOCK_LINES}A`);
  }
  process.stdout.write("\r\x1b[J");
  process.stdout.write(`\n${chalk.hex("#a855f7")("⬢ mr. mush")} wants to run\n`);
  process.stdout.write(`${chalk.dim(cmd)}\n\n`);

  OPTIONS.forEach((option, index) => {
    const pointer = index === selectedIdx ? chalk.hex("#a855f7")("❯") : " ";
    const label = index === selectedIdx ? chalk.bold(option.label) : option.label;
    process.stdout.write(`${pointer} ${label}\n`);
  });
}

function clear() {
  process.stdout.write(`\x1b[${APPROVAL_BLOCK_LINES}A\r\x1b[J`);
}

export async function requestBashApproval(cmd) {
  return new Promise((resolve) => {
    let selectedIdx = 0;
    let hasRendered = false;

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    function cleanup(result) {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      clear();
      resolve(result);
    }

    function onData(key) {
      if (key === "\x03" || key === "\x1b") {
        cleanup("reject");
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup(OPTIONS[selectedIdx].value);
        return;
      }
      if (key === "\x1b[A") {
        selectedIdx = (selectedIdx - 1 + OPTIONS.length) % OPTIONS.length;
        render(cmd, selectedIdx, hasRendered);
        hasRendered = true;
        return;
      }
      if (key === "\x1b[B") {
        selectedIdx = (selectedIdx + 1) % OPTIONS.length;
        render(cmd, selectedIdx, hasRendered);
        hasRendered = true;
      }
    }

    process.stdin.on("data", onData);
    render(cmd, selectedIdx);
    hasRendered = true;
  });
}
