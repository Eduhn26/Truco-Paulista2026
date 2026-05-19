import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import {
  getMyPlayerProfile,
  updateMyPlayerPublicName,
  type PlayerProfileDto,
} from '../services/http/playerProfileApi';

/**
 * PREMIUM PATCH — playerProfilePage
 *
 * Preserva 100%: useAuth, useState (profile, publicName, isLoading, isSaving,
 * status), useEffect loadProfile, handleSubmit, normalizePublicName,
 * validatePublicName, canSubmit logic, setSession update.
 *
 * Refinos visuais:
 *   • ProfileStat — card walnut com número em Cormorant Garamond e shimmer
 *   • LoadingPanel — spinner dourado mais cinematográfico
 *   • Shell — walnut + hairline dourada + gradients
 *   • Avatar preview — moldura dourada com glow
 *   • Input — gold focus ring, inner glow
 *   • Submit button — shimmer, lift 3D
 *   • "Onde aparece" — pills com icon bullet dourado
 */

type StatusMessage = {
  tone: 'success' | 'error';
  message: string;
} | null;

const MIN_PUBLIC_NAME_LENGTH = 3;
const MAX_PUBLIC_NAME_LENGTH = 32;
const PUBLIC_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;

function normalizePublicName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function validatePublicName(value: string): string | null {
  const normalizedValue = normalizePublicName(value);
  if (
    normalizedValue.length < MIN_PUBLIC_NAME_LENGTH ||
    normalizedValue.length > MAX_PUBLIC_NAME_LENGTH
  ) {
    return `Use entre ${MIN_PUBLIC_NAME_LENGTH} e ${MAX_PUBLIC_NAME_LENGTH} caracteres.`;
  }
  if (!PUBLIC_NAME_PATTERN.test(normalizedValue)) {
    return 'Use apenas letras, números, espaços, ponto, underline, apóstrofo ou hífen.';
  }
  return null;
}

function ProfileStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail?: string | undefined;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3"
      style={{
        background: 'linear-gradient(180deg, rgba(10,16,24,0.72), rgba(5,9,14,0.60))',
        border: '1px solid rgba(201,168,76,0.14)',
        boxShadow: 'inset 0 1px 0 rgba(255,241,184,0.06), 0 8px 20px rgba(0,0,0,0.28)',
      }}
    >
      <p
        className="text-[9px] font-black uppercase tracking-[0.24em]"
        style={{ color: 'rgba(201,168,76,0.62)' }}
      >
        {label}
      </p>
      <p
        className="mt-1 text-[22px] font-black leading-none"
        style={{
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          background: 'linear-gradient(180deg, #fff1b8 0%, #e8c76a 50%, #c9a84c 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))',
        }}
      >
        {value}
      </p>
      {detail ? (
        <p className="mt-1 text-[10px] font-semibold" style={{ color: 'rgba(134,239,172,0.72)' }}>
          {detail}
        </p>
      ) : null}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="flex min-h-[62vh] items-center justify-center">
      <div
        className="flex flex-col items-center gap-5 rounded-3xl px-10 py-9 text-center"
        style={{
          background: 'linear-gradient(180deg, rgba(10,18,28,0.92), rgba(5,10,18,0.88))',
          border: '1px solid rgba(201,168,76,0.18)',
          boxShadow:
            '0 24px 80px rgba(0,0,0,0.42), 0 0 24px rgba(201,168,76,0.06), inset 0 1px 0 rgba(255,241,184,0.06)',
        }}
      >
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div
            className="absolute inset-0 rounded-full"
            style={{ border: '1px solid rgba(255,241,184,0.12)' }}
          />
          <div
            className="absolute inset-0 animate-spin rounded-full"
            style={{ border: '2px solid transparent', borderTopColor: '#e8c76a' }}
          />
          <div
            className="absolute inset-[6px] animate-spin rounded-full"
            style={{
              border: '1px solid transparent',
              borderTopColor: 'rgba(232,199,106,0.42)',
              animationDuration: '1.8s',
              animationDirection: 'reverse',
            }}
          />
          <span
            className="text-lg font-black leading-none"
            style={{
              background: 'linear-gradient(180deg, #fff1b8, #c9a84c)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontFamily: 'Cormorant Garamond, Georgia, serif',
            }}
          >
            TP
          </span>
        </div>
        <div>
          <p
            className="text-sm font-black uppercase tracking-[0.22em]"
            style={{ color: '#e8c76a' }}
          >
            Carregando perfil
          </p>
          <p className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.40)' }}>
            Buscando seu nome público atual.
          </p>
        </div>
      </div>
    </div>
  );
}

export function PlayerProfilePage() {
  const { session, setSession } = useAuth();
  const [profile, setProfile] = useState<PlayerProfileDto | null>(null);
  const [publicName, setPublicName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<StatusMessage>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile(): Promise<void> {
      if (!session) return;
      setIsLoading(true);
      setStatus(null);
      try {
        const response = await getMyPlayerProfile(session);
        if (!isMounted) return;
        setProfile(response.profile);
        setPublicName(response.profile.publicName ?? response.profile.displayName ?? '');
      } catch (error) {
        if (!isMounted) return;
        setStatus({
          tone: 'error',
          message: error instanceof Error ? error.message : 'Não foi possível carregar o perfil.',
        });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    void loadProfile();
    return () => { isMounted = false; };
  }, [session?.authToken, session?.backendUrl]);

  const normalizedPublicName = useMemo(() => normalizePublicName(publicName), [publicName]);
  const validationMessage = useMemo(() => validatePublicName(publicName), [publicName]);
  const savedPublicName = profile?.publicName?.trim() ?? '';
  const hasChanges = normalizedPublicName !== savedPublicName;
  const canSubmit = Boolean(!isSaving && !validationMessage && hasChanges);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!session || !canSubmit) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const response = await updateMyPlayerPublicName(session, normalizedPublicName);
      setProfile(response.profile);
      setPublicName(response.profile.publicName ?? response.profile.displayName ?? normalizedPublicName);
      setSession({
        ...session,
        user: session.user
          ? { ...session.user, displayName: response.profile.displayName }
          : null,
      });
      setStatus({
        tone: 'success',
        message: 'Nome público atualizado. Ele será usado nas próximas salas, rankings e partidas.',
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Não foi possível salvar o nome público.',
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) return <LoadingPanel />;

  const fallbackName = session?.user?.displayName ?? session?.user?.email ?? 'Jogador';
  const previewName = normalizedPublicName || profile?.displayName || fallbackName;
  const characterCount = normalizedPublicName.length;
  const characterCounterTone = characterCount > MAX_PUBLIC_NAME_LENGTH
    ? 'rgba(248,113,113,0.9)'
    : 'rgba(255,255,255,0.32)';

  return (
    <section
      className="relative overflow-hidden rounded-[32px]"
      style={{
        background: 'linear-gradient(145deg, rgba(10,18,28,0.95), rgba(5,10,18,0.92))',
        border: '1px solid rgba(201,168,76,0.18)',
        boxShadow:
          '0 28px 90px rgba(0,0,0,0.46), 0 0 0 1px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,241,184,0.05)',
      }}
    >
      {/* Atmospheric layers */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% -10%, rgba(201,168,76,0.16), transparent 50%)',
          }}
        />
        <div
          className="absolute -right-24 top-10 h-72 w-72 rounded-full"
          style={{ background: 'rgba(201,168,76,0.08)', filter: 'blur(60px)' }}
        />
        <div
          className="absolute -bottom-28 left-14 h-80 w-80 rounded-full"
          style={{ background: 'rgba(34,197,94,0.06)', filter: 'blur(80px)' }}
        />
      </div>

      {/* Hairline top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.5) 50%, transparent 100%)',
        }}
      />

      <div className="relative z-10 grid gap-4 p-4 lg:grid-cols-[0.95fr_1.05fr] lg:gap-5 lg:p-6">
        {/* LEFT — preview card */}
        <div
          className="rounded-[28px] p-6 lg:p-8"
          style={{
            background: 'linear-gradient(180deg, rgba(8,14,22,0.72), rgba(5,9,14,0.60))',
            border: '1px solid rgba(201,168,76,0.16)',
            boxShadow: 'inset 0 1px 0 rgba(255,241,184,0.05), 0 16px 40px rgba(0,0,0,0.28)',
          }}
        >
          <div
            className="inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.24em]"
            style={{
              background: 'rgba(201,168,76,0.12)',
              border: '1px solid rgba(201,168,76,0.28)',
              color: '#e8c76a',
              boxShadow: 'inset 0 1px 0 rgba(255,241,184,0.10)',
            }}
          >
            Perfil público
          </div>

          <h1
            className="mt-5 leading-tight text-slate-100"
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 'clamp(26px, 4vw, 42px)',
              fontWeight: 600,
              color: '#f0e6d3',
              letterSpacing: '-0.02em',
            }}
          >
            Escolha o nome que entra na mesa.
          </h1>

          <p
            className="mt-4 max-w-xl"
            style={{ fontSize: 13, lineHeight: 1.75, color: 'rgba(255,255,255,0.44)' }}
          >
            Este é o nome exibido no ranking, lobby, histórico e nos cards das partidas. Bots
            continuam usando a própria persona.
          </p>

          {/* Prévia */}
          <div
            className="mt-8 rounded-[24px] p-5"
            style={{
              background: 'rgba(0,0,0,0.28)',
              border: '1px solid rgba(201,168,76,0.12)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
            }}
          >
            <p
              className="text-[9px] font-black uppercase tracking-[0.26em]"
              style={{ color: 'rgba(255,255,255,0.32)' }}
            >
              Prévia no jogo
            </p>

            <div className="mt-5 flex items-center gap-4">
              <div
                className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background:
                    'linear-gradient(145deg, rgba(40,30,12,0.92), rgba(12,9,4,0.88))',
                  border: '1px solid rgba(232,199,106,0.44)',
                  boxShadow:
                    '0 0 28px rgba(201,168,76,0.20), 0 12px 28px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,241,184,0.14)',
                }}
              >
                <span
                  className="text-2xl font-black leading-none"
                  style={{
                    fontFamily: 'Cormorant Garamond, Georgia, serif',
                    background: 'linear-gradient(180deg, #fff1b8, #c9a84c)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
                  }}
                >
                  {previewName.charAt(0).toUpperCase() || 'J'}
                </span>
              </div>

              <div className="min-w-0">
                <p
                  className="truncate text-2xl font-black"
                  style={{ color: '#f0e6d3', fontFamily: 'Cormorant Garamond, Georgia, serif' }}
                >
                  {previewName}
                </p>
                <p
                  className="mt-1 text-[10px] font-black uppercase tracking-[0.22em]"
                  style={{ color: 'rgba(134,239,172,0.72)' }}
                >
                  Humano · Ranking ativo
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          {profile ? (
            <div className="mt-5 grid grid-cols-2 gap-3">
              <ProfileStat label="Rating" value={profile.rating.toLocaleString('pt-BR')} />
              <ProfileStat label="Partidas" value={profile.matchesPlayed} />
              <ProfileStat label="Vitórias" value={profile.wins} />
              <ProfileStat label="Derrotas" value={profile.losses} />
            </div>
          ) : null}
        </div>

        {/* RIGHT — edit form */}
        <div
          className="rounded-[28px] p-6 lg:p-8"
          style={{
            background: 'linear-gradient(180deg, rgba(6,12,20,0.65), rgba(4,8,14,0.50))',
            border: '1px solid rgba(255,255,255,0.07)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p
                className="text-[9px] font-black uppercase tracking-[0.26em]"
                style={{ color: '#e8c76a' }}
              >
                Editar nome
              </p>
              <h2
                className="mt-2 text-2xl font-black"
                style={{ color: '#f0e6d3', fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 600 }}
              >
                Nome público do jogador
              </h2>
            </div>

            <Link
              to="/lobby"
              className="rounded-2xl px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'rgba(255,255,255,0.62)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(201,168,76,0.32)';
                e.currentTarget.style.color = '#e8c76a';
                e.currentTarget.style.background = 'rgba(201,168,76,0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.62)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              }}
            >
              ← Lobby
            </Link>
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <label className="block">
              <span
                className="text-[10px] font-black uppercase tracking-[0.22em]"
                style={{ color: 'rgba(255,255,255,0.44)' }}
              >
                Nome exibido publicamente
              </span>

              <input
                value={publicName}
                onChange={(event) => {
                  setPublicName(event.target.value);
                  setStatus(null);
                }}
                maxLength={MAX_PUBLIC_NAME_LENGTH + 8}
                placeholder="Ex: Duh Flow"
                className="mt-3 w-full rounded-2xl px-5 py-4 text-lg font-black outline-none transition-all duration-200"
                style={{
                  background: 'rgba(0,0,0,0.32)',
                  border: '1px solid rgba(255,255,255,0.09)',
                  color: '#f0e6d3',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(232,199,106,0.50)';
                  e.currentTarget.style.boxShadow =
                    '0 0 0 1px rgba(201,168,76,0.22), inset 0 0 18px rgba(201,168,76,0.06), inset 0 1px 0 rgba(255,255,255,0.03)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
                  e.currentTarget.style.boxShadow = 'inset 0 1px 0 rgba(255,255,255,0.03)';
                }}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p
                className="text-[11px] font-bold"
                style={{ color: validationMessage ? 'rgba(248,113,113,0.9)' : 'rgba(255,255,255,0.34)' }}
              >
                {validationMessage ??
                  'Letras, números, espaços, ponto, underline, apóstrofo e hífen são aceitos.'}
              </p>
              <span
                className="text-[10px] font-black uppercase tracking-[0.18em]"
                style={{ color: characterCounterTone }}
              >
                {characterCount}/{MAX_PUBLIC_NAME_LENGTH}
              </span>
            </div>

            {status ? (
              <div
                className="rounded-2xl px-4 py-3 text-sm font-semibold"
                style={{
                  background:
                    status.tone === 'success'
                      ? 'rgba(20,83,45,0.32)'
                      : 'rgba(127,29,29,0.32)',
                  border:
                    status.tone === 'success'
                      ? '1px solid rgba(74,222,128,0.26)'
                      : '1px solid rgba(248,113,113,0.26)',
                  color: status.tone === 'success' ? '#86efac' : '#fca5a5',
                  boxShadow: `0 0 18px ${status.tone === 'success' ? 'rgba(34,197,94,0.10)' : 'rgba(220,38,38,0.10)'}`,
                }}
                aria-live="polite"
              >
                {status.message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="relative inline-flex w-full items-center justify-center overflow-hidden rounded-2xl px-5 py-4 text-sm font-black uppercase tracking-[0.2em] transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-40"
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, #fff1b8 0%, #e8c76a 35%, #c9a84c 65%, #8a6a28 100%)'
                  : 'rgba(255,255,255,0.06)',
                color: canSubmit ? '#1a0800' : 'rgba(255,255,255,0.24)',
                border: canSubmit
                  ? '1px solid rgba(255,241,184,0.72)'
                  : '1px solid rgba(255,255,255,0.06)',
                boxShadow: canSubmit
                  ? '0 0 32px rgba(201,168,76,0.30), 0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.38)'
                  : 'none',
              }}
              onMouseEnter={(e) => {
                if (!canSubmit) return;
                e.currentTarget.style.transform = 'translateY(-2px) scale(1.01)';
                e.currentTarget.style.boxShadow =
                  '0 0 44px rgba(201,168,76,0.44), 0 20px 44px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.40)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                if (!canSubmit) return;
                e.currentTarget.style.boxShadow =
                  '0 0 32px rgba(201,168,76,0.30), 0 16px 36px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.38)';
              }}
            >
              {/* Shimmer overlay */}
              {canSubmit ? (
                <span
                  className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl"
                  aria-hidden
                >
                  <span
                    className="absolute inset-0"
                    style={{
                      background:
                        'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.28) 50%, transparent 70%)',
                      animation: 'px-shine-loop 3.5s ease-in-out infinite',
                      mixBlendMode: 'overlay',
                    }}
                  />
                </span>
              ) : null}
              {isSaving ? 'Salvando...' : hasChanges ? 'Salvar nome público' : 'Nome já salvo'}
            </button>
          </form>

          {/* Onde aparece */}
          <div
            className="mt-8 rounded-[24px] p-5"
            style={{
              background: 'rgba(0,0,0,0.22)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <p
              className="text-[9px] font-black uppercase tracking-[0.24em]"
              style={{ color: 'rgba(255,255,255,0.28)' }}
            >
              Onde esse nome aparece
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {['Ranking', 'Cards da partida', 'Lobby', 'Histórico'].map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold"
                  style={{
                    background: 'rgba(255,255,255,0.035)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(240,230,211,0.70)',
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ background: '#c9a84c', boxShadow: '0 0 8px rgba(201,168,76,0.5)' }}
                  />
                  {item}
                </div>
              ))}
            </div>
          </div>

          {profile?.publicSlug ? (
            <p className="mt-5 text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.34)' }}>
              Identificador público atual:{' '}
              <span className="font-black" style={{ color: '#e8c76a' }}>
                @{profile.publicSlug}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
