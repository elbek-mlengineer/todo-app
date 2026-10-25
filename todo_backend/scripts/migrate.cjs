require('dotenv').config({ quiet: true });
const { Pool } = require('pg');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing. Run npm run setup from the root.');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(734213)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    for (const file of readdirSync(resolve(__dirname, '../db')).filter(f => f.endsWith('.sql')).sort()) {
      if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [file])).rowCount) continue;
      await db.query(readFileSync(resolve(__dirname, '../db', file), 'utf8'));
      await db.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
      console.log(`Applied ${file}`);
    }
    await db.query('COMMIT');
    console.log('Database is up to date.');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
  finally { db.release(); await pool.end(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
