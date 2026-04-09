import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  getAppEnvironment,
  getDefaultBackendUrl,
  getFrontendOrigin,
  isLocalFrontendOrigin,
  normalizeBackendUrl,
  shouldAllowManualBackendOverride,
} from '../config/appConfig';
import {
  savePendingAuthBackendUrl,
  type FrontendSession,
} from '../features/auth/authStorage';
import { useAuth } from '../features/auth/authStore';

function buildNextSession(
  session: FrontendSession | null,
  backendUrl: string,
  authToken: string,
): FrontendSession {
  return {
    backendUrl,
    authToken,
    expiresIn: session?.expiresIn ?? null,
    user: session?.user ?? null,
  };
}

export function HomePage() {
  const { session, setSession } = useAuth();

  const [backendUrl, setBackendUrl] = useState(() =>
    normalizeBackendUrl(session?.backendUrl ?? getDefaultBackendUrl()),
  );
  const [manualAuthToken, setManualAuthToken] = useState('');

  const normalizedBackendUrl = useMemo(
    () => normalizeBackendUrl(backendUrl),
    [backendUrl],
  );

  const frontendUrl = getFrontendOrigin();

  // NOTE: Parse only the safe origin to prevent path/protocol injection in OAuth URLs.
  const safeBackendOrigin = useMemo(() => {
    try {
      const parsed = new URL(normalizedBackendUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Not a valid URL
    }
    return '';
  }, [normalizedBackendUrl]);

  const googleLoginUrl = safeBackendOrigin
    ? `${safeBackendOrigin}/auth/google?frontendUrl=${encodeURIComponent(frontendUrl)}`
    : '';
  const githubLoginUrl = safeBackendOrigin
    ? `${safeBackendOrigin}/auth/github?frontendUrl=${encodeURIComponent(frontendUrl)}`
    : '';

  const appEnvironment = getAppEnvironment();
  const isLocalEnvironment = isLocalFrontendOrigin(frontendUrl);
  const allowManualBackendOverride = shouldAllowManualBackendOverride();

  function handleSaveBackendUrl(): void {
    setSession(buildNextSession(session, normalizedBackendUrl, session?.authToken ?? ''));
  }

  function handleSaveManualToken(): void {
    const normalizedToken = manualAuthToken.trim();
    if (!normalizedToken) return;
    setSession(buildNextSession(session, normalizedBackendUrl, normalizedToken));
  }

  function handleOAuthStart(): void {
    // NOTE: Persist the chosen backend boundary before the OAuth redirect
    // so the callback page can restore the correct API origin.
    savePendingAuthBackendUrl(normalizedBackendUrl);
  }

  const isAuthenticated = Boolean(session?.authToken);
  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Jogador';

  return (
    <section className="mx-auto grid max-w-5xl gap-8">
      {/* ── HERO ENTRY ── */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          background: 'radial-gradient(ellipse 100% 80% at 50% 0%, rgba(201,168,76,0.1) 0%, rgba(8,12,16,0.95) 55%), rgba(8,12,16,0.95)',
          border: '1px solid rgba(201,168,76,0.2)',
          boxShadow: '0 0 60px rgba(201,168,76,0.06), 0 32px 80px rgba(0,0,0,0.5)',
        }}
      >
        {/* Decorative corner cards */}
        <div className="pointer-events-none absolute left-4 top-4 rotate-[-18deg] opacity-30">
          <DecorativeCard rank="A" suitChar="♣" isRed={false} />
        </div>
        <div className="pointer-events-none absolute right-4 top-2 rotate-[14deg] opacity-25">
          <DecorativeCard rank="3" suitChar="♠" isRed={false} />
        </div>
        <div className="pointer-events-none absolute bottom-4 left-8 rotate-[12deg] opacity-20">
          <DecorativeCard rank="7" suitChar="♦" isRed />
        </div>
        <div className="pointer-events-none absolute bottom-6 right-6 rotate-[-14deg] opacity-25">
          <DecorativeCard rank="2" suitChar="♥" isRed />
        </div>

        {/* Hero content */}
        <div className="relative px-8 py-12 text-center">
          {/* Logo mark */}
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-black"
            style={{
              background: 'rgba(201,168,76,0.12)',
              border: '2px solid rgba(201,168,76,0.45)',
              boxShadow: '0 0 28px rgba(201,168,76,0.2)',
              color: '#c9a84c',
              fontFamily: 'Georgia, serif',
            }}
          >
            TP
          </div>

          <h1
            className="text-4xl font-black leading-none tracking-tight text-white lg:text-5xl"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            Truco Paulista
          </h1>
          <p className="mt-3 text-base" style={{ color: 'rgba(201,168,76,0.6)' }}>
            O Duelo Paulista no seu Navegador
          </p>

          {/* Auth buttons */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={googleLoginUrl || undefined}
              onClick={googleLoginUrl ? handleOAuthStart : (e) => e.preventDefault()}
              aria-disabled={!googleLoginUrl}
              tabIndex={googleLoginUrl ? 0 : -1}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-bold transition sm:w-auto"
              style={{
                background: 'rgba(201,168,76,0.12)',
                border: '1px solid rgba(201,168,76,0.4)',
                color: '#c9a84c',
                boxShadow: '0 0 16px rgba(201,168,76,0.1)',
                opacity: googleLoginUrl ? 1 : 0.5,
                cursor: googleLoginUrl ? 'pointer' : 'not-allowed',
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Entrar com Google
            </a>

            <a
              href={githubLoginUrl || undefined}
              onClick={githubLoginUrl ? handleOAuthStart : (e) => e.preventDefault()}
              aria-disabled={!githubLoginUrl}
              tabIndex={githubLoginUrl ? 0 : -1}
              className="flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-bold transition sm:w-auto"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.8)',
                opacity: githubLoginUrl ? 1 : 0.5,
                cursor: githubLoginUrl ? 'pointer' : 'not-allowed',
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Entrar com GitHub
            </a>
          </div>

          {isAuthenticated && (
            <div className="mt-5 flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: '#3d8a6a' }} />
              <span className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Autenticado como{' '}
                <span className="font-semibold text-white">{displayName}</span>
              </span>
              <Link to="/lobby" className="ml-3 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[1.5px] transition" style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', color: '#c9a84c' }}>
                Ir ao lobby →
              </Link>
            </div>
          )}

          {!isAuthenticated && (
            <div className="mt-4">
              <Link to="/lobby" className="text-xs transition" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Ir direto para o lobby →
              </Link>
            </div>
          )}

          {/* Feature badges */}
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {['1v1', '2v2', 'Matchmaking', 'Ranking ELO', 'Truco Paulista'].map((badge) => (
              <span
                key={badge}
                className="rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[1.5px]"
                style={{
                  background: 'rgba(201,168,76,0.07)',
                  border: '1px solid rgba(201,168,76,0.15)',
                  color: 'rgba(201,168,76,0.55)',
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── DEV TOOLS — minimal, below the fold ── */}
      <div
        className="grid gap-5 rounded-2xl px-6 py-5 lg:grid-cols-2"
        style={{
          background: 'rgba(15,25,35,0.6)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Backend URL */}
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="text-xs font-bold uppercase tracking-[1.5px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Backend URL
            </div>
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[1.5px]" style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }}>
              {appEnvironment}
            </span>
          </div>

          <input
            value={backendUrl}
            onChange={(event) => setBackendUrl(event.target.value)}
            disabled={!allowManualBackendOverride}
            className="w-full rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none transition"
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
            placeholder="http://localhost:3000"
          />

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveBackendUrl}
              disabled={!allowManualBackendOverride}
              className="rounded-xl px-3 py-1.5 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.25)',
                color: '#c9a84c',
              }}
            >
              Salvar URL
            </button>
            <span className="truncate text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
              {normalizedBackendUrl}
            </span>
          </div>
        </section>

        {/* Manual token */}
        <section>
          <div className="mb-3 text-xs font-bold uppercase tracking-[1.5px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Token manual
          </div>
          <div className="flex gap-2">
            <input
              value={manualAuthToken}
              onChange={(event) => setManualAuthToken(event.target.value)}
              className="min-w-0 flex-1 rounded-xl px-4 py-2.5 text-sm text-slate-100 outline-none transition"
              style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
              placeholder="Cole o token JWT"
            />
            <button
              type="button"
              onClick={handleSaveManualToken}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold transition"
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              OK
            </button>
          </div>

          {isAuthenticated && (
            <div className="mt-2 flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#3d8a6a' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {displayName} · {frontendUrl}
              </span>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function DecorativeCard({ rank, suitChar, isRed }: { rank: string; suitChar: string; isRed: boolean }) {
  return (
    <div
      className="flex flex-col justify-between rounded-lg px-1.5 py-2"
      style={{
        width: '42px',
        height: '60px',
        background: 'linear-gradient(160deg, #fffdf5, #f5edd8)',
        border: '1px solid rgba(255,255,255,0.3)',
        boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
      }}
    >
      <span className="text-xs font-black leading-none" style={{ color: isRed ? '#c0392b' : '#1a1a1a' }}>{rank}</span>
      <span className="self-center text-base leading-none" style={{ color: isRed ? '#c0392b' : '#1a1a1a' }}>{suitChar}</span>
      <span className="self-end rotate-180 text-xs font-black leading-none" style={{ color: isRed ? '#c0392b' : '#1a1a1a' }}>{rank}</span>
    </div>
  );
}
