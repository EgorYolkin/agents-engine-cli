const sessionIndices = new Map();
let currentSessionId = "default-session";

/**
 * Set the currently active session ID.
 */
export function setActiveSession(sessionId) {
  if (sessionId) {
    currentSessionId = sessionId;
  }
}

/**
 * Get or create the index state for a session.
 */
export function getSessionIndex(sessionId = currentSessionId) {
  let index = sessionIndices.get(sessionId);
  if (!index) {
    index = {
      docCount: 0,
      idfMap: new Map(), // term -> document frequency (count of docs containing term)
      vocab: new Map(),  // term -> index
      vocabList: []
    };
    sessionIndices.set(sessionId, index);
  }
  return index;
}

/**
 * Clear the index state for a session.
 */
export function clearSessionIndex(sessionId) {
  sessionIndices.delete(sessionId);
}

/**
 * 1. Tokenize: lowercase, strip punctuation, split by whitespace.
 */
export function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^\w\sа-яё]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * 2. Incremental IDF update when a new artifact is added.
 * Supports both signatures: updateIdfMap(terms) and updateIdfMap(sessionId, terms).
 */
export function updateIdfMap(termsOrSessionId, maybeTerms = null) {
  let sessionId = currentSessionId;
  let terms = termsOrSessionId;

  if (typeof termsOrSessionId === "string" && maybeTerms !== null) {
    sessionId = termsOrSessionId;
    terms = maybeTerms;
  }

  if (!Array.isArray(terms)) return;

  const index = getSessionIndex(sessionId);
  index.docCount += 1;

  const uniqueTerms = new Set(terms);
  for (const term of uniqueTerms) {
    index.idfMap.set(term, (index.idfMap.get(term) || 0) + 1);
    if (!index.vocab.has(term)) {
      index.vocab.set(term, index.vocabList.length);
      index.vocabList.push(term);
    }
  }
}

/**
 * 3. Build a SparseVector from text.
 * Supports both signatures: buildSparseVector(text) and buildSparseVector(sessionId, text).
 */
export function buildSparseVector(textOrSessionId, maybeText = undefined) {
  let sessionId = currentSessionId;
  let text = textOrSessionId;

  if (typeof textOrSessionId === "string" && maybeText !== undefined) {
    sessionId = textOrSessionId;
    text = maybeText;
  }

  const index = getSessionIndex(sessionId);
  const terms = tokenize(text);

  // Compute Term Frequency (TF)
  const tfMap = new Map();
  for (const term of terms) {
    tfMap.set(term, (tfMap.get(term) || 0) + 1);
  }

  const indexValPairs = [];

  for (const [term, tf] of tfMap.entries()) {
    if (index.vocab.has(term)) {
      const idx = index.vocab.get(term);
      const df = index.idfMap.get(term) || 1;
      // IDF formula: log(1 + docCount / df)
      const idf = Math.log(1 + index.docCount / df);
      const tfIdf = tf * idf;
      if (tfIdf > 0) {
        indexValPairs.push({ index: idx, value: tfIdf });
      }
    }
  }

  // Sort by index ascending to support fast two-pointer cosine similarity
  indexValPairs.sort((a, b) => a.index - b.index);

  const indices = new Int32Array(indexValPairs.length);
  const values = new Float32Array(indexValPairs.length);

  for (let i = 0; i < indexValPairs.length; i++) {
    indices[i] = indexValPairs[i].index;
    values[i] = indexValPairs[i].value;
  }

  return { indices, values };
}

/**
 * 4. Compute cosine similarity between two SparseVectors.
 */
export function calculateCosine(a, b) {
  if (!a || !b) return 0;
  
  const aIndices = a.indices;
  const aValues = a.values;
  const bIndices = b.indices;
  const bValues = b.values;

  if (aIndices.length === 0 || bIndices.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  // L2 Norm for a
  for (let i = 0; i < aValues.length; i++) {
    normA += aValues[i] * aValues[i];
  }

  // L2 Norm for b
  for (let j = 0; j < bValues.length; j++) {
    normB += bValues[j] * bValues[j];
  }

  // Two-pointer matching since indices are sorted
  let idxA = 0;
  let idxB = 0;

  while (idxA < aIndices.length && idxB < bIndices.length) {
    const valA = aIndices[idxA];
    const valB = bIndices[idxB];

    if (valA === valB) {
      dotProduct += aValues[idxA] * bValues[idxB];
      idxA++;
      idxB++;
    } else if (valA < valB) {
      idxA++;
    } else {
      idxB++;
    }
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}
