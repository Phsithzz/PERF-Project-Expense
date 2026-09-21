import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';

export const requireExpenseVersion: RequestHandler = (request, response, next) => {
  const rawIfMatch = request.header('If-Match');
  if (!rawIfMatch) {
    next(
      new AppError({
        status: 428,
        code: 'PRECONDITION_REQUIRED',
        message: 'If-Match is required for this operation',
      }),
    );
    return;
  }

  const match = /^"([1-9][0-9]*)"$/.exec(rawIfMatch);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) {
    next(
      new AppError({
        status: 422,
        code: 'VALIDATION_FAILED',
        message: 'One or more fields are invalid',
        details: [
          {
            field: 'If-Match',
            code: 'INVALID_FORMAT',
            message: 'If-Match must contain one quoted positive integer version',
          },
        ],
      }),
    );
    return;
  }

  response.locals.expenseVersion = version;
  next();
};

export function getExpenseVersion(responseLocals: Record<string, unknown>): number {
  return responseLocals.expenseVersion as number;
}
