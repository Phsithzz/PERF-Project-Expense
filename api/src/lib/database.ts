import { Pool } from 'pg';
import type { Logger } from 'pino';

import type { AppConfig } from '../config/env.js';

export function createDatabasePool(
  config: Pick<
    AppConfig,
    'databaseUrl' | 'dbPoolMax' | 'dbIdleTimeoutMs' | 'dbConnectionTimeoutMs'
  >,
  logger: Logger,
): Pool {
  const pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: config.dbIdleTimeoutMs,
    connectionTimeoutMillis: config.dbConnectionTimeoutMs,
    application_name: 'expense-tracker-api',
  });

  pool.on('error', (error) => {
    logger.error({ error }, 'Unexpected error from an idle PostgreSQL client');
  });

  return pool;
}
