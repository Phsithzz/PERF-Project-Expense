import type { Pool } from 'pg';

export async function assertDatabaseTables(
  pool: Pick<Pool, 'query'>,
  tableNames: readonly string[],
): Promise<void> {
  const result = await pool.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name = ANY($1::text[])`,
    [tableNames],
  );
  const found = new Set(result.rows.map((row) => row.table_name));
  const missing = tableNames.filter((tableName) => !found.has(tableName));
  if (missing.length > 0) {
    throw new Error(`Test database is missing required tables: ${missing.join(', ')}`);
  }
}

export async function resetTestData(pool: Pick<Pool, 'query'>): Promise<void> {
  await pool.query('DELETE FROM refresh_sessions');
  await pool.query('DELETE FROM expenses');
  await pool.query('DELETE FROM users');
  await pool.query('UPDATE categories SET is_active = TRUE WHERE is_active = FALSE');
}
