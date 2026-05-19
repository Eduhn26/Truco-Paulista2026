import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getDefaultBackendUrl,
  getFrontendOrigin,
  normalizeBackendUrl,
  shouldAllowManualBackendOverride,
} from '../config/appConfig';
import { savePendingAuthBackendUrl, type FrontendSession } from '../features/auth/authStorage';
import { useAuth } from '../features/auth/authStore';

/**
 * PREMIUM PATCH — homePage.
 *
 * Mantém 100% da lógica original: useAuth, dev login, OAuth, backend URL,
 * todos os fluxos de session. Refinamentos visuais:
 *
 *   • DecorCard — bordas duplas, glow dourado, hover lift
 *   • Hero — ornamentos art-déco, hairline gold animada, "paulista" italic
 *     refinado com Cormorant Garamond
 *   • Status pill "Online em tempo real" — ripple emerald via classes
 *   • CTAs — px-shine + lift; auto-detected pelo premium-patch.css
 *   • Stats trio — `.px-pill` style; números com text shimmer
 *   • Feature cards — surface-card-premium + px-ornament-corners
 *   • Footer — divider ornate
 */
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

type DevLoginIdentity = 'eduardo' | 'amigo' | 'qa1' | 'qa2';

type DevLoginOption = {
  identity: DevLoginIdentity;
  label: string;
  helper: string;
};

const DEV_LOGIN_OPTIONS: DevLoginOption[] = [
  { identity: 'eduardo', label: 'Eduardo Dev', helper: 'Sessão principal' },
  { identity: 'amigo', label: 'Amigo Dev', helper: 'Segunda janela' },
  { identity: 'qa1', label: 'QA Dev 1', helper: 'Teste extra' },
  { identity: 'qa2', label: 'QA Dev 2', helper: 'Teste extra' },
];

function DecorCard({
  rank,
  suit,
  isRed,
  rotate,
  x,
  y,
  delay = 0,
}: {
  rank: string;
  suit: string;
  isRed: boolean;
  rotate: number;
  x: number;
  y: number;
  delay?: number;
}) {
  const color = isRed ? '#b91c1c' : '#1a1a2e';

  return (
    <div
      className="pointer-events-none absolute select-none"
      style={{
        transform: `rotate(${rotate}deg) translate(${x}px, ${y}px)`,
        animation: `px-fade-up 0.9s ${delay}s cubic-bezier(0.20, 0.90, 0.24, 1) backwards`,
      }}
    >
      <div
        className="relative flex flex-col items-center justify-between overflow-hidden"
        style={{
          width: 102,
          height: 142,
          borderRadius: 14,
          background:
            'linear-gradient(145deg, #fefdf8 0%, #f8f5ec 55%, #f0e9d4 100%)',
          border: '1px solid rgba(0,0,0,0.14)',
          boxShadow:
            '0 24px 44px rgba(0,0,0,0.42), 0 12px 22px rgba(0,0,0,0.22), 0 0 0 1px rgba(232,199,106,0.18), inset 0 1px 0 rgba(255,255,255,0.96)',
          padding: '7px 8px',
        }}
      >
        {/* Reflexo angular topo */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: 'inherit',
            background:
              'linear-gradient(155deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.45) 22%, transparent 38%)',
          }}
        />
        {/* Borda interna dourada sutil */}
        <div
          className="pointer-events-none absolute inset-[3px]"
          style={{
            borderRadius: 11,
            border: '1px solid rgba(201,168,76,0.10)',
          }}
        />

        <div className="relative z-10 self-start">
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              lineHeight: 1,
              color,
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {rank}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1, color }}>{suit}</div>
        </div>
        <div
          className="relative z-10"
          style={{
            fontSize: 50,
            lineHeight: 1,
            color,
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.12))',
          }}
        >
          {suit}
        </div>
        <div className="relative z-10 self-end rotate-180">
          <div
            style={{
              fontSize: 17,
              fontWeight: 900,
              lineHeight: 1,
              color,
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              letterSpacing: '-0.01em',
            }}
          >
            {rank}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1, color }}>{suit}</div>
        </div>
      </div>
    </div>
  );
}

export function HomePage() {
  const { session, setSession } = useAuth();
  const [backendUrl, setBackendUrl] = useState(() =>
    normalizeBackendUrl(session?.backendUrl ?? getDefaultBackendUrl()),
  );
  const [manualAuthToken, setManualAuthToken] = useState('');
  const [showDevTools, setShowDevTools] = useState(false);
  const [devLoginPendingIdentity, setDevLoginPendingIdentity] =
    useState<DevLoginIdentity | null>(null);
  const [devLoginError, setDevLoginError] = useState<string | null>(null);

  const normalizedBackendUrl = useMemo(() => normalizeBackendUrl(backendUrl), [backendUrl]);
  const frontendUrl = getFrontendOrigin();

  const safeBackendOrigin = useMemo(() => {
    try {
      const parsed = new URL(normalizedBackendUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // Invalid backend URLs disable OAuth links without breaking the landing page.
    }
    return '';
  }, [normalizedBackendUrl]);

  const googleLoginUrl = safeBackendOrigin
    ? `${safeBackendOrigin}/auth/google?frontendUrl=${encodeURIComponent(frontendUrl)}`
    : '';
  const githubLoginUrl = safeBackendOrigin
    ? `${safeBackendOrigin}/auth/github?frontendUrl=${encodeURIComponent(frontendUrl)}`
    : '';

  const allowManualBackendOverride = shouldAllowManualBackendOverride();

  function handleSaveBackendUrl() {
    setSession(buildNextSession(session, normalizedBackendUrl, session?.authToken ?? ''));
  }

  function handleSaveManualToken() {
    const t = manualAuthToken.trim();
    if (!t) return;
    setSession(buildNextSession(session, normalizedBackendUrl, t));
  }

  function handleOAuthStart() {
    savePendingAuthBackendUrl(normalizedBackendUrl);
  }

  async function handleDevLogin(identity: DevLoginIdentity): Promise<void> {
    if (!safeBackendOrigin) {
      setDevLoginError('Backend URL inválida para dev login.');
      return;
    }

    setDevLoginPendingIdentity(identity);
    setDevLoginError(null);

    try {
      const response = await fetch(`${safeBackendOrigin}/auth/dev/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity }),
      });

      if (!response.ok) {
        throw new Error(`Dev login falhou (${response.status}).`);
      }

      const payload = (await response.json()) as {
        authToken?: unknown;
        expiresIn?: unknown;
        user?: {
          id?: unknown;
          provider?: unknown;
          email?: unknown;
          displayName?: unknown;
          avatarUrl?: unknown;
        };
      };

      if (
        typeof payload.authToken !== 'string' ||
        !payload.user ||
        typeof payload.user.id !== 'string' ||
        typeof payload.user.provider !== 'string'
      ) {
        throw new Error('Resposta inválida do dev login.');
      }

      setSession({
        backendUrl: normalizedBackendUrl,
        authToken: payload.authToken,
        expiresIn: typeof payload.expiresIn === 'string' ? payload.expiresIn : null,
        user: {
          id: payload.user.id,
          provider: payload.user.provider,
          email: typeof payload.user.email === 'string' ? payload.user.email : null,
          displayName:
            typeof payload.user.displayName === 'string' ? payload.user.displayName : null,
          avatarUrl: typeof payload.user.avatarUrl === 'string' ? payload.user.avatarUrl : null,
        },
      });
      window.location.assign('/lobby');
    } catch (error) {
      setDevLoginError(error instanceof Error ? error.message : 'Dev login falhou.');
    } finally {
      setDevLoginPendingIdentity(null);
    }
  }

  const isAuthenticated = Boolean(session?.authToken);

  return (
    <div
      className="bg-noise-soft relative overflow-hidden rounded-3xl"
      style={{
        background:
          'radial-gradient(ellipse at 50% -10%, #102619 0%, #050d18 40%, #050810 100%)',
        border: '1px solid rgba(201,168,76,0.12)',
        boxShadow:
          '0 30px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,241,184,0.04)',
      }}
    >
      {/* Camadas atmosféricas — auroras suaves nas bordas */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: 900,
            height: 600,
            background: 'rgba(201,168,76,0.09)',
            filter: 'blur(90px)',
            animation: 'px-frame-breathe 6s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: 520,
            height: 520,
            background: 'rgba(15,61,30,0.38)',
            filter: 'blur(90px)',
          }}
        />
        <div
          className="absolute left-0 top-1/3 rounded-full"
          style={{
            width: 360,
            height: 360,
            background: 'rgba(34,197,94,0.06)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      {/* Hairline dourada superior */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.6) 50%, transparent 100%)',
        }}
      />

      <section className="relative z-10 mx-auto max-w-7xl px-6 pb-10 pt-12 lg:pb-10 lg:pt-14">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
          <div className="space-y-6">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
              style={{
                border: '1px solid rgba(201,168,76,0.32)',
                background:
                  'linear-gradient(180deg, rgba(40,30,12,0.55), rgba(15,12,6,0.4))',
                color: '#d7c18b',
                boxShadow:
                  '0 4px 14px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,241,184,0.08)',
              }}
            >
              <span
                className="relative h-2 w-2 rounded-full bg-emerald-400"
                style={{ boxShadow: '0 0 12px rgba(52,211,153,0.78)' }}
              >
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-emerald-400/60"
                  style={{ animation: 'px-dot-ripple 2.2s ease-out infinite' }}
                />
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.24em]">
                Online em tempo real
              </span>
            </div>

            <div>
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: '0.30em',
                  color: 'rgba(255,255,255,0.36)',
                  textTransform: 'uppercase',
                  marginBottom: 14,
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                Truco Paulista Digital
              </p>

              <h1
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontSize: 'clamp(54px, 8.5vw, 108px)',
                  lineHeight: 0.88,
                  fontWeight: 600,
                  letterSpacing: '-0.04em',
                  color: '#f5ecd6',
                  textShadow:
                    '0 0 48px rgba(201,168,76,0.15), 0 2px 0 rgba(0,0,0,0.4)',
                }}
              >
                O baralho
                <br />
                <span
                  style={{
                    fontStyle: 'italic',
                    fontWeight: 500,
                    color: 'transparent',
                    background:
                      'linear-gradient(135deg, #fff1b8 0%, #f2d488 30%, #c9a84c 65%, #8a6a28 100%)',
                    backgroundSize: '200% 100%',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    animation: 'px-gold-shimmer 7s ease-in-out infinite',
                    filter: 'drop-shadow(0 4px 28px rgba(201,168,76,0.32))',
                  }}
                >
                  paulista
                </span>
                <br />
                na tela
              </h1>
            </div>

            <p
              style={{
                maxWidth: 590,
                fontSize: 16,
                lineHeight: 1.75,
                color: 'rgba(255,255,255,0.58)',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              Entre no lobby, escolha uma mesa e jogue Truco Paulista com regras reais,
              sincronização em tempo real e uma interface premium inspirada nas mesas de jogo
              clássicas.
            </p>

            <div className="flex flex-wrap gap-3">
              {isAuthenticated ? (
                <Link
                  to="/lobby"
                  className="group inline-flex items-center gap-3 rounded-xl px-7 py-4 text-sm font-black uppercase tracking-wider transition-all duration-200"
                  style={{
                    background:
                      'linear-gradient(135deg, #fff1b8 0%, #e8c76a 35%, #c9a84c 65%, #8a6a28 100%)',
                    color: '#1a0800',
                    boxShadow:
                      '0 0 32px rgba(201,168,76,0.32), 0 14px 34px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                  }}
                >
                  Entrar no lobby
                  <span className="transition-transform group-hover:translate-x-1">→</span>
                </Link>
              ) : (
                <>
                  <a
                    href={googleLoginUrl || undefined}
                    onClick={
                      googleLoginUrl
                        ? handleOAuthStart
                        : (e) => {
                            e.preventDefault();
                          }
                    }
                    className="group inline-flex items-center gap-3 rounded-xl px-7 py-4 text-sm font-black uppercase tracking-wider transition-all duration-200"
                    style={{
                      background:
                        'linear-gradient(135deg, #fff1b8 0%, #e8c76a 35%, #c9a84c 65%, #8a6a28 100%)',
                      color: '#1a0800',
                      boxShadow:
                        '0 0 32px rgba(201,168,76,0.32), 0 14px 34px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                      opacity: googleLoginUrl ? 1 : 0.55,
                      pointerEvents: googleLoginUrl ? 'auto' : 'none',
                    }}
                  >
                    Entrar com Google
                    <span className="transition-transform group-hover:translate-x-1">→</span>
                  </a>

                  {githubLoginUrl ? (
                    <a
                      href={githubLoginUrl}
                      onClick={handleOAuthStart}
                      className="inline-flex items-center rounded-xl px-6 py-4 text-sm font-bold uppercase tracking-wider transition-all duration-200 hover:bg-white/[0.10]"
                      style={{
                        background:
                          'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                        border: '1px solid rgba(255,255,255,0.10)',
                        color: 'rgba(240,230,211,0.82)',
                        boxShadow:
                          '0 8px 22px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
                      }}
                    >
                      Entrar com GitHub
                    </a>
                  ) : null}
                </>
              )}
            </div>

            <div
              className="grid max-w-xl grid-cols-3 gap-3 rounded-2xl p-4 backdrop-blur"
              style={{
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.015))',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow:
                  '0 8px 24px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              {[
                { v: '1v1 · 2v2', l: 'Modos suportados' },
                { v: 'Sem app', l: 'Direto no navegador' },
                { v: 'Socket', l: 'Tempo real autoritativo' },
              ].map((s) => (
                <div key={s.l}>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 900,
                      background:
                        'linear-gradient(180deg, #fff1b8 0%, #e8c76a 50%, #c9a84c 100%)',
                      WebkitBackgroundClip: 'text',
                      backgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      fontFamily: 'Cormorant Garamond, Georgia, serif',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {s.v}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.16em',
                      color: 'rgba(255,255,255,0.36)',
                      textTransform: 'uppercase',
                      marginTop: 2,
                    }}
                  >
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative hidden h-[440px] lg:block">
            <div
              className="absolute inset-0 rounded-[32px]"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 50%, rgba(15,61,30,0.6), transparent 64%)',
                filter: 'blur(20px)',
                animation: 'px-frame-breathe 5s ease-in-out infinite',
              }}
            />
            <div
              className="absolute inset-0 rounded-[32px]"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 50%, rgba(201,168,76,0.15), transparent 56%)',
                filter: 'blur(28px)',
              }}
            />
            <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2">
              <DecorCard rank="A" suit="♠" isRed={false} rotate={-19} x={-58} y={26} delay={0.20} />
              <DecorCard rank="7" suit="♥" isRed rotate={-7} x={-20} y={0} delay={0.30} />
              <DecorCard rank="4" suit="♣" isRed={false} rotate={5} x={22} y={-18} delay={0.40} />
              <DecorCard rank="K" suit="♦" isRed rotate={15} x={60} y={8} delay={0.50} />
            </div>
          </div>
        </div>
      </section>

      <section
        className="relative z-10 border-y border-amber-400/[0.06]"
        style={{
          background:
            'linear-gradient(180deg, rgba(5,10,22,0.65) 0%, rgba(3,8,18,0.55) 100%)',
        }}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-6 py-9 md:grid-cols-3">
          {[
            {
              t: 'Mesas em tempo real',
              d: 'Cada carta jogada sincroniza entre as duplas em tempo real via conexão socket autoritativa.',
            },
            {
              t: 'Truco, seis, nove, doze',
              d: 'Aposta clássica do paulista, com manilha, vira e mão de ferro respeitando a tradição.',
            },
            {
              t: 'Salas privadas',
              d: 'Crie uma sala, compartilhe o código e jogue só com a sua trupe.',
            },
          ].map((f) => (
            <div
              key={f.t}
              className="surface-card-premium surface-felt-grain px-ornament-corners p-5 backdrop-blur"
            >
              <div
                className="mb-3 h-[2px] w-10 rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, #fff1b8 0%, #c9a84c 50%, transparent 100%)',
                  boxShadow: '0 0 10px rgba(201,168,76,0.42)',
                }}
              />
              <h3
                style={{
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  fontSize: 19,
                  fontWeight: 700,
                  color: '#f5ecd6',
                  marginBottom: 6,
                  letterSpacing: '-0.01em',
                }}
              >
                {f.t}
              </h3>
              <p
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.62,
                  color: 'rgba(255,255,255,0.48)',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                {f.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-7xl px-6 py-6 text-center">
        <div className="px-divider-ornate mx-auto mb-4 max-w-xs">
          <span />
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.22em',
            color: 'rgba(255,255,255,0.26)',
            textTransform: 'uppercase',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          © Truco Paulista — Edição Premium
        </span>
      </footer>

      <div className="relative z-30 mx-auto max-w-7xl px-6 pb-8">
        <button
          onClick={() => setShowDevTools(!showDevTools)}
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.22)',
            textDecoration: 'underline',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.12em',
          }}
        >
          {showDevTools ? 'Esconder configuração avançada' : 'Configuração avançada (dev)'}
        </button>

        {showDevTools && (
          <div
            className="mt-4 grid gap-5 rounded-2xl p-6 lg:grid-cols-2"
            style={{
              background:
                'linear-gradient(180deg, rgba(5,10,18,0.92), rgba(3,7,14,0.86))',
              border: '1px solid rgba(201,168,76,0.14)',
              boxShadow:
                '0 16px 38px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  color: 'rgba(232,199,106,0.6)',
                  display: 'block',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                Backend URL
              </label>
              <div className="flex gap-2">
                <input
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  disabled={!allowManualBackendOverride}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: '#e8dcb8',
                  }}
                  placeholder="http://localhost:3000"
                />
                <button
                  onClick={handleSaveBackendUrl}
                  disabled={!allowManualBackendOverride}
                  style={{
                    padding: '8px 16px',
                    background:
                      'linear-gradient(180deg, rgba(40,30,12,0.7), rgba(20,15,6,0.6))',
                    border: '1px solid rgba(201,168,76,0.24)',
                    color: '#e8c76a',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Salvar
                </button>
              </div>
            </div>

            <div>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  color: 'rgba(232,199,106,0.6)',
                  display: 'block',
                  marginBottom: 8,
                  textTransform: 'uppercase',
                }}
              >
                Token Manual (JWT)
              </label>
              <div className="flex gap-2">
                <input
                  value={manualAuthToken}
                  onChange={(e) => setManualAuthToken(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    color: '#e8dcb8',
                  }}
                  placeholder="Cole o token aqui..."
                />
                <button
                  onClick={handleSaveManualToken}
                  style={{
                    padding: '8px 16px',
                    background:
                      'linear-gradient(180deg, rgba(40,30,12,0.7), rgba(20,15,6,0.6))',
                    border: '1px solid rgba(201,168,76,0.24)',
                    color: '#e8c76a',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Usar
                </button>
              </div>
            </div>

            {allowManualBackendOverride ? (
              <div className="lg:col-span-2">
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    color: 'rgba(232,199,106,0.6)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                  }}
                >
                  Login local de desenvolvimento
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {DEV_LOGIN_OPTIONS.map((option) => {
                    const isPending = devLoginPendingIdentity === option.identity;

                    return (
                      <button
                        key={option.identity}
                        onClick={() => {
                          void handleDevLogin(option.identity);
                        }}
                        disabled={devLoginPendingIdentity !== null}
                        className="rounded-xl px-3 py-3 text-left transition-all duration-200 hover:scale-[1.02]"
                        style={{
                          background: isPending
                            ? 'linear-gradient(180deg, rgba(201,168,76,0.2), rgba(140,110,40,0.10))'
                            : 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))',
                          border: isPending
                            ? '1px solid rgba(232,199,106,0.42)'
                            : '1px solid rgba(255,255,255,0.10)',
                          color: '#e8dcb8',
                          cursor: devLoginPendingIdentity === null ? 'pointer' : 'wait',
                          boxShadow: isPending
                            ? '0 0 18px rgba(201,168,76,0.24), inset 0 1px 0 rgba(255,255,255,0.06)'
                            : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 900,
                            color: isPending ? '#fff1b8' : '#f5ecd6',
                            textTransform: 'uppercase',
                            letterSpacing: '0.10em',
                          }}
                        >
                          {isPending ? 'Entrando...' : option.label}
                        </div>
                        <div
                          className="mt-1"
                          style={{
                            fontSize: 10,
                            color: 'rgba(255,255,255,0.38)',
                          }}
                        >
                          {option.helper}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {devLoginError ? (
                  <p
                    className="mt-3 rounded-lg px-3 py-2"
                    style={{
                      background: 'rgba(153,27,27,0.22)',
                      border: '1px solid rgba(239,68,68,0.28)',
                      color: '#fca5a5',
                      fontSize: 12,
                    }}
                  >
                    {devLoginError}
                  </p>
                ) : (
                  <p className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.30)' }}>
                    Use identidades diferentes em Chrome, Edge ou aba anônima para testar dois
                    humanos sem outra conta Google.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
