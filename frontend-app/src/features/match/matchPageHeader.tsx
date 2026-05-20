import { useEffect, useRef, useState, type ReactNode } from 'react';

import type { Rank } from '../../services/socket/socketTypes';
import { resolveValeTier, type ValeTier } from './matchPresentationSelectors';

type RoundChip = {
  result: string | null;
  finished: boolean;
};

type RoundVisualState = 'us' | 'them' | 'tie' | 'empty';

const MAX_ROUND_CHIPS = 3;

function shouldShowMatchHeaderDebug(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  return params.get('debugMatch') === '1' || params.get('debugTruco') === '1';
}

function getValeTierVisuals(tier: ValeTier) {
  switch (tier) {
    case 'gold':
      return {
        background: 'linear-gradient(135deg, #fff1b8 0%, #e8c76a 38%, #c9a84c 72%, #6f4f14 100%)',
        border: '1px solid rgba(255,241,184,0.76)',
        textColor: '#170d02',
        glow: '0 0 22px rgba(201,168,76,0.34), 0 12px 24px rgba(0,0,0,0.36)',
      };
    case 'orange':
      return {
        background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 42%, #b45309 74%, #5f2d08 100%)',
        border: '1px solid rgba(251,191,36,0.72)',
        textColor: '#1a0500',
        glow: '0 0 26px rgba(245,158,11,0.44), 0 12px 24px rgba(0,0,0,0.38)',
      };
    case 'red':
      return {
        background: 'linear-gradient(135deg, #fca5a5 0%, #ef4444 42%, #991b1b 78%, #450a0a 100%)',
        border: '1px solid rgba(252,165,165,0.70)',
        textColor: '#fff5f5',
        glow: '0 0 30px rgba(220,38,38,0.50), 0 14px 28px rgba(0,0,0,0.42)',
      };
    case 'red-pulse':
      return {
        background: 'linear-gradient(135deg, #fee2e2 0%, #f87171 36%, #dc2626 68%, #450a0a 100%)',
        border: '1px solid rgba(254,226,226,0.84)',
        textColor: '#ffffff',
        glow: '0 0 40px rgba(248,113,113,0.64), 0 14px 30px rgba(0,0,0,0.46)',
      };
    case 'muted':
    default:
      return {
        background: 'linear-gradient(180deg, rgba(28,24,16,0.94), rgba(12,11,8,0.88))',
        border: '1px solid rgba(230,195,100,0.24)',
        textColor: 'rgba(232,199,106,0.88)',
        glow: '0 10px 22px rgba(0,0,0,0.32)',
      };
  }
}

function resolveRoundVisualState({
  round,
  ownTeam,
}: {
  round: RoundChip;
  ownTeam: 'P1' | 'P2' | null;
}): RoundVisualState {
  if (round.result === null) {
    return 'empty';
  }

  const normalizedResult =
    round.result === 'T1' ? 'P1' : round.result === 'T2' ? 'P2' : round.result;

  if (normalizedResult === 'TIE') {
    return 'tie';
  }

  if (ownTeam !== null && normalizedResult === ownTeam) {
    return 'us';
  }

  if (normalizedResult === 'P1' || normalizedResult === 'P2') {
    return 'them';
  }

  return 'empty';
}

function getRoundChipVisuals(state: RoundVisualState) {
  switch (state) {
    case 'us':
      return {
        label: 'Nós',
        dot: 'radial-gradient(circle at 35% 28%, #fff7d6 0%, #f2d488 32%, #c9a84c 66%, #604711 100%)',
        border: '1px solid rgba(255,241,184,0.92)',
        shadow:
          '0 0 16px rgba(242,212,136,0.60), 0 0 7px rgba(255,241,184,0.40), inset 0 1px 0 rgba(255,255,255,0.34)',
        text: '#f8e7b4',
      };
    case 'them':
      return {
        label: 'Eles',
        dot: 'radial-gradient(circle at 35% 28%, #fecaca 0%, #ef4444 35%, #991b1b 72%, #450a0a 100%)',
        border: '1px solid rgba(254,202,202,0.80)',
        shadow: '0 0 14px rgba(220,38,38,0.50), inset 0 1px 0 rgba(255,255,255,0.22)',
        text: '#fecaca',
      };
    case 'tie':
      return {
        label: 'Empate',
        dot: 'radial-gradient(circle at 35% 28%, #f8fafc 0%, #cbd5e1 38%, #64748b 72%, #1e293b 100%)',
        border: '1px solid rgba(226,232,240,0.76)',
        shadow: '0 0 12px rgba(203,213,225,0.42), inset 0 1px 0 rgba(255,255,255,0.26)',
        text: '#dbe4ef',
      };
    case 'empty':
    default:
      return {
        label: '—',
        dot: 'linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.03))',
        border: '1px solid rgba(255,255,255,0.10)',
        shadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 5px 10px rgba(0,0,0,0.20)',
        text: 'rgba(240,230,211,0.34)',
      };
  }
}

function buildRoundSlots(rounds?: RoundChip[]): RoundChip[] {
  const provided = rounds ?? [];
  const slots: RoundChip[] = [];

  for (let index = 0; index < MAX_ROUND_CHIPS; index += 1) {
    slots.push(provided[index] ?? { result: null, finished: false });
  }

  return slots;
}

function ScoreColumn({
  label,
  score,
  tone,
}: {
  label: string;
  score: string;
  tone: 'us' | 'them';
}) {
  const accentColor = tone === 'us' ? '#4ade80' : '#f87171';
  const previousScoreRef = useRef<string>(score);
  const [bumpKey, setBumpKey] = useState(0);

  useEffect(() => {
    if (previousScoreRef.current !== score) {
      previousScoreRef.current = score;
      setBumpKey((key) => key + 1);
    }
  }, [score]);

  return (
    <div className="flex min-w-[64px] flex-col items-center justify-center">
      <span
        className="text-[9px] font-black uppercase tracking-[0.28em]"
        style={{
          color: accentColor,
          fontFamily: 'Georgia, serif',
          textShadow: `0 0 10px ${
            tone === 'us' ? 'rgba(74,222,128,0.42)' : 'rgba(248,113,113,0.42)'
          }`,
        }}
      >
        {label}
      </span>

      <span
        key={bumpKey}
        className="mt-0.5 inline-block text-[27px] font-black leading-none sm:text-[30px]"
        style={{
          color: '#f6efe2',
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          textShadow:
            '0 4px 14px rgba(0,0,0,0.48), 0 1px 0 rgba(255,255,255,0.14), 0 0 24px rgba(201,168,76,0.18)',
          animation:
            bumpKey > 0
              ? 'px-score-bump 0.7s cubic-bezier(0.34, 1.56, 0.64, 1), px-score-breathe 5s ease-in-out 0.7s infinite'
              : 'px-score-breathe 5s ease-in-out infinite',
          transformOrigin: 'center',
        }}
      >
        {score}
      </span>
    </div>
  );
}

function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'gold' | 'success' | 'danger';
}) {
  const styles =
    tone === 'gold'
      ? {
          background: 'rgba(201,168,76,0.10)',
          border: '1px solid rgba(255,223,128,0.20)',
          color: 'rgba(255,236,177,0.82)',
          boxShadow: '0 0 12px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,241,184,0.08)',
        }
      : tone === 'success'
        ? {
            background: 'rgba(34,197,94,0.10)',
            border: '1px solid rgba(74,222,128,0.20)',
            color: 'rgba(134,239,172,0.86)',
            boxShadow: '0 0 12px rgba(34,197,94,0.10), inset 0 1px 0 rgba(74,222,128,0.08)',
          }
        : tone === 'danger'
          ? {
              background: 'rgba(220,38,38,0.12)',
              border: '1px solid rgba(248,113,113,0.22)',
              color: 'rgba(254,202,202,0.84)',
              boxShadow:
                '0 0 14px rgba(220,38,38,0.16), inset 0 1px 0 rgba(248,113,113,0.10)',
            }
          : {
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(240,230,211,0.50)',
            };

  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-[1px] text-[8px] font-black uppercase tracking-[0.16em]"
      style={styles}
    >
      {children}
    </span>
  );
}

function RoundTracker({
  rounds,
  ownTeam,
}: {
  rounds: RoundChip[] | undefined;
  ownTeam: 'P1' | 'P2' | null;
}) {
  const roundSlots = buildRoundSlots(rounds);
  const playedCount = roundSlots.filter((round) => round.result !== null).length;
  const previousStatesRef = useRef<RoundVisualState[]>([]);
  const currentStates = roundSlots.map((round) => resolveRoundVisualState({ round, ownTeam }));
  const justResolvedIndexes = currentStates.map((state, index) => {
    const previousState = previousStatesRef.current[index];

    return previousState === 'empty' && state !== 'empty';
  });

  previousStatesRef.current = currentStates;

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-2 py-0.5"
      aria-label={`Rodadas ${playedCount}/${MAX_ROUND_CHIPS}`}
      style={{
        background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.18))',
        border: '1px solid rgba(201,168,76,0.10)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <span className="mr-0.5 text-[7px] font-black uppercase tracking-[0.20em] text-amber-100/50">
        Rodadas
      </span>

      {roundSlots.map((round, index) => {
        const state = currentStates[index]!;
        const visuals = getRoundChipVisuals(state);
        const justResolved = justResolvedIndexes[index];

        return (
          <span key={index} className="flex items-center gap-1">
            <span className="text-[6px] font-black leading-none" style={{ color: visuals.text }}>
              {index + 1}
            </span>

            <span
              className="h-[10px] w-[10px] rounded-full"
              title={`Rodada ${index + 1}: ${visuals.label}`}
              data-just-resolved={justResolved ? 'true' : undefined}
              style={{
                background: visuals.dot,
                border: visuals.border,
                boxShadow: visuals.shadow,
                opacity: state === 'empty' ? 0.72 : 1,
                transform: state === 'empty' ? 'scale(0.82)' : 'scale(1)',
                transition: 'all 0.3s cubic-bezier(0.20, 0.90, 0.24, 1)',
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

export function MatchPageHeader({
  connectionStatus,
  resolvedMatchId,
  mySeat,
  viraRank,
  canStartHand,
  onRefreshState,
  onStartHand,
  scoreLabel,
  currentValue,
  rounds,
  stateLabel,
}: {
  connectionStatus: 'offline' | 'online';
  resolvedMatchId: string;
  mySeat: string | null;
  viraRank: Rank;
  canStartHand: boolean;
  onRefreshState: () => void;
  onStartHand: () => void;
  scoreLabel?: string;
  currentValue?: number;
  rounds?: RoundChip[];
  stateLabel?: string;
}) {
  const isOnline = connectionStatus === 'online';
  const showDebugMeta = shouldShowMatchHeaderDebug();
  const scoreT1 = scoreLabel?.match(/T1\s+(\d+)/)?.[1] ?? '0';
  const scoreT2 = scoreLabel?.match(/T2\s+(\d+)/)?.[1] ?? '0';
  const myTeam =
    mySeat === 'T1A' || mySeat === 'T1B'
      ? 'T1'
      : mySeat === 'T2A' || mySeat === 'T2B'
        ? 'T2'
        : null;
  const ownTeam: 'P1' | 'P2' | null = myTeam === 'T2' ? 'P2' : myTeam === 'T1' ? 'P1' : null;
  const usScore = myTeam === 'T2' ? scoreT2 : scoreT1;
  const themScore = myTeam === 'T2' ? scoreT1 : scoreT2;
  const resolvedCurrentValue = currentValue ?? 1;
  const valeVisuals = getValeTierVisuals(resolveValeTier(resolvedCurrentValue));
  const abbreviatedMatchId = resolvedMatchId ? `#${resolvedMatchId.slice(-6)}` : '#------';
  const statusLabel = stateLabel ?? (isOnline ? 'Mesa sincronizada' : 'Reconectando');

  return (
    <header
      className="relative overflow-hidden px-1.5 py-0 sm:px-4 sm:py-0.5"
      style={{
        background:
          'linear-gradient(180deg, rgba(8,12,20,0.98) 0%, rgba(7,13,18,0.96) 54%, rgba(4,8,12,0.92) 100%)',
        borderBottom: '1px solid rgba(201,168,76,0.18)',
        boxShadow:
          '0 14px 34px rgba(0,0,0,0.30), 0 0 28px rgba(201,168,76,0.04), inset 0 1px 0 rgba(255,241,184,0.05)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,223,128,0.56) 50%, transparent 100%)',
          backgroundSize: '200% 100%',
          animation: 'px-gold-shimmer 8s ease-in-out infinite',
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute left-[34%] top-[-92px] h-[180px] w-[32%] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(201,168,76,0.14) 0%, transparent 68%)',
          filter: 'blur(18px)',
          animation: 'px-frame-breathe 7s ease-in-out infinite',
        }}
      />

      <div className="relative z-10 grid min-h-[38px] grid-cols-1 items-center gap-0.5 sm:min-h-[52px] sm:gap-1 xl:grid-cols-[minmax(190px,0.72fr)_minmax(390px,1.18fr)_minmax(190px,0.72fr)] xl:gap-2">
        <div className="hidden min-w-0 items-center gap-3 sm:flex">
          <div
            className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px]"
            style={{
              background:
                'linear-gradient(145deg, rgba(40,30,12,0.98), rgba(8,12,14,0.94))',
              border: '1px solid rgba(255,223,128,0.32)',
              boxShadow:
                '0 12px 22px rgba(0,0,0,0.32), 0 0 16px rgba(201,168,76,0.18), inset 0 1px 0 rgba(255,241,184,0.14)',
            }}
          >
            <span
              className="text-[12px] font-black leading-none"
              style={{
                background:
                  'linear-gradient(180deg, #fff1b8 0%, #e8c76a 50%, #c9a84c 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                fontFamily: 'Georgia, serif',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
              }}
            >
              TP
            </span>
          </div>

          <div className="min-w-0">
            <div
              className="truncate text-[10px] font-black uppercase tracking-[0.24em]"
              style={{
                color: '#e8c76a',
                fontFamily: 'Georgia, serif',
                textShadow: '0 0 14px rgba(201,168,76,0.32)',
              }}
            >
              Mesa ao vivo
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Pill tone={mySeat ? 'success' : 'neutral'}>{mySeat ? 'Você' : 'Entrando'}</Pill>

              {showDebugMeta ? <Pill tone="neutral">Seat {mySeat ?? '—'}</Pill> : null}

              <Pill tone="gold">Vira {viraRank}</Pill>
            </div>
          </div>
        </div>

        <section
          className="relative mx-auto flex w-full max-w-[470px] items-center justify-center gap-1 rounded-[14px] px-1.5 py-0 sm:gap-2.5 sm:rounded-[18px] sm:px-3 sm:py-0.5"
          aria-label="Placar da partida"
          style={{
            background:
              'linear-gradient(180deg, rgba(12,18,28,0.94) 0%, rgba(6,10,16,0.94) 100%)',
            border: '1px solid rgba(201,168,76,0.32)',
            boxShadow:
              '0 18px 38px rgba(0,0,0,0.42), 0 0 24px rgba(201,168,76,0.12), inset 0 1px 0 rgba(255,255,255,0.06)',
          }}
        >
          <div
            aria-hidden
            className="absolute inset-x-8 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,223,128,0.62) 50%, transparent 100%)',
            }}
          />

          <ScoreColumn label="Nós" score={usScore} tone="us" />

          <div className="flex min-w-[82px] flex-col items-center sm:min-w-[122px]">
            <div
              className="relative flex h-[30px] w-[30px] items-center justify-center rounded-full sm:h-[38px] sm:w-[38px]"
              style={{
                background: valeVisuals.background,
                border: valeVisuals.border,
                boxShadow: valeVisuals.glow,
              }}
              aria-label={`Vale ${resolvedCurrentValue}`}
            >
              <span
                className="text-[7px] font-black uppercase tracking-[0.08em] sm:text-[8px]"
                style={{
                  color: valeVisuals.textColor,
                  fontFamily: 'Georgia, serif',
                }}
              >
                Vale
              </span>

              <span
                className="ml-0.5 text-[15px] font-black leading-none sm:text-[18px]"
                style={{
                  color: valeVisuals.textColor,
                  fontFamily: 'Cormorant Garamond, Georgia, serif',
                  textShadow: '0 1px 0 rgba(255,255,255,0.18)',
                }}
              >
                {resolvedCurrentValue}
              </span>
            </div>

            <div className="mt-0.5">
              <RoundTracker rounds={rounds} ownTeam={ownTeam} />
            </div>
          </div>

          <ScoreColumn label="Eles" score={themScore} tone="them" />
        </section>

        <div className="hidden items-center justify-start gap-2 sm:flex xl:justify-end">
          <div className="hidden min-w-0 flex-col items-end xl:flex">
            <Pill tone={isOnline ? 'success' : 'danger'}>
              <span
                aria-hidden
                className="relative h-2 w-2 rounded-full"
                style={{
                  background: isOnline ? '#22c55e' : '#ef4444',
                  boxShadow: isOnline
                    ? '0 0 10px rgba(34,197,94,0.68)'
                    : '0 0 10px rgba(239,68,68,0.68)',
                }}
              >
                {isOnline ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-emerald-400/60"
                    style={{ animation: 'px-dot-ripple 2.2s ease-out infinite' }}
                  />
                ) : null}
              </span>
              {statusLabel}
            </Pill>

            {showDebugMeta ? (
              <span className="mt-0.5 text-[7px] font-black uppercase tracking-[0.18em] text-white/32">
                Partida {abbreviatedMatchId}
              </span>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onRefreshState}
            className="rounded-[10px] px-2 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-amber-100/62 transition hover:text-amber-100"
            style={{
              background:
                'linear-gradient(180deg, rgba(15,22,30,0.82), rgba(6,10,14,0.86))',
              border: '1px solid rgba(201,168,76,0.14)',
              boxShadow:
                '0 10px 20px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            Atualizar
          </button>

          <button
            type="button"
            onClick={onStartHand}
            disabled={!canStartHand}
            aria-disabled={!canStartHand}
            className={`rounded-[10px] px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.16em] transition-all duration-200 ${
              canStartHand ? 'px-shine' : ''
            }`}
            style={
              canStartHand
                ? {
                    background:
                      'linear-gradient(135deg, #fff1b8 0%, #e8c76a 38%, #c9a84c 72%, #6f4f14 100%)',
                    border: '1px solid rgba(255,241,184,0.74)',
                    color: '#1a0a00',
                    boxShadow:
                      '0 0 22px rgba(230,195,100,0.34), 0 12px 24px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.36)',
                  }
                : {
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: 'rgba(255,255,255,0.26)',
                    cursor: 'not-allowed',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                  }
            }
          >
            Nova mão
          </button>
        </div>
      </div>
    </header>
  );
}
