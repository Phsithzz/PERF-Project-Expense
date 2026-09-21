import type { Server } from 'node:http';

import type { Pool } from 'pg';
import type { Logger } from 'pino';

interface ShutdownDependencies {
  server: Pick<Server, 'close' | 'closeIdleConnections' | 'closeAllConnections'>;
  pool: Pick<Pool, 'end'>;
  logger: Logger;
  timeoutMs: number;
  forceExit?: (code: number) => never | void;
}

export type ShutdownHandler = (signal: NodeJS.Signals) => Promise<void>;

export function createShutdownHandler({
  server,
  pool,
  logger,
  timeoutMs,
  forceExit = (code) => process.exit(code),
}: ShutdownDependencies): ShutdownHandler {
  let shutdownStarted = false;

  return async (signal) => {
    if (shutdownStarted) {
      return;
    }
    shutdownStarted = true;

    logger.info({ signal }, 'Graceful shutdown started');

    const forceTimer = setTimeout(() => {
      logger.fatal({ timeoutMs }, 'Graceful shutdown timed out');
      server.closeAllConnections();
      forceExit(1);
    }, timeoutMs);
    forceTimer.unref();

    try {
      server.closeIdleConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
      await pool.end();
      clearTimeout(forceTimer);
      logger.info({ signal }, 'Graceful shutdown completed');
    } catch (error) {
      clearTimeout(forceTimer);
      logger.fatal({ error, signal }, 'Graceful shutdown failed');
      forceExit(1);
    }
  };
}
