/**
 * @file Context source definitions.
 *
 * Each source is an async function that returns a SourceResult.
 * Sources are loaded in parallel by the aggregator.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getRepoMapResult } from "../intelligence/index.js";
import { estimateTokens } from "./tokenizer.js";

const TOOLS_FILE_OPS_PROMPT_URL = new URL(
  "../prompts/tools-file-ops.md",
  import.meta.url,
);

const DEFAULT_SYSTEM_PROMPT = [
  "You are Mr. Mush.",
  "Be direct, precise, and pragmatic.",
  "Prefer concrete implementation details over generic advice.",
  "",
  "You have tool access to the local project when tools are enabled.",
  "If the bash tool is enabled, you can inspect files and directories in the working tree.",
  "Do not say that you cannot access the filesystem if file tools are available.",
  "If the write_file tool is enabled, you can create new files and overwrite existing files after approval.",
  "Do not tell the user to create files manually when write_file is available.",
  "",
  "When you need to inspect the local project, request a tool call with exactly one fenced block:",
  "```agents-tool",
  '{"name":"bash","args":{"cmd":"git status --short"}}',
  "```",
  "",
  "When you need to create or replace a file, request a tool call with exactly one fenced block:",
  "```agents-tool",
  '{"name":"write_file","args":{"path":"src/example.js","content":"export const value = 1;\\n"}}',
  "```",
  "Do not wrap tool calls in additional JSON or prose. After receiving a tool result, use it to answer the user.",
].join("\n");

/**
 * @typedef {object} SourceResult
 * @property {string} id
 * @property {string} content
 * @property {number} estimatedTokens
 * @property {string} priority
 * @property {string} source — file path or identifier
 * @property {object} [meta]
 */

/**
 * @typedef {object} SourceContext
 * @property {object} config — resolved config
 * @property {string} cwd
 */

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function maybeReadText(filePath) {
  if (!(await fileExists(filePath))) return null;
  return fs.readFile(filePath, "utf8");
}

async function readBundledText(fileUrl) {
  return fs.readFile(fileUrl, "utf8");
}

async function findProjectFileUpwards(startDir, fileName, homeDir) {
  const boundary = path.resolve(homeDir);
  let currentDir = path.resolve(startDir);
  while (true) {
    const candidate = path.join(currentDir, fileName);
    if (await fileExists(candidate)) return candidate;
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir || currentDir === boundary) return null;
    currentDir = parentDir;
  }
}

function makeResult(id, content, priority, source, meta = null) {
  const text = (content ?? "").trim();
  return {
    id,
    content: text,
    estimatedTokens: estimateTokens(text),
    priority,
    source,
    meta,
  };
}

/**
 * @type {Array<{id: string, priority: string, fetch: (ctx: SourceContext) => Promise<SourceResult>}>}
 */
export const CONTEXT_SOURCES = [
  {
    id: "built-in",
    priority: "required",
    async fetch() {
      return makeResult("built-in", DEFAULT_SYSTEM_PROMPT, "required", "built-in");
    },
  },

  {
    id: "global-system",
    priority: "required",
    async fetch({ config }) {
      const content = await maybeReadText(config.paths.systemPromptFile);
      if (!content) return null;
      return makeResult("global-system", content, "required", config.paths.systemPromptFile);
    },
  },

  {
    id: "project-mrmush",
    priority: "high",
    async fetch({ config, cwd }) {
      const filePath = await findProjectFileUpwards(cwd, "MRMUSH.md", config.paths.homeDir);
      if (!filePath) return null;
      const content = await maybeReadText(filePath);
      if (!content) return null;
      return makeResult("project-mrmush", content, "high", filePath);
    },
  },

  {
    id: "profile",
    priority: "high",
    async fetch({ config }) {
      const profile = config.activeProfile;
      const content = await maybeReadText(config.paths.profilePromptFile(profile));
      if (!content) return null;
      return makeResult("profile", content, "high", config.paths.profilePromptFile(profile));
    },
  },

  {
    id: "provider",
    priority: "normal",
    async fetch({ config }) {
      const providerId = config.activeProvider;
      const content = await maybeReadText(config.paths.providerPromptFile(providerId));
      if (!content) return null;
      return makeResult("provider", content, "normal", config.paths.providerPromptFile(providerId));
    },
  },

  {
    id: "project-agents",
    priority: "normal",
    async fetch({ config, cwd }) {
      const filePath = await findProjectFileUpwards(cwd, "AGENTS.md", config.paths.homeDir);
      if (!filePath) return null;
      const content = await maybeReadText(filePath);
      if (!content) return null;
      return makeResult("project-agents", content, "normal", filePath);
    },
  },

  {
    id: "repo-map",
    priority: "normal",
    async fetch({ config, cwd }) {
      const enabled = config.intelligence?.repo_map?.enabled ?? false;
      if (!enabled) return null;

      const result = await getRepoMapResult(cwd, {
        mode: config.intelligence?.repo_map?.mode,
        tokenBudget: config.intelligence?.repo_map?.token_budget,
        maxSymbolsPerFile: config.intelligence?.repo_map?.max_symbols_per_file,
        includeInternalSymbols: config.intelligence?.repo_map?.include_internal_symbols,
        deniedPaths: config.intelligence?.repo_map?.denied_paths,
      });

      if (!result.text?.trim()) return null;

      return makeResult("repo-map", result.text, "normal", "repo-map", result.stats);
    },
  },

  {
    id: "tools-file-ops",
    priority: "normal",
    async fetch({ config }) {
      const bashEnabled = config.tools?.bash?.enabled ?? true;
      if (!bashEnabled) return null;
      const content = await readBundledText(TOOLS_FILE_OPS_PROMPT_URL);
      return makeResult("tools-file-ops", content, "normal", fileURLPath(TOOLS_FILE_OPS_PROMPT_URL));
    },
  },

  {
    id: "project-system",
    priority: "low",
    async fetch({ config }) {
      const content = await maybeReadText(config.paths.projectPromptFile);
      if (!content) return null;
      return makeResult("project-system", content, "low", config.paths.projectPromptFile);
    },
  },
];

/**
 * Get source IDs mapped to their priority.
 * @returns {Record<string, string>}
 */
export function getSourcePriorities() {
  const map = {};
  for (const source of CONTEXT_SOURCES) {
    map[source.id] = source.priority;
  }
  return map;
}

/**
 * Filter sources by intent (domain).
 * null intent = load everything.
 * @param {string|null} intent
 * @returns {typeof CONTEXT_SOURCES}
 */
export function filterSourcesByIntent(intent) {
  if (!intent) return CONTEXT_SOURCES;

  const DOMAIN_SOURCES = {
    devops: ["built-in", "global-system", "profile", "provider", "tools-file-ops", "project-mrmush", "project-system"],
    backend: ["built-in", "global-system", "profile", "provider", "repo-map", "tools-file-ops", "project-mrmush", "project-system"],
    frontend: ["built-in", "global-system", "profile", "provider", "tools-file-ops", "project-mrmush", "project-system"],
    analysis: ["built-in", "global-system", "profile", "provider", "repo-map", "project-agents", "project-mrmush", "project-system"],
    general: null,
  };

  const allowed = DOMAIN_SOURCES[intent];
  if (!allowed) return CONTEXT_SOURCES;

  return CONTEXT_SOURCES.filter((source) => allowed.includes(source.id));
}

function fileURLPath(url) {
  try {
    return fileURLToPath(url);
  } catch {
    return String(url);
  }
}
