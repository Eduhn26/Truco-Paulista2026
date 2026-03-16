import { Controller, Get } from '@nestjs/common';

type LivenessResponse = {
  status: 'ok';
  check: 'liveness';
  service: 'truco-paulista-backend';
  timestamp: string;
};

@Controller('health')
export class HealthController {
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
}
