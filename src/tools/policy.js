const SHELL_CHARS = /[;&|<>`$(){}[\]*?\n\r]/;

export function parseCommand(cmd) {
  const argv = [];
  let current = "";
  let quote = null;

  for (let index = 0; index < cmd.length; index += 1) {
    const char = cmd[index];
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        argv.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (quote) {
    return { ok: false, error: "Unclosed quote in command" };
  }
  if (current) argv.push(current);
  if (argv.length === 0) {
    return { ok: false, error: "Empty command" };
  }

  return { ok: true, argv };
}

export function evaluateBashPolicy(cmd) {
  if (typeof cmd !== "string" || cmd.trim().length === 0) {
    return { ok: false, error: "Empty command" };
  }
  if (cmd.includes("\0")) {
    return { ok: false, error: "NUL bytes are not allowed in bash commands" };
  }

  const parsed = parseCommand(cmd);
  if (!parsed.ok) return parsed;

  return {
    ok: true,
    argv: parsed.argv,
    shell: SHELL_CHARS.test(cmd),
  };
}
