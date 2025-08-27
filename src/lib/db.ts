
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_FILE = 'typing-texts.db';
let db: Database.Database;

function initializeDb() {
    const dbPath = path.join(process.cwd(), DB_FILE);
    const dbExists = fs.existsSync(dbPath);
    db = new Database(dbPath);

    if (!dbExists) {
        console.log('Creating texts table...');
        db.exec(`
            CREATE TABLE texts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                wordLength INTEGER NOT NULL,
                title TEXT NOT NULL,
                source TEXT DEFAULT 'ai'
            );
        `);
        console.log('Texts table created.');
    }
}

function getDbConnection() {
    if (!db) {
        initializeDb();
    }
    return db;
}

export interface TextRecord {
  id: number;
  content: string;
  wordLength: number;
  title: string;
  source: string;
}

export function getText(id: number): TextRecord | null {
  try {
    const db = getDbConnection();
    const stmt = db.prepare('SELECT * FROM texts WHERE id = ?');
    const result = stmt.get(id) as TextRecord | null;
    return result;
  } catch (error) {
    console.error(`Failed to get text with id ${id}:`, error);
    return null;
  }
}

export function getTextsByWordLength(wordLength: number): Pick<TextRecord, 'id' | 'title'>[] {
  const db = getDbConnection();
  const stmt = db.prepare('SELECT id, title FROM texts WHERE wordLength = ?');
  const results = stmt.all(wordLength) as Pick<TextRecord, 'id' | 'title'>[];
  return results;
}

export function getTextCountByWordLength(wordLength: number): number {
  const db = getDbConnection();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM texts WHERE wordLength = ?');
  const result = stmt.get(wordLength) as { count: number };
  return result.count;
}

export function addText(content: string, wordLength: number, title: string): Database.RunResult {
  const db = getDbConnection();
  const stmt = db.prepare('INSERT INTO texts (content, wordLength, title) VALUES (?, ?, ?)');
  const result = stmt.run(content, wordLength, title);
  return result;
}

export function getRandomTextByWordLength(wordLength: number): TextRecord | null {
  const db = getDbConnection();
  const stmt = db.prepare('SELECT * FROM texts WHERE wordLength = ? ORDER BY RANDOM() LIMIT 1');
  const result = stmt.get(wordLength) as TextRecord | null;
  return result;
}
