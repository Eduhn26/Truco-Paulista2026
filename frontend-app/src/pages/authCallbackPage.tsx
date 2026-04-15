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
    window.location.replace('/lobby');
  }, [payload, session?.backendUrl, setSession]);

  if (!payload) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050810] p-4">
        <div className="gold-frame p-12 text-center max-w-md w-full">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-red-400 mb-4">Erro no Callback</div>
          <h1 className="text-2xl font-black text-white mb-4">Falha na Autenticação</h1>
          <p className="text-slate-400 text-sm mb-8">
            O frontend esperava <code className="bg-slate-800 px-1 py-0.5 rounded text-red-300">authToken</code>, <code className="bg-slate-800 px-1 py-0.5 rounded text-red-300">provider</code> e <code className="bg-slate-800 px-1 py-0.5 rounded text-red-300">userId</code> na URL.
          </p>
          <Link
            to="/"
            className="inline-block px-6 py-3 bg-amber-600 hover:bg-amber-500 text-slate-900 font-bold rounded-xl transition-colors"
          >
            Voltar para Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050810] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(201,168,76,0.1),transparent_60%)]" />
      
      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="gold-frame p-8 sm:p-10 text-center relative overflow-hidden">
          {/* Animated Golden Smoke/Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/20 blur-3xl rounded-full animate-pulse" />

          {/* Spinner */}
          <div className="relative mx-auto w-20 h-20 mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-slate-800" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-amber-400 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xl font-black text-gradient-gold" style={{ fontFamily: 'Georgia, serif' }}>TP</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-black text-white mb-2">Autenticando...</h1>
          <p className="text-amber-200/60 text-sm mb-8 font-medium">{payload.user.displayName ?? payload.user.email ?? 'Jogador'}</p>

          {/* Steps */}
          <div className="text-left space-y-4">
            <StepItem status="success" label="Token OAuth verificado" />
            <StepItem status="success" label={`Provedor: ${payload.user.provider}`} />
            <StepItem status="loading" label="Persistindo sessão..." />
            <StepItem status="pending" label="Redirecionando ao lobby" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepItem({ status, label }: { status: 'success' | 'loading' | 'pending'; label: string }) {
  return (
    <div className="flex items-center gap-4">
      {/* Icon */}
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs ${
        status === 'success' ? 'bg-green-500/20 text-green-400' :
        status === 'loading' ? 'bg-amber-500/20 text-amber-400 animate-pulse' :
        'bg-slate-800 text-slate-600'
      }`}>
        {status === 'success' && '✓'}
        {status === 'loading' && '●'}
        {status === 'pending' && '○'}
      </div>
      {/* Label */}
      <span className={`text-sm font-medium ${
        status === 'success' ? 'text-slate-300' :
        status === 'loading' ? 'text-white' :
        'text-slate-600'
      }`}>
        {label}
      </span>
    </div>
  );
}
