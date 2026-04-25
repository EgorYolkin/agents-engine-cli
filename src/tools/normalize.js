import { randomUUID } from "crypto";

/**
 * @typedef {{ name: string, description: string, parameters: object }} ToolDefinition
 * @typedef {{ name: string, args: object, id: string }} ToolCall
 * @typedef {{ id: string, name: string, result: object }} ToolResult
 */

// ─── OpenAI-compatible format ────────────────────────────────────────────────

/**
 * Convert internal tool definitions to OpenAI function-calling format.
 *
 * @param {ToolDefinition[]} tools
 * @returns {Array<{ type: 'function', function: { name: string, description: string, parameters: object } }>}
 */
export function formatToolsOpenAI(tools) {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Normalize a single OpenAI tool call to internal format.
 * Handles both streaming-accumulated and non-streaming response shapes.
 *
 * @param {{ id: string, function: { name: string, arguments: string } }} raw
 * @returns {ToolCall}
 */
export function normalizeToolCallOpenAI(raw) {
  let args;
  try {
    args = JSON.parse(raw.function.arguments);
  } catch {
    args = {};
  }
  return {
    name: raw.function.name,
    args,
    id: raw.id ?? randomUUID(),
  };
}

/**
 * Format internal tool result for OpenAI-compatible API (tool role message).
 *
 * @param {ToolResult} toolResult
 * @returns {{ role: 'tool', tool_call_id: string, content: string }}
 */
export function formatToolResultOpenAI(toolResult) {
  return {
    role: "tool",
    tool_call_id: toolResult.id,
    content: JSON.stringify(toolResult.result),
  };
}

// ─── Google Gemini format ────────────────────────────────────────────────────

/**
 * Convert internal tool definitions to Google Gemini format.
 *
 * @param {ToolDefinition[]} tools
 * @returns {{ functionDeclarations: Array<{ name: string, description: string, parameters: object }> }}
 */
export function formatToolsGoogle(tools) {
  return {
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
  };
}

/**
 * Normalize a Google Gemini function call to internal format.
 *
 * @param {{ name: string, args: object }} raw
 * @param {string} [callId]
 * @returns {ToolCall}
 */
export function normalizeToolCallGoogle(raw, callId) {
  return {
    name: raw.name,
    args: raw.args ?? {},
    id: callId ?? randomUUID(),
  };
}

/**
 * Format internal tool result for Google Gemini API (functionResponse part).
 *
 * @param {ToolResult} toolResult
 * @returns {{ functionResponse: { name: string, response: object } }}
 */
export function formatToolResultGoogle(toolResult) {
  return {
    functionResponse: {
      name: toolResult.name,
      response: toolResult.result,
    },
  };
}
