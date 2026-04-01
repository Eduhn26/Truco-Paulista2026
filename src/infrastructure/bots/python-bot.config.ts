import { Injectable } from '@nestjs/common';

export const PYTHON_BOT_CONFIG = Symbol('PYTHON_BOT_CONFIG');

export type PythonBotConfig = {
  baseUrl: string;
  timeoutMs: number;
  enabled: boolean;
};

@Injectable()
export class PythonBotConfigService {
  getConfig(): PythonBotConfig {
    const baseUrl = process.env['PYTHON_BOT_BASE_URL']?.trim() || 'http://localhost:8000';
    const rawTimeoutMs = process.env['PYTHON_BOT_TIMEOUT_MS'];
    const timeoutMs =
      rawTimeoutMs && Number.isFinite(Number(rawTimeoutMs)) ? Number(rawTimeoutMs) : 1500;
    const enabled = process.env['PYTHON_BOT_ENABLED'] === 'true';

    // NOTE: Keep remote service coordinates inside Infrastructure so transport
    // concerns do not leak into Gateway orchestration.
    return {
      baseUrl,
      timeoutMs,
      enabled,
    };
  }
}
