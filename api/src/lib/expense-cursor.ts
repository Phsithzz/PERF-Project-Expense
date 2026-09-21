import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

const cursorPayloadSchema = z
  .object({
    v: z.literal(1),
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    sortValue: z.string().min(1).max(32),
    id: z.string().uuid(),
  })
  .strict();

export interface ExpenseCursorPayload {
  fingerprint: string;
  sortValue: string;
  id: string;
}

export class InvalidExpenseCursorError extends Error {
  constructor() {
    super('Expense cursor is invalid');
    this.name = 'InvalidExpenseCursorError';
  }
}

export class ExpenseCursorCodec {
  private readonly secret: Buffer;

  constructor(secret: string) {
    this.secret = Buffer.from(secret, 'utf8');
  }

  encode(payload: ExpenseCursorPayload): string {
    const encodedPayload = Buffer.from(JSON.stringify({ v: 1, ...payload }), 'utf8').toString(
      'base64url',
    );
    return `${encodedPayload}.${this.sign(encodedPayload).toString('base64url')}`;
  }

  decode(cursor: string): ExpenseCursorPayload {
    const match = /^([A-Za-z0-9_-]{1,1536})\.([A-Za-z0-9_-]{43})$/.exec(cursor);
    if (!match) {
      throw new InvalidExpenseCursorError();
    }

    const encodedPayload = match[1]!;
    const actualSignature = Buffer.from(match[2]!, 'base64url');
    if (actualSignature.toString('base64url') !== match[2]) {
      throw new InvalidExpenseCursorError();
    }
    const expectedSignature = this.sign(encodedPayload);
    if (
      actualSignature.length !== expectedSignature.length ||
      !timingSafeEqual(actualSignature, expectedSignature)
    ) {
      throw new InvalidExpenseCursorError();
    }

    try {
      const payloadBytes = Buffer.from(encodedPayload, 'base64url');
      if (payloadBytes.toString('base64url') !== encodedPayload) {
        throw new InvalidExpenseCursorError();
      }
      const parsed: unknown = JSON.parse(payloadBytes.toString('utf8'));
      const result = cursorPayloadSchema.safeParse(parsed);
      if (!result.success) {
        throw new InvalidExpenseCursorError();
      }
      return {
        fingerprint: result.data.fingerprint,
        sortValue: result.data.sortValue,
        id: result.data.id,
      };
    } catch (error) {
      if (error instanceof InvalidExpenseCursorError) {
        throw error;
      }
      throw new InvalidExpenseCursorError();
    }
  }

  private sign(encodedPayload: string): Buffer {
    return createHmac('sha256', this.secret).update(encodedPayload, 'ascii').digest();
  }
}
