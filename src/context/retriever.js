import { searchFts } from "./artifact-store.js";
import { buildSparseVector, calculateCosine, tokenize } from "./idf-index.js";

// Cache for warm-memory sparse vectors (artifactId -> SparseVector)
export const warmVectorCache = new Map();

/**
 * Clear vector cache (useful for testing or session reset).
 */
export function clearVectorCache() {
  warmVectorCache.clear();
}

/**
 * Fast token estimation heuristic.
 */
function estimateFastTokens(text) {
  return Math.ceil(String(text ?? "").length / 3.5);
}

/**
 * Perform hybrid retrieval combining BM25, Cosine Similarity, and Recency Decay.
 * Re-ranks using MMR and packs within the target warm token budget.
 */
export async function retrieveContext(db, {
  sessionId,
  userQuery,
  warmBudget = 2800, // 35% of 8000 tokens
  minScore = 0.1,
  alpha = 0.5,
  nowOverride = null
}) {
  const terms = tokenize(userQuery);
  if (terms.length === 0) {
    return [];
  }

  // 1. Hot-zone Filtering: get IDs of last 4 messages in current session
  const hotRows = await db.query(
    "SELECT id FROM artifacts WHERE session_id = ? ORDER BY ts DESC LIMIT 4",
    [sessionId]
  );
  const hotIds = new Set(hotRows.map((r) => r.id));

  // 2. Lexical step: search top-20 candidates using FTS5 MATCH
  const ftsQuery = terms.join(" OR ");
  const candidates = await searchFts(db, ftsQuery, 20);

  const scoredCandidates = [];
  const queryVec = buildSparseVector(sessionId, userQuery);

  const now = nowOverride !== null ? nowOverride : Math.floor(Date.now() / 1000);

  // 3. Compute hybrid scores for candidates
  for (const row of candidates) {
    // If in Hot-zone, score is forced to 0
    if (hotIds.has(row.id)) {
      continue;
    }

    // Normalise raw BM25 score (SQLite BM25 returns negative values, smaller is better)
    // Formula: bm25_norm = 1 / (1 + exp(raw_bm25_score))
    const bm25Norm = 1 / (1 + Math.exp(row.raw_bm25_score));

    // Get or build SparseVector for the summary
    let vec;
    if (row.session_id === sessionId) {
      vec = warmVectorCache.get(row.id);
      if (!vec) {
        vec = buildSparseVector(sessionId, row.summary);
        warmVectorCache.set(row.id, vec);
      }
    } else {
      // For cold-memory (other sessions), build on-the-fly using the current session vocabulary
      vec = buildSparseVector(sessionId, row.summary);
    }

    // Cosine similarity
    const cosineSim = calculateCosine(queryVec, vec);

    // Temporal decay
    const lambda = row.session_id === sessionId ? 0.1 : 0.01;
    const ageHours = Math.max(0, now - row.ts) / 3600;
    const recencyWeight = Math.exp(-lambda * ageHours);

    // Hybrid score formula
    const score = (0.45 * bm25Norm) + (0.35 * cosineSim) + (0.20 * recencyWeight);

    if (score >= minScore) {
      scoredCandidates.push({
        artifact: row,
        score,
        vector: vec
      });
    }
  }

  // Sort candidates by hybrid score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  // 5. Maximal Marginal Relevance (MMR) Ranking
  const selected = [];
  const unselected = [...scoredCandidates];

  while (unselected.length > 0) {
    let bestIdx = -1;
    let bestMmrScore = -Infinity;

    for (let i = 0; i < unselected.length; i++) {
      const cand = unselected[i];
      let maxSimWithSelected = 0;

      for (const sel of selected) {
        const sim = calculateCosine(cand.vector, sel.vector);
        if (sim > maxSimWithSelected) {
          maxSimWithSelected = sim;
        }
      }

      // MMR Score formula: alpha * relevance - (1 - alpha) * redundancy
      const mmrScore = (alpha * cand.score) - ((1 - alpha) * maxSimWithSelected);
      if (mmrScore > bestMmrScore) {
        bestMmrScore = mmrScore;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      break;
    }

    selected.push(unselected[bestIdx]);
    unselected.splice(bestIdx, 1);
  }

  // 6. Packing into budget
  const packed = [];
  let totalTokens = 0;

  for (const item of selected) {
    const textToInclude = item.artifact.summary;
    const tokens = estimateFastTokens(textToInclude);
    if (totalTokens + tokens <= warmBudget) {
      packed.push(item.artifact);
      totalTokens += tokens;
    } else {
      break;
    }
  }

  return packed;
}
