import { getProvider } from "../providers/index.js";
import { estimateTokens } from "../context/tokenizer.js";

const TIMEOUT_MS = 15_000;

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

const CHEAP_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  google: "gemini-2.0-flash",
  deepseek: "deepseek-chat",
  xiaomimimo: "mimo-v2.5", // use default model (mimo-v2.5)
  ollama: null, // use default local model
  lmstudio: null,
  modelscope: "qwen-turbo",
};

/**
 * PARAPHRASE PROMPT — edit this to customize how user queries are rewritten.
 *
 * The prompt receives the raw user query and should return a clearer,
 * more specific version suitable for an AI coding assistant.
 *
 * Guidelines:
 * - Keep the original intent and language
 * - Add implicit context that helps the assistant understand the request
 * - Reply with ONLY the rephrased query, nothing else
 */
const PARAPHRASE_PROMPT = [
  "You rewrite user queries for an AI coding assistant.",
  "",
  "Your job is conservative normalization, not expansion.",
  "",
  "Preserve exactly:",
  "- the user's original language",
  "- intent",
  "- tone",
  "- directness",
  "- urgency",
  "- scope",
  "- ambiguity",
  "- level of specificity",
  "",
  "You may:",
  "- fix obvious misspellings",
  "- standardize product or technology names",
  "- make a tiny wording improvement only when it clearly increases clarity",
  "",
  "You must not:",
  "- translate the query into another language",
  "- add instructions about which language to answer in",
  "- add context not stated by the user",
  "- infer project structure or tech stack",
  "- add requirements or subtasks",
  "- choose an implementation approach",
  "- make the request more formal",
  "- soften or strengthen the user's command",
  "- remove useful informal signals that affect the expected answer style",
  "",
  "Prefer returning the original query unchanged unless the rewrite clearly improves clarity without changing tone or interaction style.",
  "If rewriting would change the meaning, tone, expected response style, or language, return the original query unchanged.",
  "Reply with ONLY the final query.",
  "",
  "Examples:",
  '  "чё такое реакт" → "чё такое React"',
  '  "что делает useeffect" → "что делает useEffect"',
  '  "почини баг" → "почини баг"',
  '  "сделай норм" → "сделай норм"',
  '  "реакт не ререндерит" → "React не ререндерит"',
  '  "тс орёт на типы" → "TypeScript орёт на типы"',
  '  "добавь auth middleware" → "добавь auth middleware"',
  '  "implement auth" → "implement auth"',
  "",
  "User query:",
].join("\n");
/**
 * Paraphrase a user query using a cheap model.
 *
 * @param {string} query - Original user query
 * @param {object} config - Resolved config
 * @param {object} runtimeOverrides - Runtime overrides
 * @returns {Promise<{ original: string, paraphrased: string, model: string, tokens: number }>}
 */
export async function paraphraseQuery(query, config, runtimeOverrides = {}) {
  const providerId = runtimeOverrides.providerId ?? config.activeProvider;
  const provider = getProvider(providerId);
  const cheapModel = CHEAP_MODELS[providerId] ?? null;

  // Use cheap model if available, otherwise use main model
  const model = cheapModel ?? runtimeOverrides.model ?? config.activeModel;

  const overrides = {
    ...runtimeOverrides,
    model,
    thinkingLevel: "off",
  };

  const prompt = `${PARAPHRASE_PROMPT}\n${query}`;

  try {
    const response = await withTimeout(
      provider.exec(config, prompt, overrides),
    );
    const paraphrased = (response.text ?? "").trim();
    const tokens = estimateTokens(query) + estimateTokens(paraphrased);

    if (!paraphrased || paraphrased === query) {
      return { original: query, paraphrased: query, model: cheapModel, tokens };
    }

    return { original: query, paraphrased, model: cheapModel, tokens };
  } catch {
    // If paraphrasing fails, fall back to original query
    return {
      original: query,
      paraphrased: query,
      model: cheapModel,
      tokens: 0,
    };
  }
}
