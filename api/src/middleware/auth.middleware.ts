import type { RequestHandler } from 'express';

import { AppError } from '../errors/app-error.js';
import type { AccessTokenVerifier } from '../lib/access-token.js';

function authError(code: 'AUTH_REQUIRED' | 'ACCESS_TOKEN_INVALID' | 'ACCESS_TOKEN_EXPIRED') {
  const messages = {
    AUTH_REQUIRED: 'Authentication is required',
    ACCESS_TOKEN_INVALID: 'Access token is invalid',
    ACCESS_TOKEN_EXPIRED: 'Access token has expired',
  } as const;

  return new AppError({
    status: 401,
    code,
    message: messages[code],
    headers: { 'WWW-Authenticate': 'Bearer' },
  });
}

export function createAuthenticateMiddleware(tokens: AccessTokenVerifier): RequestHandler {
  return async (request, _response, next) => {
    const authorization = request.header('Authorization');
    if (!authorization) {
      next(authError('AUTH_REQUIRED'));
      return;
    }

    const match = /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match) {
      next(authError('ACCESS_TOKEN_INVALID'));
      return;
    }

    const verification = await tokens.verify(match[1]!);
    if (!verification.valid) {
      next(
        authError(
          verification.reason === 'expired' ? 'ACCESS_TOKEN_EXPIRED' : 'ACCESS_TOKEN_INVALID',
        ),
      );
      return;
    }

    request.auth = { userId: verification.userId };
    next();
  };
}
