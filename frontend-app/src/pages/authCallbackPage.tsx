import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { getDefaultBackendUrl, resolveBackendUrl } from '../config/appConfig';
import {
  clearPendingAuthBackendUrl,
  loadPendingAuthBackendUrl,
} from '../features/auth/authStorage';
import { useAuth } from '../features/auth/authStore';

export function AuthCallbackPage() {
  const searchParams = new URLSearchParams(window.location.search);
  const { session, setSession } = useAuth();

  const payload = useMemo(() => {
    const authToken = searchParams.get('authToken');
    const expiresIn = searchParams.get('expiresIn');
    const provider = searchParams.get('provider');
    const userId = searchParams.get('userId');
    const email = searchParams.get('email');
    const displayName = searchParams.get('displayName');
    const avatarUrl = searchParams.get('avatarUrl');

    if (!authToken || !provider || !userId) {
      return null;
    }

    return {
      authToken,
      expiresIn,
      user: {
        id: userId,
        provider,
        email,
        displayName,
        avatarUrl,
      },
    };
  }, [searchParams]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    const pendingBackendUrl = loadPendingAuthBackendUrl();
    const resolvedBackendUrl = resolveBackendUrl(
      pendingBackendUrl,
      session?.backendUrl,
      getDefaultBackendUrl(),
    );

    setSession({
      backendUrl: resolvedBackendUrl,
      authToken: payload.authToken,
      expiresIn: payload.expiresIn,
      user: payload.user,
    });

    clearPendingAuthBackendUrl();

    // NOTE: OAuth callback comes from a full external redirect.
    // A hard redirect here is more reliable than client-side navigation
    // and avoids stale callback UI remaining mounted until a manual refresh.
    window.location.replace('/lobby');
  }, [payload, session?.backendUrl, setSession]);

  if (!payload) {
    return (
      <section className="mx-auto max-w-3xl">
        <div className="rounded-[28px] border border-red-500/20 bg-slate-900/75 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
          <div className="inline-flex rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-red-300">
            Callback error
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-white">
            OAuth callback payload is incomplete.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            The frontend expected at least <code>authToken</code>, <code>provider</code>{' '}
            and <code>userId</code> in the callback query string.
          </p>

          <div className="mt-6">
            <Link
              to="/"
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Back to home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl">
      <div className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-900/75 shadow-[0_20px_60px_rgba(15,23,42,0.35)]">
        <div className="border-b border-white/10 bg-white/[0.03] px-6 py-5 lg:px-8">
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">
            OAuth callback
          </div>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-white lg:text-4xl">
            Finalizando autenticação com boundary consistente.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            A sessão está sendo persistida com a URL de backend que realmente iniciou
            o fluxo OAuth, evitando drift entre frontend origin e API origin.
          </p>
        </div>

        <div className="grid gap-5 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm font-semibold text-slate-100">Authenticated player</div>

            <div className="mt-3 text-xl font-semibold text-white">
              {payload.user.displayName ?? payload.user.email ?? 'Authenticated player'}
            </div>

            <div className="mt-4 grid gap-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                <span className="text-slate-500">Provider:</span> {payload.user.provider}
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                <span className="text-slate-500">User ID:</span> {payload.user.id}
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3">
                <span className="text-slate-500">Expires in:</span>{' '}
                {payload.expiresIn ?? '-'}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-slate-950/60 p-5">
            <div className="text-sm font-semibold text-slate-100">Next step</div>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              The browser session is being persisted locally with the backend URL that
              actually started the OAuth flow.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
