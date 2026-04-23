const TOOL_BLOCK_RE = /```agents-tool\s*([\s\S]*?)```/m;

export function parseToolCall(text) {
  const match = text.match(TOOL_BLOCK_RE);
  if (!match) return null;
  const before = text.slice(0, match.index).trimEnd();
  const after = text.slice(match.index + match[0].length).trim();

  let parsed;
  try {
    parsed = JSON.parse(match[1].trim());
  } catch (err) {
    return {
      ok: false,
      error: `Invalid agents-tool JSON: ${err.message}`,
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Tool call must be a JSON object" };
  }
  if (!parsed.args || typeof parsed.args !== "object") {
    return { ok: false, error: "Tool call args must be an object" };
  }

  if (parsed.name === "bash") {
    if (typeof parsed.args.cmd !== "string" || parsed.args.cmd.trim().length === 0) {
      return { ok: false, error: "bash.cmd must be a non-empty string" };
    }

    return {
      ok: true,
      call: {
        name: "bash",
        args: {
          cmd: parsed.args.cmd.trim(),
        },
      },
      before,
      after,
    };
  }

  if (parsed.name === "write_file") {
    if (typeof parsed.args.path !== "string" || parsed.args.path.trim().length === 0) {
      return { ok: false, error: "write_file.path must be a non-empty string" };
    }
    if (typeof parsed.args.content !== "string") {
      return { ok: false, error: "write_file.content must be a string" };
    }

    return {
      ok: true,
      call: {
        name: "write_file",
        args: {
          path: parsed.args.path.trim(),
          content: parsed.args.content,
        },
      },
      before,
      after,
    };
  }

  return { ok: false, error: `Unsupported tool: ${parsed.name}` };
}

export function formatToolResultForModel(result) {
  return [
    "Tool result:",
    "```json",
    JSON.stringify(result, null, 2),
    "```",
  ].join("\n");
}
