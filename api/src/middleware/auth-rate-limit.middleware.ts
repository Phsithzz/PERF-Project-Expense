import { rateLimit } from 'express-rate-limit';

interface AuthRateLimitConfig {
  windowMs: number;
  limit: number;
}

export function createAuthRateLimiter(config: AuthRateLimitConfig) {
  return rateLimit({
    windowMs: config.windowMs,
    limit: config.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    identifier: 'authentication',
    passOnStoreError: false,
    handler: (request, response) => {
      if (!response.hasHeader('Retry-After')) {
        response.setHeader('Retry-After', Math.ceil(config.windowMs / 1_000).toString());
      }
      response.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many authentication requests',
          details: [],
          requestId: request.requestId,
        },
      });
    },
  });
}
