import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { AccessTokenService } from '../../src/lib/access-token.js';
import { ExpenseCursorCodec } from '../../src/lib/expense-cursor.js';
import { PostgresCategoryRepository } from '../../src/repositories/category.repository.js';
import { PostgresExpenseRepository } from '../../src/repositories/expense.repository.js';
import { PostgresHealthRepository } from '../../src/repositories/health.repository.js';
import { DefaultCategoryService } from '../../src/services/category.service.js';
import { DefaultExpenseService } from '../../src/services/expense.service.js';
import { HealthService } from '../../src/services/health.service.js';
import { createUnusedAuthenticationService } from '../helpers/auth-stubs.js';
import { createTestLogger } from '../helpers/test-logger.js';
import { assertDatabaseTables, resetTestData } from '../helpers/database.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe.sequential : describe.skip;
const userA = '21000000-0000-4000-8000-000000000001';
const userB = '21000000-0000-4000-8000-000000000002';
const food = '10000000-0000-4000-8000-000000000001';
const travel = '10000000-0000-4000-8000-000000000002';
const bills = '10000000-0000-4000-8000-000000000005';
const education = '10000000-0000-4000-8000-000000000007';
const ids = Array.from(
  { length: 6 },
  (_, index) => `31000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
);
const otherUserId = '31000000-0000-4000-8000-000000000099';

describeWithDatabase('expense list integration with PostgreSQL', () => {
  const pool = new Pool({ connectionString: testDatabaseUrl, max: 10 });
  const categories = new PostgresCategoryRepository(pool);
  const expenses = new PostgresExpenseRepository(pool);
  const accessTokens = new AccessTokenService({
    secret: 'list-integration-access-secret-at-least-32-characters',
    issuer: 'expense-tracker-api',
    audience: 'expense-tracker-clients',
    ttlSeconds: 900,
  });
  const app = createApp({
    healthService: new HealthService(new PostgresHealthRepository(pool)),
    authService: createUnusedAuthenticationService(),
    categoryService: new DefaultCategoryService(categories),
    expenseService: new DefaultExpenseService(
      expenses,
      categories,
      new ExpenseCursorCodec('list-integration-cursor-secret-at-least-32-characters'),
    ),
    accessTokenVerifier: accessTokens,
    logger: createTestLogger(),
    httpConfig: {
      webOrigins: ['https://web.example.test'],
      authRateLimitWindowMs: 60_000,
      authRateLimitMax: 1_000,
    },
  });
  let authorizationA: string;
  let authorizationB: string;

  async function seedExpenses(): Promise<void> {
    await pool.query(
      `INSERT INTO expenses
         (id, user_id, category_id, title, amount, expense_date, note)
       VALUES
         ($1, $7, $9,  'Coffee 100%', 10.00,  '2026-08-01', 'Morning'),
         ($2, $7, $9,  'Lunch',       20.00,  '2026-08-01', 'Special meal'),
         ($3, $7, $10, 'Bus',         20.00,  '2026-08-02', NULL),
         ($4, $7, $11, 'Book',         5.00,  '2026-08-03', 'COURSE material'),
         ($5, $7, $9,  'Dinner',      20.00,  '2026-08-03', NULL),
         ($6, $7, $12, 'Rent',       100.00,  '2026-08-04', NULL),
         ($8, $13, $9, 'Other owner', 999.00, '2026-08-31', NULL)`,
      [...ids, userA, otherUserId, food, travel, education, bills, userB],
    );
  }

  async function collectPages(
    authorization: string,
    query: Record<string, string>,
  ): Promise<string[]> {
    const collected: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const response = await request(app)
        .get('/api/v1/expenses')
        .set('Authorization', authorization)
        .query(cursor ? { ...query, cursor } : query)
        .expect(200);
      collected.push(...response.body.data.map((item: { id: string }) => item.id));
      cursor = response.body.meta.nextCursor as string | null;
      expect(response.body.meta.hasMore).toBe(Boolean(cursor));
      if (!cursor) {
        return collected;
      }
    }
    throw new Error('Pagination did not terminate');
  }

  beforeAll(async () => {
    await assertDatabaseTables(pool, ['users', 'categories', 'expenses', 'refresh_sessions']);
  });

  beforeEach(async () => {
    await resetTestData(pool);
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash)
       VALUES
         ($1, 'List Owner A', 'list-a@example.com', 'integration-hash'),
         ($2, 'List Owner B', 'list-b@example.com', 'integration-hash')`,
      [userA, userB],
    );
    await seedExpenses();
    authorizationA = `Bearer ${(await accessTokens.issue(userA)).token}`;
    authorizationB = `Bearer ${(await accessTokens.issue(userB)).token}`;
  });

  afterAll(async () => {
    await resetTestData(pool);
    await pool.end();
  });

  it('pages equal dates without gaps or duplicates and never crosses ownership', async () => {
    const collected = await collectPages(authorizationA, { limit: '2' });
    expect(collected).toEqual([ids[5], ids[4], ids[3], ids[2], ids[1], ids[0]]);
    expect(new Set(collected).size).toBe(6);
    expect(collected).not.toContain(otherUserId);

    const userBIds = await collectPages(authorizationB, { limit: '2' });
    expect(userBIds).toEqual([otherUserId]);
  });

  it('composes literal text search, category, and inclusive date filters', async () => {
    const noteSearch = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ q: 'course' })
      .expect(200);
    expect(noteSearch.body.data.map((item: { id: string }) => item.id)).toEqual([ids[3]]);

    const literalWildcard = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ q: '%' })
      .expect(200);
    expect(literalWildcard.body.data.map((item: { id: string }) => item.id)).toEqual([ids[0]]);

    const combined = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ q: 'lunch', categoryId: food, from: '2026-08-01', to: '2026-08-03' })
      .expect(200);
    expect(combined.body.data.map((item: { id: string }) => item.id)).toEqual([ids[1]]);

    const dateRange = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ from: '2026-08-02', to: '2026-08-03' })
      .expect(200);
    expect(dateRange.body.data.map((item: { id: string }) => item.id)).toEqual([
      ids[4],
      ids[3],
      ids[2],
    ]);
    expect(dateRange.body.data[0]).toMatchObject({ hasReceipt: false });
    expect(dateRange.body.data[0].note).toBeUndefined();

    await pool.query('UPDATE categories SET is_active = FALSE WHERE id = $1', [food]);
    const historical = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ categoryId: food })
      .expect(200);
    expect(historical.body.data.map((item: { id: string }) => item.id)).toEqual([
      ids[4],
      ids[1],
      ids[0],
    ]);
  });

  it('uses amount plus UUID as a deterministic cursor tuple', async () => {
    const ascending = await collectPages(authorizationA, { sort: 'amountAsc', limit: '2' });
    expect(ascending).toEqual([ids[3], ids[0], ids[1], ids[2], ids[4], ids[5]]);

    const descending = await collectPages(authorizationA, { sort: 'amountDesc', limit: '2' });
    expect(descending).toEqual([ids[5], ids[4], ids[2], ids[1], ids[0], ids[3]]);
  });

  it('rejects cursor tampering and reuse with another query or user', async () => {
    const first = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ limit: '2' })
      .expect(200);
    const cursor = first.body.meta.nextCursor as string;

    const mismatch = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ limit: '3', cursor })
      .expect(400);
    expect(mismatch.body.error.code).toBe('CURSOR_QUERY_MISMATCH');

    const wrongOwner = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationB)
      .query({ limit: '2', cursor })
      .expect(400);
    expect(wrongOwner.body.error.code).toBe('CURSOR_QUERY_MISMATCH');

    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`;
    const invalid = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ limit: '2', cursor: tampered })
      .expect(400);
    expect(invalid.body.error.code).toBe('INVALID_CURSOR');

    const injectionLike = await request(app)
      .get('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .query({ q: `' OR TRUE --` })
      .expect(200);
    expect(injectionLike.body.data).toEqual([]);
  });
});
