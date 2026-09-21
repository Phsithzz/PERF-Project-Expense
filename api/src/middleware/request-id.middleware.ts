import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

export const requestIdMiddleware: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();

  request.requestId = requestId;
  response.setHeader('X-Request-Id', requestId);
  next();
};
