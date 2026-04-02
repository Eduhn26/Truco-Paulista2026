import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from './health.controller';
import { type HttpMetricsSnapshot } from '../application/http/metrics/http-metrics.service';
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

type HttpMetricsServiceStub = {
  getSnapshot: () => HttpMetricsSnapshot;
};

describe('HealthController', () => {
  function createHttpMetricsSnapshot(): HttpMetricsSnapshot {
    return {
      status: 'ok',
      check: 'metrics',
      service: 'truco-paulista-backend',
      totals: {
        requests: 3,
        failedRequests: 1,
        totalDurationMs: 120,
        averageDurationMs: 40,
      },
      byStatusCode: {
        '200': 2,
        '503': 1,
      },
      timestamp: new Date().toISOString(),
    };
  }

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

    const httpMetricsServiceStub: HttpMetricsServiceStub = {
      getSnapshot: () => createHttpMetricsSnapshot(),
    };

    const healthController = new HealthController(
      healthServiceStub as never,
      httpMetricsServiceStub as never,
    );
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

    const httpMetricsServiceStub: HttpMetricsServiceStub = {
      getSnapshot: () => createHttpMetricsSnapshot(),
    };

    const healthController = new HealthController(
      healthServiceStub as never,
      httpMetricsServiceStub as never,
    );
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

    const httpMetricsServiceStub: HttpMetricsServiceStub = {
      getSnapshot: () => createHttpMetricsSnapshot(),
    };

    const healthController = new HealthController(
      healthServiceStub as never,
      httpMetricsServiceStub as never,
    );

    await expect(healthController.getReadiness()).rejects.toThrow(ServiceUnavailableException);
  });

  it('returns the metrics snapshot', () => {
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

    const httpMetricsSnapshot = createHttpMetricsSnapshot();
    const httpMetricsServiceStub: HttpMetricsServiceStub = {
      getSnapshot: () => httpMetricsSnapshot,
    };

    const healthController = new HealthController(
      healthServiceStub as never,
      httpMetricsServiceStub as never,
    );
    const result = healthController.getMetrics();

    expect(result).toEqual(httpMetricsSnapshot);
  });
});
