import { createApp } from './app.js';
import { EnvironmentValidationError, parseEnvironment } from './config/env.js';
import { createDatabasePool } from './lib/database.js';
import { AccessTokenService } from './lib/access-token.js';
import { ExpenseCursorCodec } from './lib/expense-cursor.js';
import { createShutdownHandler } from './lib/graceful-shutdown.js';
import { createLogger } from './lib/logger.js';
import { ArgonPasswordHasher } from './lib/password.js';
import { PostgresHealthRepository } from './repositories/health.repository.js';
import { PostgresCategoryRepository } from './repositories/category.repository.js';
import { PostgresExpenseRepository } from './repositories/expense.repository.js';
import { PostgresRefreshSessionRepository } from './repositories/refresh-session.repository.js';
import { PostgresUserRepository } from './repositories/user.repository.js';
import { AuthService } from './services/auth.service.js';
import { DefaultCategoryService } from './services/category.service.js';
import { DefaultExpenseService } from './services/expense.service.js';
import { HealthService } from './services/health.service.js';

async function main(): Promise<void> {
  const config = parseEnvironment(process.env);
  const logger = createLogger(config);
  const pool = createDatabasePool(config, logger);
  const healthRepository = new PostgresHealthRepository(pool);
  const healthService = new HealthService(healthRepository);
  const userRepository = new PostgresUserRepository(pool);
  const refreshSessionRepository = new PostgresRefreshSessionRepository(pool);
  const categoryRepository = new PostgresCategoryRepository(pool);
  const expenseRepository = new PostgresExpenseRepository(pool);
  const passwordHasher = new ArgonPasswordHasher();
  const accessTokenService = new AccessTokenService({
    secret: config.jwtAccessSecret,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    ttlSeconds: config.accessTokenTtlSeconds,
  });
  const authService = new AuthService(
    userRepository,
    refreshSessionRepository,
    passwordHasher,
    accessTokenService,
    { refreshTokenTtlDays: config.refreshTokenTtlDays },
  );
  const app = createApp({
    healthService,
    authService,
    categoryService: new DefaultCategoryService(categoryRepository),
    expenseService: new DefaultExpenseService(
      expenseRepository,
      categoryRepository,
      new ExpenseCursorCodec(config.cursorSigningSecret),
    ),
    accessTokenVerifier: accessTokenService,
    logger,
    httpConfig: {
      webOrigins: config.webOrigins,
      authRateLimitWindowMs: config.authRateLimitWindowMs,
      authRateLimitMax: config.authRateLimitMax,
    },
  });

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port }, 'Expense Tracker API listening');
  });

  const shutdown = createShutdownHandler({
    server,
    pool,
    logger,
    timeoutMs: config.shutdownTimeoutMs,
  });

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  server.once('error', (error) => {
    logger.fatal({ error }, 'HTTP server failed');
    void pool.end().finally(() => {
      process.exitCode = 1;
    });
  });
}

void main().catch((error: unknown) => {
  if (error instanceof EnvironmentValidationError) {
    process.stderr.write(`API startup failed: ${error.message}\n`);
  } else {
    process.stderr.write('API startup failed unexpectedly\n');
  }
  process.exitCode = 1;
});
