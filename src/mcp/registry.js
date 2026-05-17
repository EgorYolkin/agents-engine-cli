/**
 * @file MCP server registry — maintains connected server state and their tools.
 *
 * The registry is a runtime singleton that tracks which MCP servers are
 * connected, their capabilities, and the tools they expose.
 * It also maps tool names back to their owning server for dispatch.
 */

/**
 * @typedef {object} RegisteredServer
 * @property {string} id - Server identifier from config
 * @property {import("@modelcontextprotocol/sdk/client/index.js").Client} client - Connected MCP client
 * @property {object} serverVersion - Server version info from handshake
 * @property {object} serverCapabilities - Server capabilities from handshake
 * @property {"connected"|"error"|"disconnected"} status
 * @property {string|null} error - Error message if status is "error"
 * @property {Array<{ name: string, description: string, inputSchema: object }>} tools
 */

/**
 * @typedef {object} McpToolEntry
 * @property {string} serverId - The MCP server that owns this tool
 * @property {string} name - Qualified tool name (serverId__toolName)
 * @property {string} originalName - Original tool name from MCP server
 * @property {string} description
 * @property {object} inputSchema
 */

/**
 * Create a new MCP registry instance.
 *
 * @returns {object} Registry API
 */
export function createMcpRegistry() {
  /** @type {Map<string, RegisteredServer>} */
  const servers = new Map();

  /** @type {Map<string, McpToolEntry>} */
  const toolIndex = new Map();

  /**
   * Qualify a tool name with its server ID to avoid collisions.
   * e.g. context7__resolve_library_id
   */
  function qualifyToolName(serverId, toolName) {
    return `mcp__${serverId}__${toolName}`;
  }

  /**
   * Register a connected server and its tools.
   *
   * @param {string} id
   * @param {import("@modelcontextprotocol/sdk/client/index.js").Client} client
   * @param {object} serverVersion
   * @param {object} serverCapabilities
   * @param {Array<{ name: string, description: string, inputSchema: object }>} tools
   */
  function register(id, client, serverVersion, serverCapabilities, tools) {
    servers.set(id, {
      id,
      client,
      serverVersion,
      serverCapabilities,
      status: "connected",
      error: null,
      tools,
    });

    // Index each tool
    for (const tool of tools) {
      const qualifiedName = qualifyToolName(id, tool.name);
      toolIndex.set(qualifiedName, {
        serverId: id,
        name: qualifiedName,
        originalName: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      });
    }
  }

  /**
   * Register a server that failed to connect.
   */
  function registerError(id, errorMessage) {
    servers.set(id, {
      id,
      client: null,
      serverVersion: null,
      serverCapabilities: null,
      status: "error",
      error: errorMessage,
      tools: [],
    });
  }

  /**
   * Unregister a server and remove its tools from the index.
   */
  function unregister(id) {
    const server = servers.get(id);
    if (server) {
      for (const tool of server.tools) {
        toolIndex.delete(qualifyToolName(id, tool.name));
      }
      servers.delete(id);
    }
  }

  /**
   * Find a tool entry by its qualified name.
   *
   * @param {string} qualifiedName
   * @returns {McpToolEntry|null}
   */
  function findTool(qualifiedName) {
    return toolIndex.get(qualifiedName) ?? null;
  }

  /**
   * Get the MCP client for a tool by qualified name.
   *
   * @param {string} qualifiedName
   * @returns {{ client: Client, entry: McpToolEntry }|null}
   */
  function getClientForTool(qualifiedName) {
    const entry = toolIndex.get(qualifiedName);
    if (!entry) return null;
    const server = servers.get(entry.serverId);
    if (!server || !server.client || server.status !== "connected") return null;
    return { client: server.client, entry };
  }

  /**
   * Get all registered tools as an array.
   *
   * @returns {McpToolEntry[]}
   */
  function getAllTools() {
    return Array.from(toolIndex.values());
  }

  /**
   * Get all registered servers as an array.
   *
   * @returns {RegisteredServer[]}
   */
  function getAllServers() {
    return Array.from(servers.values());
  }

  /**
   * Get a registered server by ID.
   *
   * @param {string} id
   * @returns {RegisteredServer|null}
   */
  function getServer(id) {
    return servers.get(id) ?? null;
  }

  /**
   * Check if the registry has any connected servers with tools.
   */
  function hasTools() {
    return toolIndex.size > 0;
  }

  /**
   * Clear all entries.
   */
  function clear() {
    toolIndex.clear();
    servers.clear();
  }

  return {
    register,
    registerError,
    unregister,
    findTool,
    getClientForTool,
    getAllTools,
    getAllServers,
    getServer,
    hasTools,
    clear,
    qualifyToolName,
  };
}
