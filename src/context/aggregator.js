/**
 * @file Context aggregator.
 *
 * Loads context sources in parallel, applies budget constraints,
 * and produces a prompt stack compatible with the existing interface.
 */

import { CONTEXT_SOURCES, filterSourcesByIntent } from "./sources.js";
import { estimateTokens } from "./tokenizer.js";

const PRIORITY_ORDER = { required: 0, high: 1, normal: 2, low: 3 };

/**
 * @typedef {object} AggregateResult
 * @property {Array<{id: string, source: string, content: string, meta?: object}>} layers
 * @property {string} text — all layers joined with \n\n
 * @property {number} totalTokens
 * @property {string[]} includedSourceIds
 * @property {string[]} skippedSourceIds
 */

/**
 * Aggregate context from all sources, applying budget constraints.
 *
 * @param {object} params
 * @param {object} params.config — resolved config
 * @param {string} params.cwd
 * @param {string|null} [params.intent] — domain intent for source filtering
 * @returns {Promise<AggregateResult>}
 */
export async function aggregateContext({ config, cwd, intent = null }) {
  const sources = filterSourcesByIntent(intent);
  const budget = config.intelligence?.context_budget ?? 8000;

  const sourceContext = { config, cwd };

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        return await source.fetch(sourceContext);
      } catch {
        return null;
      }
    }),
  );

  const valid = results
    .filter((r) => r && r.content && r.content.trim().length > 0)
    .sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority] ?? 99;
      const pb = PRIORITY_ORDER[b.priority] ?? 99;
      return pa - pb;
    });

  const included = [];
  const skipped = [];
  let usedTokens = 0;

  for (const result of valid) {
    if (result.priority === "required" || usedTokens + result.estimatedTokens <= budget) {
      included.push(result);
      usedTokens += result.estimatedTokens;
    } else {
      skipped.push(result.id);
    }
  }

  const layers = included.map((r) => ({
    id: r.id,
    source: r.source,
    content: r.content,
    ...(r.meta ? { meta: r.meta } : {}),
  }));

  return {
    layers,
    text: layers.map((layer) => layer.content.trim()).join("\n\n"),
    totalTokens: usedTokens,
    includedSourceIds: included.map((r) => r.id),
    skippedSourceIds: skipped,
  };
}
