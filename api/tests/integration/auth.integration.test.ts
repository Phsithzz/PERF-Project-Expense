import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { AccessTokenService } from '../../src/lib/access-token.js';
import { ExpenseCursorCodec } from '../../src/lib/expense-cursor.js';
import { ArgonPasswordHasher } from '../../src/lib/password.js';
import { hashRefreshToken } from '../../src/lib/refresh-token.js';
import { PostgresHealthRepository } from '../../src/repositories/health.repository.js';
import { PostgresCategoryRepository } from '../../src/repositories/category.repository.js';
import { PostgresExpenseRepository } from '../../src/repositories/expense.repository.js';
import { PostgresRefreshSessionRepository } from '../../src/repositories/refresh-session.repository.js';
import { PostgresUserRepository } from '../../src/repositories/user.repository.js';
import { AuthService } from '../../src/services/auth.service.js';
import { HealthService } from '../../src/services/health.service.js';
import { DefaultCategoryService } from '../../src/services/category.service.js';
import { DefaultExpenseService } from '../../src/services/expense.service.js';
import { createTestLogger } from '../helpers/test-logger.js';
import { assertDatabaseTables, resetTestData } from '../helpers/database.js';

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = testDatabaseUrl ? describe.sequential : describe.skip;
const password = 'correct horse battery staple';

function cookieValue(setCookie: string): string {
  return setCookie.split(';', 1)[0]!.split('=', 2)[1]!;
}

describeWithDatabase('authentication integration with PostgreSQL', () => {
  const pool = new Pool({
    connectionString: testDatabaseUrl,
    max: 10,
    connectionTimeoutMillis: 2_000,
  });
  const userRepository = new PostgresUserRepository(pool);
  const sessionRepository = new PostgresRefreshSessionRepository(pool);
  const categoryRepository = new PostgresCategoryRepository(pool);
  const expenseRepository = new PostgresExpenseRepository(pool);
  const passwordHasher = new ArgonPasswordHasher();
  const accessTokens = new AccessTokenService({
    secret: 'integration-test-access-secret-at-least-32-characters',
    issuer: 'expense-tracker-api',
    audience: 'expense-tracker-clients',
    ttlSeconds: 900,
  });
  const authService = new AuthService(
    userRepository,
    sessionRepository,
    passwordHasher,
    accessTokens,
    { refreshTokenTtlDays: 30 },
  );
  const app = createApp({
    healthService: new HealthService(new PostgresHealthRepository(pool)),
    authService,
    categoryService: new DefaultCategoryService(categoryRepository),
    expenseService: new DefaultExpenseService(
      expenseRepository,
      categoryRepository,
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

  async function register(email = 'learner@example.com') {
    return request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Full Stack Learner', email, password })
      .expect(201);
  }

  async function login(clientType: 'web' | 'mobile', email = 'learner@example.com') {
    return request(app)
      .post('/api/v1/auth/login')
      .send({ email, password, clientType })
      .expect(200);
  }

  beforeAll(async () => {
    await assertDatabaseTables(pool, ['users', 'categories', 'expenses', 'refresh_sessions']);
  });

  beforeEach(async () => {
    await resetTestData(pool);
  });

  afterAll(async () => {
    await resetTestData(pool);
    await pool.end();
  });

  it('registers a normalized account, stores Argon2id only, and rejects duplicate email', async () => {
    const registered = await register('  Learner@Example.COM  ');

    expect(registered.headers.location).toBe('/api/v1/users/me');
    expect(registered.body.data).toMatchObject({
      name: 'Full Stack Learner',
      email: 'learner@example.com',
    });
    expect(registered.body.data.password).toBeUndefined();
    expect(registered.body.data.passwordHash).toBeUndefined();

    const stored = await pool.query<{ email: string; password_hash: string }>(
      `SELECT email, password_hash
       FROM users
       WHERE email = $1`,
      ['learner@example.com'],
    );
    expect(stored.rows[0]!.email).toBe('learner@example.com');
    expect(stored.rows[0]!.password_hash).toMatch(/^\$argon2id\$/);
    expect(stored.rows[0]!.password_hash).not.toContain(password);
    await expect(passwordHasher.verify(stored.rows[0]!.password_hash, password)).resolves.toBe(
      true,
    );

    const duplicate = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Duplicate', email: 'LEARNER@example.com', password })
      .expect(409);
    expect(duplicate.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('does not disclose whether invalid login used a missing account or wrong password', async () => {
    await register();

    const wrongPassword = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'learner@example.com',
        password: 'wrong password value',
        clientType: 'mobile',
      })
      .expect(401);
    const missingAccount = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'missing@example.com',
        password: 'wrong password value',
        clientType: 'mobile',
      })
      .expect(401);

    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(missingAccount.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(missingAccount.body.error.message).toBe(wrongPassword.body.error.message);
  });

  it('creates a mobile session, stores only its hash, and authenticates current-user lookup', async () => {
    await register();
    const loggedIn = await login('mobile');
    const refreshToken = loggedIn.body.data.refreshToken as string;
    const accessToken = loggedIn.body.data.accessToken as string;

    expect(refreshToken).toHaveLength(64);
    expect(loggedIn.headers['set-cookie']).toBeUndefined();

    const stored = await pool.query<{ token_hash: string }>(
      `SELECT token_hash
       FROM refresh_sessions
       WHERE user_id = $1`,
      [loggedIn.body.data.user.id],
    );
    expect(stored.rows[0]!.token_hash).toBe(hashRefreshToken(refreshToken));
    expect(stored.rows[0]!.token_hash).not.toBe(refreshToken);

    const profile = await request(app)
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(profile.body.data.email).toBe('learner@example.com');
  });

  it('rotates a web cookie and revokes the whole family when the old token is reused', async () => {
    await register();
    const loggedIn = await login('web');
    expect(loggedIn.body.data.refreshToken).toBeUndefined();
    const firstCookieHeader = (loggedIn.headers['set-cookie'] as unknown as string[])[0]!;
    const firstToken = cookieValue(firstCookieHeader);

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `__Host-expense_refresh=${firstToken}`)
      .send({ clientType: 'web' })
      .expect(200);
    const secondCookieHeader = (refreshed.headers['set-cookie'] as unknown as string[])[0]!;
    const secondToken = cookieValue(secondCookieHeader);
    expect(secondToken).not.toBe(firstToken);
    expect(refreshed.body.data.refreshToken).toBeUndefined();

    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `__Host-expense_refresh=${firstToken}`)
      .send({ clientType: 'web' })
      .expect(401);
    expect(reused.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    const revokedSuccessor = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `__Host-expense_refresh=${secondToken}`)
      .send({ clientType: 'web' })
      .expect(401);
    expect(revokedSuccessor.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('binds refresh credentials to client transport without revoking on a mismatch', async () => {
    await register();
    const loggedIn = await login('mobile');
    const mobileToken = loggedIn.body.data.refreshToken as string;

    const wrongTransport = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `__Host-expense_refresh=${mobileToken}`)
      .send({ clientType: 'web' })
      .expect(401);
    expect(wrongTransport.body.error.code).toBe('REFRESH_TOKEN_INVALID');

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ clientType: 'mobile', refreshToken: mobileToken })
      .expect(200);
  });

  it('makes logout repeat-safe and prevents the logged-out token from refreshing', async () => {
    await register();
    const loggedIn = await login('mobile');
    const refreshToken = loggedIn.body.data.refreshToken as string;
    const body = { clientType: 'mobile', refreshToken };

    await request(app).post('/api/v1/auth/logout').send(body).expect(204);
    await request(app).post('/api/v1/auth/logout').send(body).expect(204);
    const refresh = await request(app).post('/api/v1/auth/refresh').send(body).expect(401);
    expect(refresh.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('revokes every active session owned by the access-token subject on logout-all', async () => {
    await register();
    const first = await login('mobile');
    const second = await login('mobile');

    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${first.body.data.accessToken}`)
      .expect(204);

    for (const token of [first.body.data.refreshToken, second.body.data.refreshToken]) {
      const refresh = await request(app)
        .post('/api/v1/auth/refresh')
        .send({ clientType: 'mobile', refreshToken: token })
        .expect(401);
      expect(refresh.body.error.code).toBe('REFRESH_TOKEN_INVALID');
    }
  });

  it('rejects and records an expired refresh generation', async () => {
    const registered = await register();
    const rawToken = 'e'.repeat(64);
    const createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1_000);
    await sessionRepository.create({
      id: randomUUID(),
      userId: registered.body.data.id,
      familyId: randomUUID(),
      tokenHash: hashRefreshToken(rawToken),
      clientType: 'mobile',
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1_000),
    });

    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ clientType: 'mobile', refreshToken: rawToken })
      .expect(401);
    expect(response.body.error.code).toBe('REFRESH_TOKEN_INVALID');

    const stored = await pool.query<{ revoke_reason: string | null }>(
      `SELECT revoke_reason
       FROM refresh_sessions
       WHERE token_hash = $1`,
      [hashRefreshToken(rawToken)],
    );
    expect(stored.rows[0]!.revoke_reason).toBe('expired');
  });

  it('serializes concurrent refresh and treats the losing replay as family reuse', async () => {
    await register();
    const loggedIn = await login('mobile');
    const oldToken = loggedIn.body.data.refreshToken as string;
    const refreshBody = { clientType: 'mobile', refreshToken: oldToken };

    const responses = await Promise.all([
      request(app).post('/api/v1/auth/refresh').send(refreshBody),
      request(app).post('/api/v1/auth/refresh').send(refreshBody),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    const failed = responses.find((response) => response.status === 401)!;
    const succeeded = responses.find((response) => response.status === 200)!;
    expect(failed.body.error.code).toBe('REFRESH_TOKEN_REUSED');

    const successor = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ clientType: 'mobile', refreshToken: succeeded.body.data.refreshToken })
      .expect(401);
    expect(successor.body.error.code).toBe('REFRESH_TOKEN_INVALID');
  });

  it('rolls back rotation fully when successor insertion fails', async () => {
    const registered = await register();
    const now = new Date();
    const originalRaw = 'o'.repeat(64);
    const collisionRaw = 'c'.repeat(64);
    await sessionRepository.create({
      id: randomUUID(),
      userId: registered.body.data.id,
      familyId: randomUUID(),
      tokenHash: hashRefreshToken(originalRaw),
      clientType: 'mobile',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
    });
    await sessionRepository.create({
      id: randomUUID(),
      userId: registered.body.data.id,
      familyId: randomUUID(),
      tokenHash: hashRefreshToken(collisionRaw),
      clientType: 'mobile',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
    });

    await expect(
      sessionRepository.rotate({
        tokenHash: hashRefreshToken(originalRaw),
        clientType: 'mobile',
        newSessionId: randomUUID(),
        newTokenHash: hashRefreshToken(collisionRaw),
        now: new Date(now.getTime() + 1_000),
      }),
    ).rejects.toMatchObject({ code: '23505' });

    const original = await pool.query<{ revoked_at: Date | null; replaced_by_id: string | null }>(
      `SELECT revoked_at, replaced_by_id
       FROM refresh_sessions
       WHERE token_hash = $1`,
      [hashRefreshToken(originalRaw)],
    );
    expect(original.rows[0]).toEqual({ revoked_at: null, replaced_by_id: null });
  });
});
