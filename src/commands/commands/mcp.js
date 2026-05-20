import { getEnabledMcpServers } from "../../mcp/servers.js";
import { successResult } from "../results.js";

function formatMcpServer(server) {
  const endpoint =
    server.transport === "http"
      ? server.url
      : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");

  const detail = server.startup_timeout_sec
    ? `${server.transport}, ${server.startup_timeout_sec}s`
    : server.transport;

  return `- **${server.id}** (${detail}) — ${endpoint}${server.cwd ? ` · ${server.cwd}` : ""}`;
}

export const mcpCommand = {
  name: "mcp",
  descriptionKey: "commands.descriptions.mcp",
  usage: "/mcp",
  async execute({ config }) {
    const mcpServers = getEnabledMcpServers(config).map(formatMcpServer);

    if (mcpServers.length === 0) {
      return successResult("No enabled MCP servers");
    }

    return successResult(`MCP servers:\n${mcpServers.join("\n")}`);
  },
};
