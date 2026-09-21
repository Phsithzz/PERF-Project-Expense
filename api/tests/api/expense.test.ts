import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { AccessTokenVerifier } from '../../src/lib/access-token.js';
import type { CategoryService } from '../../src/services/category.service.js';
import type { ExpenseService } from '../../src/services/expense.service.js';
import { HealthService } from '../../src/services/health.service.js';
import {
  createExpenseResource,
  TEST_CATEGORY,
  TEST_EXPENSE_ID,
  TEST_USER_ID,
} from '../fixtures/expense.fixtures.js';
import { createUnusedAuthenticationService } from '../helpers/auth-stubs.js';
import { createTestLogger } from '../helpers/test-logger.js';

const userId = TEST_USER_ID;
const expenseId = TEST_EXPENSE_ID;
const category = TEST_CATEGORY;
const expense = createExpenseResource();

function buildApp(options: {
  categories?: CategoryService;
  expenses?: ExpenseService;
  verifier?: AccessTokenVerifier;
}) {
  const healthService = new HealthService({ checkConnection: vi.fn() });
  return createApp({
    healthService,
    authService: createUnusedAuthenticationService(),
    categoryService: options.categories ?? { listActive: vi.fn().mockResolvedValue([category]) },
    expenseService:
      options.expenses ??
      ({
        listOwned: vi.fn(),
        create: vi.fn().mockResolvedValue(expense),
        getOwned: vi.fn().mockResolvedValue(expense),
        update: vi.fn().mockResolvedValue({ ...expense, version: 2 }),
        delete: vi.fn().mockResolvedValue(undefined),
      } satisfies ExpenseService),
    accessTokenVerifier: options.verifier ?? {
      verify: vi.fn().mockResolvedValue({ valid: true, userId }),
    },
    logger: createTestLogger(),
    httpConfig: {
      webOrigins: ['https://web.example.test'],
      authRateLimitWindowMs: 60_000,
      authRateLimitMax: 1_000,
    },
  });
}

const authorization = { Authorization: 'Bearer valid-token' };
const validCreateBody = {
  categoryId: category.id,
  title: 'Lunch',
  amount: '120.50',
  expenseDate: '2026-08-08',
};

describe('core CRUD HTTP contract', () => {
  it('normalizes list defaults and returns the cursor page envelope', async () => {
    const page = {
      data: [
        {
          id: expense.id,
          category,
          title: expense.title,
          amount: expense.amount,
          expenseDate: expense.expenseDate,
          version: expense.version,
          hasReceipt: false,
          createdAt: expense.createdAt,
          updatedAt: expense.updatedAt,
        },
      ],
      meta: { limit: 20, hasMore: false, nextCursor: null },
    };
    const expenses = {
      listOwned: vi.fn().mockResolvedValue(page),
      create: vi.fn(),
      getOwned: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } satisfies ExpenseService;

    const response = await request(buildApp({ expenses }))
      .get('/api/v1/expenses?q=%20Lunch%20&sort=amountAsc&limit=20')
      .set(authorization)
      .expect(200);

    expect(response.body).toEqual(page);
    expect(expenses.listOwned).toHaveBeenCalledWith(userId, {
      q: 'Lunch',
      sort: 'amountAsc',
      limit: 20,
    });
  });

  it('rejects invalid list query combinations before the service', async () => {
    const cases = [
      '?from=2026-08-01',
      '?from=2026-08-02&to=2026-08-01',
      '?sort=titleDesc',
      '?limit=0',
      '?limit=1.5',
      '?q=%20%20',
      '?unknown=value',
    ];

    for (const query of cases) {
      const response = await request(buildApp({}))
        .get(`/api/v1/expenses${query}`)
        .set(authorization)
        .expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('returns a secret-safe generic envelope for an unexpected backend failure', async () => {
    const internalDetail = 'SELECT password_hash FROM users at private-db-host';
    const expenses = {
      listOwned: vi.fn().mockRejectedValue(new Error(internalDetail)),
      create: vi.fn(),
      getOwned: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } satisfies ExpenseService;

    const response = await request(buildApp({ expenses }))
      .get('/api/v1/expenses')
      .set(authorization)
      .expect(500);

    expect(response.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: [],
      requestId: response.headers['x-request-id'],
    });
    expect(JSON.stringify(response.body)).not.toContain(internalDetail);
  });

  it('protects categories and returns active category response shape', async () => {
    await request(buildApp({})).get('/api/v1/categories').expect(401);

    const response = await request(buildApp({}))
      .get('/api/v1/categories')
      .set(authorization)
      .expect(200);
    expect(response.body).toEqual({ data: [category] });
  });

  it('creates an owned expense with contract headers and exact money string', async () => {
    const expenses = {
      listOwned: vi.fn(),
      create: vi.fn().mockResolvedValue(expense),
      getOwned: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    } satisfies ExpenseService;
    const response = await request(buildApp({ expenses }))
      .post('/api/v1/expenses')
      .set(authorization)
      .set('Idempotency-Key', 'logical-create-0001')
      .send(validCreateBody)
      .expect(201);

    expect(response.headers.location).toBe(`/api/v1/expenses/${expenseId}`);
    expect(response.headers.etag).toBe('"1"');
    expect(response.body).toEqual({ data: expense });
    expect(expenses.create).toHaveBeenCalledWith(userId, {
      ...validCreateBody,
      idempotencyKey: 'logical-create-0001',
    });
  });

  it('rejects unsafe create inputs before calling the service', async () => {
    const cases = [
      { body: validCreateBody, key: undefined },
      { body: { ...validCreateBody, amount: 120.5 }, key: 'logical-create-0001' },
      { body: { ...validCreateBody, amount: '0.00' }, key: 'logical-create-0001' },
      { body: { ...validCreateBody, expenseDate: '2026-02-30' }, key: 'logical-create-0001' },
      { body: { ...validCreateBody, userId }, key: 'logical-create-0001' },
    ];

    for (const testCase of cases) {
      let pending = request(buildApp({})).post('/api/v1/expenses').set(authorization);
      if (testCase.key) {
        pending = pending.set('Idempotency-Key', testCase.key);
      }
      const response = await pending.send(testCase.body).expect(422);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('returns detail with ETag and forwards only token-derived ownership', async () => {
    const expenses = {
      listOwned: vi.fn(),
      create: vi.fn(),
      getOwned: vi.fn().mockResolvedValue(expense),
      update: vi.fn(),
      delete: vi.fn(),
    } satisfies ExpenseService;
    const response = await request(buildApp({ expenses }))
      .get(`/api/v1/expenses/${expenseId}`)
      .set(authorization)
      .expect(200);

    expect(response.headers.etag).toBe('"1"');
    expect(expenses.getOwned).toHaveBeenCalledWith(userId, expenseId);
  });

  it('requires a valid If-Match and returns the advanced update version', async () => {
    const expenses = {
      listOwned: vi.fn(),
      create: vi.fn(),
      getOwned: vi.fn(),
      update: vi.fn().mockResolvedValue({ ...expense, title: 'Dinner', version: 2 }),
      delete: vi.fn(),
    } satisfies ExpenseService;
    const app = buildApp({ expenses });

    const missing = await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set(authorization)
      .send({ title: 'Dinner' })
      .expect(428);
    expect(missing.body.error.code).toBe('PRECONDITION_REQUIRED');

    const malformed = await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set(authorization)
      .set('If-Match', '1')
      .send({ title: 'Dinner' })
      .expect(422);
    expect(malformed.body.error.details[0].field).toBe('If-Match');

    const updated = await request(app)
      .patch(`/api/v1/expenses/${expenseId}`)
      .set(authorization)
      .set('If-Match', '"1"')
      .send({ title: 'Dinner' })
      .expect(200);
    expect(updated.headers.etag).toBe('"2"');
    expect(expenses.update).toHaveBeenCalledWith(userId, expenseId, 1, { title: 'Dinner' });
  });

  it('deletes with an ownership/version precondition and no response body', async () => {
    const expenses = {
      listOwned: vi.fn(),
      create: vi.fn(),
      getOwned: vi.fn(),
      update: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } satisfies ExpenseService;
    const response = await request(buildApp({ expenses }))
      .delete(`/api/v1/expenses/${expenseId}`)
      .set(authorization)
      .set('If-Match', '"3"')
      .expect(204);

    expect(response.text).toBe('');
    expect(expenses.delete).toHaveBeenCalledWith(userId, expenseId, 3);
  });
});
