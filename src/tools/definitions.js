/**
 * Formal JSON Schema definitions for all supported tools.
 * Used by native tool calling providers to declare capabilities to the LLM.
 *
 * @typedef {{ name: string, description: string, parameters: object }} ToolDefinition
 */

/** @type {ToolDefinition[]} */
export const TOOL_DEFINITIONS = [
  {
    name: "bash",
    description: "Run a shell command. Returns stdout, stderr, exit code.",
    parameters: {
      type: "object",
      properties: {
        cmd: { type: "string", description: "Shell command to execute." },
      },
      required: ["cmd"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file. Creates or overwrites.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path." },
        content: { type: "string", description: "File content." },
      },
      required: ["path", "content"],
    },
  },
];

/**
 * @param {string} name
 * @returns {ToolDefinition | undefined}
 */
export function getToolDefinition(name) {
  return TOOL_DEFINITIONS.find((t) => t.name === name);
}

/**
 * Check whether a tool name is an MCP-namespaced tool.
 * MCP tools use the format: mcp__<serverId>__<toolName>
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isMcpTool(name) {
  return name.startsWith("mcp__");
}

/**
 * Convert MCP tools from the registry into ToolDefinition format.
 *
 * @param {object|null} registry - MCP registry instance (or null)
 * @returns {ToolDefinition[]}
 */
export function getMcpToolDefinitions(registry) {
  if (!registry) return [];
  return registry.getAllTools().map((entry) => ({
    name: entry.name,
    description: `[MCP:${entry.serverId}] ${entry.description}`,
    parameters: entry.inputSchema,
  }));
}

/**
 * Get all tool definitions: built-in + MCP tools from the registry.
 *
 * @param {object|null} registry - MCP registry instance (or null)
 * @returns {ToolDefinition[]}
 */
export function getAllToolDefinitions(registry) {
  return [...TOOL_DEFINITIONS, ...getMcpToolDefinitions(registry)];
}
