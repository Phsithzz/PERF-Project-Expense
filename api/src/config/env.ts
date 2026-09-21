import { z } from 'zod';

const postgresUrl = z
  .string()
  .trim()
  .min(1, 'DATABASE_URL is required')
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === 'postgres:' || protocol === 'postgresql:';
    } catch {
      return false;
    }
  }, 'DATABASE_URL must be a valid PostgreSQL connection URL');

const webOrigins = z
  .string()
  .default('http://localhost:5173')
  .refine((value) => {
    const origins = value.split(',').map((origin) => origin.trim());
    return (
      origins.length > 0 &&
      origins.every((origin) => {
        try {
          const url = new URL(origin);
          return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === origin;
        } catch {
          return false;
        }
      })
    );
  }, 'WEB_ORIGINS must be a comma-separated list of exact HTTP(S) origins');

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_URL: postgresUrl,
  JWT_ACCESS_SECRET: z.string().min(32).max(4096),
  CURSOR_SIGNING_SECRET: z.string().min(32).max(4096),
  JWT_ISSUER: z.string().trim().min(1).max(200).default('expense-tracker-api'),
  JWT_AUDIENCE: z.string().trim().min(1).max(200).default('expense-tracker-clients'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1_000).max(3_600_000).default(60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000).default(10),
  WEB_ORIGINS: webOrigins,
  DB_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(10_000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(2_000),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type AppConfig = Readonly<{
  nodeEnv: z.infer<typeof environmentSchema>['NODE_ENV'];
  port: number;
  databaseUrl: string;
  jwtAccessSecret: string;
  cursorSigningSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  authRateLimitWindowMs: number;
  authRateLimitMax: number;
  webOrigins: readonly string[];
  dbPoolMax: number;
  dbIdleTimeoutMs: number;
  dbConnectionTimeoutMs: number;
  shutdownTimeoutMs: number;
  logLevel: z.infer<typeof environmentSchema>['LOG_LEVEL'];
}>;

export class EnvironmentValidationError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`Invalid environment configuration: ${fields.join(', ')}`);
    this.name = 'EnvironmentValidationError';
    this.fields = fields;
  }
}

export function parseEnvironment(input: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(input);

  if (!result.success) {
    const fields = [
      ...new Set(result.error.issues.map((issue) => issue.path.join('.') || 'environment')),
    ];
    throw new EnvironmentValidationError(fields);
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    jwtAccessSecret: result.data.JWT_ACCESS_SECRET,
    cursorSigningSecret: result.data.CURSOR_SIGNING_SECRET,
    jwtIssuer: result.data.JWT_ISSUER,
    jwtAudience: result.data.JWT_AUDIENCE,
    accessTokenTtlSeconds: result.data.ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlDays: result.data.REFRESH_TOKEN_TTL_DAYS,
    authRateLimitWindowMs: result.data.AUTH_RATE_LIMIT_WINDOW_MS,
    authRateLimitMax: result.data.AUTH_RATE_LIMIT_MAX,
    webOrigins: result.data.WEB_ORIGINS.split(',').map((origin) => origin.trim()),
    dbPoolMax: result.data.DB_POOL_MAX,
    dbIdleTimeoutMs: result.data.DB_IDLE_TIMEOUT_MS,
    dbConnectionTimeoutMs: result.data.DB_CONNECTION_TIMEOUT_MS,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    logLevel: result.data.LOG_LEVEL,
  };
}
