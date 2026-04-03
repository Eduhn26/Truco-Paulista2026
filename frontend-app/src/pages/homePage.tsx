import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';

export function HomePage() {
  const { session, setSession } = useAuth();

  const [backendUrl, setBackendUrl] = useState(session?.backendUrl ?? 'http://localhost:3000');
  const [manualAuthToken, setManualAuthToken] = useState('');

  const normalizedBackendUrl = useMemo(
    () => backendUrl.trim().replace(/\/+$/, '') || 'http://localhost:3000',
    [backendUrl],
  );

  const frontendUrl = window.location.origin;
  const googleLoginUrl = `${normalizedBackendUrl}/auth/google?frontendUrl=${encodeURIComponent(frontendUrl)}`;
  const githubLoginUrl = `${normalizedBackendUrl}/auth/github?frontendUrl=${encodeURIComponent(frontendUrl)}`;

  function handleSaveBackendUrl(): void {
    setSession({
      backendUrl: normalizedBackendUrl,
      authToken: session?.authToken ?? '',
      expiresIn: session?.expiresIn ?? null,
      user: session?.user ?? null,
    });
  }

  function handleSaveManualToken(): void {
    const normalizedToken = manualAuthToken.trim();

    if (!normalizedToken) {
      return;
    }

    setSession({
      backendUrl: normalizedBackendUrl,
      authToken: normalizedToken,
      expiresIn: session?.expiresIn ?? null,
      user: session?.user ?? null,
    });
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
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Entrar com Google
            </a>

            <a
              href={githubLoginUrl}
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
                Auth callback persists the browser session.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                The lobby already supports authenticated real-time connection.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                Match view hydrates from socket state and snapshot recovery.
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
                Phase 17 now focuses on presentation, hierarchy and polish.
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
              Foundation
            </div>
          </div>

          <div className="mt-6 grid gap-5">
            <div className="grid gap-4 rounded-3xl border border-white/10 bg-slate-950/60 p-5">
              <div>
                <div className="text-sm font-semibold text-slate-100">Backend URL</div>
                <div className="mt-1 text-xs text-slate-400">
                  This remains configurable because the frontend still depends on the backend
                  boundary for auth and multiplayer orchestration.
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
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}