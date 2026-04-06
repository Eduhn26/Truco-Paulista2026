import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  getAppEnvironment,
  getFrontendOrigin,
  isLocalFrontendOrigin,
  normalizeBackendUrl,
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
    normalizeBackendUrl(session?.backendUrl),
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
            O fluxo principal do frontend já parte de OAuth real. Esta home agora funciona como
            porta de entrada do produto: autenticação, acesso ao lobby e configuração mínima da
            boundary com o backend.
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
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Entrar com Google
            </a>

            <a
              href={githubLoginUrl}
              onClick={handleOAuthStart}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Entrar com GitHub
            </a>
          </div>
        </div>

        <div className="grid gap-4 px-6 py-6 lg:grid-cols-[1fr_1fr] lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              Flow status
            </div>

            {session?.user ? (
              <div className="mt-4">
                <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-300">
                  Authenticated session
                </div>

                <div className="mt-4 text-lg font-bold text-slate-100">
                  {session.user.displayName ?? session.user.email ?? 'Authenticated user'}
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span className="text-slate-500">Provider:</span> {session.user.provider}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span className="text-slate-500">User ID:</span> {session.user.id}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span className="text-slate-500">Email:</span> {session.user.email ?? '-'}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span className="text-slate-500">Expires in:</span> {session.expiresIn ?? '-'}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                    <span className="text-slate-500">Backend URL:</span> {session.backendUrl}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-3xl border border-amber-400/20 bg-amber-500/10 p-5 text-sm leading-6 text-amber-100">
                No authenticated user yet. Use Google or GitHub login to create the session before
                entering real-time play.
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
              What is ready
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                OAuth now preserves the backend boundary before leaving the SPA.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                The callback can restore the intended API origin without guessing from the frontend
                host.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                The lobby already supports authenticated real-time connection.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                Match view hydrates from socket state and snapshot recovery.
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <section className="rounded-[28px] border border-white/10 bg-slate-900/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black tracking-tight text-white">Session settings</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Keep the backend boundary explicit while the visual layer evolves.
              </p>
            </div>

            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {appEnvironment}
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            <div className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Backend URL</div>
                <div className="mt-1 text-xs text-slate-400">
                  Use an explicit backend boundary. Production should come from env, while local
                  development may still override it here when needed.
                </div>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="text-slate-400">Backend URL</span>
                <input
                  value={backendUrl}
                  onChange={(event) => setBackendUrl(event.target.value)}
                  className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400/40"
                  placeholder="http://localhost:3000"
                />
              </label>

              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
                Frontend origin: <span className="text-slate-200">{frontendUrl}</span>
              </div>

              <button
                type="button"
                onClick={handleSaveBackendUrl}
                className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
              >
                Save backend URL
              </button>
            </div>

            <div className="grid gap-4 rounded-3xl border border-dashed border-white/10 bg-slate-950/60 p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Manual token fallback</div>
                <div className="mt-1 text-xs text-slate-400">
                  Keep this only for development and diagnostics. OAuth remains the default product
                  flow.
                </div>
              </div>

              <label className="grid gap-2 text-sm">
                <span className="text-slate-400">Auth token</span>
                <textarea
                  value={manualAuthToken}
                  onChange={(event) => setManualAuthToken(event.target.value)}
                  className="min-h-28 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400/40"
                  placeholder="Fallback only: paste a token manually if needed."
                />
              </label>

              <button
                type="button"
                onClick={handleSaveManualToken}
                className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
              >
                Save manual token
              </button>

              {!isLocalEnvironment ? (
                <div className="rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-100">
                  Production should not depend on manual token pasting or hidden browser
                  reconfiguration. This fallback exists only to keep local diagnostics practical.
                </div>
              ) : null}
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
