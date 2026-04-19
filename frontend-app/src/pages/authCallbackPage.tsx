import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getDefaultBackendUrl, resolveBackendUrl } from '../config/appConfig';
import {
  clearPendingAuthBackendUrl,
  loadPendingAuthBackendUrl,
} from '../features/auth/authStorage';
import { useAuth } from '../features/auth/authStore';

// ── Real auth logic preserved 100% ─────────────────────────────────────────────
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
    if (!authToken || !provider || !userId) return null;
    return { authToken, expiresIn, user: { id: userId, provider, email, displayName, avatarUrl } };
  }, [searchParams]);

  useEffect(() => {
    if (!payload) return;
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

  // ── ERROR STATE ──
  if (!payload) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden px-6"
        style={{ background: 'radial-gradient(ellipse at 50% 0%, #1a0d08 0%, #050810 70%)' }}
      >
        {/* Background glow */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, rgba(153,27,27,0.12) 0%, transparent 65%)',
          }}
        />

        <div
          className="relative z-10 w-full max-w-md rounded-3xl p-10 text-center backdrop-blur-xl"
          style={{
            background: 'linear-gradient(180deg, rgba(10,18,30,0.92), rgba(6,12,22,0.85))',
            border: '1px solid rgba(239,68,68,0.22)',
            boxShadow: '0 0 40px rgba(239,68,68,0.08), 0 24px 60px rgba(0,0,0,0.45)',
          }}
        >
          {/* Error icon */}
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: 'rgba(153,27,27,0.2)', border: '1.5px solid rgba(239,68,68,0.3)' }}
          >
            <span style={{ fontSize: 28 }}>✕</span>
          </div>

          <div
            style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.3em', color: '#f87171', textTransform: 'uppercase', marginBottom: 10 }}
          >
            Erro no Callback
          </div>

          <h1
            style={{ fontFamily: 'Georgia, serif', fontSize: 26, fontWeight: 700, color: '#f0e6d3', marginBottom: 12 }}
          >
            Falha na Autenticação
          </h1>

          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: 24 }}>
            O frontend esperava{' '}
            <code style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', padding: '1px 6px', borderRadius: 4, color: '#fca5a5', fontSize: 12 }}>
              authToken
            </code>
            ,{' '}
            <code style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', padding: '1px 6px', borderRadius: 4, color: '#fca5a5', fontSize: 12 }}>
              provider
            </code>{' '}
            e{' '}
            <code style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.2)', padding: '1px 6px', borderRadius: 4, color: '#fca5a5', fontSize: 12 }}>
              userId
            </code>{' '}
            na URL.
          </p>

          <Link
            to="/"
            className="inline-block rounded-xl px-7 py-3.5 text-sm font-black uppercase tracking-wider transition-all duration-200 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
              color: '#1a0800',
              textDecoration: 'none',
              boxShadow: '0 0 22px rgba(201,168,76,0.25), 0 8px 20px rgba(0,0,0,0.3)',
              letterSpacing: '0.1em',
            }}
          >
            Voltar para Home
          </Link>
        </div>
      </div>
    );
  }

  // ── LOADING / SUCCESS STATE ──
  const userName = payload.user.displayName ?? payload.user.email ?? 'Jogador';

  const steps: { status: 'success' | 'loading' | 'pending'; label: string }[] = [
    { status: 'success', label: 'Token OAuth verificado' },
    { status: 'success', label: `Provedor: ${payload.user.provider}` },
    { status: 'loading', label: 'Persistindo sessão...' },
    { status: 'pending', label: 'Redirecionando ao lobby' },
  ];

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-6"
      style={{ background: 'radial-gradient(ellipse at 50% -10%, #0d2318 0%, #050810 50%, #040610 100%)' }}
    >
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ width: 600, height: 600, background: 'rgba(201,168,76,0.07)', filter: 'blur(80px)' }}
        />
        <div
          className="absolute bottom-0 right-0 rounded-full"
          style={{ width: 400, height: 400, background: 'rgba(15,61,30,0.25)', filter: 'blur(80px)' }}
        />
      </div>

      {/* Card */}
      <div
        className="relative z-10 w-full max-w-md rounded-3xl p-10 text-center backdrop-blur-xl"
        style={{
          background: 'linear-gradient(180deg, rgba(10,20,34,0.95), rgba(6,14,24,0.88))',
          border: '1px solid rgba(201,168,76,0.2)',
          boxShadow: '0 0 50px rgba(201,168,76,0.08), 0 28px 70px rgba(0,0,0,0.45)',
        }}
      >
        {/* Spinning logo */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            {/* Dashed orbit */}
            <div
              className="absolute -inset-2 rounded-full"
              style={{
                border: '1px dashed rgba(201,168,76,0.3)',
                animation: 'spin 8s linear infinite',
              }}
            />
            {/* Logo disc */}
            <div
              className="relative flex h-16 w-16 items-center justify-center rounded-full"
              style={{
                background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
                boxShadow: '0 0 30px rgba(201,168,76,0.35)',
              }}
            >
              <span
                style={{ fontFamily: 'Georgia, serif', fontSize: 24, fontWeight: 900, color: '#1a0800' }}
              >
                T
              </span>
            </div>
          </div>
        </div>

        {/* Copy */}
        <p
          style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.4em', color: 'rgba(255,255,255,0.32)', textTransform: 'uppercase', marginBottom: 10 }}
        >
          AUTENTICAÇÃO
        </p>
        <h1
          style={{ fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 700, color: '#f0e6d3', marginBottom: 6 }}
        >
          Embaralhando suas{' '}
          <span
            style={{ background: 'linear-gradient(135deg, #e8c76a, #c9a84c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            cartas
          </span>
        </h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', marginBottom: 6, lineHeight: 1.55 }}>
          Finalizando seu login. Em segundos você estará no lobby.
        </p>
        <p
          className="mb-8 text-sm font-bold"
          style={{ color: 'rgba(201,168,76,0.75)' }}
        >
          {userName}
        </p>

        {/* Card fan (decorative face-down cards) */}
        <div
          className="mx-auto mb-8 flex items-end justify-center gap-1 rounded-2xl py-6"
          style={{
            background: 'radial-gradient(ellipse at 50% 50%, rgba(15,61,30,0.55) 0%, rgba(8,32,16,0.35) 100%)',
            border: '1px solid rgba(201,168,76,0.12)',
          }}
        >
          {[-15, -6, 4, 13].map((r, i) => (
            <div
              key={i}
              style={{ transform: `rotate(${r}deg)`, marginBottom: i === 1 || i === 2 ? -8 : 0 }}
            >
              <div
                className="relative overflow-hidden"
                style={{
                  width: 52,
                  height: 74,
                  borderRadius: 8,
                  background: 'linear-gradient(145deg, #1a2635 0%, #141d2a 50%, #1e2d40 100%)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 8px 20px rgba(0,0,0,0.45)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    inset: 7,
                    borderRadius: 6,
                    border: '1px solid rgba(201,168,76,0.2)',
                    backgroundImage:
                      'repeating-linear-gradient(45deg, rgba(201,168,76,0.1) 0, rgba(201,168,76,0.1) 1px, transparent 1px, transparent 6px)',
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Step items */}
        <div className="mb-8 space-y-3 text-left">
          {steps.map((step, i) => (
            <StepItem key={i} status={step.status} label={step.label} />
          ))}
        </div>

        {/* Progress bar */}
        <div
          className="relative h-1 overflow-hidden rounded-full"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: '60%',
              background: 'linear-gradient(90deg, #8a6a28, #c9a84c, #e8c76a, #c9a84c)',
              backgroundSize: '200% 100%',
              animation: 'shimmer 1.6s linear infinite',
            }}
          />
        </div>

        <Link
          to="/"
          className="mt-6 inline-block text-xs uppercase tracking-widest transition-colors"
          style={{ color: 'rgba(255,255,255,0.2)', textDecoration: 'none', letterSpacing: '0.25em' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
        >
          Cancelar
        </Link>
      </div>

      {/* Keyframe styles injected inline */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </main>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepItem({ status, label }: { status: 'success' | 'loading' | 'pending'; label: string }) {
  const iconStyle = {
    success: {
      bg: 'rgba(22,101,52,0.22)',
      border: '1px solid rgba(34,197,94,0.3)',
      color: '#4ade80',
      icon: '✓',
    },
    loading: {
      bg: 'rgba(201,168,76,0.15)',
      border: '1px solid rgba(201,168,76,0.3)',
      color: '#e8c76a',
      icon: '●',
    },
    pending: {
      bg: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.07)',
      color: 'rgba(255,255,255,0.2)',
      icon: '○',
    },
  }[status];

  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${status === 'loading' ? 'animate-pulse' : ''}`}
        style={{ background: iconStyle.bg, border: iconStyle.border, color: iconStyle.color }}
      >
        {iconStyle.icon}
      </div>
      <span
        style={{
          fontSize: 13,
          fontWeight: status === 'loading' ? 700 : 500,
          color: status === 'success'
            ? 'rgba(255,255,255,0.65)'
            : status === 'loading'
            ? '#f0e6d3'
            : 'rgba(255,255,255,0.25)',
        }}
      >
        {label}
      </span>
    </div>
  );
}
