import { createContext, useContext, useMemo, useState, type PropsWithChildren } from 'react';

import {
  clearStoredSession,
  loadSession,
  saveSession,
  type FrontendSession,
} from './authStorage';

type AuthContextValue = {
  session: FrontendSession | null;
  setSession: (session: FrontendSession) => void;
  clearSession: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const DEFAULT_BACKEND_URL = 'http://localhost:3000';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSessionState] = useState<FrontendSession | null>(() => loadSession());

  function setSession(nextSession: FrontendSession): void {
    saveSession(nextSession);
    setSessionState(nextSession);
  }

  function clearSession(): void {
    clearStoredSession();
    setSessionState(null);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      session:
        session ??
        {
          authToken: '',
          backendUrl: DEFAULT_BACKEND_URL,
        },
      setSession,
      clearSession,
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error('useAuth must be used within AuthProvider.');
  }

  return value;
}