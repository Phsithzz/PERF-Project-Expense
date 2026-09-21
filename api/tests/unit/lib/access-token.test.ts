import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';

import { AccessTokenService } from '../../../src/lib/access-token.js';

const userId = '20000000-0000-4000-8000-000000000001';
const baseConfig = {
  secret: 'test-access-secret-that-is-at-least-32-characters',
  issuer: 'expense-tracker-api',
  audience: 'expense-tracker-clients',
  ttlSeconds: 900,
};

describe('AccessTokenService', () => {
  it('issues and verifies a constrained access token', async () => {
    const now = new Date('2026-08-08T12:00:00.000Z');
    const tokens = new AccessTokenService(baseConfig, () => now);

    const issued = await tokens.issue(userId);

    await expect(tokens.verify(issued.token)).resolves.toEqual({ valid: true, userId });
    expect(issued.expiresAt.toISOString()).toBe('2026-08-08T12:15:00.000Z');
  });

  it('distinguishes expiry from an invalid signature', async () => {
    let now = new Date('2026-08-08T12:00:00.000Z');
    const tokens = new AccessTokenService(baseConfig, () => now);
    const issued = await tokens.issue(userId);

    now = new Date('2026-08-08T12:16:00.000Z');
    await expect(tokens.verify(issued.token)).resolves.toEqual({ valid: false, reason: 'expired' });

    const otherSigner = new AccessTokenService({
      ...baseConfig,
      secret: 'a-different-test-secret-that-is-long-enough',
    });
    await expect(otherSigner.verify(issued.token)).resolves.toEqual({
      valid: false,
      reason: 'invalid',
    });
  });

  it('rejects a correctly signed token whose subject is not a user UUID', async () => {
    const now = new Date('2026-08-08T12:00:00.000Z');
    const tokens = new AccessTokenService(baseConfig, () => now);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject('admin')
      .setIssuer(baseConfig.issuer)
      .setAudience(baseConfig.audience)
      .setIssuedAt(Math.floor(now.getTime() / 1_000))
      .setExpirationTime(Math.floor(now.getTime() / 1_000) + 900)
      .sign(new TextEncoder().encode(baseConfig.secret));

    await expect(tokens.verify(token)).resolves.toEqual({ valid: false, reason: 'invalid' });
  });
});
