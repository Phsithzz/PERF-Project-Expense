import type { Pool } from 'pg';
import type { Logger } from 'pino';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { createDatabasePool } from '../../src/lib/database.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe.sequential : describe.skip;

describeWithDatabase('database pool integration', () => {
  const pools: Pool[] = [];

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
  });

  it('applies bounded pool configuration and identifies API connections', async () => {
    const logError = vi.fn();
    const pool = createDatabasePool(
      {
        databaseUrl: testDatabaseUrl!,
        dbPoolMax: 3,
        dbIdleTimeoutMs: 5_000,
        dbConnectionTimeoutMs: 2_000,
      },
      { error: logError } as unknown as Logger,
    );
    pools.push(pool);

    expect(pool.options.max).toBe(3);
    expect(pool.options.idleTimeoutMillis).toBe(5_000);
    expect(pool.options.connectionTimeoutMillis).toBe(2_000);
    const result = await pool.query<{ application_name: string }>(
      `SELECT current_setting('application_name') AS application_name`,
    );
    expect(result.rows[0]?.application_name).toBe('expense-tracker-api');

    const idleError = new Error('simulated idle client failure');
    pool.emit('error', idleError, undefined);
    expect(logError).toHaveBeenCalledWith(
      { error: idleError },
      'Unexpected error from an idle PostgreSQL client',
    );
  });
});
