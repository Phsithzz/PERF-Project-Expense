import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { AppError, type ErrorDetail } from '../errors/app-error.js';

export interface RequestSchemas {
  body?: z.ZodType;
  params?: z.ZodType;
  query?: z.ZodType;
  headers?: z.ZodType;
}

export interface ValidatedRequest {
  body?: unknown;
  params?: unknown;
  query?: unknown;
  headers?: unknown;
}

function toErrorDetails(error: z.ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.map(String).join('.') || 'request',
    code: issue.code.toUpperCase(),
    message: issue.message,
  }));
}

export function validateRequest(schemas: RequestSchemas): RequestHandler {
  return (request, response, next) => {
    const validated: ValidatedRequest = {};
    const inputs: Array<readonly [keyof RequestSchemas, unknown]> = [
      ['body', request.body],
      ['params', request.params],
      ['query', request.query],
      ['headers', request.headers],
    ];

    for (const [key, input] of inputs) {
      const schema = schemas[key];
      if (!schema) {
        continue;
      }

      const result = schema.safeParse(input);
      if (!result.success) {
        next(
          new AppError({
            status: 422,
            code: 'VALIDATION_FAILED',
            message: 'One or more fields are invalid',
            details: toErrorDetails(result.error),
          }),
        );
        return;
      }

      validated[key] = result.data;
    }

    response.locals.validatedRequest = validated;
    next();
  };
}

export function getValidatedRequest(responseLocals: Record<string, unknown>): ValidatedRequest {
  return responseLocals.validatedRequest as ValidatedRequest;
}
