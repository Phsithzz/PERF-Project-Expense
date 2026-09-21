import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';

export const notFoundMiddleware: RequestHandler = (_request, _response, next) => {
  next(
    new AppError({
      status: 404,
      code: 'ROUTE_NOT_FOUND',
      message: 'Route not found',
    }),
  );
};
