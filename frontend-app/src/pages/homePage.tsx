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
  const googleLoginUrl = `${normalizedBackendUrl}/auth/google?frontendUrl=${encodeURIComponent(frontendUrl)}`;
  const githubLoginUrl = `${normalizedBackendUrl}/auth/github?frontendUrl=${encodeURIComponent(frontendUrl)}`;

  const appEnvironment = getAppEnvironment();
  const isLocalEnvironment = isLocalFrontendOrigin(frontendUrl);
  const allowManualBackendOverride = shouldAllowManualBackendOverride();

  function handleSaveBackendUrl(): void {
    setSession(
      buildNextSession(session, normalizedBackendUrl, session?.authToken ?? ''),
    );
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
  const displayName =
    session?.user?.displayName ?? session?.user?.email ?? 'Guest player';

  return (
    <section className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/75 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
        <div className="border-b border-white/10 bg-white/[0.03] px-6 py-5 lg:px-8">
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
            Product entry
          </div>

          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-tight text-white lg:text-5xl">
            Entre no lobby e jogue Truco Paulista com sessão autenticada.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 lg:text-base">
            O fluxo principal do frontend já parte de OAuth real. Esta home funciona
            como porta de entrada do produto: autenticação, acesso ao lobby e
            boundary explícita com o backend correto.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/lobby"
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Ir para lobby
            </Link>

            <a
              href={googleLoginUrl}
              onClick={handleOAuthStart}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Entrar com Google
            </a>

            <a
              href={githubLoginUrl}
              onClick={handleOAuthStart}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Entrar com GitHub
            </a>
          </div>
        </div>

        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-100">
                    Backend boundary
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Em produção, a API padrão deve vir do env. Em ambiente local,
                    o override manual continua disponível para desenvolvimento.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
                  {appEnvironment}
                </span>
              </div>

              <div className="mt-5 space-y-3">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Backend URL
                  </span>

                  <input
                    value={backendUrl}
                    onChange={(event) => setBackendUrl(event.target.value)}
                    disabled={!allowManualBackendOverride}
                    className="w-full rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-400/40 focus:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
                    placeholder="http://localhost:3000"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveBackendUrl}
                    disabled={!allowManualBackendOverride}
                    className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Save backend URL
                  </button>

                  <div className="text-xs text-slate-500">
                    Active boundary: {normalizedBackendUrl}
                  </div>
                </div>

                {!allowManualBackendOverride ? (
                  <p className="text-xs leading-6 text-amber-300">
                    NOTE: Production keeps the API boundary locked to
                    <span className="mx-1 font-semibold">{getDefaultBackendUrl()}</span>
                    from env to avoid hidden browser-only configuration.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div className="text-sm font-semibold text-slate-100">
                Manual auth token
              </div>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Dev-only escape hatch for transport validation without repeating the
                OAuth flow.
              </p>

              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <input
                  value={manualAuthToken}
                  onChange={(event) => setManualAuthToken(event.target.value)}
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-400/40 focus:bg-slate-950"
                  placeholder="Paste auth token"
                />

                <button
                  type="button"
                  onClick={handleSaveManualToken}
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                >
                  Save token
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isAuthenticated ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                Session
              </div>

              <div className="mt-3 text-lg font-semibold text-slate-100">
                {displayName}
              </div>

              <div className="mt-1 text-sm text-slate-400">
                {isAuthenticated
                  ? `Signed in via ${session?.user?.provider ?? 'session'}`
                  : 'Authentication required for real-time play'}
              </div>

              <div className="mt-4 grid gap-3 text-sm text-slate-300">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-slate-500">Frontend origin:</span> {frontendUrl}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-slate-500">Environment:</span> {appEnvironment}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-slate-500">Local frontend:</span>{' '}
                  {isLocalEnvironment ? 'yes' : 'no'}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="text-slate-500">Effective backend:</span>{' '}
                  {normalizedBackendUrl}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div className="text-sm font-semibold text-slate-100">Why this matters</div>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                OAuth leaves the SPA and comes back through the callback route. The
                frontend must persist the backend boundary that actually started the
                flow, otherwise production can accidentally treat the frontend origin
                as the API origin.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
