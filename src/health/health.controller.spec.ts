import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from './health.controller';
import { type ReadinessResponse } from './health.service';

type HealthServiceStub = {
  getReadiness: () => Promise<
    | {
        ok: true;
        response: ReadinessResponse;
      }
    | {
        ok: false;
        response: ReadinessResponse;
      }
  >;
};

describe('HealthController', () => {
  it('returns the liveness payload without checking dependencies', () => {
    const healthServiceStub: HealthServiceStub = {
      getReadiness: () =>
        Promise.resolve({
          ok: true,
          response: {
            status: 'ok',
            check: 'readiness',
            service: 'truco-paulista-backend',
            dependencies: {
              database: 'up',
            },
            timestamp: new Date().toISOString(),
          },
        }),
    };

    const healthController = new HealthController(healthServiceStub as never);
    const result = healthController.getLiveness();

    expect(result.status).toBe('ok');
    expect(result.check).toBe('liveness');
    expect(result.service).toBe('truco-paulista-backend');
    expect(result.timestamp).toEqual(expect.any(String));
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('returns readiness payload when the database is ready', async () => {
    const healthServiceStub: HealthServiceStub = {
      getReadiness: () =>
        Promise.resolve({
          ok: true,
          response: {
            status: 'ok',
            check: 'readiness',
            service: 'truco-paulista-backend',
            dependencies: {
              database: 'up',
            },
            timestamp: new Date().toISOString(),
          },
        }),
    };

    const healthController = new HealthController(healthServiceStub as never);
    const result = await healthController.getReadiness();

    expect(result.status).toBe('ok');
    expect(result.check).toBe('readiness');
    expect(result.dependencies.database).toBe('up');
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });

  it('throws 503 when the database is not ready', async () => {
    const readinessResponse: ReadinessResponse = {
      status: 'error',
      check: 'readiness',
      service: 'truco-paulista-backend',
      dependencies: {
        database: 'down',
      },
      timestamp: new Date().toISOString(),
    };

    const healthServiceStub: HealthServiceStub = {
      getReadiness: () =>
        Promise.resolve({
          ok: false,
          response: readinessResponse,
        }),
    };

    const healthController = new HealthController(healthServiceStub as never);

    await expect(healthController.getReadiness()).rejects.toThrow(ServiceUnavailableException);
  });
});
