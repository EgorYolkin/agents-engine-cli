/**
 * @file MCP client wrapper around @modelcontextprotocol/sdk.
 *
 * Creates an MCP Client for a given server config, connects via the
 * appropriate transport (stdio or http), performs the initialize
 * handshake, and exposes tool listing / calling.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const CLIENT_INFO = { name: "mush", version: "1.2.5" };

/**
 * Create a transport for the given server config.
 *
 * @param {object} serverConfig - Normalized MCP server entry
 * @returns {object} Transport instance
 */
function createTransport(serverConfig) {
  if (serverConfig.transport === "stdio") {
    return new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args ?? [],
      cwd: serverConfig.cwd,
      env: {
        ...process.env,
        ...(serverConfig.env ?? {}),
      },
      stderr: "pipe",
    });
  }

  if (serverConfig.transport === "http") {
    return new StreamableHTTPClientTransport(
      new URL(serverConfig.url),
    );
  }

  throw new Error(`Unsupported MCP transport: ${serverConfig.transport}`);
}

/**
 * Connect to an MCP server and return a connected client.
 *
 * @param {object} serverConfig - Normalized MCP server entry from servers.js
 * @param {object} [options]
 * @param {AbortSignal} [options.signal] - Optional abort signal
 * @returns {Promise<{ client: Client, serverInfo: object }>}
 */
export async function connectMcpServer(serverConfig, options = {}) {
  const transport = createTransport(serverConfig);
  const client = new Client(CLIENT_INFO, {
    capabilities: {
      roots: { listChanged: false },
    },
  });

  const timeoutMs = (serverConfig.startup_timeout_sec ?? 30) * 1000;

  const connectPromise = client.connect(transport);

  // Race against timeout
  const timeoutPromise = new Promise((_, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`MCP server "${serverConfig.id}" startup timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    // Allow GC to clean up if connect resolves first
    connectPromise.then(() => clearTimeout(timer), () => clearTimeout(timer));
  });

  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      client.close().catch(() => {});
    }, { once: true });
  }

  await Promise.race([connectPromise, timeoutPromise]);

  const serverVersion = client.getServerVersion?.() ?? null;
  const serverCapabilities = client.getServerCapabilities?.() ?? {};

  return { client, serverVersion, serverCapabilities };
}

/**
 * List all tools exposed by a connected MCP client.
 *
 * @param {Client} client
 * @returns {Promise<Array<{ name: string, description: string, inputSchema: object }>>}
 */
export async function listMcpTools(client) {
  const result = await client.listTools();
  return (result.tools ?? []).map((tool) => ({
    name: tool.name,
    description: tool.description ?? "",
    inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
  }));
}

/**
 * Call a tool on a connected MCP client.
 *
 * @param {Client} client
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<object>}
 */
export async function callMcpTool(client, toolName, args = {}) {
  const result = await client.callTool({ name: toolName, arguments: args });
  return {
    tool: toolName,
    content: result.content ?? [],
    isError: result.isError ?? false,
  };
}

/**
 * Disconnect an MCP client gracefully.
 *
 * @param {Client} client
 */
export async function disconnectMcpClient(client) {
  try {
    await client.close();
  } catch {
    // Swallow close errors — process may already be dead
  }
}
