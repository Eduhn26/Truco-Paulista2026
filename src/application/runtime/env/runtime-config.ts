import { URL } from 'node:url';

type NodeEnvironment = 'development' | 'test' | 'production';

export type RuntimeConfig = {
  nodeEnv: NodeEnvironment;
  port: number;
  databaseUrl: string;
  corsOrigin: string;
  authTokenSecret: string;
  authTokenExpiresIn: string;
  pythonBotEnabled: boolean;
  pythonBotBaseUrl: string | null;
  pythonBotTimeoutMs: number | null;
};

export function loadRuntimeConfig(env: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const nodeEnv = readNodeEnv(env['NODE_ENV']);
  const port = readPositiveInteger(env['PORT'], 'PORT');
  const databaseUrl = readRequiredString(env['DATABASE_URL'], 'DATABASE_URL');
  const corsOrigin = readRequiredUrlLikeString(env['CORS_ORIGIN'], 'CORS_ORIGIN');
  const authTokenSecret = readRequiredString(env['AUTH_TOKEN_SECRET'], 'AUTH_TOKEN_SECRET');
  const authTokenExpiresIn = readRequiredString(
    env['AUTH_TOKEN_EXPIRES_IN'],
    'AUTH_TOKEN_EXPIRES_IN',
  );

  enforceProductionSecretPolicy(nodeEnv, authTokenSecret, 'AUTH_TOKEN_SECRET');

  const pythonBotEnabled = readBoolean(env['PYTHON_BOT_ENABLED'], 'PYTHON_BOT_ENABLED');

  let pythonBotBaseUrl: string | null = null;
  let pythonBotTimeoutMs: number | null = null;

  if (pythonBotEnabled) {
    pythonBotBaseUrl = readRequiredUrlLikeString(env['PYTHON_BOT_BASE_URL'], 'PYTHON_BOT_BASE_URL');
    pythonBotTimeoutMs = readPositiveInteger(env['PYTHON_BOT_TIMEOUT_MS'], 'PYTHON_BOT_TIMEOUT_MS');
  }

  return {
    nodeEnv,
    port,
    databaseUrl,
    corsOrigin,
    authTokenSecret,
    authTokenExpiresIn,
    pythonBotEnabled,
    pythonBotBaseUrl,
    pythonBotTimeoutMs,
  };
}

function readNodeEnv(value: string | undefined): NodeEnvironment {
  const normalized = value?.trim() ?? 'development';

  if (normalized === 'development' || normalized === 'test' || normalized === 'production') {
    return normalized;
  }

  throw new Error('Invalid NODE_ENV. Expected development, test, or production.');
}

function readRequiredString(value: string | undefined, envName: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`Missing required environment variable: ${envName}.`);
  }

  return normalized;
}

function readPositiveInteger(value: string | undefined, envName: string): number {
  const normalized = readRequiredString(value, envName);
  const parsed = Number(normalized);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${envName}. Expected a positive integer.`);
  }

  return parsed;
}

function readBoolean(value: string | undefined, envName: string): boolean {
  const normalized = readRequiredString(value, envName).toLowerCase();

  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error(`Invalid ${envName}. Expected true or false.`);
}

function readRequiredUrlLikeString(value: string | undefined, envName: string): string {
  const normalized = readRequiredString(value, envName);

  try {
    const url = new URL(normalized);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error();
    }

    return normalized;
  } catch {
    throw new Error(`Invalid ${envName}. Expected a valid http/https URL.`);
  }
}

function enforceProductionSecretPolicy(
  nodeEnv: NodeEnvironment,
  value: string,
  envName: string,
): void {
  if (nodeEnv !== 'production') {
    return;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized.includes('dummy') ||
    normalized.includes('example') ||
    normalized.includes('changeme')
  ) {
    throw new Error(`Unsafe ${envName} for production. Replace placeholder values before startup.`);
  }
}
