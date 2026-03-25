import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setSession } = useAuth();

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

    setSession({
      backendUrl: window.location.origin === 'http://localhost:5173'
        ? 'http://localhost:3000'
        : window.location.origin,
      authToken: payload.authToken,
      expiresIn: payload.expiresIn,
      user: payload.user,
    });

    navigate('/lobby', { replace: true });
  }, [navigate, payload, setSession]);

  if (!payload) {
    return (
      <section className="mx-auto max-w-2xl rounded-3xl border border-rose-500/20 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-300">
          Auth callback error
        </p>

        <h1 className="mt-3 text-2xl font-black tracking-tight">
          Missing OAuth callback payload
        </h1>

        <p className="mt-3 text-sm leading-6 text-slate-300">
          O frontend não recebeu <code>authToken</code>, <code>provider</code> e
          <code>userId</code> na URL de callback.
        </p>

        <div className="mt-6">
          <Link
            to="/"
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Voltar para Home
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-white/10 bg-slate-900/70 p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
        Auth callback
      </p>

      <h1 className="mt-3 text-2xl font-black tracking-tight">
        Finalizando sessão…
      </h1>

      <p className="mt-3 text-sm leading-6 text-slate-300">
        O frontend recebeu a sessão autenticada e está redirecionando para o lobby.
      </p>
    </section>
  );
}