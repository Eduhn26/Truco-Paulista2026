import { Injectable } from '@nestjs/common';

export const PYTHON_BOT_CONFIG = Symbol('PYTHON_BOT_CONFIG');

export type PythonBotConfig = {
  enabled: boolean;
  baseUrl: string;
  timeoutMs: number;
};

const DEFAULT_PYTHON_BOT_BASE_URL = 'http://localhost:8000';
const DEFAULT_PYTHON_BOT_TIMEOUT_MS = 1500;
const MIN_PYTHON_BOT_TIMEOUT_MS = 100;
const MAX_PYTHON_BOT_TIMEOUT_MS = 5000;

@Injectable()
export class PythonBotConfigService {
  getConfig(env: NodeJS.ProcessEnv = process.env): PythonBotConfig {
    const enabled = this.readBoolean(env['PYTHON_BOT_ENABLED']);
    const baseUrl = this.readBaseUrl(env['PYTHON_BOT_BASE_URL']);
    const timeoutMs = this.readTimeoutMs(env['PYTHON_BOT_TIMEOUT_MS']);

    return {
      enabled,
      baseUrl,
      timeoutMs,
    };
  }

  private readBoolean(rawValue: string | undefined): boolean {
    if (!rawValue) {
      return false;
    }

    const normalizedValue = rawValue.trim().toLowerCase();

    return normalizedValue === 'true';
  }

  private readBaseUrl(rawValue: string | undefined): string {
    const normalizedValue = rawValue?.trim();

    if (!normalizedValue) {
      return DEFAULT_PYTHON_BOT_BASE_URL;
    }

    return normalizedValue.replace(/\/+$/, '');
  }

  private readTimeoutMs(rawValue: string | undefined): number {
    if (!rawValue) {
      return DEFAULT_PYTHON_BOT_TIMEOUT_MS;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isInteger(parsedValue)) {
      return DEFAULT_PYTHON_BOT_TIMEOUT_MS;
    }

    if (parsedValue < MIN_PYTHON_BOT_TIMEOUT_MS || parsedValue > MAX_PYTHON_BOT_TIMEOUT_MS) {
      return DEFAULT_PYTHON_BOT_TIMEOUT_MS;
    }

    return parsedValue;
  }
}
