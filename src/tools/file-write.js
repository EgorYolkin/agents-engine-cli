import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_DENIED_PATHS = [
  ".git",
  "node_modules",
  ".env",
  ".env.local",
  ".env.production",
];

function isInsideCwd(resolvedPath, cwd) {
  const relativePath = path.relative(cwd, resolvedPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

export function evaluateWritePolicy(filePath, cwd, config = {}) {
  const resolvedCwd = path.resolve(cwd);
  const resolvedPath = path.resolve(resolvedCwd, filePath);
  if (!isInsideCwd(resolvedPath, resolvedCwd)) {
    return { ok: false, error: "Path escapes working directory" };
  }

  const deniedPatterns = config.denied_paths ?? DEFAULT_DENIED_PATHS;
  const relativePath = path.relative(resolvedCwd, resolvedPath);
  for (const pattern of deniedPatterns) {
    if (!pattern) continue;
    if (
      relativePath === pattern
      || relativePath.startsWith(`${pattern}/`)
      || resolvedPath.includes(`${path.sep}${pattern}${path.sep}`)
      || resolvedPath.endsWith(`${path.sep}${pattern}`)
    ) {
      return { ok: false, error: `Writing to ${pattern} is not allowed` };
    }
  }

  const maxFileSizeKb = config.max_file_size_kb ?? 512;
  const contentSizeBytes = Buffer.byteLength(config.content ?? "", "utf8");
  if (contentSizeBytes > maxFileSizeKb * 1024) {
    return { ok: false, error: `File content exceeds max size of ${maxFileSizeKb} KB` };
  }

  return { ok: true, resolved: resolvedPath };
}

export async function readExistingFile(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeFile({ path: filePath, content, cwd }) {
  const resolvedPath = path.resolve(cwd, filePath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, content, "utf8");
  return {
    tool: "write_file",
    path: filePath,
    written: Buffer.byteLength(content, "utf8"),
  };
}
