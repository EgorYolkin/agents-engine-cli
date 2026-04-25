/**
 * @file MCP server configuration helpers.
 *
 * Each entry in config.mcp.servers represents an MCP server
 * that Mr. Mush can spawn or connect to.
 *
 * stdio servers require `command` (and optional `args`).
 * http  servers require `url`.
 */

/**
 * Returns the list of enabled MCP servers with normalized fields.
 * @param {object} config
 * @returns {Array<{id:string, enabled:boolean, transport:string, command?:string, args:string[], cwd?:string, startup_timeout_sec?:number, url?:string, env:Record<string,string>}>}
 */
export function getEnabledMcpServers(config) {
  const servers = config.mcp?.servers ?? {};

  return Object.entries(servers)
    .filter(([, server]) => server.enabled)
    .map(([id, server]) => normalizeServer(id, server));
}

/**
 * Returns a single enabled MCP server by id, or null if not found / disabled.
 * @param {object} config
 * @param {string} id
 * @returns {object|null}
 */
export function getMcpServerById(config, id) {
  const server = config.mcp?.servers?.[id];
  if (!server || !server.enabled) return null;
  return normalizeServer(id, server);
}

/**
 * Returns the list of all MCP server ids (both enabled and disabled).
 * @param {object} config
 * @returns {string[]}
 */
export function getMcpServerIds(config) {
  const servers = config.mcp?.servers ?? {};
  return Object.keys(servers);
}

/**
 * Validates a single MCP server entry.
 * - stdio transport requires `command` to be a non-empty string.
 * - http  transport requires `url` to be a non-empty string.
 *
 * @param {object} server
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateMcpServer(server) {
  const errors = [];

  if (server.transport === "stdio") {
    if (
      !server.command ||
      typeof server.command !== "string" ||
      server.command.trim().length === 0
    ) {
      errors.push('stdio transport requires a non-empty "command"');
    }
  } else if (server.transport === "http") {
    if (
      !server.url ||
      typeof server.url !== "string" ||
      server.url.trim().length === 0
    ) {
      errors.push('http transport requires a non-empty "url"');
    }
  } else {
    errors.push(`unsupported transport "${server.transport}"`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Normalise a raw server entry with defaults.
 * @param {string} id
 * @param {object} raw
 * @returns {{id:string, enabled:boolean, transport:string, command?:string, args:string[], cwd?:string, startup_timeout_sec?:number, url?:string, env:Record<string,string>}}
 */
function normalizeServer(id, raw) {
  return {
    id,
    enabled: raw.enabled ?? false,
    transport: raw.transport ?? "stdio",
    command: raw.command,
    args: raw.args ?? [],
    cwd: raw.cwd,
    startup_timeout_sec: raw.startup_timeout_sec,
    url: raw.url,
    env: raw.env ?? {},
  };
}
