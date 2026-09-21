import { Router, type RequestHandler } from 'express';

import type { AuthController } from '../controllers/auth.controller.js';
import {
  loginRequestSchema,
  refreshCredentialRequestSchema,
  registerRequestSchema,
} from '../validation/auth.validation.js';
import { validateRequest } from '../validation/request-validation.js';

export function createAuthRouter(
  controller: AuthController,
  authenticate: RequestHandler,
  rateLimiter: RequestHandler,
): Router {
  const router = Router();

  router.post(
    '/register',
    rateLimiter,
    validateRequest({ body: registerRequestSchema }),
    controller.register,
  );
  router.post(
    '/login',
    rateLimiter,
    validateRequest({ body: loginRequestSchema }),
    controller.login,
  );
  router.post(
    '/refresh',
    rateLimiter,
    validateRequest({ body: refreshCredentialRequestSchema }),
    controller.refresh,
  );
  router.post(
    '/logout',
    rateLimiter,
    validateRequest({ body: refreshCredentialRequestSchema }),
    controller.logout,
  );
  router.post('/logout-all', rateLimiter, authenticate, controller.logoutAll);

  return router;
}
