import { encoding_for_model } from "tiktoken";

let encoderInstance = null;

/**
 * Get or lazily initialize the tiktoken gpt-4o encoder.
 */
function getEncoder() {
  if (!encoderInstance) {
    encoderInstance = encoding_for_model("gpt-4o");
  }
  return encoderInstance;
}

/**
 * Heuristic to detect if a text fragment contains code.
 */
export function isLikelyCode(text) {
  if (typeof text !== "string") return false;
  if (text.includes("```")) return true;
  if (
    text.includes("import ") ||
    text.includes("export ") ||
    text.includes("const ") ||
    text.includes("let ") ||
    text.includes("function ") ||
    text.includes("class ")
  ) {
    return true;
  }
  if (text.includes("def ") || text.includes("return ") || text.includes("elif ")) {
    return true;
  }
  const syntaxCount = (text.match(/[{};()]/g) || []).length;
  return syntaxCount > 5;
}

/**
 * Heuristic Fast token estimation.
 * Normal text: length / 3.5
 * Code: length / 2.8
 */
export function estimateTokensFast(text, isCode = null) {
  const cleanText = String(text ?? "");
  const code = isCode !== null ? isCode : isLikelyCode(cleanText);
  const divisor = code ? 2.8 : 3.5;
  return Math.ceil(cleanText.length / divisor);
}

/**
 * Exact token calculation using tiktoken gpt-4o encoder.
 */
export function estimateTokensExact(text) {
  try {
    const enc = getEncoder();
    return enc.encode(String(text ?? "")).length;
  } catch (err) {
    // Fallback if encoder fails or is not supported
    return estimateTokensFast(text);
  }
}

/**
 * Main token estimator for backward compatibility. Uses fast mode by default.
 */
export function estimateTokens(text, isCode = null) {
  return estimateTokensFast(text, isCode);
}

/**
 * Estimate total tokens across an array of chat messages.
 */
export function estimateMessagesTokens(messages, useExact = false) {
  if (!Array.isArray(messages)) return 0;
  let total = 0;
  const estimateFn = useExact ? estimateTokensExact : estimateTokensFast;
  for (const msg of messages) {
    const text = msg.content ?? msg.text ?? "";
    total += estimateFn(text);
    total += 4; // role/formatting overhead per message
  }
  return total;
}

/**
 * Estimate tokens for a prompt stack (layers array).
 */
export function estimateLayersTokens(layers, useExact = false) {
  if (!Array.isArray(layers)) return 0;
  let total = 0;
  const estimateFn = useExact ? estimateTokensExact : estimateTokensFast;
  for (const layer of layers) {
    total += estimateFn(layer.content ?? "");
  }
  return total;
}
