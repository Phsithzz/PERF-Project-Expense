import { Router } from 'express';

import type { HealthController } from '../controllers/health.controller.js';

export function createHealthRouter(controller: HealthController): Router {
  const router = Router();

  router.get('/live', controller.getLiveness);
  router.get('/ready', controller.getReadiness);

  return router;
}
