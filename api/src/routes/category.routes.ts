import { Router, type RequestHandler } from 'express';

import type { CategoryController } from '../controllers/category.controller.js';

export function createCategoryRouter(
  controller: CategoryController,
  authenticate: RequestHandler,
): Router {
  const router = Router();
  router.get('/', authenticate, controller.list);
  return router;
}
