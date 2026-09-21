import type { RequestHandler } from 'express';

import type { HealthService } from '../services/health.service.js';

export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  readonly getLiveness: RequestHandler = (_request, response) => {
    response.status(200).json({ data: this.healthService.getLiveness() });
  };

  readonly getReadiness: RequestHandler = async (_request, response) => {
    const health = await this.healthService.getReadiness();
    response.status(200).json({ data: health });
  };
}
