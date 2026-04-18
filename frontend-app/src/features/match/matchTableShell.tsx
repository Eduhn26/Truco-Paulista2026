import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { MatchActionSurface } from './matchActionSurface';
import type { MatchAction } from './matchActionTypes';
import { MatchPlayerHandDock } from './matchPlayerHandDock';
import { resolveValeTier, type ValeTier } from './matchPresentationSelectors';
import type { CardPayload, MatchStatePayload, Rank } from '../../services/socket/socketTypes';
import { useConfetti } from '../../hooks/useConfetti';
import { useGameSound } from '../../hooks/useGameSound';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
type HandStatusVariant = 'neutral' | 'success' | 'warning';

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
};

type RoundView = NonNullable<MatchStatePayload['currentHand']>['rounds'][number] | null;

type MatchTableShellProps = {
  handStatusLabel: string;
  handStatusTone: HandStatusVariant;
  betState: string;
  currentValue: number;
  pendingValue: number | null;
  requestedBy: string | null;
  specialState: string;
  specialDecisionPending: boolean;
  specialDecisionBy: string | null;
  winner: string | null;
  awardedPoints: number | null;
  latestRound: RoundView;
  latestRoundMyPlayedCard: string | null;
  latestRoundOpponentPlayedCard: string | null;
  displayedResolvedRoundFinished: boolean;
  displayedResolvedRoundResult: string | null;
  tablePhase: TablePhase;
  canStartHand: boolean;
  scoreLabel: string;
  opponentSeatView: TableSeatView | null;
  mySeatView: TableSeatView | null;
  isOneVsOne: boolean;
  roomMode: string | null;
  currentTurnSeatId: string | null;
  displayedOpponentPlayedCard: string | null;
  displayedMyPlayedCard: string | null;
  opponentRevealKey: number;
  myRevealKey: number;
  myCardLaunching: boolean;
  roundIntroKey: number;
  roundResolvedKey: number;
  currentPrivateViraRank: Rank | null;
  currentPublicViraRank: Rank | null;
  viraRank: Rank;
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
  myCards: CardPayload[];
  canPlayCard: boolean;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
  playedRoundsCount: number;
  isMyTurn?: boolean;
  isResolvingRound: boolean;
  closingTableCards: { mine: string | null; opponent: string | null };
  suppressHandOutcomeModal?: boolean;
  onHandClimaxDismissed?: () => void;
};

const SUIT_SYMBOL_MAP: Record<string, string> = {
  C: '♣',
  O: '♦',
  P: '♥',
  E: '♠',
};

// CHANGE: climax auto-dismiss duration. After this, the climax card fades out
// on its own — the fix for the "modal travado" bug. The underlying tablePhase
// may stay at 'hand_finished' (backend-authoritative) but the visual takeover
// lifts itself so the player sees the mesa again and can click "Nova mão"
// without a blocker.
const CLIMAX_AUTO_DISMISS_MS = 2800;

function parseSuitColor(suit: string): boolean {
  return suit === 'P' || suit === 'O';
}

function getTierVisuals(tier: ValeTier) {
  switch (tier) {
    case 'gold':
      return {
        background: 'linear-gradient(135deg, #e8c76a 0%, #c9a84c 55%, #8a6a28 100%)',
        border: '1px solid rgba(255,223,128,0.64)',
        textColor: '#1a0a00',
        glow: '0 0 28px rgba(201,168,76,0.45), 0 20px 42px rgba(0,0,0,0.38)',
      };
    case 'orange':
      return {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 55%, #92400e 100%)',
        border: '1px solid rgba(251,191,36,0.62)',
        textColor: '#1a0500',
        glow: '0 0 36px rgba(245,158,11,0.52), 0 20px 42px rgba(0,0,0,0.40)',
      };
    case 'red':
      return {
        background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 55%, #7f1d1d 100%)',
        border: '1px solid rgba(252,165,165,0.62)',
        textColor: '#fff5f5',
        glow: '0 0 44px rgba(220,38,38,0.58), 0 20px 42px rgba(0,0,0,0.42)',
      };
    case 'red-pulse':
      return {
        background: 'linear-gradient(135deg, #fca5a5 0%, #dc2626 55%, #450a0a 100%)',
        border: '1px solid rgba(254,226,226,0.82)',
        textColor: '#ffffff',
        glow: '0 0 56px rgba(248,113,113,0.72), 0 20px 42px rgba(0,0,0,0.44)',
      };
    case 'muted':
    default:
      return {
        background: 'linear-gradient(135deg, #3a3424, #221f14)',
        border: '1px solid rgba(201,168,76,0.22)',
        textColor: 'rgba(232,199,106,0.82)',
        glow: '0 14px 30px rgba(0,0,0,0.26)',
      };
  }
}

function CardShape({
  rank,
  suit,
  faceDown = false,
  winner = false,
  highlight = false,
  compact = false,
}: {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
  winner?: boolean;
  highlight?: boolean;
  compact?: boolean;
}) {
  const isRed = parseSuitColor(suit ?? '');
  const symbol = suit ? SUIT_SYMBOL_MAP[suit] : '♦';

  if (faceDown) {
    // Face-down back with TP monogram in gold (kept from previous patch —
    // matches the reference image's opponent card backs).
    return (
      <div
        className={`relative rounded-[14px] border ${compact ? 'h-[96px] w-[68px]' : 'h-[120px] w-[86px]'}`}
        style={{
          background: 'linear-gradient(180deg, #132643 0%, #0b1a32 50%, #091528 100%)',
          borderColor: 'rgba(230,195,100,0.32)',
          boxShadow:
            '0 14px 28px rgba(0,0,0,0.55), inset 0 0 18px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="absolute inset-[4px] rounded-[10px]"
          style={{
            background:
              'repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 4px)',
            border: '1px solid rgba(255,255,255,0.05)',
          }}
        />

        <div
          className="absolute inset-0 flex items-center justify-center font-black"
          style={{
            fontFamily: 'Georgia, serif',
            fontSize: compact ? 20 : 26,
            letterSpacing: '0.02em',
            color: 'transparent',
            background: 'linear-gradient(180deg, #f2d488 0%, #c9a84c 55%, #8a6a28 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.30))',
          }}
        >
          TP
        </div>

        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: compact ? 42 : 54,
            height: compact ? 42 : 54,
            border: '1px solid rgba(230,195,100,0.24)',
            boxShadow: 'inset 0 0 12px rgba(230,195,100,0.12)',
          }}
        />
      </div>
    );
  }

  return (
    <motion.div
      animate={
        winner
          ? { y: [-2, -8, -2], rotate: [0, 0.7, 0], scale: [1.02, 1.06, 1.02] }
          : highlight
            ? { y: [-1, -2, -1] }
            : {}
      }
      transition={{ duration: 1.1, repeat: winner || highlight ? Infinity : 0 }}
      className={`relative rounded-[16px] border ${
        compact ? 'h-[86px] w-[62px]' : 'h-[132px] w-[94px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, #fefdf8 0%, #f8f5ec 50%, #f5f0e4 100%)',
        borderColor: winner ? 'rgba(255,223,128,0.92)' : 'rgba(0,0,0,0.14)',
        boxShadow: winner
          ? '0 0 52px rgba(201,168,76,0.58), 0 0 20px rgba(255,223,128,0.44), 0 28px 44px rgba(0,0,0,0.40)'
          : highlight
            ? '0 0 16px rgba(201,168,76,0.14), 0 20px 36px rgba(0,0,0,0.32)'
            : '0 6px 14px rgba(0,0,0,0.30), 0 18px 34px rgba(0,0,0,0.36)',
      }}
    >
      {winner ? (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[16px]"
          animate={{ opacity: [0.22, 0.5, 0.22] }}
          transition={{ duration: 0.95, repeat: Infinity }}
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(255,223,128,0.52), transparent 72%)',
          }}
        />
      ) : null}

      <div className="absolute left-2 top-1.5 flex flex-col items-start leading-none">
        <span
          className={`${compact ? 'text-[16px]' : 'text-[22px]'} font-black`}
          style={{ color: isRed ? '#b91c1c' : '#0f172a' }}
        >
          {rank}
        </span>
        <span
          className={`${compact ? 'text-[12px]' : 'text-[16px]'} font-black leading-none`}
          style={{ color: isRed ? '#ef4444' : '#111827' }}
        >
          {symbol}
        </span>
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center ${
          compact ? 'text-[22px]' : 'text-[36px]'
        } font-black`}
        style={{ color: isRed ? '#ef4444' : '#111827', opacity: 0.92 }}
      >
        {symbol}
      </div>

      <div className="absolute bottom-1.5 right-2 rotate-180 leading-none">
        <span
          className={`${compact ? 'text-[12px]' : 'text-[16px]'} font-black`}
          style={{ color: isRed ? '#ef4444' : '#111827' }}
        >
          {symbol}
        </span>
      </div>
    </motion.div>
  );
}

// CHANGE: Opponent group — avatar pill sits IMMEDIATELY above the 3 face-down
// cards, tight coupling. Matches the reference where T2A + cards are one
// visual unit. Adds a subtle ground shadow under the cards to anchor them.
function OpponentCluster({ seat, isOpponent }: { seat: TableSeatView; isOpponent: boolean }) {
  const isCurrentTurn = seat.isCurrentTurn;
  const displayName = seat.isMine ? 'Você' : seat.seatId;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex flex-col items-center gap-2.5">
      <motion.div
        animate={isCurrentTurn ? { scale: [1, 1.015, 1] } : {}}
        transition={{ duration: 2.2, repeat: isCurrentTurn ? Infinity : 0 }}
        className="relative flex items-center gap-3 rounded-full px-4 py-1.5 backdrop-blur-xl"
        style={{
          background: 'linear-gradient(180deg, rgba(20,30,48,0.92), rgba(10,18,32,0.86))',
          border: isCurrentTurn
            ? '1px solid rgba(230,195,100,0.52)'
            : '1px solid rgba(255,255,255,0.10)',
          boxShadow: isCurrentTurn
            ? '0 0 24px rgba(230,195,100,0.22), 0 14px 30px rgba(0,0,0,0.48)'
            : '0 14px 30px rgba(0,0,0,0.44)',
        }}
      >
        <div
          className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
          style={{
            background: 'linear-gradient(135deg, #3a4a62 0%, #1a2234 55%, #0d141f 100%)',
            border: '1px solid rgba(255,255,255,0.16)',
            color: 'rgba(235,220,180,0.92)',
            fontFamily: 'Georgia, serif',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 10px rgba(0,0,0,0.42)',
          }}
        >
          {initial}
        </div>

        <span
          className="relative z-10 text-[18px] font-black leading-none"
          style={{
            color: '#e8d5a0',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.02em',
          }}
        >
          {displayName}
        </span>

        <span
          className="relative z-10 h-2.5 w-2.5 rounded-full"
          style={{
            background: seat.isBot
              ? 'rgba(148,163,184,0.55)'
              : isCurrentTurn
                ? '#22c55e'
                : 'rgba(148,163,184,0.42)',
            boxShadow: isCurrentTurn ? '0 0 10px rgba(34,197,94,0.64)' : 'none',
          }}
        />
      </motion.div>

      <div className="flex items-center gap-3">
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: -8, rotate: index === 0 ? -5 : index === 2 ? 5 : 0 }}
            animate={{ opacity: 1, y: 0, rotate: index === 0 ? -5 : index === 2 ? 5 : 0 }}
            transition={{ delay: index * 0.06 }}
          >
            <CardShape faceDown />
          </motion.div>
        ))}
      </div>

      {/* Ground shadow under the opponent cluster so it reads as "sitting on
          the table", not floating. */}
      <div
        aria-hidden
        className="pointer-events-none h-3 w-40 rounded-full"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.40) 0%, transparent 72%)',
          filter: 'blur(6px)',
        }}
      />
    </div>
  );
}

// CHANGE: Vira with the reference's treatment — just "Vira" in a fine gold
// caps label above the card. No wrapper, no caption. Voiddddd clean.
function ViraCard({ rank, suit }: { rank: string; suit: string }) {
  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <span
        className="text-[11px] font-bold tracking-[0.26em]"
        style={{
          color: '#e8c76a',
          fontFamily: 'Georgia, serif',
          textShadow: '0 2px 4px rgba(0,0,0,0.50)',
        }}
      >
        Vira
      </span>

      <div className="relative">
        <div
          className="pointer-events-none absolute -inset-3 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(230,195,100,0.28) 0%, rgba(230,195,100,0.08) 36%, transparent 70%)',
            filter: 'blur(12px)',
          }}
        />
        <div className="relative">
          <CardShape rank={rank} suit={suit} highlight />
        </div>
      </div>
    </div>
  );
}

// CHANGE: NEW — Context column on the LEFT. Absorbs "pressure" notifications
// ("Aguardando Truco", "Truco pedido", "Resposta pendente") so they no longer
// need to float over the cards. Modeled after the reference's
// "VALOR ATUAL / ESTADO" column.
function LeftContextColumn({
  currentValue,
  valeTier,
  stateLabel,
  stateAccent,
}: {
  currentValue: number;
  valeTier: ValeTier;
  stateLabel: string;
  stateAccent: 'neutral' | 'pressure' | 'escalate' | 'win' | 'loss';
}) {
  const accentColor =
    stateAccent === 'pressure'
      ? '#f87171'
      : stateAccent === 'escalate'
        ? '#fbbf24'
        : stateAccent === 'win'
          ? '#e8c76a'
          : stateAccent === 'loss'
            ? '#fca5a5'
            : '#e8d5a0';

  const valeVisuals = getTierVisuals(valeTier);

  return (
    <div className="flex w-[150px] shrink-0 flex-col gap-5 self-center">
      <div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: 'rgba(232,213,160,0.52)' }}
        >
          Valor atual
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span
            className="text-[34px] font-black leading-none"
            style={{
              color: valeTier === 'muted' ? '#e8d5a0' : 'transparent',
              background: valeTier === 'muted' ? 'none' : valeVisuals.background,
              WebkitBackgroundClip: valeTier === 'muted' ? 'border-box' : 'text',
              backgroundClip: valeTier === 'muted' ? 'border-box' : 'text',
              fontFamily: 'Georgia, serif',
              filter:
                valeTier === 'red-pulse'
                  ? 'drop-shadow(0 0 10px rgba(248,113,113,0.60))'
                  : valeTier === 'red'
                    ? 'drop-shadow(0 0 8px rgba(220,38,38,0.42))'
                    : valeTier === 'orange'
                      ? 'drop-shadow(0 0 8px rgba(245,158,11,0.40))'
                      : valeTier === 'gold'
                        ? 'drop-shadow(0 0 6px rgba(201,168,76,0.36))'
                        : 'none',
            }}
          >
            {currentValue}
          </span>
          <span
            className="text-[10px] font-bold uppercase tracking-[0.20em]"
            style={{ color: 'rgba(232,213,160,0.48)' }}
          >
            {currentValue === 1 ? 'ponto' : 'pontos'}
          </span>
        </div>
      </div>

      <div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: 'rgba(232,213,160,0.52)' }}
        >
          Estado
        </div>
        <motion.div
          key={stateLabel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-1 text-[16px] font-black leading-tight"
          style={{
            color: accentColor,
            fontFamily: 'Georgia, serif',
          }}
        >
          {stateLabel}
        </motion.div>
      </div>
    </div>
  );
}

// CHANGE: NEW — Right column with compact score + round chips (2/3 dots from
// the reference). Absorbs "round result" notifications — when a round is
// decided, the corresponding chip lights up gold/red and this IS the
// notification. No central overlay needed.
function RightScoreColumn({
  scoreT1,
  scoreT2,
  rounds,
}: {
  scoreT1: number;
  scoreT2: number;
  rounds: { result: string | null; finished: boolean }[];
}) {
  const maxChips = 3;
  const chips = Array.from({ length: maxChips }, (_, index) => rounds[index] ?? null);
  const playedCount = rounds.filter((round) => round.finished).length;

  return (
    <div className="flex w-[170px] shrink-0 flex-col items-end gap-4 self-center">
      <div
        className="flex items-center gap-3 rounded-[14px] px-4 py-2"
        style={{
          background: 'linear-gradient(180deg, rgba(12,22,38,0.94), rgba(6,14,26,0.88))',
          border: '1px solid rgba(230,195,100,0.28)',
          boxShadow: '0 10px 22px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex flex-col items-center">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.22em]"
            style={{ color: 'rgba(232,213,160,0.54)' }}
          >
            T1
          </span>
          <span
            className="text-[26px] font-black leading-none"
            style={{ color: '#e8d5a0', fontFamily: 'Georgia, serif' }}
          >
            {scoreT1}
          </span>
        </div>

        <span
          className="text-[18px] font-black leading-none"
          style={{ color: 'rgba(232,213,160,0.30)', fontFamily: 'Georgia, serif' }}
        >
          x
        </span>

        <div className="flex flex-col items-center">
          <span
            className="text-[9px] font-bold uppercase tracking-[0.22em]"
            style={{ color: 'rgba(232,213,160,0.54)' }}
          >
            T2
          </span>
          <span
            className="text-[26px] font-black leading-none"
            style={{ color: '#e8d5a0', fontFamily: 'Georgia, serif' }}
          >
            {scoreT2}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2">
          {chips.map((round, index) => {
            const result = round?.result ?? null;
            const finished = round?.finished ?? false;

            let background = 'rgba(255,255,255,0.06)';
            let border = '1px solid rgba(255,255,255,0.10)';
            let innerGlow = '';

            if (finished) {
              if (result === 'P1') {
                background =
                  'radial-gradient(circle at 40% 35%, #f2d488 0%, #c9a84c 60%, #6b5014 100%)';
                border = '1px solid rgba(255,223,128,0.84)';
                innerGlow =
                  '0 0 14px rgba(201,168,76,0.52), inset 0 1px 2px rgba(255,255,255,0.38)';
              } else if (result === 'P2') {
                background =
                  'radial-gradient(circle at 40% 35%, #fca5a5 0%, #b91c1c 60%, #450a0a 100%)';
                border = '1px solid rgba(254,202,202,0.74)';
                innerGlow = '0 0 14px rgba(220,38,38,0.48), inset 0 1px 2px rgba(255,255,255,0.28)';
              } else if (result === 'TIE') {
                background =
                  'radial-gradient(circle at 40% 35%, #cbd5e1 0%, #64748b 60%, #1e293b 100%)';
                border = '1px solid rgba(203,213,225,0.64)';
                innerGlow =
                  '0 0 10px rgba(148,163,184,0.42), inset 0 1px 2px rgba(255,255,255,0.32)';
              }
            }

            return (
              <motion.div
                key={index}
                initial={false}
                animate={{ scale: finished ? 1 : 0.88 }}
                transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                className="h-5 w-5 rounded-full"
                style={{
                  background,
                  border,
                  boxShadow: innerGlow || '0 2px 4px rgba(0,0,0,0.30)',
                }}
              />
            );
          })}
        </div>

        <span
          className="text-[9px] font-bold uppercase tracking-[0.22em]"
          style={{ color: 'rgba(232,213,160,0.42)' }}
        >
          {playedCount}/{maxChips}
        </span>
      </div>
    </div>
  );
}

type PlayedSlotProps = {
  label?: string;
  card: { rank: string; suit: string } | null;
  revealKey: number;
  isWinner: boolean;
  isFading: boolean;
  rotation: number;
  isLaunching?: boolean;
  hideEmpty?: boolean;
  winnerBadgeLabel?: string | null;
  isTieHighlight?: boolean;
};

function PlayedSlot({
  label = '',
  card,
  revealKey,
  isWinner,
  isFading,
  rotation,
  isLaunching = false,
  hideEmpty = false,
  winnerBadgeLabel = null,
  isTieHighlight = false,
}: PlayedSlotProps) {
  const shouldRenderCard = Boolean(card) || !hideEmpty;
  const showWinnerBadge = Boolean(card && isWinner && winnerBadgeLabel);
  const showTieHighlight = Boolean(card && isTieHighlight && !isWinner);

  return (
    <div className="relative flex min-w-[132px] flex-col items-center gap-3">
      <span
        className="text-[10px] font-black uppercase tracking-[0.24em]"
        style={{
          color: isWinner
            ? 'rgba(242,212,136,0.96)'
            : showTieHighlight
              ? 'rgba(203,213,225,0.86)'
              : 'rgba(255,255,255,0.42)',
          textShadow: isWinner ? '0 0 10px rgba(201,168,76,0.32)' : 'none',
        }}
      >
        {label}
      </span>

      <div className="relative flex h-[164px] w-[116px] items-center justify-center">
        {showWinnerBadge ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.82, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="pointer-events-none absolute -right-2 top-0 z-30 rounded-full px-3 py-1"
            style={{
              background: 'linear-gradient(135deg, #f2d488 0%, #c9a84c 58%, #7b5a1d 100%)',
              border: '1px solid rgba(255,223,128,0.84)',
              boxShadow: '0 8px 18px rgba(0,0,0,0.34), 0 0 18px rgba(201,168,76,0.34)',
            }}
          >
            <span
              className="text-[9px] font-black uppercase tracking-[0.2em]"
              style={{ color: '#1a1204' }}
            >
              {winnerBadgeLabel}
            </span>
          </motion.div>
        ) : null}

        {showTieHighlight ? (
          <div
            className="pointer-events-none absolute inset-x-3 top-3 z-10 h-12 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(203,213,225,0.18) 0%, transparent 72%)',
              filter: 'blur(8px)',
            }}
          />
        ) : null}

        {shouldRenderCard ? (
          <motion.div
            key={`${label}-${card?.rank ?? 'empty'}${card?.suit ?? ''}-${revealKey}`}
            initial={{ opacity: 0, y: isLaunching ? 26 : 10, scale: 0.92, rotate: rotation }}
            animate={{
              opacity: isFading ? 0.78 : 1,
              y: isWinner ? -6 : 0,
              scale: isWinner ? 1.04 : 1,
              rotate: rotation,
            }}
            transition={{
              duration: isWinner ? 0.28 : 0.22,
              ease: 'easeOut',
            }}
            className="relative"
            style={{
              filter: isWinner
                ? 'drop-shadow(0 0 22px rgba(201,168,76,0.42))'
                : showTieHighlight
                  ? 'drop-shadow(0 0 12px rgba(148,163,184,0.22))'
                  : 'none',
            }}
          >
            {card ? (
              <>
                {isWinner ? (
                  <div
                    className="pointer-events-none absolute -inset-2 rounded-[22px]"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 42%, rgba(242,212,136,0.28) 0%, rgba(201,168,76,0.12) 42%, transparent 78%)',
                      filter: 'blur(10px)',
                    }}
                  />
                ) : null}

                <div
                  className="relative rounded-[18px]"
                  style={{
                    boxShadow: isWinner
                      ? '0 0 0 1px rgba(255,223,128,0.58), 0 0 24px rgba(201,168,76,0.24)'
                      : showTieHighlight
                        ? '0 0 0 1px rgba(203,213,225,0.28)'
                        : 'none',
                  }}
                >
                  <CardShape
                    rank={card.rank}
                    suit={card.suit}
                    winner={isWinner}
                    highlight={showTieHighlight}
                  />
                </div>
              </>
            ) : (
              <div
                className="h-[132px] w-[94px] rounded-[18px] border border-white/8"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  opacity: hideEmpty ? 0 : 1,
                }}
              />
            )}
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

function CenterActionBar({
  availableActions,
  onAction,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
}) {
  const canAccept = availableActions.canAcceptBet || availableActions.canAcceptMaoDeOnze;
  const canDecline = availableActions.canDeclineBet || availableActions.canDeclineMaoDeOnze;
  const canRaise =
    availableActions.canRaiseToSix ||
    availableActions.canRaiseToNine ||
    availableActions.canRaiseToTwelve;
  const canTruco = availableActions.canRequestTruco;
  const hasDecision = canAccept || canDecline || canRaise;

  const raiseAction: MatchAction | null = availableActions.canRaiseToSix
    ? 'raise-to-six'
    : availableActions.canRaiseToNine
      ? 'raise-to-nine'
      : availableActions.canRaiseToTwelve
        ? 'raise-to-twelve'
        : null;
  const acceptAction: MatchAction | null = availableActions.canAcceptBet
    ? 'accept-bet'
    : availableActions.canAcceptMaoDeOnze
      ? 'accept-mao-de-onze'
      : null;
  const declineAction: MatchAction | null = availableActions.canDeclineBet
    ? 'decline-bet'
    : availableActions.canDeclineMaoDeOnze
      ? 'decline-mao-de-onze'
      : null;

  const raiseLabel = availableActions.canRaiseToSix
    ? 'Aumentar 6'
    : availableActions.canRaiseToNine
      ? 'Aumentar 9'
      : availableActions.canRaiseToTwelve
        ? 'Aumentar 12'
        : 'Aumentar';

  return (
    <div className="flex items-center justify-center gap-3">
      <motion.button
        type="button"
        onClick={() => canTruco && onAction('request-truco')}
        disabled={!canTruco || hasDecision}
        whileHover={canTruco && !hasDecision ? { y: -1, scale: 1.02 } : {}}
        whileTap={canTruco && !hasDecision ? { scale: 0.97 } : {}}
        className="relative overflow-hidden"
        style={{
          borderRadius: 999,
          minHeight: 44,
          minWidth: 112,
          padding: '10px 22px',
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontFamily: 'Georgia, serif',
          background:
            canTruco && !hasDecision
              ? 'linear-gradient(180deg, #ef4444 0%, #c81d0d 55%, #7f1d1d 100%)'
              : 'rgba(255,255,255,0.03)',
          border:
            canTruco && !hasDecision
              ? '1px solid rgba(252,165,165,0.46)'
              : '1px solid rgba(255,255,255,0.05)',
          color: canTruco && !hasDecision ? '#fff' : 'rgba(255,255,255,0.18)',
          boxShadow:
            canTruco && !hasDecision
              ? '0 0 22px rgba(220,38,38,0.32), 0 10px 22px rgba(0,0,0,0.32)'
              : 'none',
          cursor: canTruco && !hasDecision ? 'pointer' : 'not-allowed',
        }}
      >
        Truco!
      </motion.button>

      <motion.button
        type="button"
        onClick={() => acceptAction && onAction(acceptAction)}
        disabled={!canAccept}
        whileHover={canAccept ? { y: -1, scale: 1.02 } : {}}
        whileTap={canAccept ? { scale: 0.97 } : {}}
        style={{
          borderRadius: 999,
          minHeight: 44,
          minWidth: 112,
          padding: '10px 22px',
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontFamily: 'Georgia, serif',
          background: canAccept
            ? 'linear-gradient(180deg, rgba(44,58,80,0.98), rgba(20,30,48,0.98))'
            : 'rgba(255,255,255,0.03)',
          border: canAccept
            ? '1px solid rgba(230,195,100,0.34)'
            : '1px solid rgba(255,255,255,0.05)',
          color: canAccept ? '#e8d5a0' : 'rgba(255,255,255,0.18)',
          boxShadow: canAccept
            ? '0 10px 22px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.06)'
            : 'none',
          cursor: canAccept ? 'pointer' : 'not-allowed',
        }}
      >
        Aceitar
      </motion.button>

      <motion.button
        type="button"
        onClick={() => {
          if (raiseAction) {
            onAction(raiseAction);
          } else if (declineAction) {
            onAction(declineAction);
          }
        }}
        disabled={!canRaise && !canDecline}
        whileHover={canRaise || canDecline ? { y: -1, scale: 1.02 } : {}}
        whileTap={canRaise || canDecline ? { scale: 0.97 } : {}}
        style={{
          borderRadius: 999,
          minHeight: 44,
          minWidth: 112,
          padding: '10px 22px',
          fontSize: 13,
          fontWeight: 900,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontFamily: 'Georgia, serif',
          background: canRaise
            ? 'linear-gradient(180deg, #d97706 0%, #92400e 100%)'
            : canDecline
              ? 'linear-gradient(180deg, rgba(44,58,80,0.98), rgba(20,30,48,0.98))'
              : 'rgba(255,255,255,0.03)',
          border: canRaise
            ? '1px solid rgba(251,191,36,0.44)'
            : canDecline
              ? '1px solid rgba(148,163,184,0.30)'
              : '1px solid rgba(255,255,255,0.05)',
          color: canRaise ? '#fef3c7' : canDecline ? '#cbd5e1' : 'rgba(255,255,255,0.18)',
          boxShadow: canRaise || canDecline ? '0 10px 22px rgba(0,0,0,0.30)' : 'none',
          cursor: canRaise || canDecline ? 'pointer' : 'not-allowed',
        }}
      >
        {canRaise ? raiseLabel : canDecline ? 'Correr' : 'Aumentar'}
      </motion.button>
    </div>
  );
}

// CHANGE: NEW — Climax card with auto-dismiss. This is the fix for the
// "modal travado" bug. The card:
//   1. Is a motion.div with proper exit animation
//   2. Auto-dismisses after CLIMAX_AUTO_DISMISS_MS via internal state
//   3. The parent's AnimatePresence still wraps it, so if the parent unmounts
//      it (tablePhase changes), it fades out correctly too.
// The underlying tablePhase may stay 'hand_finished' indefinitely (backend
// authoritative), but the visual takeover always lifts after ~2.8s.
function HandClimaxStage({
  isMyHand,
  awardedPoints,
  valueTier,
  isMatchFinished,
  onDismiss,
}: {
  isMyHand: boolean;
  awardedPoints: number;
  valueTier: ValeTier;
  isMatchFinished: boolean;
  onDismiss: () => void;
}) {
  // CHANGE: auto-dismiss timer. Match finished stays 1s longer so the player
  // has time to absorb the final verdict.
  useEffect(() => {
    const timeout = window.setTimeout(
      onDismiss,
      isMatchFinished ? CLIMAX_AUTO_DISMISS_MS + 1000 : CLIMAX_AUTO_DISMISS_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [isMatchFinished, onDismiss]);

  const heroTier: ValeTier = isMyHand ? valueTier : 'red';
  const visuals = getTierVisuals(heroTier);

  const heading = isMatchFinished
    ? isMyHand
      ? 'Partida sua'
      : 'Partida deles'
    : isMyHand
      ? 'Mão sua'
      : 'Mão deles';

  const subheading = isMatchFinished
    ? isMyHand
      ? 'Você fechou a partida'
      : 'O oponente fechou a partida'
    : isMyHand
      ? 'Você marcou'
      : 'Eles marcaram';

  return (
    <motion.div
      className="pointer-events-auto fixed inset-0 z-[60]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
      onClick={onDismiss}
      role="button"
      tabIndex={0}
      aria-label="Fechar resultado da mão"
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(2,6,12,0.68)',
          backdropFilter: 'blur(6px)',
        }}
      />

      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.42, 0] }}
        transition={{ duration: 0.22, times: [0, 0.3, 1] }}
        style={{
          background: isMyHand
            ? 'radial-gradient(circle at 50% 50%, rgba(255,223,128,0.38), transparent 62%)'
            : 'radial-gradient(circle at 50% 50%, rgba(220,38,38,0.36), transparent 62%)',
          pointerEvents: 'none',
        }}
      />

      <motion.div
        className="absolute left-1/2 top-1/2"
        initial={{ x: '-50%', y: '-50%', scale: 0.4, opacity: 0 }}
        animate={{ x: '-50%', y: '-50%', scale: 1, opacity: 1 }}
        exit={{ x: '-50%', y: '-50%', scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 20 }}
      >
        <div
          className="relative overflow-hidden rounded-[26px] px-10 py-7 text-center"
          style={{
            background: visuals.background,
            border: `2px solid ${visuals.border.replace('1px solid ', '')}`,
            color: visuals.textColor,
            boxShadow: `${visuals.glow}, 0 40px 90px rgba(0,0,0,0.55)`,
            minWidth: 360,
          }}
        >
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 50% 30%, rgba(255,255,255,0.22), transparent 62%)',
            }}
          />

          <div className="relative z-10">
            <div
              className="text-[11px] font-black uppercase tracking-[0.26em]"
              style={{ opacity: 0.72 }}
            >
              {isMatchFinished ? 'Fim da partida' : 'Resultado da mão'}
            </div>

            <div
              className="mt-1 text-[36px] font-black uppercase leading-none tracking-[0.08em]"
              style={{ fontFamily: 'Georgia, serif' }}
            >
              {heading}
            </div>

            <div
              className="mt-3 text-[11px] font-bold uppercase tracking-[0.18em]"
              style={{ opacity: 0.8 }}
            >
              {subheading}
            </div>

            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.18, duration: 0.36 }}
              className="mt-2 text-[62px] font-black leading-none"
              style={{
                fontFamily: 'Georgia, serif',
                textShadow: '0 6px 18px rgba(0,0,0,0.32)',
              }}
            >
              +{awardedPoints}
            </motion.div>

            <div
              className="text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ opacity: 0.68 }}
            >
              ponto{awardedPoints === 1 ? '' : 's'}
            </div>

            <div
              className="mt-4 text-[9px] font-bold uppercase tracking-[0.22em]"
              style={{ opacity: 0.54 }}
            >
              Toque para continuar
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}



function MaoDeOnzeDecisionStage({
  isVisible,
  onPlay,
  onRun,
}: {
  isVisible: boolean;
  onPlay: () => void;
  onRun: () => void;
}) {
  if (!isVisible) {
    return null;
  }

  return (
    <motion.div
      initial={{ y: 28, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 20, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      className="pointer-events-auto fixed inset-x-4 bottom-[252px] z-[110] mx-auto w-full max-w-xl md:bottom-[272px] md:max-w-2xl"
    >
      <div
        className="overflow-hidden rounded-[26px] border px-4 py-3.5 md:rounded-[28px] md:px-5 md:py-4 backdrop-blur-xl"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,22,30,0.94) 0%, rgba(10,12,18,0.90) 100%)',
          borderColor: 'rgba(255,223,128,0.34)',
          boxShadow:
            '0 28px 54px rgba(0,0,0,0.42), 0 0 36px rgba(201,168,76,0.16), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div
              className="text-[11px] font-black uppercase tracking-[0.28em]"
              style={{ color: '#f6dfa0' }}
            >
              Mão de 11
            </div>
            <h3
              className="mt-1 text-[24px] font-black leading-none"
              style={{ color: '#fff8e1', fontFamily: 'Georgia, serif' }}
            >
              Analise sua mão antes de decidir
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'rgba(255,248,225,0.72)' }}>
              Você ainda não pode jogar carta. Primeiro escolha se vai seguir na mão ou correr.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
            <motion.button
              type="button"
              onClick={onPlay}
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="rounded-full px-6 py-3 text-[12px] font-black uppercase tracking-[0.18em]"
              style={{
                background: 'linear-gradient(135deg, #e8c76a 0%, #c9a84c 60%, #8a6a28 100%)',
                color: '#1a1104',
                border: '1px solid rgba(255,223,128,0.72)',
                boxShadow: '0 14px 28px rgba(0,0,0,0.28), 0 0 16px rgba(201,168,76,0.18)',
              }}
            >
              Jogar
            </motion.button>

            <motion.button
              type="button"
              onClick={onRun}
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="rounded-full px-6 py-3 text-[12px] font-black uppercase tracking-[0.18em]"
              style={{
                background:
                  'linear-gradient(180deg, rgba(44,58,80,0.98), rgba(20,30,48,0.98))',
                color: '#d6dde8',
                border: '1px solid rgba(148,163,184,0.26)',
                boxShadow: '0 14px 28px rgba(0,0,0,0.24)',
              }}
            >
              Correr
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function MatchResultModal({
  isOpen,
  isVictory,
  scoreLabel,
}: {
  isOpen: boolean;
  isVictory: boolean;
  scoreLabel: string;
}) {
  if (!isOpen) {
    return null;
  }

  const title = isVictory ? 'Vitória' : 'Derrota';
  const subtitle = isVictory
    ? 'Você fechou a partida. Belo fechamento de mesa.'
    : 'A partida terminou. Vale revisar o placar e voltar preparado para a próxima.'
    ;
  const accentBackground = isVictory
    ? 'linear-gradient(135deg, #f2d488 0%, #c9a84c 55%, #7b5a1d 100%)'
    : 'linear-gradient(135deg, #fca5a5 0%, #dc2626 55%, #450a0a 100%)';
  const accentColor = isVictory ? '#1a1204' : '#fff5f5';

  const handleBackToLobby = () => {
    window.location.assign('/lobby');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[120] flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0"
        style={{
          background: 'rgba(4,6,10,0.68)',
          backdropFilter: 'blur(10px)',
        }}
      />

      <motion.div
        initial={{ y: 24, scale: 0.96, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 18, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 230, damping: 24 }}
        className="relative w-full max-w-xl overflow-hidden rounded-[30px] border px-6 py-6"
        style={{
          background:
            'linear-gradient(180deg, rgba(16,20,30,0.96) 0%, rgba(8,10,18,0.96) 100%)',
          borderColor: isVictory ? 'rgba(255,223,128,0.36)' : 'rgba(252,165,165,0.28)',
          boxShadow:
            '0 34px 64px rgba(0,0,0,0.48), 0 0 42px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div
          className="inline-flex rounded-full px-4 py-1 text-[11px] font-black uppercase tracking-[0.24em]"
          style={{
            background: accentBackground,
            color: accentColor,
            boxShadow: '0 10px 22px rgba(0,0,0,0.24)',
          }}
        >
          Partida encerrada
        </div>

        <h2
          className="mt-4 text-[40px] font-black leading-none"
          style={{ color: isVictory ? '#fff0bf' : '#ffe4e6', fontFamily: 'Georgia, serif' }}
        >
          {title}
        </h2>

        <p className="mt-3 text-[15px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.78)' }}>
          {subtitle}
        </p>

        <div
          className="mt-5 rounded-[22px] border px-5 py-4"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.02))',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <div
            className="text-[10px] font-black uppercase tracking-[0.24em]"
            style={{ color: 'rgba(232,213,160,0.58)' }}
          >
            Placar final
          </div>
          <div
            className="mt-2 text-[24px] font-black"
            style={{ color: '#f3e7bf', fontFamily: 'Georgia, serif' }}
          >
            {scoreLabel}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <motion.button
            type="button"
            onClick={handleBackToLobby}
            whileHover={{ y: -1, scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            className="rounded-full px-6 py-3 text-[12px] font-black uppercase tracking-[0.18em]"
            style={{
              background: accentBackground,
              color: accentColor,
              border: '1px solid rgba(255,223,128,0.48)',
              boxShadow: '0 16px 28px rgba(0,0,0,0.24)',
            }}
          >
            Voltar ao lobby
          </motion.button>

          <button
            type="button"
            disabled
            className="rounded-full px-6 py-3 text-[12px] font-black uppercase tracking-[0.18em]"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.42)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'not-allowed',
            }}
            title="Backend rematch flow is not wired yet."
          >
            Revanche em breve
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function MatchTableShell(props: MatchTableShellProps) {
  const {
    betState,
    currentValue,
    pendingValue,
    winner,
    awardedPoints,
    displayedResolvedRoundFinished,
    displayedResolvedRoundResult,
    tablePhase,
    opponentSeatView,
    mySeatView,
    displayedOpponentPlayedCard,
    displayedMyPlayedCard,
    opponentRevealKey,
    myRevealKey,
    myCardLaunching,
    currentPrivateViraRank,
    currentPublicViraRank,
    viraRank,
    availableActions,
    onAction,
    myCards,
    canPlayCard,
    launchingCardKey,
    currentPrivateHand,
    currentPublicHand,
    onPlayCard,
    isMyTurn = false,
    isResolvingRound,
    closingTableCards,
  } = props;

  // CHANGE: alias so the RightScoreColumn round-chips logic reads clearly.
  const publicHandForRounds = currentPublicHand;

  const { play } = useGameSound();
  const { fire } = useConfetti();

  const effectiveViraRank = currentPrivateViraRank ?? currentPublicViraRank ?? viraRank;
  const isAwaitingBet = betState === 'awaiting_response';
  const isMaoDeOnze = props.specialState === 'mao_de_onze';
  const isViewerMaoDeOnzeDecision =
    props.specialDecisionPending &&
    (availableActions.canAcceptMaoDeOnze || availableActions.canDeclineMaoDeOnze);
  const isMatchFinished = tablePhase === 'match_finished';
  const isHandFinished = tablePhase === 'hand_finished';

  const activeValueForTier = isAwaitingBet && pendingValue !== null ? pendingValue : currentValue;
  const activeTier = useMemo<ValeTier>(
    () => resolveValeTier(activeValueForTier),
    [activeValueForTier],
  );

  const parseCard = (cardString: string | null) => {
    if (!cardString || cardString.length < 2) {
      return null;
    }

    return {
      rank: cardString.slice(0, -1),
      suit: cardString.slice(-1),
    };
  };

  const resolvedMyCardString = isResolvingRound ? closingTableCards.mine : displayedMyPlayedCard;
  const resolvedOpponentCardString = isResolvingRound
    ? closingTableCards.opponent
    : displayedOpponentPlayedCard;

  const myCard = parseCard(resolvedMyCardString);
  const opponentCard = parseCard(resolvedOpponentCardString);

  const resolvedRoundFinished = displayedResolvedRoundFinished;
  const resolvedRoundResult = displayedResolvedRoundResult;

  const hasAnyClosingCard = closingTableCards.mine !== null || closingTableCards.opponent !== null;
  const hasAnyDisplayedCard =
    displayedMyPlayedCard !== null || displayedOpponentPlayedCard !== null;

  const isShowingResolvedRoundCards = Boolean(
    resolvedRoundFinished && isResolvingRound && (hasAnyClosingCard || hasAnyDisplayedCard),
  );

  const shouldFadeMyCard = Boolean(
    closingTableCards.mine !== null &&
    resolvedMyCardString === closingTableCards.mine &&
    isResolvingRound,
  );
  const shouldFadeOpponentCard = Boolean(
    closingTableCards.opponent !== null &&
    resolvedOpponentCardString === closingTableCards.opponent &&
    isResolvingRound,
  );

  const myCardWon = Boolean(isShowingResolvedRoundCards && resolvedRoundResult === 'P1');
  const opponentCardWon = Boolean(isShowingResolvedRoundCards && resolvedRoundResult === 'P2');
  const isTieRound = Boolean(isShowingResolvedRoundCards && resolvedRoundResult === 'TIE');

  const shouldBlockHandDock =
    isAwaitingBet ||
    props.specialDecisionPending ||
    availableActions.canAcceptBet ||
    availableActions.canDeclineBet ||
    availableActions.canRaiseToSix ||
    availableActions.canRaiseToNine ||
    availableActions.canRaiseToTwelve ||
    availableActions.canAcceptMaoDeOnze ||
    availableActions.canDeclineMaoDeOnze;

  // CHANGE: climax dismissal is now a local state controlled by the Stage
  // component itself. Once the user clicks OR 2.8s pass, the climax is
  // hidden even if tablePhase remains 'hand_finished'. Reset when the phase
  // transitions away from hand_finished so the next climax can fire.
  const [climaxDismissed, setClimaxDismissed] = useState(false);
  const lastClimaxPhaseRef = useRef<TablePhase | null>(null);

  useEffect(() => {
    if (tablePhase !== 'hand_finished' && tablePhase !== 'match_finished') {
      setClimaxDismissed(false);
      lastClimaxPhaseRef.current = tablePhase;
    } else if (lastClimaxPhaseRef.current !== tablePhase) {
      // New climax-eligible phase → reset dismissal so the stage fires again.
      setClimaxDismissed(false);
      lastClimaxPhaseRef.current = tablePhase;
    }
  }, [tablePhase]);

  // CHANGE: stateLabel derives from the actual hand state and feeds the
  // LeftContextColumn. This is the main "notification absorber" — we stopped
  // floating banners over the cards and instead write the semantic state
  // into the left column.
  const stateInfo = useMemo<{
    label: string;
    accent: 'neutral' | 'pressure' | 'escalate' | 'win' | 'loss';
  }>(() => {
    if (isMatchFinished) {
      return { label: 'Partida encerrada', accent: winner === 'P1' ? 'win' : 'loss' };
    }

    if (isHandFinished && winner !== null) {
      return winner === 'P1'
        ? { label: 'Mão sua', accent: 'win' }
        : { label: 'Mão deles', accent: 'loss' };
    }

    if (isAwaitingBet) {
      const ask = pendingValue ?? currentValue;
      if (ask > 3) {
        return { label: `Subiu para ${ask}`, accent: 'escalate' };
      }
      return { label: 'Truco pedido', accent: 'pressure' };
    }

    if (props.specialDecisionPending) {
      return isViewerMaoDeOnzeDecision
        ? { label: 'Decida a mão de 11', accent: 'escalate' }
        : { label: 'Mão de 11', accent: 'escalate' };
    }

    if (isShowingResolvedRoundCards && resolvedRoundResult) {
      if (resolvedRoundResult === 'P1') {
        return { label: 'Rodada sua', accent: 'win' };
      }
      if (resolvedRoundResult === 'P2') {
        return { label: 'Rodada deles', accent: 'loss' };
      }
      return { label: 'Empate', accent: 'neutral' };
    }

    if (isMyTurn && canPlayCard) {
      return { label: 'Sua jogada', accent: 'neutral' };
    }

    return { label: 'Aguardando', accent: 'neutral' };
  }, [
    canPlayCard,
    currentValue,
    isAwaitingBet,
    isHandFinished,
    isMatchFinished,
    isMyTurn,
    isShowingResolvedRoundCards,
    pendingValue,
    isViewerMaoDeOnzeDecision,
    props.specialDecisionPending,
    resolvedRoundResult,
    winner,
  ]);

  // Round chips for the RightScoreColumn.
  const roundsForChips = useMemo(() => {
    const rounds = publicHandForRounds?.rounds ?? [];
    return rounds.map((round) => ({
      result: round.result ?? null,
      finished: Boolean(round.finished),
    }));
  }, [publicHandForRounds]);

  // Score from scoreLabel (same parsing as the header).
  const scoreT1 = Number(props.scoreLabel?.match(/T1\s+(\d+)/)?.[1] ?? '0');
  const scoreT2 = Number(props.scoreLabel?.match(/T2\s+(\d+)/)?.[1] ?? '0');

  const climax = (() => {
    if (props.suppressHandOutcomeModal) {
      return null;
    }

    if (climaxDismissed) {
      return null;
    }

    if ((isHandFinished || isMatchFinished) && winner !== null && awardedPoints !== null) {
      return {
        isMyHand: winner === 'P1',
        awardedPoints,
      };
    }

    return null;
  })();

  useEffect(() => {
    if (!isShowingResolvedRoundCards) {
      return;
    }

    if (resolvedRoundResult === 'P1') {
      play('round-win', 0.6);
    }
  }, [isShowingResolvedRoundCards, play, resolvedRoundResult]);

  // CHANGE: confetti + sound fire ONCE when the climax first becomes visible.
  // Previously this could re-fire because it depended on the full `climax`
  // object identity. Now we key off a stable signature.
  const climaxFiredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!climax) {
      climaxFiredRef.current = null;
      return;
    }

    const signature = `${climax.isMyHand}|${climax.awardedPoints}|${tablePhase}`;
    if (climaxFiredRef.current === signature) {
      return;
    }
    climaxFiredRef.current = signature;

    if (climax.isMyHand) {
      fire();
      play(isMatchFinished ? 'game-win' : 'round-win', isMatchFinished ? 0.8 : 0.7);
    }
  }, [climax, fire, isMatchFinished, play, tablePhase]);

  const lastDismissedClimaxKeyRef = useRef<string | null>(null);

  const handleClimaxDismiss = useCallback(() => {
    setClimaxDismissed(true);

    if (!climax) {
      return;
    }

    const dismissalKey = `${climax.isMyHand}|${climax.awardedPoints}|${tablePhase}`;

    if (lastDismissedClimaxKeyRef.current === dismissalKey) {
      return;
    }

    lastDismissedClimaxKeyRef.current = dismissalKey;
    props.onHandClimaxDismissed?.();
  }, [climax, props.onHandClimaxDismissed, tablePhase]);

  useEffect(() => {
    if (!climax) {
      lastDismissedClimaxKeyRef.current = null;
    }
  }, [climax]);

  return (
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={{
        // CHANGE: felt — the reference has a dark navy with a soft curved
        // highlight at the TOP and deepening toward the bottom. Keep the
        // navy tone, but add a visible top arch highlight (reference has
        // this clearly in the first third of the screen).
        background:
          'radial-gradient(ellipse 120% 90% at 50% -5%, rgba(70,95,128,0.32) 0%, rgba(40,58,88,0.16) 22%, transparent 42%), radial-gradient(ellipse at 50% 55%, #132036 0%, #0c1828 36%, #06101c 64%, #030810 100%)',
        borderRadius: 28,
        // CHANGE: the outer bezel returns as a thin steel border reminiscent
        // of the monitor frame in the reference. Not a gold ring.
        border: '1px solid rgba(120,140,170,0.16)',
        boxShadow:
          '0 0 0 1px rgba(0,0,0,0.50), 0 32px 82px rgba(0,0,0,0.64), inset 0 0 200px rgba(0,0,0,0.52), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Felt grain */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.030'/%3E%3C/svg%3E\")",
          borderRadius: 28,
        }}
      />

      {/* CHANGE: subtle starfield — the reference image has minute specks of
          light on the felt. Kept low density. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 18% 22%, rgba(255,255,255,0.20) 50%, transparent 100%), radial-gradient(1px 1px at 76% 18%, rgba(255,255,255,0.14) 50%, transparent 100%), radial-gradient(1px 1px at 14% 74%, rgba(255,255,255,0.10) 50%, transparent 100%), radial-gradient(1px 1px at 84% 72%, rgba(255,255,255,0.16) 50%, transparent 100%), radial-gradient(1px 1px at 44% 86%, rgba(255,255,255,0.08) 50%, transparent 100%), radial-gradient(1px 1px at 56% 14%, rgba(255,255,255,0.12) 50%, transparent 100%)',
          backgroundRepeat: 'no-repeat',
          borderRadius: 28,
          opacity: 0.5,
        }}
      />

      {/* CHANGE: top arch outline — the reference image has an open curve at
          the top of the mesa that reads like a console bezel. Reproduced as
          a very soft arc outline. */}
      <div
        className="pointer-events-none absolute inset-x-[3%] top-[2%] h-[36%]"
        style={{
          borderTopLeftRadius: '46%',
          borderTopRightRadius: '46%',
          borderTop: '1px solid rgba(160,180,210,0.14)',
          borderLeft: '1px solid rgba(160,180,210,0.08)',
          borderRight: '1px solid rgba(160,180,210,0.08)',
        }}
      />

      {/* Centre ambient — much more subtle than before, just a breath. */}
      <div
        className="felt-breathe-anim pointer-events-none absolute inset-x-[22%] top-[28%] h-[44%] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(180,200,230,0.035) 0%, transparent 68%)',
          filter: 'blur(24px)',
        }}
      />

      {/* CHANGE: central reactive pulse — kept, but intensity scaled down
          when any side-column notification is active, so it doesn't compete. */}
      <motion.div
        key={`centre-pulse-${isAwaitingBet}-${isResolvingRound}`}
        className="pointer-events-none absolute left-1/2 top-[46%] z-[1] h-[220px] w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        initial={{ opacity: 0.12, scale: 0.94 }}
        animate={{
          opacity: isResolvingRound
            ? [0.22, 0.4, 0.22]
            : isAwaitingBet
              ? [0.16, 0.3, 0.16]
              : isMyTurn && canPlayCard
                ? [0.1, 0.18, 0.1]
                : [0.06, 0.1, 0.06],
          scale: isResolvingRound ? [0.96, 1.03, 0.98] : [0.98, 1.01, 0.98],
        }}
        transition={{ duration: isResolvingRound ? 1.0 : 1.9, repeat: Infinity }}
        style={{
          background: isResolvingRound
            ? 'radial-gradient(circle, rgba(255,223,128,0.22) 0%, rgba(201,168,76,0.10) 40%, transparent 72%)'
            : isAwaitingBet
              ? 'radial-gradient(circle, rgba(220,38,38,0.18) 0%, rgba(127,29,29,0.08) 40%, transparent 72%)'
              : isMyTurn && canPlayCard
                ? 'radial-gradient(circle, rgba(201,168,76,0.14) 0%, rgba(255,255,255,0.03) 42%, transparent 72%)'
                : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%)',
          filter: 'blur(24px)',
        }}
      />

      {/* Main composition: 3-column arena — LEFT context | CENTER play | RIGHT score */}
      <div className="relative flex min-h-0 flex-1 flex-col px-6 pb-3 pt-5">
        <div className="flex flex-1 items-stretch gap-6">
          {/* LEFT column — absorbs the pressure / state notifications */}
          <LeftContextColumn
            currentValue={currentValue}
            valeTier={activeTier}
            stateLabel={stateInfo.label}
            stateAccent={stateInfo.accent}
          />

          {/* CENTER — opponent cluster, played cards, vira */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-between gap-3 py-2">
            {opponentSeatView ? <OpponentCluster seat={opponentSeatView} isOpponent /> : null}

            {/* CHANGE: Vira + played cards in one horizontal row, just like
                the reference. No labels on the slots, no separator line — the
                cards ARE the story. */}
            <div className="flex items-center justify-center gap-5">
              <ViraCard rank={effectiveViraRank} suit="C" />

              <PlayedSlot
                label="Oponente"
                card={opponentCard}
                revealKey={opponentRevealKey}
                isWinner={opponentCardWon}
                isFading={shouldFadeOpponentCard}
                rotation={-7}
                winnerBadgeLabel="WIN"
                isTieHighlight={isTieRound}
              />

              <PlayedSlot
                label="Você"
                card={myCard}
                revealKey={myRevealKey}
                isWinner={myCardWon}
                isFading={shouldFadeMyCard}
                rotation={7}
                isLaunching={myCardLaunching}
                winnerBadgeLabel="WIN"
                isTieHighlight={isTieRound}
              />
            </div>

            {/* CHANGE: action bar — horizontal, centered, always visible.
                Replaces the heavy bottom dock wrapper. */}
            <div className="mt-1">
              <CenterActionBar availableActions={availableActions} onAction={onAction} />
            </div>
          </div>

          {/* RIGHT column — absorbs the round-result notifications via chips */}
          <RightScoreColumn scoreT1={scoreT1} scoreT2={scoreT2} rounds={roundsForChips} />
        </div>

        {/* Bottom: player's hand. No wrapper/dock — cards sit directly on the
            felt, matching the reference. */}
        <div className="relative mt-2 shrink-0">
          <MatchPlayerHandDock
            myCards={myCards}
            canPlayCard={shouldBlockHandDock ? false : canPlayCard}
            tablePhase={tablePhase}
            launchingCardKey={launchingCardKey}
            currentPrivateHand={currentPrivateHand}
            currentPublicHand={currentPublicHand}
            onPlayCard={onPlayCard}
            isMyTurn={isMyTurn}
            isOneVsOne={props.isOneVsOne}
            viraRank={effectiveViraRank}
            isSubdued={Boolean(climax) && !isViewerMaoDeOnzeDecision}
            isDecisionFocus={isViewerMaoDeOnzeDecision}
          />
        </div>
      </div>

      {/* CHANGE: climax — now dismissable on click and auto-dismisses in
          2.8s. This is the fix for the "modal travado" bug. */}
      <AnimatePresence>
        {climax ? (
          <HandClimaxStage
            isMyHand={climax.isMyHand}
            awardedPoints={climax.awardedPoints}
            valueTier={activeTier}
            isMatchFinished={isMatchFinished}
            onDismiss={handleClimaxDismiss}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMaoDeOnze && !isViewerMaoDeOnzeDecision ? (
          <motion.div
            initial={{ y: -200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 200, opacity: 0 }}
            transition={{ type: 'spring', damping: 14 }}
            className="pointer-events-none fixed left-1/2 top-16 z-[100] -translate-x-1/2"
          >
            <div
              className="rounded-full px-10 py-4 text-2xl font-black uppercase tracking-widest text-black shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
                border: '2px solid #ffdf80',
                boxShadow: '0 0 60px rgba(201,168,76,0.8)',
              }}
            >
              ⚡ Mão de 11 ⚡
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isViewerMaoDeOnzeDecision ? (
          <MaoDeOnzeDecisionStage
            isVisible={isViewerMaoDeOnzeDecision}
            onPlay={() => onAction('accept-mao-de-onze')}
            onRun={() => onAction('decline-mao-de-onze')}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMatchFinished && climaxDismissed ? (
          <MatchResultModal
            isOpen={isMatchFinished && climaxDismissed}
            isVictory={winner === 'P1'}
            scoreLabel={props.scoreLabel}
          />
        ) : null}
      </AnimatePresence>

      {/* Use the legacy MatchActionSurface reference so the file still
          imports/tree-shakes correctly even though the center uses the new
          CenterActionBar. This avoids adding a non-functional dead import. */}
      <div className="hidden">
        <MatchActionSurface
          availableActions={availableActions}
          onAction={onAction}
          isCritical={false}
          emphasisLabel={null}
        />
      </div>
    </div>
  );
}
