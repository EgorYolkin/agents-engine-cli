/**
 * @file Token estimation utilities for context budget management.
 *
 * Uses a rough heuristic: 1 token ≈ 4 characters.
 * This matches the existing estimate in intelligence/repo-map.js.
 */

/**
 * Estimate token count for a text string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? "").length / 4);
}

/**
 * Estimate total tokens across an array of chat messages.
 * @param {Array<{role: string, content?: string, text?: string}>} messages
 * @returns {number}
 */
export function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  for (const msg of messages) {
    const text = msg.content ?? msg.text ?? "";
    total += estimateTokens(text);
    total += 4; // role/formatting overhead per message
  }
  return total;
}

/**
 * Estimate tokens for a prompt stack (layers array).
 * @param {Array<{content?: string}>} layers
 * @returns {number}
 */
export function estimateLayersTokens(layers) {
  if (!Array.isArray(layers)) return 0;
  let total = 0;
  for (const layer of layers) {
    total += estimateTokens(layer.content ?? "");
  }
  return total;
}
