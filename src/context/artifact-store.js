import path from "node:path";
import fs from "node:fs/promises";

let dbInstance = null;
let activeDriverName = null; // "better-sqlite3" or "@databases/sqlite"

/**
 * SQL statements for schema initialization.
 */
const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      role TEXT CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      summary TEXT NOT NULL,
      tokens INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      intent TEXT,
      importance REAL DEFAULT 0.5
  )`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS artifacts_fts USING fts5(
      id UNINDEXED,
      summary,
      content='artifacts',
      content_rowid='rowid'
  )`,
  `CREATE TRIGGER IF NOT EXISTS artifacts_ai AFTER INSERT ON artifacts BEGIN
      INSERT INTO artifacts_fts(rowid, id, summary) VALUES (new.rowid, new.id, new.summary);
  END`,
  `CREATE TRIGGER IF NOT EXISTS artifacts_ad AFTER DELETE ON artifacts BEGIN
      INSERT INTO artifacts_fts(artifacts_fts, rowid, id, summary) VALUES('delete', old.rowid, old.id, old.summary);
  END`
];

/**
 * Dynamic helper to convert dynamic query params to @databases format.
 */
function toAtDatabasesQuery(sql, queryStr, params = []) {
  const parts = queryStr.split("?");
  const items = [];
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== "") {
      items.push({ type: 0, text: parts[i] });
    }
    if (i < params.length) {
      items.push({ type: 1, value: params[i] });
    }
  }
  return sql.__dangerous__constructFromParts(items);
}

/**
 * Universal Database Wrapper interface.
 */
class SQLiteWrapper {
  constructor(rawDb, driverName, sqlModule = null) {
    this.db = rawDb;
    this.driver = driverName;
    this.sqlModule = sqlModule;
  }

  async execute(queryStr, params = []) {
    if (this.driver === "better-sqlite3") {
      return this.db.prepare(queryStr).run(params);
    } else {
      const q = toAtDatabasesQuery(this.sqlModule, queryStr, params);
      return this.db.query(q);
    }
  }

  async query(queryStr, params = []) {
    if (this.driver === "better-sqlite3") {
      return this.db.prepare(queryStr).all(params);
    } else {
      const q = toAtDatabasesQuery(this.sqlModule, queryStr, params);
      return this.db.query(q);
    }
  }

  async get(queryStr, params = []) {
    if (this.driver === "better-sqlite3") {
      return this.db.prepare(queryStr).get(params) ?? null;
    } else {
      const rows = await this.query(queryStr, params);
      return rows[0] ?? null;
    }
  }

  async close() {
    if (this.driver === "better-sqlite3") {
      this.db.close();
    } else {
      await this.db.dispose();
    }
  }
}

/**
 * Initialize SQLite database with required tables, triggers, and WAL mode.
 * Falls back to @databases/sqlite if better-sqlite3 is unavailable.
 */
export async function getDb(config = null) {
  if (dbInstance) return dbInstance;

  const paths = config?.paths ?? {};
  const rootDir = paths.rootDir ?? paths.historyDir ?? path.join(process.env.HOME || process.env.USERPROFILE || ".", ".mrmush");
  if (rootDir !== ":memory:") {
    await fs.mkdir(rootDir, { recursive: true });
  }
  const dbPath = rootDir === ":memory:" ? ":memory:" : path.join(rootDir, "mush-entropy.db");

  let rawDb;
  let driverName;
  let sqlModule = null;

  try {
    const Database = (await import("better-sqlite3")).default;
    rawDb = new Database(dbPath);
    rawDb.pragma("journal_mode = WAL");
    driverName = "better-sqlite3";
  } catch (betterSqliteError) {
    try {
      const connect = (await import("@databases/sqlite")).default;
      const { sql } = await import("@databases/sqlite");
      rawDb = connect(dbPath);
      driverName = "@databases/sqlite";
      sqlModule = sql;
    } catch (atDatabasesError) {
      throw new Error(
        `Failed to initialize any SQLite driver.\n` +
        `better-sqlite3 error: ${betterSqliteError.message}\n` +
        `@databases/sqlite error: ${atDatabasesError.message}`
      );
    }
  }

  activeDriverName = driverName;
  const wrapper = new SQLiteWrapper(rawDb, driverName, sqlModule);

  // Initialize schema
  for (const statement of SCHEMA_STATEMENTS) {
    await wrapper.execute(statement);
  }

  dbInstance = wrapper;
  return dbInstance;
}

/**
 * For testing and teardown: clear active db instances.
 */
export async function closeDb() {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    activeDriverName = null;
  }
}

/**
 * Get active driver name ("better-sqlite3" or "@databases/sqlite").
 */
export function getActiveDriverName() {
  return activeDriverName;
}

/**
 * Save an artifact to the database (INSERT OR REPLACE).
 */
export async function saveArtifact(db, artifact) {
  const queryStr = `
    INSERT OR REPLACE INTO artifacts (id, role, content, summary, tokens, ts, session_id, intent, importance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await db.execute(queryStr, [
    artifact.id,
    artifact.role,
    artifact.content,
    artifact.summary,
    artifact.tokens,
    artifact.ts,
    artifact.session_id,
    artifact.intent ?? null,
    artifact.importance ?? 0.5
  ]);
}

/**
 * Delete an artifact from the database by ID.
 */
export async function deleteArtifact(db, id) {
  await db.execute("DELETE FROM artifacts WHERE id = ?", [id]);
}

/**
 * Retrieve a single artifact by its ID.
 */
export async function getArtifact(db, id) {
  return db.get("SELECT * FROM artifacts WHERE id = ?", [id]);
}

/**
 * List all artifacts belonging to a session ordered by timestamp.
 */
export async function listSessionArtifacts(db, sessionId) {
  return db.query("SELECT * FROM artifacts WHERE session_id = ? ORDER BY ts ASC", [sessionId]);
}

/**
 * Perform lexical matching on artifacts_fts and join back with raw metadata.
 */
export async function searchFts(db, ftsQuery, limit = 20) {
  // Use bm25() on the virtual table. Note: bm25() requires MATCH syntax.
  const queryStr = `
    SELECT 
      a.id, 
      a.role, 
      a.content, 
      a.summary, 
      a.tokens, 
      a.ts, 
      a.session_id, 
      a.intent, 
      a.importance,
      bm25(artifacts_fts) AS raw_bm25_score
    FROM artifacts a
    JOIN artifacts_fts f ON f.rowid = a.rowid
    WHERE artifacts_fts MATCH ?
    ORDER BY raw_bm25_score ASC
    LIMIT ?
  `;
  return db.query(queryStr, [ftsQuery, limit]);
}
