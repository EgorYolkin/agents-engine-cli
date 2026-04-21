import fs from "node:fs/promises";
import path from "node:path";

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function appendMessage(sessionPath, message) {
  const line = JSON.stringify(message) + "\n";
  await fs.appendFile(sessionPath, line, "utf8");
}

export async function readMessages(sessionPath) {
  if (!(await fileExists(sessionPath))) return [];
  const content = await fs.readFile(sessionPath, "utf8");
  return content
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function readIndex(indexPath) {
  if (!(await fileExists(indexPath))) return {};
  try {
    const content = await fs.readFile(indexPath, "utf8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function writeIndex(indexPath, index) {
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
}

export function sessionFilePath(historyDir, sessionId) {
  return path.join(historyDir, `${sessionId}.jsonl`);
}
