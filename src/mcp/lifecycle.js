/**
 * @file MCP server lifecycle manager.
 *
 * Coordinates starting, connecting, and shutting down MCP servers
 * based on the user's config. Populates the MCP registry with
 * connected servers and their tools.
 */

import { getEnabledMcpServers, validateMcpServer } from "./servers.js";
import { connectMcpServer, listMcpTools, disconnectMcpClient } from "./client.js";
import { createMcpRegistry } from "./registry.js";

/**
 * Start all enabled MCP servers and populate the registry.
 *
 * Errors on individual servers are caught and logged, but do not
 * prevent other servers from starting.
 *
 * @param {object} config - Loaded mush config
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {(msg: string) => void} [options.onStatus] - Status callback for UI updates
 * @param {(id: string, err: Error) => void} [options.onError] - Per-server error callback
 * @returns {Promise<import("./registry.js").ReturnType<typeof createMcpRegistry>>}
 */
export async function startMcpServers(config, options = {}) {
  const { signal, onStatus, onError } = options;
  const registry = createMcpRegistry();

  const enabledServers = getEnabledMcpServers(config);

  if (enabledServers.length === 0) {
    return registry;
  }

  if (onStatus) {
    onStatus(`Starting ${enabledServers.length} MCP server(s)...`);
  }

  // Start all servers concurrently
  const results = await Promise.allSettled(
    enabledServers.map(async (serverConfig) => {
      // Validate before connecting
      const validation = validateMcpServer(serverConfig);
      if (!validation.valid) {
        const errorMsg = `Invalid config: ${validation.errors.join(", ")}`;
        registry.registerError(serverConfig.id, errorMsg);
        if (onError) onError(serverConfig.id, new Error(errorMsg));
        return;
      }

      try {
        if (onStatus) {
          onStatus(`Connecting to MCP server "${serverConfig.id}"...`);
        }

        const { client, serverVersion, serverCapabilities } =
          await connectMcpServer(serverConfig, { signal });

        // List tools from the server
        let tools = [];
        if (serverCapabilities?.tools) {
          tools = await listMcpTools(client);
        }

        registry.register(
          serverConfig.id,
          client,
          serverVersion,
          serverCapabilities,
          tools,
        );

        if (onStatus) {
          onStatus(
            `MCP server "${serverConfig.id}" connected (${tools.length} tool(s))`,
          );
        }
      } catch (err) {
        const errorMsg = err.message ?? String(err);
        registry.registerError(serverConfig.id, errorMsg);
        if (onError) onError(serverConfig.id, err);
        if (onStatus) {
          onStatus(`MCP server "${serverConfig.id}" failed: ${errorMsg}`);
        }
      }
    }),
  );

  if (process.env.MRMUSH_DEBUG) {
    const connected = registry.getAllServers().filter((s) => s.status === "connected").length;
    const failed = registry.getAllServers().filter((s) => s.status === "error").length;
    process.stderr.write(
      `[mcp-lifecycle] ${connected} connected, ${failed} failed, ${registry.getAllTools().length} tools\n`,
    );
  }

  return registry;
}

/**
 * Shut down all MCP servers in the registry.
 *
 * @param {object} registry - MCP registry instance
 * @param {object} [options]
 * @param {(msg: string) => void} [options.onStatus]
 */
export async function stopMcpServers(registry, options = {}) {
  const { onStatus } = options;
  const servers = registry.getAllServers();

  if (servers.length === 0) return;

  if (onStatus) {
    onStatus(`Stopping ${servers.length} MCP server(s)...`);
  }

  await Promise.allSettled(
    servers
      .filter((s) => s.client && s.status === "connected")
      .map(async (server) => {
        try {
          await disconnectMcpClient(server.client);
          registry.unregister(server.id);
        } catch {
          // Best-effort cleanup
        }
      }),
  );

  registry.clear();
}

/**
 * Get a summary of the MCP registry state for UI/logging.
 *
 * @param {object} registry
 * @returns {{ connected: number, failed: number, tools: number, servers: object[] }}
 */
export function getMcpStatus(registry) {
  const servers = registry.getAllServers();
  return {
    connected: servers.filter((s) => s.status === "connected").length,
    failed: servers.filter((s) => s.status === "error").length,
    tools: registry.getAllTools().length,
    servers: servers.map((s) => ({
      id: s.id,
      status: s.status,
      error: s.error,
      toolCount: s.tools.length,
      version: s.serverVersion,
    })),
  };
}
