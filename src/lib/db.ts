import 'server-only';
import { neon } from '@neondatabase/serverless';

// Neon-only database layer: always uses DATABASE_URL (Neon Postgres)
const DATABASE_URL: string | undefined = process.env.DATABASE_URL;

let neonSql: ((strings: TemplateStringsArray, ...values: any[]) => Promise<any[]>) | null = null;
let neonReady = false;
async function ensureNeon() {
  if (neonSql && neonReady) return neonSql;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is required (Neon Postgres).');
  }
  neonSql = neon(DATABASE_URL);
  // Ensure schema exists (id serial + check constraint)
  await neonSql`CREATE TABLE IF NOT EXISTS texts (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    wordLength INTEGER NOT NULL,
    title TEXT NOT NULL,
    source TEXT DEFAULT 'ai'
  );`;
  await neonSql`DO $$
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
  $$;`;
  neonReady = true;
  return neonSql;
}

export interface TextRecord {
  id: number;
  content: string;
  wordLength: number;
  title: string;
  source: string;
}

export async function getText(id: number): Promise<TextRecord | null> {
  const sql = await ensureNeon();
  const rows = await sql`SELECT * FROM texts WHERE id = ${id}`;
  return (rows as TextRecord[])[0] ?? null;
}

export async function getTextsByWordLength(wordLength: number): Promise<Pick<TextRecord, 'id' | 'title'>[]> {
  const sql = await ensureNeon();
  const rows = await sql`SELECT id, title FROM texts WHERE wordLength = ${wordLength}`;
  return rows as Pick<TextRecord, 'id' | 'title'>[];
}

export async function getTextCountByWordLength(wordLength: number): Promise<number> {
  const sql = await ensureNeon();
  const rows = await sql`SELECT COUNT(*)::int AS count FROM texts WHERE wordLength = ${wordLength}`;
  const first = rows[0] as { count?: number | string } | undefined;
  return Number((first?.count as any) ?? 0);
}

// Returns the inserted id
export async function addText(content: string, wordLength: number, title: string): Promise<number> {
  const sql = await ensureNeon();
  const rows = await sql`INSERT INTO texts (content, wordLength, title) VALUES (${content}, ${wordLength}, ${title}) RETURNING id`;
  return Number((rows[0] as { id?: number | string } | undefined)?.id ?? -1);
}

export async function getRandomTextByWordLength(wordLength: number): Promise<TextRecord | null> {
  const sql = await ensureNeon();
  const rows = await sql`SELECT * FROM texts WHERE wordLength = ${wordLength} ORDER BY RANDOM() LIMIT 1`;
  return (rows as TextRecord[])[0] ?? null;
}
