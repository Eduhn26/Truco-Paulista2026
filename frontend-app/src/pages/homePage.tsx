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

  // Derive a safe origin-only URL for OAuth links, preventing protocol injection.
  // We use only the parsed `origin` (scheme + host + port) — never the user's raw string —
  // so path manipulation and non-http(s) protocols are rejected at construction time.
  const safeBackendOrigin = useMemo(() => {
    try {
      const parsed = new URL(normalizedBackendUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin; // guaranteed scheme://host:port with no user-supplied path
      }
    } catch {
      // Not a valid URL — return empty string to disable the links
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

    if (!normalizedToken) {
      return;
    }

    setSession(buildNextSession(session, normalizedBackendUrl, normalizedToken));
  }

  function handleOAuthStart(): void {
    // NOTE: OAuth leaves the SPA entirely. Persisting the chosen backend boundary
    // before the redirect prevents the callback from guessing the API origin later.
    savePendingAuthBackendUrl(normalizedBackendUrl);
  }

  const isAuthenticated = Boolean(session?.authToken);
  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Convidado';

  return (
    <section className="mx-auto grid max-w-5xl gap-8">
      {/* ── Casino hero / login card ── */}
      <div className="overflow-hidden rounded-2xl border border-amber-400/20 bg-slate-900/90 shadow-[0_0_60px_rgba(201,168,76,0.08),0_28px_80px_rgba(2,6,23,0.55)]">
        {/* Header gradient */}
        <div className="border-b border-amber-400/15 bg-[radial-gradient(circle_at_top,rgba(201,168,76,0.12),transparent_55%)] px-8 py-10 text-center">
          {/* TP logo */}
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-amber-400/50 bg-amber-500/15 text-3xl font-black text-amber-300 shadow-[0_0_32px_rgba(201,168,76,0.25)]">
            TP
          </div>

          <h1 className="text-3xl font-black tracking-tight text-white lg:text-4xl">
            Truco Paulista
          </h1>
          <p className="mt-2 text-sm text-slate-400">O Duelo Paulista no seu Navegador</p>

          {/* OAuth buttons */}
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href={googleLoginUrl || undefined}
              onClick={googleLoginUrl ? handleOAuthStart : (e) => e.preventDefault()}
              aria-disabled={!googleLoginUrl}
              tabIndex={googleLoginUrl ? 0 : -1}
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-6 py-3.5 text-sm font-bold text-amber-200 shadow-[0_0_18px_rgba(201,168,76,0.12)] transition hover:border-amber-400/60 hover:bg-amber-500/25 hover:text-amber-100 sm:w-auto ${!googleLoginUrl ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Entrar com Google
            </a>

            <a
              href={githubLoginUrl || undefined}
              onClick={githubLoginUrl ? handleOAuthStart : (e) => e.preventDefault()}
              aria-disabled={!githubLoginUrl}
              tabIndex={githubLoginUrl ? 0 : -1}
              className={`flex w-full items-center justify-center gap-2.5 rounded-xl border border-amber-400/40 bg-amber-500/15 px-6 py-3.5 text-sm font-bold text-amber-200 shadow-[0_0_18px_rgba(201,168,76,0.12)] transition hover:border-amber-400/60 hover:bg-amber-500/25 hover:text-amber-100 sm:w-auto ${!githubLoginUrl ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
              </svg>
              Entrar com GitHub
            </a>
          </div>

          <div className="mt-6">
            <Link
              to="/lobby"
              className="text-xs text-slate-500 transition hover:text-amber-300"
            >
              Ir direto para o lobby →
            </Link>
          </div>
        </div>

        {/* ── Developer tools section ── */}
        <div className="grid gap-6 px-8 py-8 lg:grid-cols-2">
          {/* Backend boundary */}
          <section className="rounded-xl border border-white/10 bg-slate-950/50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-bold text-slate-200">Backend URL</div>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                {appEnvironment}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              <input
                value={backendUrl}
                onChange={(event) => setBackendUrl(event.target.value)}
                disabled={!allowManualBackendOverride}
                className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-amber-400/40 disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="http://localhost:3000"
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveBackendUrl}
                  disabled={!allowManualBackendOverride}
                  className="rounded-xl border border-amber-400/30 bg-amber-500/12 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Salvar URL
                </button>
                <span className="truncate text-xs text-slate-500">{normalizedBackendUrl}</span>
              </div>

              {!allowManualBackendOverride ? (
                <p className="rounded-lg border border-amber-400/15 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
                  Produção: API locked em{' '}
                  <span className="font-semibold">{getDefaultBackendUrl()}</span>
                </p>
              ) : null}
            </div>
          </section>

          {/* Manual auth token */}
          <section className="rounded-xl border border-white/10 bg-slate-950/50 p-5">
            <div className="text-sm font-bold text-slate-200">Token manual</div>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Escape hatch para dev sem repetir o fluxo OAuth.
            </p>

            <div className="mt-4 flex gap-2">
              <input
                value={manualAuthToken}
                onChange={(event) => setManualAuthToken(event.target.value)}
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-amber-400/40"
                placeholder="Cole o token JWT"
              />
              <button
                type="button"
                onClick={handleSaveManualToken}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-amber-400/20 hover:bg-amber-500/10 hover:text-amber-200"
              >
                OK
              </button>
            </div>

            {/* Session info */}
            <div className="mt-5 flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${isAuthenticated ? 'bg-green-400' : 'bg-amber-400'}`}
              />
              <span className="text-xs text-slate-400">
                {isAuthenticated
                  ? `Autenticado como ${displayName}`
                  : 'Sem sessão ativa'}
              </span>
            </div>

            <div className="mt-3 grid gap-1.5 text-xs text-slate-500">
              <div>
                <span className="text-slate-600">Origem:</span> {frontendUrl}
              </div>
              <div>
                <span className="text-slate-600">Local:</span>{' '}
                {isLocalEnvironment ? 'sim' : 'não'}
              </div>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
