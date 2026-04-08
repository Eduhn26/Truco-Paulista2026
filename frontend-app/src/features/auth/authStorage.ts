import { normalizeBackendUrl } from '../../config/appConfig';

export type FrontendSessionUser = {
  id: string;
  provider: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

export type FrontendSession = {
  authToken: string;
  backendUrl: string;
  expiresIn: string | null;
  user: FrontendSessionUser | null;
};

const SESSION_STORAGE_KEY = 'truco-paulista:frontend-session';
const PENDING_AUTH_BACKEND_URL_KEY = 'truco-paulista:pending-auth-backend-url';

export function loadSession(): FrontendSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<FrontendSession>;

    if (typeof parsed.authToken !== 'string' || typeof parsed.backendUrl !== 'string') {
      return null;
    }

    return {
      authToken: parsed.authToken,
      backendUrl: normalizeBackendUrl(parsed.backendUrl),
      expiresIn: typeof parsed.expiresIn === 'string' ? parsed.expiresIn : null,
      user: normalizeUser(parsed.user),
    };
  } catch {
    return null;
  }
}

export function saveSession(session: FrontendSession): void {
  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      ...session,
      backendUrl: normalizeBackendUrl(session.backendUrl),
    }),
  );
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export function savePendingAuthBackendUrl(backendUrl: string): void {
  window.sessionStorage.setItem(
    PENDING_AUTH_BACKEND_URL_KEY,
    normalizeBackendUrl(backendUrl),
  );
}

export function loadPendingAuthBackendUrl(): string | null {
  const value = window.sessionStorage.getItem(PENDING_AUTH_BACKEND_URL_KEY);

  if (!value) {
    return null;
  }

  return normalizeBackendUrl(value);
}

export function clearPendingAuthBackendUrl(): void {
  window.sessionStorage.removeItem(PENDING_AUTH_BACKEND_URL_KEY);
}

function normalizeUser(value: unknown): FrontendSessionUser | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Partial<FrontendSessionUser>;

  if (typeof candidate.id !== 'string' || typeof candidate.provider !== 'string') {
    return null;
  }

  return {
    id: candidate.id,
    provider: candidate.provider,
    email: typeof candidate.email === 'string' ? candidate.email : null,
    displayName: typeof candidate.displayName === 'string' ? candidate.displayName : null,
    avatarUrl: typeof candidate.avatarUrl === 'string' ? candidate.avatarUrl : null,
  };
}
