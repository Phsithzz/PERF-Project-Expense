import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ExpenseCursorCodec, InvalidExpenseCursorError } from '../../../src/lib/expense-cursor.js';

const secret = 'unit-test-cursor-secret-at-least-32-characters';
const payload = {
  fingerprint: 'a'.repeat(64),
  sortValue: '2026-08-08',
  id: '30000000-0000-4000-8000-000000000001',
};

describe('ExpenseCursorCodec', () => {
  it('round-trips a signed opaque cursor', () => {
    const codec = new ExpenseCursorCodec(secret);
    const cursor = codec.encode(payload);

    expect(cursor).not.toContain('2026-08-08');
    expect(codec.decode(cursor)).toEqual(payload);
  });

  it('rejects tampering, another secret, and malformed values', () => {
    const codec = new ExpenseCursorCodec(secret);
    const cursor = codec.encode(payload);
    const tampered = `${cursor.slice(0, -1)}${cursor.endsWith('A') ? 'B' : 'A'}`;

    expect(() => codec.decode(tampered)).toThrow(InvalidExpenseCursorError);
    expect(() => new ExpenseCursorCodec(`${secret}-different`).decode(cursor)).toThrow(
      InvalidExpenseCursorError,
    );
    expect(() => codec.decode('not-a-cursor')).toThrow(InvalidExpenseCursorError);
  });

  it('rejects an unsupported payload even when its signature is valid', () => {
    const codec = new ExpenseCursorCodec(secret);
    const encodedPayload = Buffer.from(
      JSON.stringify({
        v: 2,
        fingerprint: 'a'.repeat(64),
        sortValue: '2026-08-08',
        id: payload.id,
      }),
      'utf8',
    ).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(encodedPayload, 'ascii')
      .digest('base64url');

    expect(() => codec.decode(`${encodedPayload}.${signature}`)).toThrow(InvalidExpenseCursorError);
  });
});
