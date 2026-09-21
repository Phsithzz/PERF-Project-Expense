import type { Pool } from 'pg';

export interface HealthRepository {
  checkConnection(): Promise<void>;
}

export class PostgresHealthRepository implements HealthRepository {
  constructor(private readonly pool: Pick<Pool, 'query'>) {}

  async checkConnection(): Promise<void> {
    await this.pool.query<{ ready: number }>('SELECT 1 AS ready');
  }
}
