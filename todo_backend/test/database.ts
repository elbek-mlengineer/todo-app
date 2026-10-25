import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';

export interface TestDatabase {
  exec(sql: string): Promise<unknown>;
  query<T = Record<string, unknown>>(sql: string, params?: any[]): Promise<{ rows: T[] }>;
  transaction<T>(fn: (db: any) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  if (process.env.TEST_REAL_POSTGRES !== 'true') return new PGlite();
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
  const settings = {
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    connectionTimeoutMillis: 5000,
  };
  const owner = new Pool(settings);
  // Only this freshly created, randomly named test schema is ever dropped.
  const schema = `todo_test_${randomBytes(8).toString('hex')}`;
  await owner.query(`CREATE SCHEMA "${schema}"`);
  const pool = new Pool({ ...settings, options: `-c search_path=${schema}` });
  return {
    exec: sql => pool.query(sql),
    query: async <T>(sql: string, params: any[] = []) => ({ rows: (await pool.query(sql, params)).rows as T[] }),
    transaction: async fn => {
      const db = await pool.connect();
      try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
      catch(error) { await db.query('ROLLBACK'); throw error; }
      finally { db.release(); }
    },
    close: async () => {
      await pool.end();
      try { await owner.query(`DROP SCHEMA "${schema}" CASCADE`); }
      finally { await owner.end(); }
    },
  };
}
