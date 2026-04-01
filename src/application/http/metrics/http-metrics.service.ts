import { Injectable } from '@nestjs/common';

type RequestsByStatusCode = Record<string, number>;

export type HttpMetricsSnapshot = {
  status: 'ok';
  check: 'metrics';
  service: 'truco-paulista-backend';
  totals: {
    requests: number;
    failedRequests: number;
    totalDurationMs: number;
    averageDurationMs: number;
  };
  byStatusCode: RequestsByStatusCode;
  timestamp: string;
};

@Injectable()
export class HttpMetricsService {
  private totalRequests = 0;
  private failedRequests = 0;
  private totalDurationMs = 0;
  private readonly requestsByStatusCode: Map<number, number> = new Map();

  recordRequest(statusCode: number, durationMs: number): void {
    this.totalRequests += 1;
    this.totalDurationMs += durationMs;

    if (statusCode >= 400) {
      this.failedRequests += 1;
    }

    const currentCount = this.requestsByStatusCode.get(statusCode) ?? 0;
    this.requestsByStatusCode.set(statusCode, currentCount + 1);
  }

  getSnapshot(): HttpMetricsSnapshot {
    const byStatusCode = Array.from(
      this.requestsByStatusCode.entries(),
    ).reduce<RequestsByStatusCode>((accumulator, [statusCode, count]) => {
      accumulator[String(statusCode)] = count;

      return accumulator;
    }, {});

    const averageDurationMs =
      this.totalRequests > 0 ? Number((this.totalDurationMs / this.totalRequests).toFixed(2)) : 0;

    return {
      status: 'ok',
      check: 'metrics',
      service: 'truco-paulista-backend',
      totals: {
        requests: this.totalRequests,
        failedRequests: this.failedRequests,
        totalDurationMs: this.totalDurationMs,
        averageDurationMs,
      },
      byStatusCode,
      timestamp: new Date().toISOString(),
    };
  }
}
