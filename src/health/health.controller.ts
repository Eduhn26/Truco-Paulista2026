import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { HealthService, type ReadinessResponse } from './health.service';

type LivenessResponse = {
  status: 'ok';
  check: 'liveness';
  service: 'truco-paulista-backend';
  timestamp: string;
};

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLiveness(): LivenessResponse {
    return {
      status: 'ok',
      check: 'liveness',
      service: 'truco-paulista-backend',
      // NOTE: Liveness must stay dependency-free so orchestrators can distinguish
      // "the process is alive" from "the infrastructure is ready".
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async getReadiness(): Promise<ReadinessResponse> {
    const readiness = await this.healthService.getReadiness();

    if (!readiness.ok) {
      throw new ServiceUnavailableException(readiness.response);
    }

    return readiness.response;
  }
}