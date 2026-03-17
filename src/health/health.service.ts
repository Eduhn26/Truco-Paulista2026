import { Injectable } from '@nestjs/common';

import { PrismaService } from '@game/infrastructure/persistence/prisma/prisma.service';

export type ReadinessResponse = {
  status: 'ok' | 'error';
  check: 'readiness';
  service: 'truco-paulista-backend';
  dependencies: {
    database: 'up' | 'down';
  };
  timestamp: string;
};

type ReadinessResult =
  | {
      ok: true;
      response: ReadinessResponse;
    }
  | {
      ok: false;
      response: ReadinessResponse;
    };

@Injectable()
export class HealthService {
  constructor(private readonly prismaService: PrismaService) {}

  async getReadiness(): Promise<ReadinessResult> {
    const isDatabaseReady = await this.prismaService.isDatabaseReady();
    const timestamp = new Date().toISOString();

    if (!isDatabaseReady) {
      return {
        ok: false,
        response: {
          status: 'error',
          check: 'readiness',
          service: 'truco-paulista-backend',
          dependencies: {
            database: 'down',
          },
          timestamp,
        },
      };
    }

    return {
      ok: true,
      response: {
        status: 'ok',
        check: 'readiness',
        service: 'truco-paulista-backend',
        dependencies: {
          database: 'up',
        },
        timestamp,
      },
    };
  }
}
