import { getEnabledMcpServers } from "../../mcp/servers.js";
import { buildChatListFrame } from "../../ui/components/list.js";
import { renderedResult } from "../results.js";

function formatMcpServer(server) {
  const endpoint =
    server.transport === "http"
      ? server.url
      : [server.command, ...(server.args ?? [])].filter(Boolean).join(" ");

  return {
    id: server.id,
    detail: server.startup_timeout_sec
      ? `${server.transport}, ${server.startup_timeout_sec}s`
      : server.transport,
    description: [endpoint, server.cwd].filter(Boolean).join(" · "),
    marker: "•",
  };
}

function renderMcpServersCard(frame) {
  process.stdout.write(frame.text);
}

export const mcpCommand = {
  name: "mcp",
  descriptionKey: "commands.descriptions.mcp",
  usage: "/mcp",
  async execute({ context, config }) {
    const rawMcpServers = getEnabledMcpServers(config).map(formatMcpServer);

    const mcpServers = rawMcpServers.map((server) => ({
      title: server.id,
      detail: server.startup_timeout_sec
        ? `${server.transport}, ${server.startup_timeout_sec}s`
        : server.transport,
      description: [server.command, ...(server.args ?? []), server.cwd]
        .filter(Boolean)
        .join(" · "),
    }));

    renderMcpServersCard(
      buildChatListFrame("mcp", mcpServers, context, {
        emptyText: "No enabled MCP servers",
      }),
    );

    return renderedResult();
  },
};
