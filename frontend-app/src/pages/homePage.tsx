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

// CHANGE: the AppShell already owns the global header (brand, nav, session
// indicator, sign-out). The HomePage no longer renders its own top header —
// that duplication made the page look like two apps stacked.
//
// CHANGE: removed the hero "stats strip" (1.2K mesas / 48K jogadores / 24/7).
// These were marketing placeholders, not real product signals, and they were
// the loudest source of dishonesty on the page. Replaced by a quiet "what this
// edition is" strip that describes the actual product.
//
// CHANGE: the secondary CTA no longer advertises a non-existent "demo table".
// When the user is signed out, the second slot is a discreet GitHub sign-in
// link (real capability). When the user is signed in, the primary CTA takes
// them to the lobby and no secondary CTA is shown — the lobby is where the
// real continuity lives.

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

function DecorCard({
  rank,
  suit,
  isRed,
  rotate,
  x,
  y,
}: {
  rank: string;
  suit: string;
  isRed: boolean;
  rotate: number;
  x: number;
  y: number;
}) {
  const color = isRed ? '#b91c1c' : '#1a1a2e';

  return (
    <div
      className="pointer-events-none absolute select-none"
      style={{ transform: `rotate(${rotate}deg) translate(${x}px, ${y}px)` }}
    >
      <div
        className="relative flex flex-col items-center justify-between overflow-hidden"
        style={{
          width: 94,
          height: 130,
          borderRadius: 14,
          background: 'linear-gradient(145deg, #fefdf8 0%, #f8f5ec 60%, #f2edd8 100%)',
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 18px 34px rgba(0,0,0,0.32), 0 10px 22px rgba(0,0,0,0.18)',
          padding: '6px 7px',
        }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            borderRadius: 'inherit',
            background: 'linear-gradient(150deg, rgba(255,255,255,0.85) 0%, transparent 30%)',
          }}
        />
        <div className="relative z-10 self-start">
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              lineHeight: 1,
              color,
              fontFamily: 'Georgia, serif',
            }}
          >
            {rank}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1, color }}>{suit}</div>
        </div>
        <div className="relative z-10" style={{ fontSize: 46, lineHeight: 1, color }}>
          {suit}
        </div>
        <div className="relative z-10 self-end rotate-180">
          <div
            style={{
              fontSize: 16,
              fontWeight: 900,
              lineHeight: 1,
              color,
              fontFamily: 'Georgia, serif',
            }}
          >
            {rank}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1, color }}>{suit}</div>
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

  const normalizedBackendUrl = useMemo(() => normalizeBackendUrl(backendUrl), [backendUrl]);
  const frontendUrl = getFrontendOrigin();

  const safeBackendOrigin = useMemo(() => {
    try {
      const parsed = new URL(normalizedBackendUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin;
      }
    } catch {
      // invalid
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

  const isAuthenticated = Boolean(session?.authToken);

  return (
    <div
      className="relative overflow-hidden rounded-3xl"
      style={{
        background: 'radial-gradient(ellipse at 50% -10%, #0d2318 0%, #050d18 40%, #050810 100%)',
        border: '1px solid rgba(201,168,76,0.08)',
      }}
    >
      {/* Ambient glows — atmosphere only, no fake data anywhere */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 rounded-full"
          style={{
            width: 900,
            height: 600,
            background: 'rgba(201,168,76,0.07)',
            filter: 'blur(80px)',
          }}
        />
        <div
          className="absolute bottom-0 right-0 rounded-full"
          style={{
            width: 500,
            height: 500,
            background: 'rgba(15,61,30,0.35)',
            filter: 'blur(80px)',
          }}
        />
      </div>

      <section className="relative z-10 mx-auto max-w-7xl px-6 pt-12 pb-10 lg:pt-14 lg:pb-10">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-10">
          <div className="space-y-6">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1"
              style={{
                border: '1px solid rgba(201,168,76,0.3)',
                background: 'rgba(201,168,76,0.07)',
              }}
            >
              <div
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, #c9a84c, #e8c76a)',
                }}
              />
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.3em',
                  color: 'rgba(255,255,255,0.55)',
                }}
              >
                EDIÇÃO PREMIUM
              </span>
            </div>

            <h1
              className="leading-[0.98] font-bold text-white"
              style={{
                fontFamily: 'Georgia, serif',
                fontSize: 'clamp(38px, 4.9vw, 66px)',
                maxWidth: 620,
              }}
            >
              A mesa de truco
              <br />
              <span
                style={{
                  background: 'linear-gradient(135deg, #e8c76a 0%, #c9a84c 50%, #8a6a28 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                mais elegante
              </span>
              <br />
              do Brasil.
            </h1>

            <p
              style={{
                fontSize: 16,
                lineHeight: 1.55,
                color: 'rgba(255,255,255,0.55)',
                maxWidth: 470,
              }}
            >
              Truco Paulista online em uma mesa digital feita à mão. Convide a dupla, sente-se e dê
              o truco — sem distrações, sem ruído.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              {isAuthenticated ? (
                <Link
                  to="/lobby"
                  className="inline-flex items-center gap-2 rounded-xl px-7 py-3.5 font-black uppercase tracking-wider transition-all duration-200 hover:scale-105"
                  style={{
                    background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
                    color: '#1a0800',
                    fontSize: 12,
                    letterSpacing: '0.12em',
                    boxShadow: '0 0 28px rgba(201,168,76,0.35), 0 8px 20px rgba(0,0,0,0.3)',
                    textDecoration: 'none',
                  }}
                >
                  Ir para o lobby →
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
                    className="inline-flex items-center gap-3 rounded-xl px-7 py-3.5 font-black uppercase tracking-wider transition-all duration-200 hover:scale-105"
                    style={{
                      background: googleLoginUrl
                        ? 'linear-gradient(135deg, #c9a84c, #8a6a28)'
                        : 'rgba(255,255,255,0.05)',
                      color: googleLoginUrl ? '#1a0800' : 'rgba(255,255,255,0.3)',
                      fontSize: 12,
                      letterSpacing: '0.12em',
                      boxShadow: googleLoginUrl
                        ? '0 0 28px rgba(201,168,76,0.35), 0 8px 20px rgba(0,0,0,0.3)'
                        : 'none',
                      cursor: googleLoginUrl ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Entrar com Google
                  </a>

                  {githubLoginUrl ? (
                    <a
                      href={githubLoginUrl}
                      onClick={handleOAuthStart}
                      className="inline-flex items-center gap-2 rounded-xl px-6 py-3.5 font-black uppercase tracking-wider transition-all duration-200 hover:scale-105"
                      style={{
                        background: 'transparent',
                        border: '1.5px solid rgba(201,168,76,0.35)',
                        color: 'rgba(201,168,76,0.85)',
                        fontSize: 11,
                        letterSpacing: '0.12em',
                        cursor: 'pointer',
                        boxShadow: '0 0 18px rgba(201,168,76,0.08)',
                        textDecoration: 'none',
                      }}
                    >
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                        <path
                          fillRule="evenodd"
                          d="M12 2C6.48 2 2 6.58 2 12.25c0 4.54 2.87 8.39 6.84 9.75.5.1.68-.22.68-.5v-1.72c-2.78.62-3.37-1.37-3.37-1.37-.46-1.17-1.11-1.48-1.11-1.48-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.13-4.55-5.03 0-1.11.39-2.02 1.03-2.73-.1-.26-.45-1.3.1-2.71 0 0 .84-.27 2.75 1.04.8-.23 1.65-.34 2.5-.34.85 0 1.7.11 2.5.34 1.91-1.31 2.75-1.04 2.75-1.04.55 1.41.2 2.45.1 2.71.64.71 1.03 1.62 1.03 2.73 0 3.91-2.34 4.77-4.57 5.02.36.32.68.94.68 1.9v2.82c0 .28.18.6.69.5A10.01 10.01 0 0 0 22 12.25C22 6.58 17.52 2 12 2z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Entrar com GitHub
                    </a>
                  ) : null}
                </>
              )}
            </div>

            {/* CHANGE: this used to be "1.2K mesas / 48K jogadores / 24/7 online" — pure
                fake marketing data. Replaced with honest edition signals that describe what
                the product actually IS, not a fabricated user base. */}
            <div className="grid max-w-lg grid-cols-3 gap-5 pt-2">
              {[
                { v: '1v1 · 2v2', l: 'Modos suportados' },
                { v: 'Sem app', l: 'Direto no navegador' },
                { v: 'Socket', l: 'Tempo real autoritativo' },
              ].map((s) => (
                <div key={s.l}>
                  <div
                    style={{
                      fontFamily: 'Georgia, serif',
                      fontSize: 18,
                      fontWeight: 800,
                      background: 'linear-gradient(135deg, #e8c76a, #c9a84c)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                      lineHeight: 1.1,
                    }}
                  >
                    {s.v}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.18em',
                      color: 'rgba(255,255,255,0.35)',
                      textTransform: 'uppercase',
                      marginTop: 3,
                    }}
                  >
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="relative flex h-[300px] items-center justify-center lg:h-[340px]">
            <div
              className="absolute rounded-full"
              style={{
                width: 360,
                height: 250,
                background:
                  'radial-gradient(ellipse, rgba(15,61,30,0.7) 0%, rgba(8,32,16,0.4) 55%, transparent 80%)',
                filter: 'blur(10px)',
              }}
            />

            <div className="relative scale-[0.92] lg:scale-100">
              <DecorCard rank="A" suit="♠" isRed={false} rotate={-18} x={-54} y={24} />
              <DecorCard rank="7" suit="♥" isRed rotate={-7} x={-18} y={0} />
              <DecorCard rank="4" suit="♣" isRed={false} rotate={4} x={20} y={-16} />
              <DecorCard rank="K" suit="♦" isRed rotate={14} x={56} y={6} />
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          borderTop: '1px solid rgba(201,168,76,0.08)',
          background: 'rgba(5,10,22,0.52)',
        }}
      >
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-6 py-8 md:grid-cols-3">
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
              className="rounded-2xl p-5 backdrop-blur"
              style={{
                background: 'linear-gradient(180deg, rgba(10,18,30,0.8), rgba(6,12,22,0.6))',
                border: '1px solid rgba(201,168,76,0.14)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              }}
            >
              <div
                className="mb-3 h-1 w-9 rounded-full"
                style={{ background: 'linear-gradient(90deg, #c9a84c, #8a6a28)' }}
              />
              <h3
                style={{
                  fontFamily: 'Georgia, serif',
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#f0e6d3',
                  marginBottom: 6,
                }}
              >
                {f.t}
              </h3>
              <p
                style={{
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: 'rgba(255,255,255,0.45)',
                }}
              >
                {f.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mx-auto max-w-7xl px-6 py-5 text-center">
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.2em',
            color: 'rgba(255,255,255,0.22)',
            textTransform: 'uppercase',
          }}
        >
          © Truco Paulista — Edição Premium
        </span>
      </footer>

      {/* CHANGE: the dev tools panel stays (it's a real capability for local
          development — custom backend URL + manual JWT), but the toggle label
          is more honest and the panel is clearly separated from the product
          surface. */}
      <div className="relative z-30 mx-auto max-w-7xl px-6 pb-8">
        <button
          onClick={() => setShowDevTools(!showDevTools)}
          style={{
            fontSize: 10,
            color: 'rgba(255,255,255,0.2)',
            textDecoration: 'underline',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            letterSpacing: '0.1em',
          }}
        >
          {showDevTools ? 'Esconder configuração avançada' : 'Configuração avançada (dev)'}
        </button>

        {showDevTools && (
          <div
            className="mt-4 grid gap-5 rounded-2xl p-6 lg:grid-cols-2"
            style={{
              background: 'rgba(5,10,18,0.85)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            <div>
              <label
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  color: 'rgba(255,255,255,0.35)',
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
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#d1d5db',
                  }}
                  placeholder="http://localhost:3000"
                />
                <button
                  onClick={handleSaveBackendUrl}
                  disabled={!allowManualBackendOverride}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#d1d5db',
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
                  letterSpacing: '0.16em',
                  color: 'rgba(255,255,255,0.35)',
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
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: '#d1d5db',
                  }}
                  placeholder="Cole o token aqui..."
                />
                <button
                  onClick={handleSaveManualToken}
                  style={{
                    padding: '8px 16px',
                    background: 'rgba(255,255,255,0.07)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#d1d5db',
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
          </div>
        )}
      </div>
    </div>
  );
}
