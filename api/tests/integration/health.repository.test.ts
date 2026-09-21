import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import { PostgresHealthRepository } from '../../src/repositories/health.repository.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;
let pool: Pool | undefined;

describeWithDatabase('PostgresHealthRepository integration', () => {
  afterAll(async () => {
    await pool?.end();
  });

  it('checks a real PostgreSQL connection', async () => {
    pool = new Pool({ connectionString: testDatabaseUrl, max: 1, connectionTimeoutMillis: 2_000 });
    const repository = new PostgresHealthRepository(pool);

    await expect(repository.checkConnection()).resolves.toBeUndefined();
  });
});
