const DEFAULT_LOCAL_BACKEND_URL = 'http://localhost:3000';

function normalizeUrl(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.trim().replace(/\/+$/, '');
}

function readEnvValue(key: 'VITE_DEFAULT_BACKEND_URL' | 'VITE_APP_ENV'): string {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;

  return env?.[key]?.trim() ?? '';
}

export function getAppEnvironment(): string {
  return readEnvValue('VITE_APP_ENV') || 'development';
}

export function getDefaultBackendUrl(): string {
  const configuredBackendUrl = normalizeUrl(readEnvValue('VITE_DEFAULT_BACKEND_URL'));

  return configuredBackendUrl || DEFAULT_LOCAL_BACKEND_URL;
}

export function getFrontendOrigin(): string {
  return window.location.origin;
}

export function isLocalFrontendOrigin(origin = getFrontendOrigin()): boolean {
  return (
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes('0.0.0.0')
  );
}

export function shouldAllowManualBackendOverride(): boolean {
  return getAppEnvironment() !== 'production' || isLocalFrontendOrigin();
}

export function normalizeBackendUrl(value: string | null | undefined): string {
  return normalizeUrl(value) || getDefaultBackendUrl();
}

export function resolveBackendUrl(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate);

    if (normalized) {
      return normalized;
    }
  }

  return getDefaultBackendUrl();
}
