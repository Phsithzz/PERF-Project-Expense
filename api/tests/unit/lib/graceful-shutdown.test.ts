import type { Server } from 'node:http';

import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createShutdownHandler } from '../../../src/lib/graceful-shutdown.js';
import { createTestLogger } from '../../helpers/test-logger.js';

describe('createShutdownHandler', () => {
  it('stops HTTP intake, closes the pool, and is idempotent', async () => {
    const calls: string[] = [];
    const server = {
      closeIdleConnections: vi.fn(() => calls.push('idle')),
      closeAllConnections: vi.fn(() => calls.push('all')),
      close: vi.fn((callback: (error?: Error) => void) => {
        calls.push('server');
        callback();
        return server;
      }),
    } as unknown as Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>;
    const pool = {
      end: vi.fn(async () => {
        calls.push('pool');
      }),
    } as unknown as Pick<Pool, 'end'>;
    const forceExit = vi.fn();
    const shutdown = createShutdownHandler({
      server,
      pool,
      logger: createTestLogger(),
      timeoutMs: 5_000,
      forceExit,
    });

    await shutdown('SIGTERM');
    await shutdown('SIGINT');

    expect(calls).toEqual(['idle', 'server', 'pool']);
    expect(server.close).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
    expect(forceExit).not.toHaveBeenCalled();
  });

  it('forces a nonzero exit when HTTP shutdown fails', async () => {
    const serverError = new Error('close failed');
    const server = {
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
      close: vi.fn((callback: (error?: Error) => void) => {
        callback(serverError);
        return server;
      }),
    } as unknown as Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>;
    const pool = { end: vi.fn() } as unknown as Pick<Pool, 'end'>;
    const forceExit = vi.fn();
    const shutdown = createShutdownHandler({
      server,
      pool,
      logger: createTestLogger(),
      timeoutMs: 5_000,
      forceExit,
    });

    await shutdown('SIGTERM');

    expect(pool.end).not.toHaveBeenCalled();
    expect(forceExit).toHaveBeenCalledWith(1);
  });

  it('closes active connections and forces exit after the deadline', async () => {
    vi.useFakeTimers();
    let completeClose: (() => void) | undefined;
    const server = {
      closeIdleConnections: vi.fn(),
      closeAllConnections: vi.fn(),
      close: vi.fn((callback: () => void) => {
        completeClose = callback;
        return server;
      }),
    } as unknown as Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>;
    const pool = { end: vi.fn() } as unknown as Pick<Pool, 'end'>;
    const forceExit = vi.fn();
    const shutdown = createShutdownHandler({
      server,
      pool,
      logger: createTestLogger(),
      timeoutMs: 1_000,
      forceExit,
    });

    const pendingShutdown = shutdown('SIGTERM');
    await vi.advanceTimersByTimeAsync(1_000);

    expect(server.closeAllConnections).toHaveBeenCalledOnce();
    expect(forceExit).toHaveBeenCalledWith(1);
    completeClose!();
    await pendingShutdown;
    vi.useRealTimers();
  });
});
