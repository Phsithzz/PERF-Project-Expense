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
const userA = '20000000-0000-4000-8000-000000000001';
const userB = '20000000-0000-4000-8000-000000000002';
const foodCategory = '10000000-0000-4000-8000-000000000001';
const travelCategory = '10000000-0000-4000-8000-000000000002';
const missingCategory = '10000000-0000-4000-8000-000000009999';
const idempotencyKey = 'integration-create-0001';

describeWithDatabase('core CRUD integration with PostgreSQL', () => {
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    max: 10,
    connectionTimeoutMillis: 2_000,
  });
  const categories = new PostgresCategoryRepository(pool);
  const expenses = new PostgresExpenseRepository(pool);
  const accessTokens = new AccessTokenService({
    secret: 'integration-test-access-secret-at-least-32-characters',
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
      new ExpenseCursorCodec('integration-cursor-secret-at-least-32-characters'),
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

  async function createExpense(authorization = authorizationA) {
    return request(app)
      .post('/api/v1/expenses')
      .set('Authorization', authorization)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        categoryId: foodCategory,
        title: 'Exact lunch',
        amount: '123456789.01',
        expenseDate: '2026-08-08',
        note: 'Paid at the counter',
      })
      .expect(201);
  }

  beforeAll(async () => {
    await assertDatabaseTables(pool, ['users', 'categories', 'expenses', 'refresh_sessions']);
  });

  beforeEach(async () => {
    await resetTestData(pool);
    await pool.query(
      `INSERT INTO users (id, name, email, password_hash)
       VALUES
         ($1, 'Owner A', 'owner-a@example.com', 'integration-hash'),
         ($2, 'Owner B', 'owner-b@example.com', 'integration-hash')`,
      [userA, userB],
    );
    authorizationA = `Bearer ${(await accessTokens.issue(userA)).token}`;
    authorizationB = `Bearer ${(await accessTokens.issue(userB)).token}`;
  });

  afterAll(async () => {
    await resetTestData(pool);
    await pool.end();
  });

  it('returns only active categories in configured order', async () => {
    await pool.query('UPDATE categories SET is_active = FALSE WHERE id = $1', [travelCategory]);
    const response = await request(app)
      .get('/api/v1/categories')
      .set('Authorization', authorizationA)
      .expect(200);

    expect(response.body.data).toHaveLength(7);
    expect(response.body.data.map((item: { slug: string }) => item.slug)).toEqual([
      'food',
      'shopping',
      'entertainment',
      'bills',
      'health',
      'education',
      'other',
    ]);
  });

  it('creates and reads an owned expense without losing money precision', async () => {
    const created = await createExpense();
    expect(created.headers.etag).toBe('"1"');
    expect(created.headers.location).toBe(`/api/v1/expenses/${created.body.data.id}`);
    expect(created.body.data).toMatchObject({
      amount: '123456789.01',
      expenseDate: '2026-08-08',
      version: 1,
      receipt: null,
      category: { id: foodCategory, slug: 'food', displayName: 'Food' },
    });

    const stored = await pool.query<{ amount: string; user_id: string }>(
      `SELECT amount, user_id
       FROM expenses
       WHERE id = $1`,
      [created.body.data.id],
    );
    expect(stored.rows[0]).toEqual({ amount: '123456789.01', user_id: userA });

    const detail = await request(app)
      .get(`/api/v1/expenses/${created.body.data.id}`)
      .set('Authorization', authorizationA)
      .expect(200);
    expect(detail.headers.etag).toBe('"1"');
    expect(detail.body).toEqual(created.body);
  });

  it('hides another user expense for read, update, and delete', async () => {
    const created = await createExpense();
    const path = `/api/v1/expenses/${created.body.data.id}`;

    const read = await request(app).get(path).set('Authorization', authorizationB).expect(404);
    const update = await request(app)
      .patch(path)
      .set('Authorization', authorizationB)
      .set('If-Match', '"1"')
      .send({ title: 'Attempted theft' })
      .expect(404);
    const deletion = await request(app)
      .delete(path)
      .set('Authorization', authorizationB)
      .set('If-Match', '"1"')
      .expect(404);

    expect(read.body.error.code).toBe('EXPENSE_NOT_FOUND');
    expect(update.body.error.code).toBe('EXPENSE_NOT_FOUND');
    expect(deletion.body.error.code).toBe('EXPENSE_NOT_FOUND');
    await request(app).get(path).set('Authorization', authorizationA).expect(200);
  });

  it('advances version once and prevents a stale write from changing data', async () => {
    const created = await createExpense();
    const path = `/api/v1/expenses/${created.body.data.id}`;

    const updated = await request(app)
      .patch(path)
      .set('Authorization', authorizationA)
      .set('If-Match', '"1"')
      .send({ title: 'Updated lunch', note: null })
      .expect(200);
    expect(updated.headers.etag).toBe('"2"');
    expect(updated.body.data).toMatchObject({ title: 'Updated lunch', note: null, version: 2 });

    const stale = await request(app)
      .patch(path)
      .set('Authorization', authorizationA)
      .set('If-Match', '"1"')
      .send({ title: 'Stale overwrite' })
      .expect(412);
    expect(stale.headers.etag).toBe('"2"');
    expect(stale.body.error.code).toBe('EXPENSE_VERSION_CONFLICT');

    const afterFailure = await request(app)
      .get(path)
      .set('Authorization', authorizationA)
      .expect(200);
    expect(afterFailure.body.data).toMatchObject({ title: 'Updated lunch', version: 2 });
  });

  it('rejects missing/inactive category changes and preserves the previous row', async () => {
    await pool.query('UPDATE categories SET is_active = FALSE WHERE id = $1', [travelCategory]);

    const missingCreate = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        categoryId: missingCategory,
        title: 'Invalid',
        amount: '1.00',
        expenseDate: '2026-08-08',
      })
      .expect(422);
    expect(missingCreate.body.error.code).toBe('VALIDATION_FAILED');

    const inactiveCreate = await request(app)
      .post('/api/v1/expenses')
      .set('Authorization', authorizationA)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        categoryId: travelCategory,
        title: 'Invalid',
        amount: '1.00',
        expenseDate: '2026-08-08',
      })
      .expect(422);
    expect(inactiveCreate.body.error.code).toBe('CATEGORY_INACTIVE');

    const created = await createExpense();
    const path = `/api/v1/expenses/${created.body.data.id}`;
    const failedChange = await request(app)
      .patch(path)
      .set('Authorization', authorizationA)
      .set('If-Match', '"1"')
      .send({ categoryId: travelCategory })
      .expect(422);
    expect(failedChange.body.error.code).toBe('CATEGORY_INACTIVE');

    const unchanged = await request(app).get(path).set('Authorization', authorizationA).expect(200);
    expect(unchanged.body.data).toMatchObject({ version: 1, category: { id: foodCategory } });

    await pool.query('UPDATE categories SET is_active = FALSE WHERE id = $1', [foodCategory]);
    const historicalEdit = await request(app)
      .patch(path)
      .set('Authorization', authorizationA)
      .set('If-Match', '"1"')
      .send({ title: 'Historical category remains readable' })
      .expect(200);
    expect(historicalEdit.body.data).toMatchObject({
      title: 'Historical category remains readable',
      version: 2,
      category: { id: foodCategory },
    });
  });

  it('permanently deletes only the expected current version', async () => {
    const created = await createExpense();
    const path = `/api/v1/expenses/${created.body.data.id}`;

    const staleDelete = await request(app)
      .delete(path)
      .set('Authorization', authorizationA)
      .set('If-Match', '"2"')
      .expect(412);
    expect(staleDelete.headers.etag).toBe('"1"');

    await request(app)
      .delete(path)
      .set('Authorization', authorizationA)
      .set('If-Match', '"1"')
      .expect(204);
    await request(app).get(path).set('Authorization', authorizationA).expect(404);
  });
});
