import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import './config';
@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    connectionTimeoutMillis: 5000,
    ssl:
      process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: true }
        : undefined,
  });
  constructor() {
    // pg emits idle connection errors separately from rejected queries.
    this.pool.on('error', () =>
      this.logger.warn(
        'Database connection interrupted; new queries will reconnect.',
      ),
    );
  }
  async query(sql: string, params: any[] = []): Promise<any> {
    return this.pool.query(sql, params);
  }
  async transaction<T>(
    fn: (db: Pick<PoolClient, 'query'>) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      const result = await fn(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
}
