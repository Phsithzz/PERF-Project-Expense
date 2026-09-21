import type { ErrorRequestHandler } from 'express';
import type { Logger } from 'pino';

import { AppError } from '../errors/app-error.js';

function isMalformedJsonError(error: unknown): boolean {
  if (!(error instanceof SyntaxError) || typeof error !== 'object' || error === null) {
    return false;
  }

  return 'type' in error && error.type === 'entity.parse.failed';
}

function normalizeError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (isMalformedJsonError(error)) {
    return new AppError({
      status: 400,
      code: 'REQUEST_MALFORMED',
      message: 'Request body contains malformed JSON',
      cause: error,
    });
  }

  return new AppError({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    cause: error,
  });
}

export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const normalized = normalizeError(error);

    if (normalized.status >= 500) {
      logger.error(
        {
          error: normalized,
          requestId: request.requestId,
          statusCode: normalized.status,
          errorCode: normalized.code,
        },
        'Request failed',
      );
    }

    for (const [name, value] of Object.entries(normalized.headers)) {
      response.setHeader(name, value);
    }

    response.status(normalized.status).json({
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
        requestId: request.requestId,
      },
    });
  };
}
