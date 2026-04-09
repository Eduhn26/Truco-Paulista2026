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

    return { authToken, expiresIn, user: { id: userId, provider, email, displayName, avatarUrl } };
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

    // NOTE: Hard redirect after OAuth is more reliable than client-side navigation
    // since it avoids any stale SPA state from before the external round-trip.
    window.location.replace('/lobby');
  }, [payload, session?.backendUrl, setSession]);

  if (!payload) {
    return (
      <section className="mx-auto flex max-w-md flex-col items-center py-20 text-center">
        <div
          className="rounded-2xl p-8 w-full"
          style={{
            background: 'rgba(15,25,35,0.8)',
            border: '1px solid rgba(192,57,43,0.25)',
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[2px]" style={{ color: '#e74c3c' }}>
            Erro no callback
          </div>
          <h1 className="mt-3 text-xl font-black text-white">
            Payload de autenticação incompleto.
          </h1>
          <p className="mt-3 text-sm leading-6" style={{ color: 'rgba(255,255,255,0.4)' }}>
            O frontend esperava <code>authToken</code>, <code>provider</code> e <code>userId</code> na query string.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-900 transition"
              style={{ background: '#c9a84c' }}
            >
              Voltar para home
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // NOTE: This view is shown briefly before window.location.replace('/lobby') fires.
  // Design goal: communicate progress clearly without blocking or looking like an error.
  return (
    <section className="mx-auto flex max-w-sm flex-col items-center py-20 text-center gap-6">
      {/* Spinner with TP mark */}
      <div className="relative">
        <div
          className="h-16 w-16 rounded-full border-[3px] border-t-transparent animate-spin"
          style={{ borderColor: 'rgba(201,168,76,0.2)', borderTopColor: '#c9a84c' }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center text-sm font-black"
          style={{ color: '#c9a84c', fontFamily: 'Georgia, serif' }}
        >
          TP
        </div>
      </div>

      <div>
        <div className="text-lg font-black text-white">Autenticando…</div>
        <div className="mt-1 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          {payload.user.displayName ?? payload.user.email ?? 'Jogador'}
        </div>
      </div>

      {/* Step indicators */}
      <div
        className="w-full rounded-2xl p-4 text-left"
        style={{
          background: 'rgba(15,25,35,0.7)',
          border: '1px solid rgba(201,168,76,0.12)',
        }}
      >
        <Step done label="Token OAuth verificado" />
        <Step done label={`Provedor: ${payload.user.provider}`} />
        <Step active label="Persistindo sessão…" />
        <Step label="Redirecionando ao lobby" />
      </div>
    </section>
  );
}

function Step({ label, done = false, active = false }: { label: string; done?: boolean; active?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div
        className="h-2 w-2 flex-shrink-0 rounded-full transition-all"
        style={{
          background: done
            ? '#3d8a6a'
            : active
              ? '#c9a84c'
              : 'rgba(255,255,255,0.1)',
          boxShadow: active ? '0 0 8px rgba(201,168,76,0.4)' : 'none',
        }}
      />
      <span
        className="text-[12px]"
        style={{
          color: done
            ? 'rgba(255,255,255,0.5)'
            : active
              ? 'rgba(255,255,255,0.85)'
              : 'rgba(255,255,255,0.2)',
        }}
      >
        {label}
      </span>
    </div>
  );
}
