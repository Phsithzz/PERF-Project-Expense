import { ServiceNotReadyError } from '../errors/app-error.js';
import type { HealthRepository } from '../repositories/health.repository.js';

export interface HealthData {
  status: 'ok';
  timestamp: string;
}

type Clock = () => Date;

export class HealthService {
  constructor(
    private readonly repository: HealthRepository,
    private readonly clock: Clock = () => new Date(),
  ) {}

  getLiveness(): HealthData {
    return this.createHealthyResult();
  }

  async getReadiness(): Promise<HealthData> {
    try {
      await this.repository.checkConnection();
      return this.createHealthyResult();
    } catch (error) {
      throw new ServiceNotReadyError(error);
    }
  }

  private createHealthyResult(): HealthData {
    return {
      status: 'ok',
      timestamp: this.clock().toISOString(),
    };
  }
}
