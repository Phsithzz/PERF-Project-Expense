import { performance } from 'node:perf_hooks';

import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function createRequestLogger(logger: Logger): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();

    response.once('finish', () => {
      logger.info(
        {
          requestId: request.requestId,
          method: request.method,
          path: request.path,
          statusCode: response.statusCode,
          durationMs: Number((performance.now() - startedAt).toFixed(2)),
        },
        'Request completed',
      );
    });

    next();
  };
}
