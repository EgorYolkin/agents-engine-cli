import { getProvider } from "../providers/index.js";
import { estimateTokens } from "../context/tokenizer.js";
import { paraphraseQuery } from "./paraphrase.js";

// ─── Test cases ──────────────────────────────────────────────────────────────

const TEST_CASES = [
  // informal explain
  { query: "чё такое реакт", category: "informal_explain" },
  { query: "что за vite", category: "informal_explain" },
  { query: "зачем нужен zustand", category: "informal_explain" },
  { query: "что делает useeffect", category: "informal_explain" },

  // vague action
  { query: "почини баг", category: "vague_action" },
  { query: "сделай норм", category: "vague_action" },
  { query: "оптимизируй это", category: "vague_action" },
  { query: "разберись почему падает", category: "vague_action" },

  // good action
  { query: "implement auth", category: "good_action" },
  { query: "add request retry logic", category: "good_action" },
  { query: "refactor parser into smaller functions", category: "good_action" },
  { query: "write tests for config loader", category: "good_action" },

  // typo or slang
  { query: "реакт не ререндерит", category: "typo_or_slang" },
  { query: "тс орёт на типы", category: "typo_or_slang" },
  { query: "eslint чето ломает", category: "typo_or_slang" },
  { query: "нпм install отваливается", category: "typo_or_slang" },

  // mixed language
  { query: "добавь auth middleware", category: "mixed_language" },
  { query: "пофикси build error", category: "mixed_language" },
  { query: "проверь fetch retry logic", category: "mixed_language" },
  { query: "сделай cache layer для api", category: "mixed_language" },

  // already clear
  {
    query: "explain the difference between debounce and throttle",
    category: "already_clear",
  },
  {
    query: "find why this command exits with code 1",
    category: "already_clear",
  },
  {
    query: "implement pagination for the users endpoint",
    category: "already_clear",
  },
  {
    query: "extract validation logic into a separate utility",
    category: "already_clear",
  },
];

// ─── Judge prompt ────────────────────────────────────────────────────────────

const JUDGE_PROMPT = `You are evaluating two AI assistant responses to the same user query.

User query: {query}

Response A:
{responseA}

Response B:
{responseB}

Evaluate which response is better based on:
1. Relevance - does it address what the user actually wanted?
2. Completeness - does it provide sufficient detail?
3. Clarity - is the response clear and well-structured?

Important:
- Judge only the quality of the responses.
- Do not prefer a response just because it is longer.
- If both responses are similarly useful, return "tie".
- In "reason", explain your choice briefly in Russian.
- In "reason", refer to the candidates only as "Response A" and "Response B".

Respond with JSON only:
{
  "winner": "A" | "B" | "tie",
  "scoreA": <1-10>,
  "scoreB": <1-10>,
  "reason": "<краткое объяснение на русском>"
}`;

// ─── Benchmark config ────────────────────────────────────────────────────────
//
// Fast defaults:
// - 24 queries
// - 2 runs per query
// - 4 benchmark workers in parallel
//
// Total rough scale:
// - 24 paraphrase calls
// - 48 comparisons
// - up to 96 generation calls
// - up to 48 judge calls
//

const TIMEOUT_MS = Number(process.env.BENCH_TIMEOUT_MS ?? 15_000);
const PARAPHRASE_TIMEOUT_MS = Number(
  process.env.BENCH_PARAPHRASE_TIMEOUT_MS ?? 15_000,
);
const RUNS_PER_CASE = Number(process.env.BENCH_RUNS ?? 2);
const BENCHMARK_CONCURRENCY = Number(process.env.BENCH_CONCURRENCY ?? 4);
const INTER_RUN_DELAY_MS = Number(process.env.BENCH_DELAY_MS ?? 50);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withTimeout(promise, ms = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms),
    ),
  ]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function average(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  if (!values.length) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function formatMetric(value, digits = 0) {
  if (value == null || Number.isNaN(value)) return "n/a";
  return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isTimeoutError(error) {
  return error === "timeout";
}

function normalizeJudgment(value) {
  if (!value || typeof value !== "object") return null;

  const winner = value.winner;
  const scoreA = Number(value.scoreA);
  const scoreB = Number(value.scoreB);
  const reason = typeof value.reason === "string" ? value.reason.trim() : "";

  if (!["A", "B", "tie"].includes(winner)) return null;
  if (!Number.isFinite(scoreA) || scoreA < 1 || scoreA > 10) return null;
  if (!Number.isFinite(scoreB) || scoreB < 1 || scoreB > 10) return null;
  if (!reason) return null;

  return {
    winner,
    scoreA,
    scoreB,
    reason,
  };
}

function resolveSemanticWinner(judgment, sides) {
  if (!judgment) return null;
  if (judgment.winner === "tie") return "tie";

  const selectedSide = sides[judgment.winner];
  return selectedSide.kind;
}

function semanticizeJudgeReason(reason, judgeLayout) {
  if (!reason) return "";

  if (judgeLayout === "original=A") {
    return reason
      .replace(/\bResponse A\b/g, "Оригинальный ответ")
      .replace(/\bResponse B\b/g, "Переписанный ответ");
  }

  if (judgeLayout === "rewritten=A") {
    return reason
      .replace(/\bResponse A\b/g, "Переписанный ответ")
      .replace(/\bResponse B\b/g, "Оригинальный ответ");
  }

  return reason;
}

/**
 * Small Promise pool with bounded concurrency.
 */
async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;

      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    () => runWorker(),
  );

  await Promise.all(workers);
  return results;
}

// ─── Paraphrase step ─────────────────────────────────────────────────────────

async function runParaphrase(query, config, runtimeOverrides) {
  const start = Date.now();

  try {
    const result = await withTimeout(
      paraphraseQuery(query, config, runtimeOverrides),
      PARAPHRASE_TIMEOUT_MS,
    );

    const paraphrased = normalizeText(result?.paraphrased);

    if (!paraphrased) {
      return {
        paraphrased: query,
        rewriteChanged: false,
        latencyMs: Date.now() - start,
        error: "empty_paraphrase",
        fallbackToOriginal: true,
      };
    }

    return {
      paraphrased,
      rewriteChanged: paraphrased !== query,
      latencyMs: Date.now() - start,
      error: null,
      fallbackToOriginal: false,
    };
  } catch (err) {
    return {
      paraphrased: query,
      rewriteChanged: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
      fallbackToOriginal: true,
    };
  }
}

// ─── Execution ───────────────────────────────────────────────────────────────

async function runQuery(query, config, runtimeOverrides) {
  const providerId = runtimeOverrides.providerId ?? config.activeProvider;
  const provider = getProvider(providerId);

  const start = Date.now();

  try {
    const response = await withTimeout(
      provider.exec(config, query, {
        ...runtimeOverrides,
        thinkingLevel: "off",
      }),
    );

    const text = normalizeText(response.text);

    return {
      text,
      latencyMs: Date.now() - start,
      tokens: estimateTokens(text),
      error: null,
      isEmpty: text.length === 0,
      success: text.length > 0,
    };
  } catch (err) {
    return {
      text: "",
      latencyMs: Date.now() - start,
      tokens: 0,
      error: err instanceof Error ? err.message : String(err),
      isEmpty: true,
      success: false,
    };
  }
}

async function judgeResponses(
  query,
  responseA,
  responseB,
  config,
  runtimeOverrides,
) {
  const providerId = runtimeOverrides.providerId ?? config.activeProvider;
  const provider = getProvider(providerId);

  const prompt = JUDGE_PROMPT.replace("{query}", query)
    .replace("{responseA}", responseA.slice(0, 2000))
    .replace("{responseB}", responseB.slice(0, 2000));

  try {
    const response = await withTimeout(
      provider.exec(config, prompt, {
        ...runtimeOverrides,
        thinkingLevel: "off",
      }),
    );

    const text = normalizeText(response.text);
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) return null;

    return normalizeJudgment(JSON.parse(jsonMatch[0]));
  } catch {
    return null;
  }
}

/**
 * One fair A/B comparison:
 * - original vs rewritten are executed sequentially
 * - their order is randomized
 * - judge A/B layout is randomized
 */
async function runComparison({ query, paraphrased, config, runtimeOverrides }) {
  const rewriteChanged = paraphrased !== query;
  const generationOriginalFirst = Math.random() < 0.5;

  let original;
  let rewritten;

  if (generationOriginalFirst) {
    original = await runQuery(query, config, runtimeOverrides);
    rewritten = await runQuery(paraphrased, config, runtimeOverrides);
  } else {
    rewritten = await runQuery(paraphrased, config, runtimeOverrides);
    original = await runQuery(query, config, runtimeOverrides);
  }

  const invalidReasons = [];

  if (original.error) invalidReasons.push(`original_error:${original.error}`);
  if (rewritten.error) {
    invalidReasons.push(`rewritten_error:${rewritten.error}`);
  }
  if (original.isEmpty) invalidReasons.push("original_empty");
  if (rewritten.isEmpty) invalidReasons.push("rewritten_empty");

  const invalid = invalidReasons.length > 0;

  let judgment = null;
  let semanticWinner = null;
  let judgeLayout = null;
  let semanticReason = "";

  if (!invalid) {
    const originalAsA = Math.random() < 0.5;

    const sides = originalAsA
      ? {
          A: { kind: "original", text: original.text },
          B: { kind: "rewritten", text: rewritten.text },
        }
      : {
          A: { kind: "rewritten", text: rewritten.text },
          B: { kind: "original", text: original.text },
        };

    judgeLayout = originalAsA ? "original=A" : "rewritten=A";

    judgment = await judgeResponses(
      query,
      sides.A.text,
      sides.B.text,
      config,
      runtimeOverrides,
    );

    semanticWinner = resolveSemanticWinner(judgment, sides);

    semanticReason = judgment
      ? semanticizeJudgeReason(judgment.reason, judgeLayout)
      : "";
  }

  return {
    rewriteChanged,
    generationOrder: generationOriginalFirst
      ? "original-first"
      : "rewritten-first",
    judgeLayout,
    invalid,
    invalidReasons,
    semanticWinner,
    semanticReason,
    original,
    rewritten,
    judgment,
  };
}

// ─── Benchmark runner ────────────────────────────────────────────────────────

async function runSingleTestCase(
  testCase,
  index,
  total,
  config,
  runtimeOverrides,
  log,
) {
  const { query, category } = testCase;

  log(`[${index + 1}/${total}] "${query}" - paraphrasing...`);

  const paraphrase = await runParaphrase(query, config, runtimeOverrides);

  log(
    paraphrase.error
      ? `  paraphrase fallback: "${query}" (${paraphrase.error})`
      : paraphrase.rewriteChanged
        ? `  paraphrased: "${paraphrase.paraphrased.slice(0, 80)}..."`
        : "  paraphrased unchanged",
  );

  const runs = [];

  for (let runIndex = 0; runIndex < RUNS_PER_CASE; runIndex++) {
    log(`  run ${runIndex + 1}/${RUNS_PER_CASE}...`);

    const comparison = await runComparison({
      query,
      paraphrased: paraphrase.paraphrased,
      config,
      runtimeOverrides,
    });

    runs.push({
      run: runIndex + 1,
      ...comparison,
    });

    if (comparison.invalid) {
      log(`    invalid: ${comparison.invalidReasons.join(", ")}`);
    } else {
      log(`    winner: ${comparison.semanticWinner ?? "judge_error"}`);
    }

    if (runIndex < RUNS_PER_CASE - 1 && INTER_RUN_DELAY_MS > 0) {
      await sleep(INTER_RUN_DELAY_MS);
    }
  }

  return {
    query,
    category,
    paraphrased: paraphrase.rewriteChanged ? paraphrase.paraphrased : null,
    rewriteChanged: paraphrase.rewriteChanged,
    paraphrase,
    runs,
  };
}

export async function runBenchmark(
  config,
  runtimeOverrides = {},
  { onProgress = null } = {},
) {
  const log = (msg) => {
    if (onProgress) onProgress(msg);
  };

  return mapWithConcurrency(
    TEST_CASES,
    BENCHMARK_CONCURRENCY,
    (testCase, index) =>
      runSingleTestCase(
        testCase,
        index,
        TEST_CASES.length,
        config,
        runtimeOverrides,
        log,
      ),
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

export function summarizeResults(results) {
  const summary = {
    totalQueries: results.length,
    totalRuns: 0,
    changedQueries: 0,
    unchangedQueries: 0,

    paraphrase: {
      failures: 0,
      fallbacks: 0,
      avgLatency: null,
      medianLatency: null,
    },

    validRuns: 0,
    invalidRuns: 0,
    judgeFailures: 0,

    wins: {
      original: 0,
      rewritten: 0,
      tie: 0,
    },

    changedRewriteWins: {
      original: 0,
      rewritten: 0,
      tie: 0,
    },

    unchangedControlWins: {
      original: 0,
      rewritten: 0,
      tie: 0,
    },

    generationSuccesses: {
      original: 0,
      rewritten: 0,
    },

    generationFailures: {
      original: 0,
      rewritten: 0,
    },

    timeouts: {
      original: 0,
      rewritten: 0,
    },

    avgLatency: {
      original: null,
      rewritten: null,
    },

    medianLatency: {
      original: null,
      rewritten: null,
    },

    avgTokens: {
      original: null,
      rewritten: null,
    },

    medianTokens: {
      original: null,
      rewritten: null,
    },

    avgScore: {
      original: null,
      rewritten: null,
    },

    medianScore: {
      original: null,
      rewritten: null,
    },

    byCategory: {},
  };

  const paraphraseLatencies = [];

  const originalLatencies = [];
  const rewrittenLatencies = [];

  const originalTokens = [];
  const rewrittenTokens = [];

  const originalScores = [];
  const rewrittenScores = [];

  for (const result of results) {
    summary.totalRuns += result.runs.length;

    paraphraseLatencies.push(result.paraphrase.latencyMs);

    if (result.paraphrase.error) {
      summary.paraphrase.failures++;
    }

    if (result.paraphrase.fallbackToOriginal) {
      summary.paraphrase.fallbacks++;
    }

    if (result.rewriteChanged) summary.changedQueries++;
    else summary.unchangedQueries++;

    if (!summary.byCategory[result.category]) {
      summary.byCategory[result.category] = {
        queries: 0,
        runs: 0,
        changedQueries: 0,
        unchangedQueries: 0,
        validRuns: 0,
        invalidRuns: 0,
        judgeFailures: 0,
        wins: {
          original: 0,
          rewritten: 0,
          tie: 0,
        },
        avgScore: {
          original: null,
          rewritten: null,
        },
        avgTokens: {
          original: null,
          rewritten: null,
        },
        _scoresOriginal: [],
        _scoresRewritten: [],
        _tokensOriginal: [],
        _tokensRewritten: [],
      };
    }

    const cat = summary.byCategory[result.category];
    cat.queries++;

    if (result.rewriteChanged) cat.changedQueries++;
    else cat.unchangedQueries++;

    for (const run of result.runs) {
      cat.runs++;

      originalLatencies.push(run.original.latencyMs);
      rewrittenLatencies.push(run.rewritten.latencyMs);

      if (run.original.success) {
        summary.generationSuccesses.original++;
        originalTokens.push(run.original.tokens);
        cat._tokensOriginal.push(run.original.tokens);
      } else {
        summary.generationFailures.original++;
      }

      if (run.rewritten.success) {
        summary.generationSuccesses.rewritten++;
        rewrittenTokens.push(run.rewritten.tokens);
        cat._tokensRewritten.push(run.rewritten.tokens);
      } else {
        summary.generationFailures.rewritten++;
      }

      if (isTimeoutError(run.original.error)) {
        summary.timeouts.original++;
      }

      if (isTimeoutError(run.rewritten.error)) {
        summary.timeouts.rewritten++;
      }

      if (run.invalid) {
        summary.invalidRuns++;
        cat.invalidRuns++;
        continue;
      }

      if (!run.judgment || !run.semanticWinner) {
        summary.judgeFailures++;
        cat.judgeFailures++;
        continue;
      }

      summary.validRuns++;
      cat.validRuns++;

      summary.wins[run.semanticWinner]++;
      cat.wins[run.semanticWinner]++;

      if (result.rewriteChanged) {
        summary.changedRewriteWins[run.semanticWinner]++;
      } else {
        summary.unchangedControlWins[run.semanticWinner]++;
      }

      const originalScore =
        run.judgeLayout === "original=A"
          ? run.judgment.scoreA
          : run.judgment.scoreB;

      const rewrittenScore =
        run.judgeLayout === "original=A"
          ? run.judgment.scoreB
          : run.judgment.scoreA;

      originalScores.push(originalScore);
      rewrittenScores.push(rewrittenScore);

      cat._scoresOriginal.push(originalScore);
      cat._scoresRewritten.push(rewrittenScore);
    }
  }

  summary.paraphrase.avgLatency = average(paraphraseLatencies);
  summary.paraphrase.medianLatency = median(paraphraseLatencies);

  summary.avgLatency.original = average(originalLatencies);
  summary.avgLatency.rewritten = average(rewrittenLatencies);
  summary.medianLatency.original = median(originalLatencies);
  summary.medianLatency.rewritten = median(rewrittenLatencies);

  summary.avgTokens.original = average(originalTokens);
  summary.avgTokens.rewritten = average(rewrittenTokens);
  summary.medianTokens.original = median(originalTokens);
  summary.medianTokens.rewritten = median(rewrittenTokens);

  summary.avgScore.original = average(originalScores);
  summary.avgScore.rewritten = average(rewrittenScores);
  summary.medianScore.original = median(originalScores);
  summary.medianScore.rewritten = median(rewrittenScores);

  for (const stats of Object.values(summary.byCategory)) {
    stats.avgScore.original = average(stats._scoresOriginal);
    stats.avgScore.rewritten = average(stats._scoresRewritten);
    stats.avgTokens.original = average(stats._tokensOriginal);
    stats.avgTokens.rewritten = average(stats._tokensRewritten);

    delete stats._scoresOriginal;
    delete stats._scoresRewritten;
    delete stats._tokensOriginal;
    delete stats._tokensRewritten;
  }

  return summary;
}

// ─── Reporting ───────────────────────────────────────────────────────────────

export function formatReport(results, summary) {
  const lines = [
    "═══════════════════════════════════════════════════════════════",
    "  PARAPHRASE BENCHMARK REPORT",
    "═══════════════════════════════════════════════════════════════",
    "",
    `  Total queries: ${summary.totalQueries}`,
    `  Runs per query: ${RUNS_PER_CASE}`,
    `  Total runs: ${summary.totalRuns}`,
    `  Benchmark concurrency: ${BENCHMARK_CONCURRENCY}`,
    `  Changed rewrites: ${summary.changedQueries}`,
    `  Unchanged controls: ${summary.unchangedQueries}`,
    "",
    "  ─── Paraphrase Step ───",
    `  Failures: ${summary.paraphrase.failures}`,
    `  Fallbacks to original: ${summary.paraphrase.fallbacks}`,
    `  Latency: avg=${formatMetric(summary.paraphrase.avgLatency)}ms, median=${formatMetric(summary.paraphrase.medianLatency)}ms`,
    "",
    "  ─── Run Validity ───",
    `  Valid judged runs: ${summary.validRuns}`,
    `  Invalid runs: ${summary.invalidRuns}`,
    `  Judge failures: ${summary.judgeFailures}`,
    `  Timeouts: original=${summary.timeouts.original}, rewritten=${summary.timeouts.rewritten}`,
    "",
    "  ─── Generation Success ───",
    `  Original:  success=${summary.generationSuccesses.original}, failed=${summary.generationFailures.original}`,
    `  Rewritten: success=${summary.generationSuccesses.rewritten}, failed=${summary.generationFailures.rewritten}`,
    "",
    "  ─── Overall Wins: valid judged runs only ───",
    `  Original wins:  ${summary.wins.original}`,
    `  Rewritten wins: ${summary.wins.rewritten}`,
    `  Ties:           ${summary.wins.tie}`,
    "",
    "  ─── Changed Rewrite Wins ───",
    `  Original wins:  ${summary.changedRewriteWins.original}`,
    `  Rewritten wins: ${summary.changedRewriteWins.rewritten}`,
    `  Ties:           ${summary.changedRewriteWins.tie}`,
    "",
    "  ─── Unchanged Control Wins ───",
    `  Original wins:  ${summary.unchangedControlWins.original}`,
    `  Rewritten wins: ${summary.unchangedControlWins.rewritten}`,
    `  Ties:           ${summary.unchangedControlWins.tie}`,
    "",
    "  ─── Latency (ms): all generation attempts, including timeouts ───",
    `  Original:  avg=${formatMetric(summary.avgLatency.original)}, median=${formatMetric(summary.medianLatency.original)}`,
    `  Rewritten: avg=${formatMetric(summary.avgLatency.rewritten)}, median=${formatMetric(summary.medianLatency.rewritten)}`,
    "",
    "  ─── Tokens: successful non-empty generations only ───",
    `  Original:  avg=${formatMetric(summary.avgTokens.original, 1)}, median=${formatMetric(summary.medianTokens.original, 1)}`,
    `  Rewritten: avg=${formatMetric(summary.avgTokens.rewritten, 1)}, median=${formatMetric(summary.medianTokens.rewritten, 1)}`,
    "",
    "  ─── Quality Score (1-10): valid judged runs only ───",
    `  Original:  avg=${formatMetric(summary.avgScore.original, 1)}, median=${formatMetric(summary.medianScore.original, 1)}`,
    `  Rewritten: avg=${formatMetric(summary.avgScore.rewritten, 1)}, median=${formatMetric(summary.medianScore.rewritten, 1)}`,
    "",
    "  ─── By Category ───",
  ];

  for (const [category, stats] of Object.entries(summary.byCategory)) {
    lines.push(
      `  ${category}: queries=${stats.queries}, runs=${stats.runs}, changed=${stats.changedQueries}, unchanged=${stats.unchangedQueries}, valid=${stats.validRuns}, invalid=${stats.invalidRuns}, judge_failures=${stats.judgeFailures}, wins(orig=${stats.wins.original}, rew=${stats.wins.rewritten}, tie=${stats.wins.tie}), score(orig=${formatMetric(stats.avgScore.original, 1)}, rew=${formatMetric(stats.avgScore.rewritten, 1)}), tokens(orig=${formatMetric(stats.avgTokens.original, 1)}, rew=${formatMetric(stats.avgTokens.rewritten, 1)})`,
    );
  }

  lines.push("");
  lines.push("  ─── Detailed Results ───");
  lines.push("");

  for (const result of results) {
    lines.push(`  [${result.category}] "${result.query}"`);

    if (result.paraphrase.error) {
      lines.push(
        `    Paraphrase status: FALLBACK (${result.paraphrase.error})`,
      );
    } else if (result.paraphrased) {
      lines.push(`    → "${result.paraphrased}"`);
      lines.push("    Paraphrase status: CHANGED");
    } else {
      lines.push("    Paraphrase status: UNCHANGED CONTROL");
    }

    lines.push(`    Paraphrase latency: ${result.paraphrase.latencyMs}ms`);

    for (const run of result.runs) {
      lines.push(`    Run ${run.run}:`);

      if (run.invalid) {
        lines.push("      Status: INVALID");
        lines.push(`      Reason: ${run.invalidReasons.join(", ")}`);
      } else if (!run.judgment || !run.semanticWinner) {
        lines.push("      Status: JUDGE ERROR");
      } else {
        const winner =
          run.semanticWinner === "original"
            ? "ORIG"
            : run.semanticWinner === "rewritten"
              ? "REWR"
              : "TIE";

        const originalScore =
          run.judgeLayout === "original=A"
            ? run.judgment.scoreA
            : run.judgment.scoreB;

        const rewrittenScore =
          run.judgeLayout === "original=A"
            ? run.judgment.scoreB
            : run.judgment.scoreA;

        lines.push(
          `      Winner: ${winner} (orig: ${originalScore}, rew: ${rewrittenScore})`,
        );

        if (run.semanticReason) {
          lines.push(`      Reason: ${run.semanticReason}`);
        }
      }

      lines.push(`      Generation order: ${run.generationOrder}`);

      if (run.judgeLayout) {
        lines.push(`      Judge layout: ${run.judgeLayout}`);
      }

      lines.push(
        `      Latency: orig=${run.original.latencyMs}ms, rew=${run.rewritten.latencyMs}ms`,
      );

      lines.push(
        `      Tokens: orig=${run.original.tokens}, rew=${run.rewritten.tokens}`,
      );

      if (run.original.error || run.rewritten.error) {
        lines.push(
          `      Errors: orig=${run.original.error ?? "none"}, rew=${run.rewritten.error ?? "none"}`,
        );
      }
    }

    lines.push("");
  }

  lines.push("═══════════════════════════════════════════════════════════════");

  return lines.join("\n");
}
