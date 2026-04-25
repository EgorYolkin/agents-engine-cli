// ─── Layout utilities ─────────────────────────────────────────────────────────
// Pure functions — no side effects, no imports.

// Strip ANSI escape codes to get the visual character count.
export function visibleLength(value) {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1b\[[0-9;]*m/g, "").length;
}

export function frameWidth() {
  const columns = process.stdout.columns || 96;
  return Math.max(6, columns - 1);
}

export function wrapText(text, width, indent) {
  const rows = [];
  const maxWidth = Math.max(1, width);

  for (const rawLine of text.split("\n")) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      rows.push("");
      continue;
    }

    let line = "";
    for (const word of words) {
      if (word.length > maxWidth) {
        if (line) {
          rows.push(line);
          line = "";
        }

        for (let start = 0; start < word.length; start += maxWidth) {
          const chunk = word.slice(start, start + maxWidth);
          if (chunk.length === maxWidth || start + maxWidth < word.length) {
            rows.push(`${indent}${chunk}`);
          } else {
            line = `${indent}${chunk}`;
          }
        }
        continue;
      }

      const next = line ? `${line} ${word}` : word;
      if (next.length > maxWidth && line) {
        rows.push(line);
        line = `${indent}${word}`;
      } else {
        line = next;
      }
    }
    rows.push(line);
  }

  return rows;
}

export function fitText(value, width) {
  const length = visibleLength(value);
  if (length <= width) return value + " ".repeat(width - length);
  if (width <= 1) return " ".repeat(width);
  return `${value.slice(0, width - 1)}…`;
}
