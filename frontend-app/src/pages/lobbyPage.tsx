import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import {
  useLobbyRealtimeSession,
  type MatchHistoryListItemPayload,
} from '../features/lobby/useLobbyRealtimeSession';

type HeroAction = {
  label: string;
  detail: string;
  ctaLabel: string;
  disabled: boolean;
  onClick: () => void;
};

type ContinuationState =
  | 'reconnect'
  | 'active-room-waiting-ready'
  | 'active-room-ready'
  | 'recent-session'
  | 'first-session';

type ContinuationDescriptor = {
  state: ContinuationState;
  badge: string;
  badgeTone: 'gold' | 'green' | 'blue';
  title: string;
  summary: string;
  action: HeroAction;
};

const GOLD_GRAD = 'linear-gradient(135deg, #c9a84c, #8a6a28)';
const CARD_BG = 'linear-gradient(180deg, rgba(10,18,30,0.85), rgba(6,12,22,0.70))';
const CARD_BORDER = '1px solid rgba(201,168,76,0.16)';

function TopBar({ displayName }: { displayName: string }) {
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <header
      className="sticky top-0 z-50 flex items-center justify-between px-6 py-3"
      style={{
        background: 'rgba(4,8,16,0.97)',
        borderBottom: '1px solid rgba(201,168,76,0.14)',
        backdropFilter: 'blur(16px)',
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{
            background: GOLD_GRAD,
            boxShadow: '0 0 18px rgba(201,168,76,0.28)',
          }}
        >
          <span
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 18,
              fontWeight: 900,
              color: '#1a0800',
            }}
          >
            T
          </span>
        </div>

        <div className="flex flex-col leading-tight">
          <span
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: '0.18em',
              background: 'linear-gradient(135deg, #e8c76a, #c9a84c)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            TRUCO
          </span>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.3em',
              color: 'rgba(255,255,255,0.3)',
            }}
          >
            PAULISTA
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}
        >
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-black"
            style={{ background: GOLD_GRAD, color: '#1a0800' }}
          >
            {initial}
          </div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.75)',
              letterSpacing: '0.04em',
            }}
          >
            {displayName}
          </span>
        </div>

        <Link
          to="/"
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.1em',
            textDecoration: 'none',
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = 'rgba(201,168,76,0.7)';
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = 'rgba(255,255,255,0.3)';
          }}
        >
          Sair
        </Link>
      </div>
    </header>
  );
}

function SeatAvatar({
  isBot,
  isMe,
  ready,
  initial,
}: {
  isBot: boolean;
  isMe: boolean;
  ready: boolean;
  initial?: string;
}) {
  return (
    <div className="relative flex flex-col items-center gap-2">
      <div
        className="relative flex h-14 w-14 items-center justify-center rounded-full"
        style={{
          background: ready
            ? 'linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.08))'
            : 'rgba(255,255,255,0.04)',
          border: ready
            ? '2px solid rgba(201,168,76,0.6)'
            : '2px solid rgba(255,255,255,0.1)',
          boxShadow: ready ? '0 0 22px rgba(201,168,76,0.25)' : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        {isMe ? (
          <div
            className="absolute -top-2 -right-2 rounded-full px-1.5 py-0.5 text-[8px] font-black text-black shadow"
            style={{ background: GOLD_GRAD, letterSpacing: '0.08em' }}
          >
            VOCÊ
          </div>
        ) : null}

        {isBot ? (
          <svg className="h-7 w-7" fill="rgba(255,255,255,0.35)" viewBox="0 0 24 24">
            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2m-3 10a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3m6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3" />
          </svg>
        ) : initial ? (
          <span
            style={{
              fontFamily: 'Georgia, serif',
              fontSize: 20,
              fontWeight: 900,
              color: ready ? '#e8c76a' : 'rgba(255,255,255,0.5)',
            }}
          >
            {initial}
          </span>
        ) : (
          <svg className="h-7 w-7" fill="rgba(255,255,255,0.3)" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        )}

        {ready ? (
          <div
            className="pointer-events-none absolute inset-0 animate-ping rounded-full opacity-20"
            style={{ border: '2px solid rgba(201,168,76,0.6)' }}
          />
        ) : null}
      </div>
    </div>
  );
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: 'rgba(255,255,255,0.07)' }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, background: GOLD_GRAD }}
      />
    </div>
  );
}

function GoldButton({
  children,
  onClick,
  disabled,
  variant = 'solid',
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'solid' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const paddingMap = { sm: '8px 18px', md: '10px 22px', lg: '12px 28px' };
  const fontSizeMap = { sm: 10, md: 11, lg: 12 };

  const solidStyle = {
    background: disabled ? 'rgba(255,255,255,0.05)' : GOLD_GRAD,
    border: `1.5px solid ${
      disabled ? 'rgba(255,255,255,0.06)' : 'rgba(201,168,76,0.5)'
    }`,
    color: disabled ? 'rgba(255,255,255,0.2)' : '#1a0800',
    boxShadow: disabled
      ? 'none'
      : '0 0 22px rgba(201,168,76,0.28), 0 6px 16px rgba(0,0,0,0.3)',
  };

  const outlineStyle = {
    background: 'transparent',
    border: `1.5px solid ${
      disabled ? 'rgba(255,255,255,0.08)' : 'rgba(201,168,76,0.4)'
    }`,
    color: disabled ? 'rgba(255,255,255,0.2)' : 'rgba(201,168,76,0.9)',
    boxShadow: 'none',
  };

  const ghostStyle = {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.07)',
    color: disabled ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.6)',
    boxShadow: 'none',
  };

  const styleMap = {
    solid: solidStyle,
    outline: outlineStyle,
    ghost: ghostStyle,
  };

  const chosen = styleMap[variant];

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-black uppercase tracking-wider transition-all duration-200 ${
        !disabled ? 'hover:scale-[1.02]' : 'cursor-not-allowed'
      } ${className}`}
      style={{
        ...chosen,
        padding: paddingMap[size],
        fontSize: fontSizeMap[size],
        letterSpacing: '0.12em',
      }}
    >
      {children}
    </button>
  );
}

function resolveRecentMatchViewModel(
  historyItem: MatchHistoryListItemPayload,
  currentUserId: string | undefined,
): {
  resultLabel: string;
  resultTone: string;
  opponentLabel: string;
  scoreLabel: string;
  finishedAtLabel: string;
} {
  const myParticipant =
    historyItem.participants.find((participant) => participant.userId === currentUserId) ?? null;

  const didCurrentUserWin =
    (historyItem.winnerPlayerId === 'P1' && myParticipant?.seatId.startsWith('T1')) ||
    (historyItem.winnerPlayerId === 'P2' && myParticipant?.seatId.startsWith('T2'));

  const opponentParticipant =
    historyItem.participants.find((participant) => {
      if (!myParticipant) {
        return participant.userId !== currentUserId;
      }

      return participant.seatId !== myParticipant.seatId;
    }) ?? null;

  const finishedAtLabel = historyItem.finishedAt
    ? new Date(historyItem.finishedAt).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Agora';

  return {
    resultLabel:
      historyItem.status !== 'completed'
        ? 'Encerrada'
        : didCurrentUserWin
          ? 'Vitória'
          : 'Derrota',
    resultTone:
      historyItem.status !== 'completed'
        ? 'rgba(255,255,255,0.65)'
        : didCurrentUserWin
          ? '#4ade80'
          : '#f87171',
    opponentLabel:
      opponentParticipant?.displayName ?? (opponentParticipant?.isBot ? 'Bot' : '—'),
    scoreLabel: `${historyItem.finalScore.playerOne} × ${historyItem.finalScore.playerTwo}`,
    finishedAtLabel,
  };
}

function resolveContinuationDescriptor(params: {
  isSocketOnline: boolean;
  canConnect: boolean;
  canCreateMatch: boolean;
  canToggleReady: boolean;
  derivedMatchId: string;
  currentReady: boolean;
  latestHistoryItem: MatchHistoryListItemPayload | null;
  handleConnect: () => void;
  handleCreateMatch: () => void;
  handleReady: () => void;
}): ContinuationDescriptor {
  const {
    isSocketOnline,
    canConnect,
    canCreateMatch,
    canToggleReady,
    derivedMatchId,
    currentReady,
    latestHistoryItem,
    handleConnect,
    handleCreateMatch,
    handleReady,
  } = params;

  if (!isSocketOnline) {
    return {
      state: 'reconnect',
      badge: 'Reconexão',
      badgeTone: 'blue',
      title: 'Reconecte para retomar sua sessão',
      summary:
        'Abra a sessão em tempo real para recuperar sala ativa, histórico recente e ranking semanal.',
      action: {
        label: 'Conectar ao Lobby',
        detail:
          'Abra a sessão em tempo real para recuperar sua sala, histórico e ranking.',
        ctaLabel: 'Conectar Socket',
        disabled: !canConnect,
        onClick: handleConnect,
      },
    };
  }

  if (derivedMatchId) {
    if (!currentReady) {
      return {
        state: 'active-room-waiting-ready',
        badge: 'Sala Atual',
        badgeTone: 'gold',
        title: 'Sua sala atual ainda está aberta',
        summary:
          'Você já tem uma mesa em andamento. O próximo passo é confirmar presença para destravar a continuidade da sessão.',
        action: {
          label: 'Retomar Sala Atual',
          detail:
            'Você já tem uma mesa aberta. Confirme presença para continuar o fluxo da partida.',
          ctaLabel: 'Marcar como Pronto',
          disabled: !canToggleReady,
          onClick: handleReady,
        },
      };
    }

    return {
      state: 'active-room-ready',
      badge: 'Mesa Pronta',
      badgeTone: 'green',
      title: 'Tudo pronto para voltar ao jogo',
      summary:
        'Sua sala já está preparada. O caminho principal agora é retornar direto para a mesa e continuar a partida.',
      action: {
        label: 'Voltar para a Mesa',
        detail: 'Sua sala atual continua ativa. Retorne direto para o centro do jogo.',
        ctaLabel: 'Ir para Mesa →',
        disabled: false,
        onClick: () => {
          window.location.assign(`/match/${derivedMatchId}`);
        },
      },
    };
  }

  if (latestHistoryItem) {
    return {
      state: 'recent-session',
      badge: 'Sessão Recente',
      badgeTone: 'gold',
      title: 'Sua última partida já está registrada',
      summary:
        'O lobby já reconhece sua sessão anterior. Entre rápido em uma nova mesa e mantenha o ritmo da progressão.',
      action: {
        label: 'Continuar a Sessão',
        detail:
          'Sua última partida já está registrada. Entre rápido em uma nova mesa e mantenha o ritmo.',
        ctaLabel: 'Jogar Novamente',
        disabled: !canCreateMatch,
        onClick: handleCreateMatch,
      },
    };
  }

  return {
    state: 'first-session',
    badge: 'Primeira Partida',
    badgeTone: 'gold',
    title: 'Tudo pronto para abrir sua próxima mesa',
    summary:
      'Você já está autenticado e conectado. O próximo passo natural é criar uma nova partida e entrar no fluxo principal do jogo.',
    action: {
      label: 'Criar Primeira Partida',
      detail:
        'Você já está pronto para começar. Abra uma sala e entre no fluxo principal do jogo.',
      ctaLabel: 'Criar Partida',
      disabled: !canCreateMatch,
      onClick: handleCreateMatch,
    },
  };
}

function toneToStyles(tone: ContinuationDescriptor['badgeTone']) {
  if (tone === 'green') {
    return {
      background: 'rgba(34,197,94,0.1)',
      border: '1px solid rgba(34,197,94,0.24)',
      color: '#4ade80',
    };
  }

  if (tone === 'blue') {
    return {
      background: 'rgba(59,130,246,0.1)',
      border: '1px solid rgba(59,130,246,0.24)',
      color: '#93c5fd',
    };
  }

  return {
    background: 'rgba(201,168,76,0.08)',
    border: '1px solid rgba(201,168,76,0.18)',
    color: 'rgba(201,168,76,0.85)',
  };
}

export function LobbyPage() {
  const { session } = useAuth();
  const [matchId, setMatchId] = useState('');
  const [showJoinPanel, setShowJoinPanel] = useState(false);

  const {
    connectionStatus,
    roomState,
    playerAssigned,
    ranking,
    latestHistoryItem,
    derivedMatchId,
    roomPlayers,
    currentReady,
    isSocketOnline,
    canConnect,
    canCreateMatch,
    canJoinMatch,
    canToggleReady,
    canRequestState,
    handleConnect,
    handleDisconnect,
    handleCreateMatch,
    handleJoinMatch,
    handleReady,
    handleGetState,
    handleRefreshHistory,
  } = useLobbyRealtimeSession(session, matchId);

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const roomModeLabel = roomState?.mode === '2v2' ? '2v2' : '1v1';
  const readyCount = roomPlayers.filter((player) => player.ready).length;
  const playerCount = roomPlayers.length;
  const isOnline = connectionStatus === 'online';
  const displayName = session?.user?.displayName ?? session?.user?.email ?? 'Jogador';
  const currentUserId = session?.user?.id;

  const rankingEntries = useMemo(() => {
    return ranking.slice(0, 5).map((entry, index) => {
      const normalizedName =
        entry.displayName?.trim() || (entry.userId === currentUserId ? displayName : 'Jogador');
      const ratingValue = typeof entry.rating === 'number' ? entry.rating : 0;
      const isCurrentUser = currentUserId !== undefined && entry.userId === currentUserId;

      return {
        position: index + 1,
        name: normalizedName,
        ratingLabel: ratingValue.toLocaleString('pt-BR'),
        isCurrentUser,
      };
    });
  }, [currentUserId, displayName, ranking]);

  const recentMatchViewModel = useMemo(() => {
    if (!latestHistoryItem) {
      return null;
    }

    return resolveRecentMatchViewModel(latestHistoryItem, currentUserId);
  }, [currentUserId, latestHistoryItem]);

  const continuation = useMemo(() => {
    return resolveContinuationDescriptor({
      isSocketOnline,
      canConnect,
      canCreateMatch,
      canToggleReady,
      derivedMatchId,
      currentReady,
      latestHistoryItem,
      handleConnect,
      handleCreateMatch,
      handleReady,
    });
  }, [
    canConnect,
    canCreateMatch,
    canToggleReady,
    currentReady,
    derivedMatchId,
    handleConnect,
    handleCreateMatch,
    handleReady,
    isSocketOnline,
    latestHistoryItem,
  ]);

  const badgeStyles = useMemo(
    () => toneToStyles(continuation.badgeTone),
    [continuation.badgeTone],
  );

  const heroAction = continuation.action;

  const eyebrow = !hasMinimumSession
    ? 'Sessão Obrigatória'
    : !isSocketOnline
      ? 'Socket Offline'
      : !derivedMatchId
        ? 'Aguardando Sala'
        : 'Sala Pronta';

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          'radial-gradient(ellipse at 50% -5%, #0d1f2e 0%, #050810 50%, #040610 100%)',
      }}
    >
      <TopBar displayName={displayName} />

      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <div
          className="relative mb-6 overflow-hidden rounded-3xl p-6 lg:p-7"
          style={{
            background:
              'linear-gradient(135deg, rgba(10,20,36,0.95), rgba(6,12,22,0.88))',
            border: '1px solid rgba(201,168,76,0.22)',
            boxShadow: '0 0 0 1px rgba(201,168,76,0.05), 0 24px 60px rgba(0,0,0,0.35)',
          }}
        >
          <div
            className="pointer-events-none absolute -right-20 -top-20 rounded-full"
            style={{
              width: 240,
              height: 240,
              background: 'rgba(201,168,76,0.1)',
              filter: 'blur(60px)',
            }}
          />

          <div className="relative grid grid-cols-1 items-center gap-5 lg:grid-cols-[1fr_auto]">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <p
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.34em',
                    color: 'rgba(255,255,255,0.38)',
                    textTransform: 'uppercase',
                  }}
                >
                  BEM-VINDO DE VOLTA
                </p>

                <span
                  className="rounded-full px-3 py-1"
                  style={{
                    ...badgeStyles,
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                  }}
                >
                  {continuation.badge}
                </span>
              </div>

              <h1
                style={{
                  fontFamily: 'Georgia, serif',
                  fontSize: 'clamp(28px, 3.5vw, 44px)',
                  fontWeight: 700,
                  color: '#f0e6d3',
                  lineHeight: 1.05,
                  marginBottom: 10,
                  maxWidth: 760,
                }}
              >
                {continuation.title}
              </h1>

              <p
                style={{
                  fontSize: 13,
                  color: 'rgba(255,255,255,0.45)',
                  maxWidth: 560,
                  lineHeight: 1.5,
                }}
              >
                {continuation.summary}
              </p>
            </div>

            <div className="flex flex-wrap gap-3 lg:justify-end">
              <GoldButton size="lg" onClick={heroAction.onClick} disabled={heroAction.disabled}>
                {heroAction.ctaLabel}
              </GoldButton>

              <GoldButton
                size="lg"
                variant="outline"
                onClick={() => setShowJoinPanel((value) => !value)}
              >
                Entrar em sala
              </GoldButton>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_280px]">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: isOnline ? '#22c55e' : '#ef4444',
                      boxShadow: isOnline
                        ? '0 0 6px rgba(34,197,94,0.6)'
                        : '0 0 6px rgba(239,68,68,0.6)',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.28em',
                      color: isOnline ? '#4ade80' : '#f87171',
                      textTransform: 'uppercase',
                    }}
                  >
                    {eyebrow}
                  </span>
                </div>

                <h2
                  style={{
                    fontFamily: 'Georgia, serif',
                    fontSize: 22,
                    fontWeight: 700,
                    color: '#f0e6d3',
                    marginTop: 4,
                  }}
                >
                  Mesa de Jogo
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.45)',
                    letterSpacing: '0.1em',
                  }}
                >
                  {roomModeLabel.toUpperCase()}
                </span>

                <span
                  className="rounded-full px-3 py-1 text-xs font-bold"
                  style={{
                    background: isOnline
                      ? 'rgba(22,101,52,0.2)'
                      : 'rgba(153,27,27,0.2)',
                    border: isOnline
                      ? '1px solid rgba(34,197,94,0.25)'
                      : '1px solid rgba(239,68,68,0.25)',
                    color: isOnline ? '#4ade80' : '#f87171',
                    letterSpacing: '0.08em',
                  }}
                >
                  {connectionStatus.toUpperCase()}
                </span>
              </div>
            </div>

            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 40%, #1a5c2e 0%, #0f3d1e 40%, #082010 100%)',
                border: '2px solid rgba(201,168,76,0.2)',
                boxShadow:
                  '0 0 0 1px rgba(201,168,76,0.06), inset 0 0 80px rgba(0,0,0,0.45)',
                minHeight: 290,
              }}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E\")",
                }}
              />

              <div
                className="pointer-events-none absolute"
                style={{
                  inset: 18,
                  borderRadius: '50%',
                  border: '1.5px solid rgba(201,168,76,0.25)',
                  boxShadow: 'inset 0 0 60px rgba(0,0,0,0.4)',
                }}
              />

              {derivedMatchId ? (
                <div className="relative z-10 pt-4 text-center">
                  <span
                    className="rounded-full px-3 py-1 font-mono text-[10px]"
                    style={{
                      background: 'rgba(0,0,0,0.3)',
                      border: '1px solid rgba(201,168,76,0.15)',
                      color: 'rgba(201,168,76,0.6)',
                    }}
                  >
                    #{derivedMatchId}
                  </span>
                </div>
              ) : null}

              <div className="relative z-10 flex flex-col items-center justify-center gap-6 py-8 sm:gap-8">
                <div className="flex flex-col items-center gap-2">
                  <SeatAvatar
                    isBot={roomPlayers.find((player) => player.seatId === 'T2A')?.isBot ?? false}
                    isMe={playerAssigned?.seatId === 'T2A'}
                    ready={roomPlayers.find((player) => player.seatId === 'T2A')?.ready ?? false}
                  />
                  <div className="text-center">
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'rgba(255,255,255,0.5)',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Adversário
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.25)',
                        fontFamily: 'monospace',
                      }}
                    >
                      T2A
                    </p>
                  </div>
                </div>

                <div className="relative flex w-full max-w-xs items-center justify-center">
                  <div className="h-px flex-1" style={{ background: 'rgba(201,168,76,0.15)' }} />
                  <span
                    className="mx-3 px-3 py-1 text-[11px] font-black italic"
                    style={{
                      color: 'rgba(255,255,255,0.2)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    VS
                  </span>
                  <div className="h-px flex-1" style={{ background: 'rgba(201,168,76,0.15)' }} />
                </div>

                <div className="flex flex-col items-center gap-2">
                  <SeatAvatar
                    isBot={roomPlayers.find((player) => player.seatId === 'T1A')?.isBot ?? false}
                    isMe={playerAssigned?.seatId === 'T1A'}
                    ready={roomPlayers.find((player) => player.seatId === 'T1A')?.ready ?? false}
                  />
                  <div className="text-center">
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: 'rgba(201,168,76,0.8)',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Você
                    </p>
                    <p
                      style={{
                        fontSize: 10,
                        color: 'rgba(255,255,255,0.25)',
                        fontFamily: 'monospace',
                      }}
                    >
                      T1A
                    </p>
                  </div>
                </div>
              </div>

              {playerCount === 0 ? (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 backdrop-blur-sm"
                  style={{ background: 'rgba(4,8,14,0.65)' }}
                >
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'rgba(255,255,255,0.45)',
                      textAlign: 'center',
                      lineHeight: 1.55,
                    }}
                  >
                    Aguardando jogadores...
                    <br />
                    <span
                      style={{
                        fontSize: 10.5,
                        color: 'rgba(255,255,255,0.25)',
                      }}
                    >
                      Crie ou entre em uma partida para começar.
                    </span>
                  </div>
                </div>
              ) : null}
            </div>

            <div
              className="rounded-2xl p-5"
              style={{
                background: CARD_BG,
                border: CARD_BORDER,
                boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
              }}
            >
              <h3
                style={{
                  fontFamily: 'Georgia, serif',
                  fontSize: 17,
                  fontWeight: 700,
                  color: '#f0e6d3',
                  marginBottom: 4,
                }}
              >
                {heroAction.label}
              </h3>

              <p
                style={{
                  fontSize: 12.5,
                  color: 'rgba(255,255,255,0.42)',
                  marginBottom: 16,
                  lineHeight: 1.5,
                }}
              >
                {heroAction.detail}
              </p>

              <div className="flex flex-wrap gap-3">
                <GoldButton
                  onClick={heroAction.onClick}
                  disabled={heroAction.disabled}
                  size="lg"
                  className="flex-1"
                >
                  {heroAction.ctaLabel}
                </GoldButton>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <GoldButton variant="ghost" onClick={handleGetState} disabled={!canRequestState}>
                  Obter Estado
                </GoldButton>

                <GoldButton variant="ghost" onClick={handleDisconnect} disabled={!isSocketOnline}>
                  Desconectar
                </GoldButton>
              </div>

              <div
                className="mt-4 rounded-xl p-4"
                style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
              >
                <div className="mb-1 flex justify-between">
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: 'rgba(255,255,255,0.3)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Jogadores
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: '#f0e6d3',
                    }}
                  >
                    {playerCount} / 2
                  </span>
                </div>

                <ProgressBar value={playerCount} max={2} />

                <div className="mt-3 flex justify-between">
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.15em',
                      color: 'rgba(255,255,255,0.3)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Prontos
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 900,
                      color: '#4ade80',
                    }}
                  >
                    {readyCount} / {playerCount}
                  </span>
                </div>
              </div>
            </div>

            {showJoinPanel ? (
              <div
                className="rounded-2xl p-5"
                style={{ background: CARD_BG, border: CARD_BORDER }}
              >
                <h3
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.15em',
                    color: 'rgba(255,255,255,0.4)',
                    textTransform: 'uppercase',
                    marginBottom: 12,
                  }}
                >
                  Entrar em Sala Existente
                </h3>

                <div className="flex gap-3">
                  <input
                    value={matchId}
                    onChange={(event) => setMatchId(event.target.value)}
                    placeholder="Cole o Match ID aqui..."
                    className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: '#d1d5db',
                    }}
                  />
                  <GoldButton onClick={() => handleJoinMatch(matchId)} disabled={!canJoinMatch}>
                    Entrar
                  </GoldButton>
                </div>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4">
            {!hasMinimumSession ? (
              <div
                className="rounded-2xl p-5"
                style={{
                  background: 'rgba(153,27,27,0.12)',
                  border: '1px solid rgba(239,68,68,0.2)',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.18em',
                    color: '#f87171',
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Sessão necessária
                </div>

                <p
                  style={{
                    fontSize: 13,
                    color: 'rgba(255,255,255,0.55)',
                    lineHeight: 1.5,
                  }}
                >
                  Faça login para acessar o lobby e criar partidas.
                </p>

                <Link
                  to="/"
                  className="mt-4 inline-block rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider"
                  style={{
                    background: 'rgba(239,68,68,0.15)',
                    border: '1px solid rgba(239,68,68,0.25)',
                    color: '#fca5a5',
                    textDecoration: 'none',
                  }}
                >
                  Ir para Login
                </Link>
              </div>
            ) : null}

            <div
              className="rounded-2xl p-4"
              style={{
                background:
                  'linear-gradient(180deg, rgba(10,18,30,0.88), rgba(7,13,23,0.74))',
                border: CARD_BORDER,
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    color: 'rgba(201,168,76,0.8)',
                    textTransform: 'uppercase',
                  }}
                >
                  Última Partida
                </h3>

                <GoldButton
                  size="sm"
                  variant="ghost"
                  onClick={handleRefreshHistory}
                  disabled={!isSocketOnline}
                >
                  Atualizar
                </GoldButton>
              </div>

              {latestHistoryItem && recentMatchViewModel ? (
                <div className="space-y-3">
                  <div
                    className="rounded-xl px-3 py-3"
                    style={{
                      background: 'rgba(0,0,0,0.22)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: recentMatchViewModel.resultTone,
                        }}
                      >
                        {recentMatchViewModel.resultLabel}
                      </span>

                      <span
                        style={{
                          fontSize: 10,
                          color: 'rgba(255,255,255,0.35)',
                          letterSpacing: '0.08em',
                        }}
                      >
                        {recentMatchViewModel.finishedAtLabel}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                          Oponente
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: '#f0e6d3',
                          }}
                        >
                          {recentMatchViewModel.opponentLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                          Placar
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'rgba(201,168,76,0.85)',
                          }}
                        >
                          {recentMatchViewModel.scoreLabel}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)' }}>
                          Match ID
                        </span>
                        <span
                          style={{
                            fontSize: 10,
                            fontFamily: 'monospace',
                            color: 'rgba(255,255,255,0.58)',
                          }}
                        >
                          #{latestHistoryItem.matchId.slice(-8)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {!derivedMatchId ? (
                    <GoldButton size="md" className="w-full" onClick={handleCreateMatch}>
                      Jogar Novamente
                    </GoldButton>
                  ) : null}
                </div>
              ) : (
                <div
                  className="rounded-xl px-3 py-4"
                  style={{
                    background: 'rgba(0,0,0,0.22)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.52)',
                      lineHeight: 1.5,
                    }}
                  >
                    Termine uma partida para começar a montar seu histórico recente aqui.
                  </p>
                </div>
              )}
            </div>

            <div
              className="rounded-2xl p-4"
              style={{ background: CARD_BG, border: CARD_BORDER }}
            >
              <h3
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  color: 'rgba(255,255,255,0.35)',
                  textTransform: 'uppercase',
                  marginBottom: 12,
                }}
              >
                Status da Sala
              </h3>

              <div className="space-y-2.5">
                {[
                  { label: 'Modo', value: roomModeLabel.toUpperCase() },
                  {
                    label: 'Conexão',
                    value: connectionStatus.toUpperCase(),
                    highlight: isOnline,
                  },
                  {
                    label: 'Match ID',
                    value: derivedMatchId ? `#${derivedMatchId.slice(-8)}` : '—',
                    mono: true,
                  },
                  { label: 'Pronto', value: currentReady ? 'Sim' : 'Não', highlight: currentReady },
                ].map(({ label, value, highlight, mono }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{label}</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: mono ? 'monospace' : undefined,
                        color: highlight ? '#4ade80' : 'rgba(255,255,255,0.7)',
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-2xl p-4"
              style={{
                background:
                  'radial-gradient(ellipse at 50% 0%, #1a5c2e 0%, #0f3d1e 50%, #082010 100%)',
                border: '1px solid rgba(201,168,76,0.2)',
              }}
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.2em',
                    color: 'rgba(201,168,76,0.8)',
                    textTransform: 'uppercase',
                  }}
                >
                  Ranking Semanal
                </h3>

                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    color: 'rgba(255,255,255,0.35)',
                    textTransform: 'uppercase',
                  }}
                >
                  Top 5
                </span>
              </div>

              {rankingEntries.length > 0 ? (
                <div className="space-y-2">
                  {rankingEntries.map((entry) => (
                    <div
                      key={`${entry.position}-${entry.name}`}
                      className="flex items-center justify-between rounded-xl px-3 py-2"
                      style={{
                        background: entry.isCurrentUser
                          ? 'rgba(201,168,76,0.12)'
                          : 'rgba(0,0,0,0.22)',
                        border: entry.isCurrentUser
                          ? '1px solid rgba(201,168,76,0.24)'
                          : '1px solid transparent',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          style={{
                            fontFamily: 'Georgia, serif',
                            fontSize: 13,
                            fontWeight: 700,
                            background: 'linear-gradient(135deg, #e8c76a, #c9a84c)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                            width: 16,
                          }}
                        >
                          {entry.position}
                        </span>

                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 13, color: '#f0e6d3' }}>{entry.name}</span>
                          {entry.isCurrentUser ? (
                            <span
                              className="rounded-full px-2 py-0.5 text-[9px] font-black"
                              style={{
                                background: 'rgba(201,168,76,0.16)',
                                color: '#e8c76a',
                                letterSpacing: '0.08em',
                              }}
                            >
                              VOCÊ
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          color: 'rgba(201,168,76,0.85)',
                          fontWeight: 700,
                        }}
                      >
                        ⭐ {entry.ratingLabel}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="rounded-xl px-3 py-4"
                  style={{
                    background: 'rgba(0,0,0,0.22)',
                    border: '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.52)',
                      lineHeight: 1.5,
                    }}
                  >
                    Conecte-se ao lobby para carregar o ranking real da semana.
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
