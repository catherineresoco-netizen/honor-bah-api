import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export const DB_FILE = resolve(process.env.DB_FILE || 'data/bah.sqlite');
export function openDb(file = DB_FILE) {
  if(file !== ':memory:') mkdirSync(dirname(file), {recursive:true});
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS imports (
      year INTEGER PRIMARY KEY, dataset_type TEXT NOT NULL CHECK(dataset_type IN ('demo','official')),
      source TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS areas (
      year INTEGER NOT NULL, mha TEXT NOT NULL, name TEXT NOT NULL,
      PRIMARY KEY(year,mha), FOREIGN KEY(year) REFERENCES imports(year)
    );
    CREATE TABLE IF NOT EXISTS zip_areas (
      year INTEGER NOT NULL, zip TEXT NOT NULL, mha TEXT NOT NULL,
      PRIMARY KEY(year,zip), FOREIGN KEY(year,mha) REFERENCES areas(year,mha)
    );
    CREATE TABLE IF NOT EXISTS rates (
      year INTEGER NOT NULL, mha TEXT NOT NULL, grade TEXT NOT NULL,
      dependents INTEGER NOT NULL CHECK(dependents IN (0,1)),
      monthly INTEGER NOT NULL CHECK(monthly>=0),
      PRIMARY KEY(year,mha,grade,dependents), FOREIGN KEY(year,mha) REFERENCES areas(year,mha)
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      plan TEXT NOT NULL CHECK(plan IN ('free','developer','business')),
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS usage_monthly (
      key_id INTEGER NOT NULL REFERENCES api_keys(id),
      month TEXT NOT NULL CHECK(length(month)=7),
      count INTEGER NOT NULL DEFAULT 0 CHECK(count>=0),
      PRIMARY KEY(key_id,month)
    );
    CREATE TABLE IF NOT EXISTS developers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      developer_id INTEGER NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_rates_lookup ON rates(year,mha,grade,dependents);
  `);
  const cols=db.prepare('PRAGMA table_info(api_keys)').all().map(c=>c.name);
  if(!cols.includes('developer_id')) db.exec('ALTER TABLE api_keys ADD COLUMN developer_id INTEGER REFERENCES developers(id)');
  return db;
}
