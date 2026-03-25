import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';

export function HomePage() {
  const { session, setSession } = useAuth();

  const [backendUrl, setBackendUrl] = useState(session?.backendUrl ?? 'http://localhost:3000');
  const [authToken, setAuthToken] = useState(session?.authToken ?? '');

  function handleSaveSession(): void {
    setSession({
      backendUrl,
      authToken,
    });
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Phase 10.B.1
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight">
          Bootstrap do frontend jogável
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
          Esta etapa sobe a casca inicial do app React e separa auth/session,
          routing e socket client. A regra continua a mesma: o backend permanece
          autoritativo e o client só coordena interface e eventos.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/lobby"
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Ir para lobby
          </Link>

          <a
            href={`${backendUrl.replace(/\/+$/, '')}/auth/google`}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
          >
            Entrar com Google
          </a>

          <a
            href={`${backendUrl.replace(/\/+$/, '')}/auth/github`}
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
          >
            Entrar com GitHub
          </a>
        </div>
      </div>

      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <h2 className="text-lg font-bold">Session bootstrap</h2>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="text-slate-400">Backend URL</span>
            <input
              value={backendUrl}
              onChange={(event) => setBackendUrl(event.target.value)}
              className="rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400/40"
              placeholder="http://localhost:3000"
            />
          </label>

          <label className="grid gap-2 text-sm">
            <span className="text-slate-400">Auth token</span>
            <textarea
              value={authToken}
              onChange={(event) => setAuthToken(event.target.value)}
              className="min-h-32 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-slate-100 outline-none transition focus:border-emerald-400/40"
              placeholder="Cole aqui o authToken emitido pelo backend."
            />
          </label>

          <button
            type="button"
            onClick={handleSaveSession}
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Save session
          </button>
        </div>
      </div>
    </section>
  );
}