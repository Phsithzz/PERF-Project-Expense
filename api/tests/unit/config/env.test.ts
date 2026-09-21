import { describe, expect, it } from 'vitest';

import { EnvironmentValidationError, parseEnvironment } from '../../../src/config/env.js';

describe('parseEnvironment', () => {
  it('parses required configuration and applies bounded defaults', () => {
    const config = parseEnvironment({
      DATABASE_URL: 'postgresql://app:secret@localhost:5432/expense_tracker',
      JWT_ACCESS_SECRET: 'a-secure-test-secret-with-32-characters',
      CURSOR_SIGNING_SECRET: 'a-different-cursor-secret-with-32-characters',
    });

    expect(config).toEqual({
      nodeEnv: 'development',
      port: 3000,
      databaseUrl: 'postgresql://app:secret@localhost:5432/expense_tracker',
      jwtAccessSecret: 'a-secure-test-secret-with-32-characters',
      cursorSigningSecret: 'a-different-cursor-secret-with-32-characters',
      jwtIssuer: 'expense-tracker-api',
      jwtAudience: 'expense-tracker-clients',
      accessTokenTtlSeconds: 900,
      refreshTokenTtlDays: 30,
      authRateLimitWindowMs: 60_000,
      authRateLimitMax: 10,
      webOrigins: ['http://localhost:5173'],
      dbPoolMax: 10,
      dbIdleTimeoutMs: 10_000,
      dbConnectionTimeoutMs: 2_000,
      shutdownTimeoutMs: 10_000,
      logLevel: 'info',
    });
  });

  it('rejects missing and invalid values without exposing their contents', () => {
    const invalidSecret = 'not-a-postgres-url-with-secret';

    expect(() =>
      parseEnvironment({
        DATABASE_URL: invalidSecret,
        JWT_ACCESS_SECRET: 'a-secure-test-secret-with-32-characters',
        CURSOR_SIGNING_SECRET: 'a-different-cursor-secret-with-32-characters',
        PORT: '70000',
        DB_POOL_MAX: '0',
      }),
    ).toThrow(EnvironmentValidationError);

    try {
      parseEnvironment({
        DATABASE_URL: invalidSecret,
        JWT_ACCESS_SECRET: 'a-secure-test-secret-with-32-characters',
        CURSOR_SIGNING_SECRET: 'a-different-cursor-secret-with-32-characters',
        PORT: '70000',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError);
      expect((error as Error).message).toContain('DATABASE_URL');
      expect((error as Error).message).toContain('PORT');
      expect((error as Error).message).not.toContain(invalidSecret);
    }
  });
});
