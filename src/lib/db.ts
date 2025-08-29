import 'server-only';
import fs from 'fs';
import path from 'path';

// Decide provider: Postgres if a known PG/Neon env var is present; else local SQLite
const PG_URL: string | undefined =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.NEON_DATABASE_URL;
const usePostgres = Boolean(PG_URL);

// SQLite setup (used when Postgres URL is not provided)
const DB_FILE = 'typing-texts.db';
let sqlite: import('better-sqlite3').Database | null = null;
function ensureSqlite() {
  if (sqlite) return sqlite;
  const dbPath = path.join(process.cwd(), DB_FILE);
  const dbExists = fs.existsSync(dbPath);
  // We intentionally use require here for better dev ergonomics in Node runtime only
  // eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires
  const Database: typeof import('better-sqlite3') = require('better-sqlite3');
  sqlite = new Database(dbPath);
  if (!dbExists) {
    sqlite.exec(`
      CREATE TABLE texts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
  wordLength INTEGER NOT NULL CHECK (wordLength IN (100, 200, 400, 800)),
        title TEXT NOT NULL,
        source TEXT DEFAULT 'ai'
      );
    `);
  }
  return sqlite;
}

// Postgres setup (lazy, only if URL provided)
let pool: import('pg').Pool | null = null;
async function ensurePg() {
  if (pool) return pool;
  // Use dynamic import without static require to satisfy ESLint while keeping lazy load
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const mod = (await (new Function("return import('pg')")())) as unknown as { Pool: typeof import('pg').Pool };
  const { Pool } = mod;
  // Neon typically requires SSL; if sslmode isn't in the URL, enforce SSL here
  const needsSsl = PG_URL && !/sslmode=\w+/i.test(PG_URL);
  pool = new Pool({
    connectionString: PG_URL,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  // Ensure schema exists (id serial, etc.)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS texts (
      id SERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      wordLength INTEGER NOT NULL,
      title TEXT NOT NULL,
      source TEXT DEFAULT 'ai'
    );
  `);
  // Ensure a CHECK constraint exists to restrict allowed word lengths
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        WHERE t.relname = 'texts' AND c.conname = 'wordlength_allowed_chk'
      ) THEN
        ALTER TABLE texts
        ADD CONSTRAINT wordlength_allowed_chk CHECK (wordLength IN (100, 200, 400, 800));
      END IF;
    END
    $$;
  `);
  return pool;
}

export interface TextRecord {
  id: number;
  content: string;
  wordLength: number;
  title: string;
  source: string;
}

export async function getText(id: number): Promise<TextRecord | null> {
  if (usePostgres) {
    const pg = await ensurePg();
    const res = await pg.query('SELECT * FROM texts WHERE id = $1', [id]);
    return res.rows[0] ?? null;
  }
  const db = ensureSqlite();
  const stmt = db.prepare('SELECT * FROM texts WHERE id = ?');
  const result = stmt.get(id) as TextRecord | null;
  return result ?? null;
}

export async function getTextsByWordLength(wordLength: number): Promise<Pick<TextRecord, 'id' | 'title'>[]> {
  if (usePostgres) {
    const pg = await ensurePg();
    const res = await pg.query('SELECT id, title FROM texts WHERE wordLength = $1', [wordLength]);
    return res.rows as Pick<TextRecord, 'id' | 'title'>[];
  }
  const db = ensureSqlite();
  const stmt = db.prepare('SELECT id, title FROM texts WHERE wordLength = ?');
  return stmt.all(wordLength) as Pick<TextRecord, 'id' | 'title'>[];
}

export async function getTextCountByWordLength(wordLength: number): Promise<number> {
  if (usePostgres) {
    const pg = await ensurePg();
    const res = await pg.query('SELECT COUNT(*)::int AS count FROM texts WHERE wordLength = $1', [wordLength]);
    return Number(res.rows[0]?.count ?? 0);
  }
  const db = ensureSqlite();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM texts WHERE wordLength = ?');
  const result = stmt.get(wordLength) as { count: number };
  return result?.count ?? 0;
}

// Returns the inserted id
export async function addText(content: string, wordLength: number, title: string): Promise<number> {
  if (usePostgres) {
    const pg = await ensurePg();
    const res = await pg.query(
      'INSERT INTO texts (content, wordLength, title) VALUES ($1, $2, $3) RETURNING id',
      [content, wordLength, title]
    );
    return Number(res.rows[0]?.id ?? -1);
  }
  const db = ensureSqlite();
  const stmt = db.prepare('INSERT INTO texts (content, wordLength, title) VALUES (?, ?, ?)');
  const result = stmt.run(content, wordLength, title);
  return Number(result.lastInsertRowid);
}

export async function getRandomTextByWordLength(wordLength: number): Promise<TextRecord | null> {
  if (usePostgres) {
    const pg = await ensurePg();
    const res = await pg.query('SELECT * FROM texts WHERE wordLength = $1 ORDER BY RANDOM() LIMIT 1', [wordLength]);
    return res.rows[0] ?? null;
  }
  const db = ensureSqlite();
  const stmt = db.prepare('SELECT * FROM texts WHERE wordLength = ? ORDER BY RANDOM() LIMIT 1');
  const result = stmt.get(wordLength) as TextRecord | null;
  return result ?? null;
}
