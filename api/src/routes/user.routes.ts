import { Router, type RequestHandler } from 'express';

import type { UserController } from '../controllers/user.controller.js';

export function createUserRouter(controller: UserController, authenticate: RequestHandler): Router {
  const router = Router();

  router.get('/me', authenticate, controller.getCurrentUser);

  return router;
}
