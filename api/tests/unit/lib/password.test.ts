import { describe, expect, it } from 'vitest';

import { ArgonPasswordHasher } from '../../../src/lib/password.js';

describe('ArgonPasswordHasher', () => {
  it('creates salted Argon2id hashes and verifies without storing plaintext', async () => {
    const passwords = new ArgonPasswordHasher();
    const plaintext = 'correct horse battery staple';

    const first = await passwords.hash(plaintext);
    const second = await passwords.hash(plaintext);

    expect(first).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
    expect(second).not.toBe(first);
    expect(first).not.toContain(plaintext);
    await expect(passwords.verify(first, plaintext)).resolves.toBe(true);
    await expect(passwords.verify(first, 'wrong password')).resolves.toBe(false);
    await expect(passwords.verify('not-an-argon-encoding', plaintext)).resolves.toBe(false);
  });
});
