import { Writable } from 'node:stream';

import pino, { type Logger } from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { createApp } from '../../src/app.js';
import { AppError } from '../../src/errors/app-error.js';
import type { AccessTokenVerifier } from '../../src/lib/access-token.js';
import type { HealthRepository } from '../../src/repositories/health.repository.js';
import type { AuthSession, AuthenticationService } from '../../src/services/auth.service.js';
import { HealthService } from '../../src/services/health.service.js';
import { createTestLogger } from '../helpers/test-logger.js';
import {
  createUnusedCategoryService,
  createUnusedExpenseService,
} from '../helpers/domain-stubs.js';

const user = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Test User',
  email: 'test@example.com',
  createdAt: '2026-08-08T12:00:00.000Z',
  updatedAt: '2026-08-08T12:00:00.000Z',
};

function session(clientType: 'web' | 'mobile'): AuthSession {
  return {
    user,
    accessToken: 'header.payload.signature',
    accessTokenExpiresAt: '2026-08-08T12:15:00.000Z',
    refreshToken: 'r'.repeat(64),
    refreshTokenExpiresAt: '2026-09-07T12:00:00.000Z',
    clientType,
  };
}

function authStub(overrides: Partial<AuthenticationService> = {}): AuthenticationService {
  return {
    register: vi.fn().mockResolvedValue(user),
    login: vi
      .fn()
      .mockImplementation(async (input: { clientType: 'web' | 'mobile' }) =>
        session(input.clientType),
      ),
    refresh: vi
      .fn()
      .mockImplementation(async (clientType: 'web' | 'mobile') => session(clientType)),
    logout: vi.fn().mockResolvedValue(undefined),
    logoutAll: vi.fn().mockResolvedValue(undefined),
    getCurrentUser: vi.fn().mockResolvedValue(user),
    ...overrides,
  };
}

function buildApp(
  options: {
    auth?: AuthenticationService;
    verifier?: AccessTokenVerifier;
    rateLimit?: number;
    logger?: Logger;
  } = {},
) {
  const healthRepository: HealthRepository = { checkConnection: vi.fn() };
  return createApp({
    healthService: new HealthService(healthRepository),
    authService: options.auth ?? authStub(),
    categoryService: createUnusedCategoryService(),
    expenseService: createUnusedExpenseService(),
    accessTokenVerifier: options.verifier ?? {
      verify: vi.fn().mockResolvedValue({ valid: true, userId: user.id }),
    },
    logger: options.logger ?? createTestLogger(),
    httpConfig: {
      webOrigins: ['https://web.example.test'],
      authRateLimitWindowMs: 60_000,
      authRateLimitMax: options.rateLimit ?? 1_000,
    },
  });
}

describe('authentication HTTP contract', () => {
  it('sets the secure web refresh cookie and omits the token from JSON', async () => {
    const response = await request(buildApp())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'valid password', clientType: 'web' })
      .expect(200);

    expect(response.body.data.refreshToken).toBeUndefined();
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies).toHaveLength(1);
    const cookie = cookies[0]!;
    expect(cookie).toContain('__Host-expense_refresh=');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('Domain=');
  });

  it('returns the mobile refresh token in JSON without setting a cookie', async () => {
    const response = await request(buildApp())
      .post('/api/v1/auth/login')
      .send({ email: 'test@example.com', password: 'valid password', clientType: 'mobile' })
      .expect(200);

    expect(response.body.data.refreshToken).toBe('r'.repeat(64));
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('protects current-user lookup and distinguishes missing, invalid, and expired access tokens', async () => {
    const missing = await request(buildApp()).get('/api/v1/users/me').expect(401);
    expect(missing.body.error.code).toBe('AUTH_REQUIRED');

    for (const reason of ['invalid', 'expired'] as const) {
      const response = await request(
        buildApp({ verifier: { verify: vi.fn().mockResolvedValue({ valid: false, reason }) } }),
      )
        .get('/api/v1/users/me')
        .set('Authorization', 'Bearer token')
        .expect(401);
      expect(response.body.error.code).toBe(
        reason === 'expired' ? 'ACCESS_TOKEN_EXPIRED' : 'ACCESS_TOKEN_INVALID',
      );
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
  });

  it('returns validated current-user data from the authenticated subject', async () => {
    const auth = authStub();
    const response = await request(buildApp({ auth }))
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(response.body).toEqual({ data: user });
    expect(auth.getCurrentUser).toHaveBeenCalledWith(user.id);
  });

  it('rejects unknown fields using the shared validation envelope', async () => {
    const response = await request(buildApp())
      .post('/api/v1/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'long enough password',
        role: 'admin',
      })
      .expect(422);

    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('allows configured credentialed CORS and omits CORS permission for unknown origins', async () => {
    const allowed = await request(buildApp())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://web.example.test')
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);
    expect(allowed.headers['access-control-allow-origin']).toBe('https://web.example.test');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const denied = await request(buildApp())
      .options('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('Access-Control-Request-Method', 'POST')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rate-limits authentication endpoints with a consistent error and retry guidance', async () => {
    const app = buildApp({ rateLimit: 1 });
    const body = { email: 'test@example.com', password: 'valid password', clientType: 'mobile' };

    await request(app).post('/api/v1/auth/login').send(body).expect(200);
    const limited = await request(app).post('/api/v1/auth/login').send(body).expect(429);

    expect(limited.body.error.code).toBe('RATE_LIMITED');
    expect(limited.body.error.requestId).toBe(limited.headers['x-request-id']);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('clears the web cookie after refresh failure', async () => {
    const auth = authStub({
      refresh: vi.fn().mockRejectedValue(
        new AppError({
          status: 401,
          code: 'REFRESH_TOKEN_INVALID',
          message: 'Refresh token is invalid',
        }),
      ),
    });
    const response = await request(buildApp({ auth }))
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${'__Host-expense_refresh'}=${'r'.repeat(64)}`)
      .send({ clientType: 'web' })
      .expect(401);

    expect(response.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies[0]).toContain('__Host-expense_refresh=;');
  });

  it('does not write credentials or request bodies to structured logs', async () => {
    let logs = '';
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        logs += chunk.toString();
        callback();
      },
    });
    const logger = pino({ level: 'info' }, sink);
    const secretPassword = 'unique-password-that-must-not-be-logged';
    const auth = authStub({
      login: vi.fn().mockRejectedValue(
        new AppError({
          status: 401,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        }),
      ),
    });

    await request(buildApp({ auth, logger }))
      .post('/api/v1/auth/login')
      .send({ email: 'private@example.com', password: secretPassword, clientType: 'mobile' })
      .expect(401);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(logs).not.toContain(secretPassword);
    expect(logs).not.toContain('private@example.com');
    expect(logs).not.toContain('authorization');
  });
});
