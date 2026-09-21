import { describe, expect, it, vi } from 'vitest';

import { ServiceNotReadyError } from '../../../src/errors/app-error.js';
import type { HealthRepository } from '../../../src/repositories/health.repository.js';
import { HealthService } from '../../../src/services/health.service.js';

describe('HealthService', () => {
  const now = new Date('2026-08-08T12:00:00.000Z');

  it('does not query PostgreSQL for liveness', () => {
    const repository: HealthRepository = { checkConnection: vi.fn() };
    const service = new HealthService(repository, () => now);

    expect(service.getLiveness()).toEqual({ status: 'ok', timestamp: now.toISOString() });
    expect(repository.checkConnection).not.toHaveBeenCalled();
  });

  it('queries PostgreSQL before reporting readiness', async () => {
    const repository: HealthRepository = { checkConnection: vi.fn().mockResolvedValue(undefined) };
    const service = new HealthService(repository, () => now);

    await expect(service.getReadiness()).resolves.toEqual({
      status: 'ok',
      timestamp: now.toISOString(),
    });
    expect(repository.checkConnection).toHaveBeenCalledOnce();
  });

  it('maps a database failure to a safe service-not-ready error', async () => {
    const repository: HealthRepository = {
      checkConnection: vi.fn().mockRejectedValue(new Error('connection string must not leak')),
    };
    const service = new HealthService(repository, () => now);

    await expect(service.getReadiness()).rejects.toBeInstanceOf(ServiceNotReadyError);
  });
});
