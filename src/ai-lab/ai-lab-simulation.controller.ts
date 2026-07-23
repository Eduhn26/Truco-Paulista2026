import { Body, Controller, Post } from '@nestjs/common';

import { AiLabSimulationService } from './ai-lab-simulation.service';

@Controller('ai-lab')
export class AiLabSimulationController {
  constructor(private readonly aiLabSimulationService: AiLabSimulationService) {}

  @Post('simulate')
  simulate(@Body() payload: unknown): Promise<unknown> {
    return this.aiLabSimulationService.simulate(payload);
  }
}
