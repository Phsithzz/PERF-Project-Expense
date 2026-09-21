import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import type { HealthRepository } from '../../src/repositories/health.repository.js';
import { HealthService } from '../../src/services/health.service.js';
import {
  createRejectingAccessTokenVerifier,
  createUnusedAuthenticationService,
} from '../helpers/auth-stubs.js';
import { createTestLogger } from '../helpers/test-logger.js';
import {
  createUnusedCategoryService,
  createUnusedExpenseService,
} from '../helpers/domain-stubs.js';

const fixedNow = new Date('2026-08-08T12:00:00.000Z');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function buildApp(repository: HealthRepository) {
  return createApp({
    healthService: new HealthService(repository, () => fixedNow),
    authService: createUnusedAuthenticationService(),
    categoryService: createUnusedCategoryService(),
    expenseService: createUnusedExpenseService(),
    accessTokenVerifier: createRejectingAccessTokenVerifier(),
    logger: createTestLogger(),
    httpConfig: {
      webOrigins: ['http://localhost:5173'],
      authRateLimitWindowMs: 60_000,
      authRateLimitMax: 1_000,
    },
  });
}

describe('health API', () => {
  it('returns OpenAPI-compatible liveness without touching PostgreSQL', async () => {
    const repository: HealthRepository = { checkConnection: vi.fn() };

    const response = await request(buildApp(repository)).get('/api/v1/health/live').expect(200);

    expect(response.body).toEqual({
      data: { status: 'ok', timestamp: fixedNow.toISOString() },
    });
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
    expect(repository.checkConnection).not.toHaveBeenCalled();
  });

  it('returns readiness after PostgreSQL responds', async () => {
    const repository: HealthRepository = { checkConnection: vi.fn().mockResolvedValue(undefined) };

    const response = await request(buildApp(repository)).get('/api/v1/health/ready').expect(200);

    expect(response.body.data.status).toBe('ok');
    expect(repository.checkConnection).toHaveBeenCalledOnce();
  });

  it('returns a safe 503 envelope when PostgreSQL is unavailable', async () => {
    const repository: HealthRepository = {
      checkConnection: vi.fn().mockRejectedValue(new Error('postgresql://secret@internal-host/db')),
    };

    const response = await request(buildApp(repository)).get('/api/v1/health/ready').expect(503);

    expect(response.headers['retry-after']).toBe('5');
    expect(response.body).toEqual({
      error: {
        code: 'SERVICE_NOT_READY',
        message: 'Service is not ready',
        details: [],
        requestId: response.headers['x-request-id'],
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('internal-host');
  });

  it('generates its own request ID instead of trusting a client value', async () => {
    const repository: HealthRepository = { checkConnection: vi.fn() };
    const clientValue = 'client-controlled-value';

    const response = await request(buildApp(repository))
      .get('/api/v1/health/live')
      .set('X-Request-Id', clientValue)
      .expect(200);

    expect(response.headers['x-request-id']).not.toBe(clientValue);
    expect(response.headers['x-request-id']).toMatch(uuidPattern);
  });

  it('uses the JSON error envelope for unknown routes', async () => {
    const repository: HealthRepository = { checkConnection: vi.fn() };

    const response = await request(buildApp(repository)).get('/api/v1/does-not-exist').expect(404);

    expect(response.body.error).toMatchObject({
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found',
      details: [],
      requestId: response.headers['x-request-id'],
    });
  });

  it('uses the JSON error envelope for malformed JSON', async () => {
    const repository: HealthRepository = { checkConnection: vi.fn() };

    const response = await request(buildApp(repository))
      .post('/api/v1/does-not-exist')
      .set('Content-Type', 'application/json')
      .send('{"broken":')
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: 'REQUEST_MALFORMED',
      details: [],
      requestId: response.headers['x-request-id'],
    });
  });
});
