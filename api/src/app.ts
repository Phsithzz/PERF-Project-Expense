import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import type { Logger } from 'pino';

import { AuthController } from './controllers/auth.controller.js';
import { CategoryController } from './controllers/category.controller.js';
import { ExpenseController } from './controllers/expense.controller.js';
import { HealthController } from './controllers/health.controller.js';
import { UserController } from './controllers/user.controller.js';
import type { AccessTokenVerifier } from './lib/access-token.js';
import { createAuthenticateMiddleware } from './middleware/auth.middleware.js';
import { createAuthRateLimiter } from './middleware/auth-rate-limit.middleware.js';
import { createCorsMiddleware } from './middleware/cors.middleware.js';
import { createErrorHandler } from './middleware/error-handler.middleware.js';
import { notFoundMiddleware } from './middleware/not-found.middleware.js';
import { requestIdMiddleware } from './middleware/request-id.middleware.js';
import { createRequestLogger } from './middleware/request-logger.middleware.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createCategoryRouter } from './routes/category.routes.js';
import { createExpenseRouter } from './routes/expense.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import type { AuthenticationService } from './services/auth.service.js';
import type { CategoryService } from './services/category.service.js';
import type { ExpenseService } from './services/expense.service.js';
import type { HealthService } from './services/health.service.js';

export interface AppDependencies {
  healthService: HealthService;
  authService: AuthenticationService;
  categoryService: CategoryService;
  expenseService: ExpenseService;
  accessTokenVerifier: AccessTokenVerifier;
  logger: Logger;
  httpConfig: {
    webOrigins: readonly string[];
    authRateLimitWindowMs: number;
    authRateLimitMax: number;
  };
}

export function createApp({
  healthService,
  authService,
  categoryService,
  expenseService,
  accessTokenVerifier,
  logger,
  httpConfig,
}: AppDependencies): Express {
  const app = express();
  const healthController = new HealthController(healthService);
  const authController = new AuthController(authService);
  const categoryController = new CategoryController(categoryService);
  const expenseController = new ExpenseController(expenseService);
  const userController = new UserController(authService);
  const authenticate = createAuthenticateMiddleware(accessTokenVerifier);
  const authRateLimiter = createAuthRateLimiter({
    windowMs: httpConfig.authRateLimitWindowMs,
    limit: httpConfig.authRateLimitMax,
  });

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(createRequestLogger(logger));
  app.use(createCorsMiddleware(httpConfig.webOrigins));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1/health', createHealthRouter(healthController));
  app.use('/api/v1/auth', createAuthRouter(authController, authenticate, authRateLimiter));
  app.use('/api/v1/users', createUserRouter(userController, authenticate));
  app.use('/api/v1/categories', createCategoryRouter(categoryController, authenticate));
  app.use('/api/v1/expenses', createExpenseRouter(expenseController, authenticate));

  app.use(notFoundMiddleware);
  app.use(createErrorHandler(logger));

  return app;
}
