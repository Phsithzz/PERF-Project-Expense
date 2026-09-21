import { Writable } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { createLogger } from '../../../src/lib/logger.js';

describe('createLogger', () => {
  it('adds service context and redacts configured credential fields', async () => {
    let output = '';
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger({ nodeEnv: 'test', logLevel: 'info' }, sink);

    logger.info(
      {
        password: 'private-password',
        accessToken: 'private-access-token',
        refreshToken: 'private-refresh-token',
        req: { headers: { authorization: 'Bearer private', cookie: 'private-cookie' } },
      },
      'redaction test',
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    const event = JSON.parse(output) as Record<string, unknown>;
    expect(event).toMatchObject({
      service: 'expense-tracker-api',
      environment: 'test',
      password: '[REDACTED]',
      accessToken: '[REDACTED]',
      refreshToken: '[REDACTED]',
      req: {
        headers: {
          authorization: '[REDACTED]',
          cookie: '[REDACTED]',
        },
      },
    });
    expect(output).not.toContain('private-password');
    expect(output).not.toContain('private-access-token');
    expect(output).not.toContain('private-refresh-token');
    expect(output).not.toContain('private-cookie');
  });
});
