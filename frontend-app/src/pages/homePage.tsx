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
    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Phase 10.B.3
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight">
          Sessão autenticada como fonte do client
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          O fluxo principal agora é OAuth real. O token manual continua só como fallback
          de desenvolvimento, e o frontend passa a trabalhar em torno da sessão já salva.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/lobby"
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Ir para lobby
          </Link>

          <a
            href={googleLoginUrl}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
          >
            Entrar com Google
          </a>

          <a
            href={githubLoginUrl}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
          >
            Entrar com GitHub
          </a>
        </div>

        {session?.user ? (
          <div className="mt-6 rounded-2xl border border-emerald-400/15 bg-emerald-500/5 p-4">
            <div className="text-sm font-bold text-emerald-300">Authenticated user</div>

            <div className="mt-3 grid gap-1 text-sm text-slate-200">
              <div>
                <span className="text-slate-400">id:</span> {session.user.id}
              </div>
              <div>
                <span className="text-slate-400">provider:</span> {session.user.provider}
              </div>
              <div>
                <span className="text-slate-400">displayName:</span> {session.user.displayName ?? '-'}
              </div>
              <div>
                <span className="text-slate-400">email:</span> {session.user.email ?? '-'}
              </div>
              <div>
                <span className="text-slate-400">expiresIn:</span> {session.expiresIn ?? '-'}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4 text-sm text-amber-200">
            No authenticated user yet. Use Google or GitHub login to create the session automatically.
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <h2 className="text-lg font-bold">Session settings</h2>

        <div className="mt-5 grid gap-5">
          <div className="grid gap-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
            <div>
              <div className="text-sm font-semibold text-slate-100">Backend URL</div>
              <div className="mt-1 text-xs text-slate-400">
                Keep this configurable because the frontend still depends on the backend boundary.
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

          <div className="grid gap-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/40 p-4">
            <div>
              <div className="text-sm font-semibold text-slate-100">Manual token fallback</div>
              <div className="mt-1 text-xs text-slate-400">
                Use only for development or diagnostics. OAuth is the default flow now.
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
      </div>
    </section>
  );
}