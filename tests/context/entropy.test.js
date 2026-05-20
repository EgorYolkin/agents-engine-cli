import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { getDb, saveArtifact, listSessionArtifacts, closeDb } from "../../src/context/artifact-store.js";
import {
  tokenize,
  updateIdfMap,
  buildSparseVector,
  calculateCosine,
  clearSessionIndex
} from "../../src/context/idf-index.js";
import { retrieveContext, warmVectorCache, clearVectorCache } from "../../src/context/retriever.js";
import { compactL1, compactL2, compactL3 } from "../../src/context/compactor.js";
import {
  estimateTokensFast,
  estimateTokensExact,
  isLikelyCode
} from "../../src/context/tokenizer.js";

// Mock config for testing database
const testConfig = {
  paths: {
    historyDir: "./tests/temp-history"
  },
  intelligence: {
    context_budget: 1000
  }
};

test("1. Tokenizer Heuristics and Exact Mode", () => {
  // Test code detection
  assert.strictEqual(isLikelyCode("const x = 5; function foo() { return x; }"), true);
  assert.strictEqual(isLikelyCode("Hello this is a plain text dialogue between two people."), false);

  // Test Fast mode calculations
  const text = "Hello world";
  const expectedTextTokens = Math.ceil(text.length / 3.5);
  assert.strictEqual(estimateTokensFast(text, false), expectedTextTokens);

  const code = "const x = 5;";
  const expectedCodeTokens = Math.ceil(code.length / 2.8);
  assert.strictEqual(estimateTokensFast(code, true), expectedCodeTokens);

  // Test Exact mode (tiktoken gpt-4o)
  const exactCount = estimateTokensExact("Hello world from Tiktoken!");
  assert.ok(exactCount > 0);
  assert.ok(typeof exactCount === "number");
});

test("2. SQLite Artifact Store (CRUD & FTS5)", async () => {
  // Ensure temp history directory exists
  await fs.mkdir(testConfig.paths.historyDir, { recursive: true });
  
  // Use in-memory SQLite for testing to avoid file clutter
  const dbConfig = {
    ...testConfig,
    paths: {
      historyDir: ":memory:" // special flag to use better-sqlite3 in-memory database
    }
  };

  const db = await getDb(dbConfig);
  
  const artifact = {
    id: "test-art-1",
    role: "user",
    content: "This is a test content about python web server application development",
    summary: "python web server app dev",
    tokens: 15,
    ts: Math.floor(Date.now() / 1000),
    session_id: "test-session",
    intent: "general",
    importance: 0.8
  };

  // Save artifact
  await saveArtifact(db, artifact);

  // Retrieve artifacts
  const list = await listSessionArtifacts(db, "test-session");
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].id, "test-art-1");
  assert.strictEqual(list[0].summary, "python web server app dev");

  // Clean up
  await closeDb();
  await fs.rm(testConfig.paths.historyDir, { recursive: true, force: true }).catch(() => {});
});

test("3. Sparse TF-IDF Vector Index & Cosine Similarity", () => {
  const sessionId = "test-vector-session";
  clearSessionIndex(sessionId);

  // Tokenization clean up checks
  const terms1 = tokenize("Hello, World! This is Python.");
  assert.deepStrictEqual(terms1, ["hello", "world", "this", "is", "python"]);

  // Populating vocabulary
  updateIdfMap(sessionId, tokenize("python is great for backend servers"));
  updateIdfMap(sessionId, tokenize("javascript is awesome for web frontend development"));
  updateIdfMap(sessionId, tokenize("python backend server coding"));

  // Build sparse vectors
  const vec1 = buildSparseVector(sessionId, "python backend server");
  const vec2 = buildSparseVector(sessionId, "javascript web frontend development");
  const vec3 = buildSparseVector(sessionId, "unrelated food recipes");

  // Cosine matching checks
  const simSelf = calculateCosine(vec1, vec1);
  assert.ok(Math.abs(simSelf - 1.0) < 1e-5);

  const simHigh = calculateCosine(vec1, buildSparseVector(sessionId, "python server"));
  const simLow = calculateCosine(vec1, vec2);
  const simNone = calculateCosine(vec1, vec3);

  assert.ok(simHigh > simLow);
  assert.ok(simLow >= simNone);
});

test("4. Hybrid Retriever (BM25, Cosine, Recency, MMR)", async () => {
  const dbConfig = {
    ...testConfig,
    paths: {
      historyDir: ":memory:"
    }
  };

  const db = await getDb(dbConfig);
  const sessionId = "retriever-session";
  clearSessionIndex(sessionId);
  clearVectorCache();

  // Insert mock records
  const now = Math.floor(Date.now() / 1000);
  const documents = [
    {
      id: "art-1",
      role: "assistant",
      content: "Deep architectural overview of Next.js static site generation framework",
      summary: "Next.js static site generation framework design",
      tokens: 20,
      ts: now - 3600, // 1 hour ago
      session_id: "other-session"
    },
    {
      id: "art-2",
      role: "assistant",
      content: "Complete guide to database optimization in PostgreSQL using index scans",
      summary: "PostgreSQL database index optimization guide",
      tokens: 20,
      ts: now - 7200, // 2 hours ago
      session_id: "other-session"
    },
    {
      id: "art-3",
      role: "assistant",
      content: "Introduction to React functional components and hooks pattern",
      summary: "React functional components hooks description",
      tokens: 20,
      ts: now - 1800, // 30 minutes ago
      session_id: "other-session"
    }
  ];

  for (const doc of documents) {
    await saveArtifact(db, {
      ...doc,
      intent: "general",
      importance: 0.5
    });
    updateIdfMap(sessionId, tokenize(doc.summary));
  }

  // Retrieve context
  const retrieved = await retrieveContext(db, {
    sessionId,
    userQuery: "database indexing optimize PostgreSQL",
    warmBudget: 200,
    minScore: 0.1
  });

  // Verify that the PostgreSQL document is retrieved first
  assert.ok(retrieved.length > 0);
  assert.strictEqual(retrieved[0].id, "art-2");

  await closeDb();
});

test("5. Compactor Logic", async () => {
  // L1 Compaction (Offloading)
  const hugeText = "python ".repeat(300); // 300 words, > 500 tokens in fast mode
  const artifact = {
    id: "huge-art",
    role: "user",
    content: hugeText,
    summary: "short python summary",
    tokens: 400
  };

  const processedL1 = compactL1(artifact, estimateTokensFast);
  assert.strictEqual(processedL1.offloaded, true);
  assert.strictEqual(processedL1.content, "short python summary");

  // L2 Compaction (Summary substitution)
  const transcript = [
    { id: "1", role: "user", content: "first long message details", summary: "first sum", offloaded: false },
    { id: "2", role: "assistant", content: "second long message details", summary: "second sum", offloaded: false },
    { id: "3", role: "user", content: "third message", summary: "third sum", offloaded: false },
    { id: "4", role: "assistant", content: "fourth message", summary: "fourth sum", offloaded: false },
    { id: "5", role: "user", content: "fifth message", summary: "fifth sum", offloaded: false }
  ];

  const { transcript: compactedL2, compacted } = compactL2(transcript, estimateTokensFast);
  assert.strictEqual(compacted, true);
  // Message 1 is outside the Hot-zone (last 4: 2, 3, 4, 5) and should be replaced by its summary
  assert.strictEqual(compactedL2[0].content, "first sum");
  assert.strictEqual(compactedL2[0].offloaded, true);
  // Message 2 is inside the Hot-zone and should remain intact
  assert.strictEqual(compactedL2[1].content, "second long message details");
});
