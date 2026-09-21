import cors from 'cors';

export function createCorsMiddleware(webOrigins: readonly string[]) {
  const allowedOrigins = new Set(webOrigins);

  return cors({
    origin: (origin, callback) => {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'If-Match'],
    exposedHeaders: ['ETag', 'Location', 'X-Request-Id'],
  });
}
