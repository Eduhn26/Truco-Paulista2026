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
  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Guest player';

  return (
    <section className="grid gap-8 xl:grid-cols-[1.18fr_0.82fr]">
      <div className="overflow-hidden rounded-[36px] border border-white/10 bg-slate-900/85 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_42%)] px-8 py-8 lg:px-10 lg:py-10">
          <div className="max-w-4xl">
            <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
              Product entry
            </div>

            <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight text-white lg:text-5xl">
              Entre no lobby e jogue Truco Paulista com sessão autenticada.
            </h1>

            <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
              O fluxo principal do frontend já parte de OAuth real. Esta home
              funciona como a entrada oficial do produto: autenticação, acesso ao
              lobby e boundary explícita com o backend correto.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/lobby"
                className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
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
        </div>

        <div className="grid gap-8 px-8 py-8 lg:px-10 lg:py-10 xl:grid-cols-[1.06fr_0.94fr]">
          <div className="grid gap-6">
            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">
                    Backend boundary
                  </div>
                  <p className="mt-2 max-w-xl text-sm leading-7 text-slate-400">
                    Em produção, a API padrão deve vir do env. Em ambiente local,
                    o override manual continua disponível para desenvolvimento e
                    troubleshooting sem quebrar a boundary oficial do produto.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
                  {appEnvironment}
                </span>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Backend URL
                  </span>

                  <input
                    value={backendUrl}
                    onChange={(event) => setBackendUrl(event.target.value)}
                    disabled={!allowManualBackendOverride}
                    className="w-full rounded-3xl border border-white/10 bg-slate-950/80 px-5 py-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-400/40 focus:bg-slate-950 disabled:cursor-not-allowed disabled:opacity-70"
                    placeholder="http://localhost:3000"
                  />
                </label>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveBackendUrl}
                    disabled={!allowManualBackendOverride}
                    className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    Save backend URL
                  </button>

                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-400">
                    Active boundary: {normalizedBackendUrl}
                  </div>
                </div>

                {!allowManualBackendOverride ? (
                  <p className="rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-200">
                    NOTE: Production keeps the API boundary locked to
                    <span className="mx-1 font-semibold">{getDefaultBackendUrl()}</span>
                    from env to avoid hidden browser-only configuration.
                  </p>
                ) : null}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div>
                <div className="text-lg font-black tracking-tight text-slate-100">
                  Manual auth token
                </div>
                <p className="mt-2 max-w-xl text-sm leading-7 text-slate-400">
                  Escape hatch de desenvolvimento para validar transporte e sessão
                  sem repetir o fluxo OAuth inteiro quando isso não for o foco do
                  teste.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <input
                  value={manualAuthToken}
                  onChange={(event) => setManualAuthToken(event.target.value)}
                  className="min-w-0 flex-1 rounded-3xl border border-white/10 bg-slate-950/80 px-5 py-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-400/40 focus:bg-slate-950"
                  placeholder="Paste auth token"
                />

                <button
                  type="button"
                  onClick={handleSaveManualToken}
                  className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                >
                  Save token
                </button>
              </div>
            </section>
          </div>

          <div className="grid gap-6">
            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isAuthenticated ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                Session status
              </div>

              <div className="mt-4 text-2xl font-black tracking-tight text-slate-100">
                {displayName}
              </div>

              <div className="mt-2 text-sm leading-7 text-slate-400">
                {isAuthenticated
                  ? `Signed in via ${session?.user?.provider ?? 'session'}`
                  : 'Authentication required for real-time play'}
              </div>

              <div className="mt-6 grid gap-3 text-sm text-slate-300">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <span className="text-slate-500">Frontend origin:</span> {frontendUrl}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <span className="text-slate-500">Environment:</span> {appEnvironment}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <span className="text-slate-500">Local frontend:</span>{' '}
                  {isLocalEnvironment ? 'yes' : 'no'}
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <span className="text-slate-500">Effective backend:</span>{' '}
                  {normalizedBackendUrl}
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div className="text-lg font-black tracking-tight text-slate-100">
                Why this matters
              </div>

              <p className="mt-3 text-sm leading-7 text-slate-400">
                OAuth sai da SPA e retorna pela callback route. O frontend precisa
                persistir a boundary do backend que realmente iniciou o fluxo;
                caso contrário, produção pode acidentalmente tratar a origem do
                frontend como se fosse a origem da API.
              </p>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}
