import { CONTEXT_SOURCES, filterSourcesByIntent } from "./sources.js";
import { estimateTokensExact, estimateTokensFast } from "./tokenizer.js";
import { retrieveContext } from "./retriever.js";
import { getDb } from "./artifact-store.js";

/**
 * Compose a unified context window using strict percentage budgets.
 *
 * @param {object} params
 * @param {object} params.db - database instance
 * @param {string} params.sessionId - active chat session ID
 * @param {string} params.userQuery - current user prompt
 * @param {Array} params.transcript - active warm transcript messages
 * @param {object} params.config - resolved config
 * @param {string} params.cwd
 * @param {string|null} [params.intent] - intent filters
 * @returns {Promise<{ layers: Array, text: string, tokens: number }>}
 */
export async function composeUnifiedContext({
  db,
  sessionId,
  userQuery,
  transcript = [],
  config,
  cwd,
  intent = null
}) {
  const budget = config.intelligence?.context_budget ?? 8000;

  // Percentage budget splits
  const hotBudgetLimit = Math.floor(budget * 0.40);
  const retrieverBudgetLimit = Math.floor(budget * 0.35);
  const staticBudgetLimit = Math.floor(budget * 0.25);

  const sourceContext = { config, cwd };

  // Fetch all context sources
  const sources = filterSourcesByIntent(intent);
  const fetchedResults = await Promise.all(
    sources.map(async (src) => {
      try {
        return await src.fetch(sourceContext);
      } catch {
        return null;
      }
    })
  );

  const sourceMap = new Map();
  for (const res of fetchedResults) {
    if (res && res.content && res.content.trim().length > 0) {
      sourceMap.set(res.id, res);
    }
  }

  // Helper: exact token estimator
  const estExact = (text) => estimateTokensExact(text);

  // ----------------------------------------------------
  // 1. Hot-zone (40% budget)
  // ----------------------------------------------------
  // Composed of: system prompts, active profile, MRMUSH.md, last 4 messages of transcript
  const hotItems = [];
  let hotTokens = 0;

  // Primary: system prompt (global or fallback built-in)
  const systemPrompt = sourceMap.get("global-system") || sourceMap.get("built-in");
  if (systemPrompt) {
    hotItems.push({ id: systemPrompt.id, role: "system", content: systemPrompt.content });
    hotTokens += estExact(systemPrompt.content);
  }

  // Secondary: profile prompt
  const profilePrompt = sourceMap.get("profile");
  if (profilePrompt && hotTokens + estExact(profilePrompt.content) <= hotBudgetLimit) {
    hotItems.push({ id: profilePrompt.id, role: "system", content: profilePrompt.content });
    hotTokens += estExact(profilePrompt.content);
  }

  // Tertiary: project-mrmush (MRMUSH.md)
  const mrmushPrompt = sourceMap.get("project-mrmush");
  if (mrmushPrompt && hotTokens + estExact(mrmushPrompt.content) <= hotBudgetLimit) {
    hotItems.push({ id: mrmushPrompt.id, role: "system", content: mrmushPrompt.content });
    hotTokens += estExact(mrmushPrompt.content);
  }

  // Quaternary: last 4 messages of active transcript (Hot dialogue)
  const hotDialogue = transcript.slice(-4);
  for (const msg of hotDialogue) {
    const text = msg.content ?? msg.text ?? "";
    const tok = estExact(text) + 4; // role overhead
    if (hotTokens + tok <= hotBudgetLimit) {
      hotItems.push({ id: `dialogue-${msg.id || msg.ts}`, role: msg.role, content: text });
      hotTokens += tok;
    } else {
      break;
    }
  }

  // ----------------------------------------------------
  // 2. Retriever results (35% budget)
  // ----------------------------------------------------
  // Retrieve relevant warm/cold summaries from database storage
  let retrieverItems = [];
  let retrieverTokens = 0;

  if (db && userQuery) {
    const retrieved = await retrieveContext(db, {
      sessionId,
      userQuery,
      warmBudget: retrieverBudgetLimit,
      minScore: 0.1
    });

    for (const art of retrieved) {
      const text = `[Context summary from session ${art.session_id}]: ${art.summary}`;
      const tok = estExact(text);
      if (retrieverTokens + tok <= retrieverBudgetLimit) {
        retrieverItems.push({ id: `retrieved-${art.id}`, role: "system", content: text });
        retrieverTokens += tok;
      } else {
        break;
      }
    }
  }

  // ----------------------------------------------------
  // 3. Static Context (25% budget)
  // ----------------------------------------------------
  // Composed of: repo-map, mcp-servers, tools-file-ops, provider prompts, etc.
  const staticIds = ["repo-map", "mcp-servers", "tools-file-ops", "provider", "project-agents", "project-system"];
  const staticCandidates = [];
  for (const id of staticIds) {
    if (sourceMap.has(id)) {
      staticCandidates.push(sourceMap.get(id));
    }
  }

  // Sort by priority (normal, low, etc. - in sources, priority is defined)
  const PRIORITY_ORDER = { required: 0, high: 1, normal: 2, low: 3 };
  staticCandidates.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    return pa - pb;
  });

  const staticItems = [];
  let staticTokens = 0;

  for (const cand of staticCandidates) {
    const tok = estExact(cand.content);
    if (staticTokens + tok <= staticBudgetLimit) {
      staticItems.push({ id: cand.id, role: "system", content: cand.content });
      staticTokens += tok;
    }
  }

  // Combine into single sorted layers list
  // System prompts/rules first, followed by static components, then retrieved snippets, then dialogue history
  const layers = [
    ...hotItems.filter(item => item.role === "system"),
    ...staticItems,
    ...retrieverItems,
    ...hotItems.filter(item => item.role !== "system")
  ];

  const totalTokens = hotTokens + retrieverTokens + staticTokens;

  return {
    layers,
    text: layers.map(l => l.content.trim()).join("\n\n"),
    tokens: totalTokens
  };
}

/**
 * Backward compatible aggregateContext method.
 * Uses exact tokenizer count check.
 */
export async function aggregateContext({ config, cwd, intent = null }) {
  const db = await getDb(config);
  // Simulates composed context without query / active dialogue
  const res = await composeUnifiedContext({
    db,
    sessionId: "default",
    userQuery: "",
    transcript: [],
    config,
    cwd,
    intent
  });

  return {
    layers: res.layers,
    text: res.text,
    totalTokens: res.tokens,
    includedSourceIds: res.layers.map(l => l.id),
    skippedSourceIds: []
  };
}
