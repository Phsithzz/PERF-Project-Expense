import { describe, expect, it } from 'vitest';

import { generateRefreshToken, hashRefreshToken } from '../../../src/lib/refresh-token.js';

describe('refresh token utilities', () => {
  it('generates high-entropy opaque tokens and hashes them to lowercase SHA-256', () => {
    const first = generateRefreshToken();
    const second = generateRefreshToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(second).not.toBe(first);
    expect(hashRefreshToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRefreshToken(first)).not.toContain(first);
  });
});
