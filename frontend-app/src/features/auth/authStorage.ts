export type FrontendSession = {
  authToken: string;
  backendUrl: string;
};

const SESSION_STORAGE_KEY = 'truco-paulista:frontend-session';

export function loadSession(): FrontendSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<FrontendSession>;

    if (!parsed.authToken || !parsed.backendUrl) {
      return null;
    }

    return {
      authToken: parsed.authToken,
      backendUrl: parsed.backendUrl,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: FrontendSession): void {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}