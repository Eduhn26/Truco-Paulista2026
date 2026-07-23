import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';

import { PythonBotConfigService } from '@game/infrastructure/bots/python-bot.config';

const AI_LAB_SIMULATION_TIMEOUT_MS = 30_000;

@Injectable()
export class AiLabSimulationService {
  private readonly logger = new Logger(AiLabSimulationService.name);

  constructor(private readonly pythonBotConfigService: PythonBotConfigService) {}

  async simulate(payload: unknown): Promise<unknown> {
    const config = this.pythonBotConfigService.getConfig();
    const requestUrl = `${config.baseUrl}/ai-lab/simulate`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), AI_LAB_SIMULATION_TIMEOUT_MS);

    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      let responsePayload: unknown;

      try {
        responsePayload = (await response.json()) as unknown;
      } catch {
        responsePayload = {
          status: 'error',
          message: 'Python bot service returned invalid JSON.',
        };
      }

      if (!response.ok) {
        throw new HttpException(
          responsePayload as string | Record<string, any>,
          response.status,
        );
      }

      return responsePayload;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (this.isAbortError(error)) {
        throw new GatewayTimeoutException(
          'AI Lab simulation exceeded the service timeout.',
        );
      }

      this.logger.warn(
        JSON.stringify({
          layer: 'application',
          component: 'ai_lab_simulation_service',
          event: 'python_simulation_request_failed',
          status: 'failed',
          url: requestUrl,
          errorType: error instanceof Error ? error.name : 'UnknownError',
        }),
      );

      throw new BadGatewayException(
        'Python bot simulation service is unavailable.',
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }
}
