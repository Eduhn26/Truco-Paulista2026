import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { MatchActionSurface } from './matchActionSurface';
import type { MatchAction } from './matchActionTypes';
import { MatchPlayerHandDock } from './matchPlayerHandDock';
import { OpponentCardFlight } from './opponentCardFlight';
import { PlayerCardFlight } from './playerCardFlight';
import { TrucoDramaOverlay } from './trucoDramaOverlay';
import { RoundClashEffects, buildKickAnimation, buildLoserKick } from './roundClashEffects';
import { resolveValeTier, type ValeTier } from './matchPresentationSelectors';
import type {
  BotIdentityPayload,
  CardPayload,
  MatchStatePayload,
  Rank,
} from '../../services/socket/socketTypes';
import { useConfetti } from '../../hooks/useConfetti';
import { useGameSound } from '../../hooks/useGameSound';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
type HandStatusVariant = 'neutral' | 'success' | 'warning';
type SlotRoundOutcome = 'win' | 'loss' | 'tie' | null;

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
  botIdentity: BotIdentityPayload | null;
};

type RoundView = NonNullable<MatchStatePayload['currentHand']>['rounds'][number] | null;

type PendingPlayedCardView = {
  owner: 'mine' | 'opponent';
  card: string;
  id: number;
};

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
  pendingPlayedCard: PendingPlayedCardView | null;
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
const CLIMAX_AUTO_DISMISS_MS = 4400;
// NOTE: Outcome badges should read as the result of the card impact, not as
// server-state stamped onto a card that is still settling. This longer delay
// gives the player time to track the card landing before the result ribbon hits.
const SETTLED_OUTCOME_BADGE_DELAY_MS = 900;
const LOSER_DIM_DELAY_MS = 260;
// NOTE: Patch 7 slows the combat beats without changing backend authority:
// card settles first, then badge/clash, then hand result. This makes bot
// speech and card outcomes readable instead of competing in the same instant.

function debugMatchTableShell(event: string, details: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info('[MATCH_TABLE_SHELL]', event, details);
}

function parseSuitColor(suit: string): boolean {
  return suit === 'P' || suit === 'O';
}

function mapSeatToPlayerId(seatId: string | null | undefined): 'P1' | 'P2' | null {
  if (!seatId) {
    return null;
  }

  if (seatId.startsWith('T1')) {
    return 'P1';
  }

  if (seatId.startsWith('T2')) {
    return 'P2';
  }

  return null;
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
        background: 'linear-gradient(135deg, #3a3323, #241f15)',
        border: '1px solid rgba(201,168,76,0.22)',
        textColor: 'rgba(232,199,106,0.82)',
        glow: '0 14px 30px rgba(0,0,0,0.26)',
      };
  }
}


type TableTensionVisuals = {
  shellBorderColor: string;
  shellBoxShadow: string;
  feltBackground: string;
  archTopColor: string;
  archSideColor: string;
  centreAmbientBackground: string;
  pulseKey: string;
  pulseOpacity: [number, number, number];
  pulseScale: [number, number, number];
  pulseDuration: number;
  pulseBackground: string;
};

function resolveTableTensionVisuals({
  activeValue,
  isAwaitingBet,
  isMaoDeOnzeTensionOpen,
  isMaoDeOnzeDecisionPending,
  isResolvingRound,
  isPlayerTurn,
}: {
  activeValue: number;
  isAwaitingBet: boolean;
  isMaoDeOnzeTensionOpen: boolean;
  isMaoDeOnzeDecisionPending: boolean;
  isResolvingRound: boolean;
  isPlayerTurn: boolean;
}): TableTensionVisuals {
  const buildShellShadow = (outerGlow: string, insetGlow: string) =>
    `0 0 0 1px rgba(0,0,0,0.50), 0 32px 82px rgba(0,0,0,0.64), ${outerGlow}, inset 0 0 220px rgba(0,0,0,0.48), ${insetGlow}, inset 0 1px 0 rgba(255,255,255,0.04)`;

  const pulseTuple = (
    first: number,
    second: number,
    third: number,
  ): [number, number, number] => [first, second, third];

  const baseVisuals: TableTensionVisuals = {
    shellBorderColor: 'rgba(201,168,76,0.14)',
    shellBoxShadow: buildShellShadow('0 0 0 rgba(201,168,76,0)', 'inset 0 0 0 rgba(201,168,76,0)'),
    feltBackground:
      'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(201,168,76,0.10) 0%, rgba(46,92,53,0.12) 18%, transparent 40%), radial-gradient(ellipse at 50% 55%, #10231a 0%, #0d1a16 34%, #08110f 62%, #04090a 100%)',
    archTopColor: 'rgba(201,168,76,0.12)',
    archSideColor: 'rgba(201,168,76,0.06)',
    centreAmbientBackground:
      'radial-gradient(circle, rgba(201,168,76,0.05) 0%, rgba(36,78,44,0.03) 36%, transparent 68%)',
    pulseKey: 'vale-1',
    pulseOpacity: [0.06, 0.1, 0.06],
    pulseScale: [0.98, 1.01, 0.98],
    pulseDuration: 1.9,
    pulseBackground:
      'radial-gradient(circle, rgba(201,168,76,0.05) 0%, rgba(36,78,44,0.03) 42%, transparent 70%)',
  };

  const withMomentPulse = (visuals: TableTensionVisuals): TableTensionVisuals => {
    if (isResolvingRound) {
      return {
        ...visuals,
        pulseKey: `${visuals.pulseKey}-resolving`,
        pulseOpacity: [0.22, 0.4, 0.22],
        pulseScale: [0.96, 1.03, 0.98],
        pulseDuration: 1,
        pulseBackground:
          'radial-gradient(circle, rgba(255,223,128,0.22) 0%, rgba(201,168,76,0.10) 40%, transparent 72%)',
      };
    }

    if (isAwaitingBet) {
      return {
        ...visuals,
        pulseKey: `${visuals.pulseKey}-bet`,
        pulseOpacity: activeValue >= 9 ? pulseTuple(0.22, 0.4, 0.22) : pulseTuple(0.16, 0.3, 0.16),
        pulseScale: activeValue >= 9 ? pulseTuple(0.96, 1.055, 0.98) : pulseTuple(0.98, 1.025, 0.98),
        pulseDuration: activeValue >= 9 ? 1.2 : 1.55,
      };
    }

    if (isPlayerTurn) {
      return {
        ...visuals,
        pulseKey: `${visuals.pulseKey}-turn`,
        pulseOpacity: [0.1, 0.18, 0.1],
        pulseScale: [0.98, 1.01, 0.98],
        pulseDuration: 1.9,
        pulseBackground:
          'radial-gradient(circle, rgba(201,168,76,0.14) 0%, rgba(255,255,255,0.03) 42%, transparent 72%)',
      };
    }

    return visuals;
  };

  if (isMaoDeOnzeTensionOpen) {
    return withMomentPulse({
      shellBorderColor: 'rgba(255,223,128,0.24)',
      shellBoxShadow: buildShellShadow(
        '0 0 38px rgba(245,158,11,0.10)',
        'inset 0 0 54px rgba(127,29,29,0.10)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(245,158,11,0.18) 0%, rgba(127,29,29,0.10) 22%, transparent 44%), radial-gradient(ellipse at 50% 55%, #1d2115 0%, #101813 34%, #0a100d 62%, #040708 100%)',
      archTopColor: 'rgba(255,223,128,0.20)',
      archSideColor: 'rgba(245,158,11,0.08)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(245,158,11,0.12) 0%, rgba(127,29,29,0.06) 38%, transparent 70%)',
      pulseKey: isMaoDeOnzeDecisionPending ? 'mao-de-onze-decision' : 'mao-de-onze-accepted',
      pulseOpacity: isMaoDeOnzeDecisionPending
        ? pulseTuple(0.22, 0.42, 0.22)
        : pulseTuple(0.16, 0.28, 0.16),
      pulseScale: [0.96, 1.06, 0.98],
      pulseDuration: 1.35,
      pulseBackground:
        'radial-gradient(circle, rgba(245,158,11,0.24) 0%, rgba(127,29,29,0.10) 42%, transparent 74%)',
    });
  }

  if (activeValue >= 12) {
    return withMomentPulse({
      shellBorderColor: 'rgba(254,202,202,0.25)',
      shellBoxShadow: buildShellShadow(
        '0 0 48px rgba(220,38,38,0.14)',
        'inset 0 0 62px rgba(127,29,29,0.14)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(248,113,113,0.18) 0%, rgba(127,29,29,0.13) 24%, transparent 46%), radial-gradient(ellipse at 50% 55%, #241615 0%, #111512 34%, #0a0f0d 62%, #040708 100%)',
      archTopColor: 'rgba(254,202,202,0.20)',
      archSideColor: 'rgba(248,113,113,0.08)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(248,113,113,0.13) 0%, rgba(127,29,29,0.07) 38%, transparent 70%)',
      pulseKey: 'vale-12',
      pulseOpacity: [0.14, 0.26, 0.14],
      pulseScale: [0.96, 1.045, 0.98],
      pulseDuration: 1.35,
      pulseBackground:
        'radial-gradient(circle, rgba(248,113,113,0.22) 0%, rgba(127,29,29,0.12) 42%, transparent 74%)',
    });
  }

  if (activeValue >= 9) {
    return withMomentPulse({
      shellBorderColor: 'rgba(248,113,113,0.20)',
      shellBoxShadow: buildShellShadow(
        '0 0 40px rgba(220,38,38,0.10)',
        'inset 0 0 54px rgba(127,29,29,0.10)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(220,38,38,0.14) 0%, rgba(127,29,29,0.09) 22%, transparent 44%), radial-gradient(ellipse at 50% 55%, #1c1c14 0%, #101712 34%, #0a100d 62%, #040708 100%)',
      archTopColor: 'rgba(248,113,113,0.16)',
      archSideColor: 'rgba(220,38,38,0.07)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(220,38,38,0.10) 0%, rgba(127,29,29,0.05) 38%, transparent 70%)',
      pulseKey: 'vale-9',
      pulseOpacity: [0.12, 0.22, 0.12],
      pulseScale: [0.97, 1.035, 0.98],
      pulseDuration: 1.55,
      pulseBackground:
        'radial-gradient(circle, rgba(220,38,38,0.18) 0%, rgba(127,29,29,0.09) 42%, transparent 74%)',
    });
  }

  if (activeValue >= 6) {
    return withMomentPulse({
      shellBorderColor: 'rgba(245,158,11,0.20)',
      shellBoxShadow: buildShellShadow(
        '0 0 34px rgba(245,158,11,0.09)',
        'inset 0 0 48px rgba(146,64,14,0.08)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(245,158,11,0.16) 0%, rgba(146,64,14,0.08) 22%, transparent 44%), radial-gradient(ellipse at 50% 55%, #182017 0%, #101913 34%, #0a110e 62%, #040708 100%)',
      archTopColor: 'rgba(251,191,36,0.18)',
      archSideColor: 'rgba(245,158,11,0.07)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(245,158,11,0.10) 0%, rgba(146,64,14,0.04) 38%, transparent 70%)',
      pulseKey: 'vale-6',
      pulseOpacity: [0.1, 0.18, 0.1],
      pulseScale: [0.98, 1.025, 0.98],
      pulseDuration: 1.8,
      pulseBackground:
        'radial-gradient(circle, rgba(245,158,11,0.15) 0%, rgba(146,64,14,0.06) 42%, transparent 72%)',
    });
  }

  if (activeValue >= 3) {
    return withMomentPulse({
      shellBorderColor: 'rgba(255,223,128,0.18)',
      shellBoxShadow: buildShellShadow(
        '0 0 28px rgba(201,168,76,0.07)',
        'inset 0 0 42px rgba(201,168,76,0.05)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(201,168,76,0.14) 0%, rgba(46,92,53,0.11) 20%, transparent 42%), radial-gradient(ellipse at 50% 55%, #12251a 0%, #0d1a16 34%, #08110f 62%, #04090a 100%)',
      archTopColor: 'rgba(255,223,128,0.15)',
      archSideColor: 'rgba(201,168,76,0.07)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(201,168,76,0.08) 0%, rgba(36,78,44,0.035) 38%, transparent 70%)',
      pulseKey: 'vale-3',
      pulseOpacity: [0.08, 0.14, 0.08],
      pulseScale: [0.98, 1.018, 0.98],
      pulseDuration: 1.9,
      pulseBackground:
        'radial-gradient(circle, rgba(201,168,76,0.10) 0%, rgba(36,78,44,0.04) 42%, transparent 72%)',
    });
  }

  return withMomentPulse(baseVisuals);
}

function CardShape({
  rank,
  suit,
  faceDown = false,
  winner = false,
  highlight = false,
  compact = false,
  outcomeBadge = null,
  outcomeBadgeLabel = null,
  outcomeBadgeDelayMs = 0,
}: {
  rank?: string;
  suit?: string;
  faceDown?: boolean;
  winner?: boolean;
  highlight?: boolean;
  compact?: boolean;
  outcomeBadge?: SlotRoundOutcome;
  outcomeBadgeLabel?: string | null;
  outcomeBadgeDelayMs?: number;
}) {
  const isRed = parseSuitColor(suit ?? '');
  const symbol = suit ? SUIT_SYMBOL_MAP[suit] : '♦';
  const resolvedOutcomeBadgeLabel =
    outcomeBadgeLabel ??
    // PATCH B — Default winner label localised to PT. Loser was already
    // 'PERDEU' and tie was already 'EMPATE'; the winner fallback was the
    // outlier in English. Any caller that wants a different word still
    // wins via `outcomeBadgeLabel`.
    (outcomeBadge === 'win' ? 'VENCEU' : outcomeBadge === 'loss' ? 'PERDEU' : 'EMPATE');
  const outcomeBadgeStyles =
    outcomeBadge === 'win'
      ? {
          wrapper: 'linear-gradient(135deg, #fff1b8 0%, #f2d488 38%, #c9a84c 74%, #6f4f14 100%)',
          border: '1px solid rgba(255,241,184,0.96)',
          shadow:
            '0 9px 18px rgba(0,0,0,0.44), 0 0 22px rgba(242,212,136,0.68), inset 0 1px 0 rgba(255,255,255,0.52)',
          text: '#160f03',
          slash: 'rgba(255,255,255,0.46)',
        }
      : outcomeBadge === 'loss'
        ? {
            wrapper: 'linear-gradient(135deg, #fecaca 0%, #ef4444 38%, #991b1b 76%, #450a0a 100%)',
            border: '1px solid rgba(254,202,202,0.80)',
            shadow:
              '0 8px 16px rgba(0,0,0,0.34), 0 0 16px rgba(220,38,38,0.32), inset 0 1px 0 rgba(255,255,255,0.30)',
            text: '#fff7f7',
            slash: 'rgba(255,255,255,0.30)',
          }
        : outcomeBadge === 'tie'
          ? {
              wrapper:
                'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 42%, #64748b 78%, #334155 100%)',
              border: '1px solid rgba(226,232,240,0.84)',
              shadow:
                '0 8px 16px rgba(0,0,0,0.36), 0 0 16px rgba(148,163,184,0.36), inset 0 1px 0 rgba(255,255,255,0.52)',
              text: '#0f172a',
              slash: 'rgba(255,255,255,0.48)',
            }
          : null;

  if (faceDown) {
    // Face-down back with TP monogram in gold (kept from previous patch —
    // matches the reference image's opponent card backs).
    return (
      <div
        className={`relative rounded-[16px] border ${compact ? 'h-[112px] w-[80px]' : 'h-[148px] w-[106px]'}`}
        style={{
          background: 'linear-gradient(180deg, #122819 0%, #0d1914 50%, #09120f 100%)',
          borderColor: 'rgba(230,195,100,0.32)',
          boxShadow:
            '0 14px 28px rgba(0,0,0,0.55), inset 0 0 18px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        <div
          className="absolute inset-[5px] rounded-[12px]"
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
            fontSize: compact ? 24 : 32,
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
            width: compact ? 50 : 68,
            height: compact ? 50 : 68,
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
          ? { y: [-1, -4, -2], rotate: [0, 0.35, 0], scale: [1.01, 1.035, 1.02] }
          : highlight
            ? { y: [-1, -2, -1] }
            : {}
      }
      transition={{ duration: 1.1, repeat: highlight ? Infinity : 0 }}
      className={`relative rounded-[18px] border ${
        compact ? 'h-[100px] w-[72px]' : 'h-[162px] w-[116px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, #fefdf8 0%, #f8f5ec 50%, #f5f0e4 100%)',
        borderColor: winner ? 'rgba(255,223,128,0.92)' : 'rgba(0,0,0,0.14)',
        boxShadow: winner
          ? '0 0 0 1px rgba(255,223,128,0.66), 0 0 18px rgba(201,168,76,0.26), 0 24px 38px rgba(0,0,0,0.38)'
          : highlight
            ? '0 0 16px rgba(201,168,76,0.14), 0 20px 36px rgba(0,0,0,0.32)'
            : '0 6px 14px rgba(0,0,0,0.30), 0 18px 34px rgba(0,0,0,0.36)',
      }}
    >
      {winner ? (
        <motion.div
          className="pointer-events-none absolute inset-[3px] rounded-[15px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.2 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          style={{
            background: 'linear-gradient(135deg, rgba(255,223,128,0.18), rgba(201,168,76,0.04))',
          }}
        />
      ) : null}

      <div className="absolute left-2.5 top-2 flex flex-col items-start leading-none">
        <span
          className={`${compact ? 'text-[18px]' : 'text-[28px]'} font-black`}
          style={{ color: isRed ? '#b91c1c' : '#0f172a' }}
        >
          {rank}
        </span>
        <span
          className={`${compact ? 'text-[14px]' : 'text-[20px]'} font-black leading-none`}
          style={{ color: isRed ? '#ef4444' : '#111827' }}
        >
          {symbol}
        </span>
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center ${
          compact ? 'text-[26px]' : 'text-[48px]'
        } font-black`}
        style={{ color: isRed ? '#ef4444' : '#111827', opacity: 0.92 }}
      >
        {symbol}
      </div>

      <div className="absolute bottom-2 right-2.5 rotate-180 leading-none">
        <span
          className={`${compact ? 'text-[14px]' : 'text-[20px]'} font-black`}
          style={{ color: isRed ? '#ef4444' : '#111827' }}
        >
          {symbol}
        </span>
      </div>

      {outcomeBadge && outcomeBadgeStyles ? (
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute z-30 rounded-full ${
            compact ? '-right-2 -top-2 px-2.5 py-1' : '-right-4 -top-4 px-3.5 py-1.5'
          }`}
          initial={{ opacity: 0, scale: 0.74, y: 8, rotate: outcomeBadge === 'loss' ? -8 : 8 }}
          animate={{
            opacity: 1,
            scale: [0.86, 1.12, 1],
            y: 0,
            rotate: outcomeBadge === 'loss' ? -5 : 5,
          }}
          transition={{
            duration: 0.44,
            delay: outcomeBadgeDelayMs / 1000,
            times: [0, 0.58, 1],
            ease: [0.2, 0.9, 0.24, 1],
          }}
          style={{
            background: outcomeBadgeStyles.wrapper,
            border: outcomeBadgeStyles.border,
            boxShadow: outcomeBadgeStyles.shadow,
          }}
        >
          <span
            className={`relative z-10 font-black uppercase leading-none ${
              compact ? 'text-[8px] tracking-[0.16em]' : 'text-[10px] tracking-[0.20em]'
            }`}
            style={{
              color: outcomeBadgeStyles.text,
              fontFamily: 'Georgia, serif',
              textShadow:
                outcomeBadge === 'loss'
                  ? '0 1px 0 rgba(0,0,0,0.24)'
                  : '0 1px 0 rgba(255,255,255,0.30)',
            }}
          >
            {resolvedOutcomeBadgeLabel}
          </span>
          <span
            className="pointer-events-none absolute left-1/2 top-0 h-full w-[1px] -rotate-[24deg]"
            style={{ background: outcomeBadgeStyles.slash }}
          />
        </motion.div>
      ) : null}
    </motion.div>
  );
}

// Opponent group — avatar pill sits IMMEDIATELY above the 3 face-down
// cards, tight coupling. Matches the reference where T2A + cards are one
// visual unit. Adds a subtle ground shadow under the cards to anchor them.
const BOT_AVATAR_GLYPHS: Record<string, string> = {
  spade: '♠',
  club: '♣',
  hat: '🎩',
  fire: '🔥',
  bolt: '⚡',
  skull: '💀',
  owl: '🦉',
  moon: '🌙',
  leaf: '🍃',
};

const BOT_PROFILE_LABELS: Record<string, string> = {
  balanced: 'Equilibrado',
  aggressive: 'Agressivo',
  cautious: 'Cauteloso',
};

type SeatAvatar = {
  content: string;
  kind: 'glyph' | 'initial';
};

function resolveSeatAvatar(seat: TableSeatView, displayName: string): SeatAvatar {
  if (seat.botIdentity) {
    const glyph = BOT_AVATAR_GLYPHS[seat.botIdentity.avatarKey];

    if (glyph) {
      return { content: glyph, kind: 'glyph' };
    }
  }

  const initial = displayName.charAt(0).toUpperCase() || '?';
  return { content: initial, kind: 'initial' };
}

function resolveProfileLabel(profile: string): string {
  return BOT_PROFILE_LABELS[profile] ?? profile;
}

type BotPresenceTone = 'idle' | 'thinking' | 'pressure' | 'maoDeOnze' | 'wonRound' | 'lostRound';

type BotPresenceHold = {
  line: string;
  quote: string | null;
  tone: BotPresenceTone;
  id: number;
};

const BOT_THINKING_LINES: Record<string, string> = {
  balanced: 'Lendo a mesa',
  aggressive: 'Preparando pressão',
  cautious: 'Calculando a mão',
};

const BOT_PRESSURE_LINES: Record<string, string> = {
  balanced: 'Colocou pressão',
  aggressive: 'Veio pra cima',
  cautious: 'Escolheu a queda',
};

const BOT_THINKING_QUOTES: Record<string, string> = {
  balanced: 'Deixa eu ler essa mesa.',
  aggressive: 'Vou apertar essa mão.',
  cautious: 'Sem pressa. Vou calcular.',
};

const BOT_PRESSURE_QUOTES: Record<string, string> = {
  balanced: 'Quero ver essa resposta.',
  aggressive: 'Truco. Quero ver.',
  cautious: 'Se é pra cair, cai direito.',
};

function resolveBotPresenceLine({
  seat,
  tone,
  currentValue,
}: {
  seat: TableSeatView | null;
  tone: BotPresenceTone;
  currentValue: number;
}): string | null {
  if (!seat?.isBot) {
    return null;
  }

  const profile = seat.botIdentity?.profile ?? 'balanced';

  if (tone === 'thinking') {
    return BOT_THINKING_LINES[profile] ?? 'Pensando a jogada';
  }

  if (tone === 'pressure') {
    if (currentValue >= 9) {
      return 'Quer decidir agora';
    }

    if (currentValue >= 6) {
      return 'Mesa esquentou';
    }

    return BOT_PRESSURE_LINES[profile] ?? 'Colocou pressão';
  }

  if (tone === 'maoDeOnze') {
    return 'Sentiu a queda';
  }

  if (tone === 'wonRound') {
    return 'Levou a rodada';
  }

  if (tone === 'lostRound') {
    return 'Sentiu o golpe';
  }

  if (currentValue >= 9) {
    return 'Mesa quente';
  }

  if (currentValue >= 6) {
    return 'Aposta alta';
  }

  return null;
}

function resolveBotPresenceQuote({
  seat,
  tone,
  currentValue,
}: {
  seat: TableSeatView | null;
  tone: BotPresenceTone;
  currentValue: number;
}): string | null {
  if (!seat?.isBot || tone === 'idle') {
    return null;
  }

  const profile = seat.botIdentity?.profile ?? 'balanced';

  if (tone === 'thinking') {
    return BOT_THINKING_QUOTES[profile] ?? 'Pensando a jogada.';
  }

  if (tone === 'pressure') {
    if (currentValue >= 9) {
      return 'Agora quero ver segurar.';
    }

    return BOT_PRESSURE_QUOTES[profile] ?? 'Coloquei pressão.';
  }

  if (tone === 'maoDeOnze') {
    return 'Agora é queda.';
  }

  if (tone === 'wonRound') {
    return 'Essa ficou comigo.';
  }

  if (tone === 'lostRound') {
    return 'Boa. Ainda tem jogo.';
  }

  return null;
}

function getBotPresenceVisuals(tone: BotPresenceTone) {
  switch (tone) {
    case 'thinking':
      return {
        background: 'linear-gradient(180deg, rgba(47,35,17,0.96), rgba(15,20,16,0.90))',
        border: '1px solid rgba(255,223,128,0.42)',
        dot: '#f2d488',
        dotGlow: '0 0 14px rgba(242,212,136,0.66)',
        text: '#f6dfa0',
        quoteBorder: 'rgba(255,223,128,0.28)',
        quoteBackground:
          'linear-gradient(180deg, rgba(32,25,14,0.94), rgba(10,14,12,0.90))',
      };
    case 'pressure':
      return {
        background: 'linear-gradient(180deg, rgba(69,18,18,0.94), rgba(20,13,11,0.90))',
        border: '1px solid rgba(248,113,113,0.38)',
        dot: '#f59e0b',
        dotGlow: '0 0 16px rgba(245,158,11,0.68)',
        text: '#fed7aa',
        quoteBorder: 'rgba(248,113,113,0.32)',
        quoteBackground:
          'linear-gradient(180deg, rgba(73,22,18,0.94), rgba(14,10,9,0.92))',
      };
    case 'maoDeOnze':
      return {
        background: 'linear-gradient(180deg, rgba(73,43,12,0.94), rgba(18,14,9,0.90))',
        border: '1px solid rgba(255,223,128,0.36)',
        dot: '#e8c76a',
        dotGlow: '0 0 14px rgba(232,199,106,0.58)',
        text: '#f2d488',
        quoteBorder: 'rgba(255,223,128,0.28)',
        quoteBackground:
          'linear-gradient(180deg, rgba(68,43,14,0.94), rgba(14,11,8,0.92))',
      };
    case 'wonRound':
      return {
        background: 'linear-gradient(180deg, rgba(75,46,15,0.96), rgba(18,16,10,0.90))',
        border: '1px solid rgba(255,223,128,0.42)',
        dot: '#f2d488',
        dotGlow: '0 0 16px rgba(242,212,136,0.64)',
        text: '#fff1b8',
        quoteBorder: 'rgba(255,223,128,0.30)',
        quoteBackground:
          'linear-gradient(180deg, rgba(52,37,14,0.94), rgba(10,12,10,0.92))',
      };
    case 'lostRound':
      return {
        background: 'linear-gradient(180deg, rgba(33,43,38,0.94), rgba(10,16,15,0.90))',
        border: '1px solid rgba(148,163,184,0.26)',
        dot: '#94a3b8',
        dotGlow: '0 0 12px rgba(148,163,184,0.34)',
        text: '#cbd5e1',
        quoteBorder: 'rgba(148,163,184,0.22)',
        quoteBackground:
          'linear-gradient(180deg, rgba(23,31,31,0.94), rgba(8,12,12,0.92))',
      };
    case 'idle':
    default:
      return {
        background: 'linear-gradient(180deg, rgba(22,30,24,0.92), rgba(10,18,14,0.86))',
        border: '1px solid rgba(255,255,255,0.10)',
        dot: 'rgba(148,163,184,0.55)',
        dotGlow: 'none',
        text: 'rgba(232,213,160,0.58)',
        quoteBorder: 'rgba(255,255,255,0.10)',
        quoteBackground: 'linear-gradient(180deg, rgba(11,16,14,0.88), rgba(5,8,8,0.86))',
      };
  }
}

// PATCH G — Dynamic OpponentCluster with lift-off exit.
//
// Before: the cluster always rendered three face-down TP cards regardless
// of how many the bot actually had left. The bot played a card → the
// OpponentCardFlight clone flew from the cluster's geometric center to the
// played slot, but the cluster itself never reacted. Visually it looked
// like the card was being conjured from thin air.
//
// After: the cluster renders exactly `cardsRemaining` cards. When the bot
// plays a card, the count drops by 1, AnimatePresence runs an "exit"
// animation on the rightmost card (lift-off + fade + slight rotate), and
// the OpponentCardFlight clone simultaneously flies from the cached source
// rect to the played slot. Two animations on the same frame, one source
// of truth: the cluster acts like a real hand, the table catches the card.
//
// Important about timing: OpponentCardFlight captures the source ref's
// getBoundingClientRect() inside a useLayoutEffect when activeFlight kicks
// off. That happens on the SAME render tick as the count drop. The flight
// reads the rect of the still-3-wide cluster — so the clone always emerges
// from the position where the card LEFT, not from the new shrunken
// geometry. This is intentional: it preserves the physical illusion.
//
// The rounds[] array on currentPublicHand carries playerOneCard /
// playerTwoCard per round (null if not yet played). Counting how many of
// those are non-null on the OPPONENT side gives an exact "cards played"
// count, which we subtract from the starting hand size of 3.
function OpponentCluster({
  seat,
  cardsRemaining,
  isOpponent,
  presenceLine = null,
  presenceQuote = null,
  presenceTone = 'idle',
  suppressNeutralProfile = false,
}: {
  seat: TableSeatView;
  cardsRemaining: number;
  isOpponent: boolean;
  presenceLine?: string | null;
  presenceQuote?: string | null;
  presenceTone?: BotPresenceTone;
  suppressNeutralProfile?: boolean;
}) {
  // Defensive clamp — never render negative, never render more than the
  // starting hand size. The "playing" indicator should always be 0–3.
  const safeCount = Math.max(0, Math.min(3, cardsRemaining));
  const cardIndices = Array.from({ length: safeCount }, (_, index) => index);

  const isCurrentTurn = seat.isCurrentTurn;
  const displayName = seat.isMine ? 'Você' : (seat.botIdentity?.displayName ?? seat.seatId);
  const avatar = resolveSeatAvatar(seat, displayName);
  const profileLabel =
    seat.isBot && seat.botIdentity ? resolveProfileLabel(seat.botIdentity.profile) : null;
  const presenceVisuals = getBotPresenceVisuals(presenceTone);
  const shouldShowPresenceLine = presenceLine !== null;
  const shouldShowPresenceQuote = presenceQuote !== null;
  const shouldPulsePresence = presenceTone !== 'idle';
  // NOTE: Dynamic speech should read like the bot's current state, not like
  // a second identity label. Keep the profile label only in neutral moments;
  // when the bot speaks, the avatar pill already owns the character name.
  const statusLabel = shouldShowPresenceLine
    ? presenceLine
    : suppressNeutralProfile
      ? null
      : profileLabel;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.div
        animate={
          shouldPulsePresence
            ? { scale: [1, 1.018, 1], y: [0, -1, 0] }
            : isCurrentTurn
              ? { scale: [1, 1.015, 1] }
              : {}
        }
        transition={{
          duration: shouldPulsePresence ? 1.35 : 2.2,
          repeat: shouldPulsePresence || isCurrentTurn ? Infinity : 0,
        }}
        className="relative flex items-center gap-2.5 rounded-full px-3.5 py-1.5 backdrop-blur-xl"
        style={{
          background: presenceVisuals.background,
          border: isCurrentTurn ? presenceVisuals.border : '1px solid rgba(255,255,255,0.10)',
          boxShadow: isCurrentTurn
            ? '0 0 24px rgba(230,195,100,0.22), 0 14px 30px rgba(0,0,0,0.48)'
            : '0 14px 30px rgba(0,0,0,0.44)',
        }}
      >
        <div
          className="relative z-10 flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-full font-black"
          style={{
            background: 'linear-gradient(135deg, #3d3426 0%, #211c14 55%, #11100c 100%)',
            border: '1px solid rgba(255,255,255,0.16)',
            color: 'rgba(235,220,180,0.92)',
            fontFamily: 'Georgia, serif',
            fontSize: avatar.kind === 'glyph' ? 16 : 13,
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), 0 4px 10px rgba(0,0,0,0.42)',
          }}
          aria-hidden
        >
          {avatar.content}
        </div>

        <span
          className="relative z-10 text-[15px] font-black leading-none"
          style={{
            color: '#e8d5a0',
            fontFamily: 'Georgia, serif',
            letterSpacing: '0.02em',
          }}
        >
          {displayName}
        </span>

        <motion.span
          className="relative z-10 h-2.5 w-2.5 rounded-full"
          animate={shouldPulsePresence ? { opacity: [0.62, 1, 0.62], scale: [1, 1.22, 1] } : {}}
          transition={{ duration: 1.1, repeat: shouldPulsePresence ? Infinity : 0 }}
          style={{
            background: seat.isBot
              ? presenceVisuals.dot
              : isCurrentTurn
                ? '#22c55e'
                : 'rgba(148,163,184,0.42)',
            boxShadow: seat.isBot
              ? presenceVisuals.dotGlow
              : isCurrentTurn
                ? '0 0 10px rgba(34,197,94,0.64)'
                : 'none',
          }}
        />
      </motion.div>

      <AnimatePresence mode="popLayout">
        {statusLabel || shouldShowPresenceQuote ? (
          <motion.div
            key={String(presenceTone) + '-' + String(statusLabel ?? 'profile') + '-' + String(presenceQuote ?? 'no-quote')}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`pointer-events-none max-w-[270px] rounded-[16px] border text-center ${
              shouldShowPresenceQuote ? 'px-3.5 py-2' : 'px-3 py-1.5'
            }`}
            style={{
              background: shouldShowPresenceQuote
                ? presenceVisuals.quoteBackground
                : shouldShowPresenceLine
                  ? presenceVisuals.quoteBackground
                  : 'rgba(0,0,0,0.16)',
              borderColor: shouldShowPresenceQuote
                ? presenceVisuals.quoteBorder
                : shouldShowPresenceLine
                  ? presenceVisuals.quoteBorder
                  : 'rgba(255,223,128,0.12)',
              boxShadow: shouldPulsePresence
                ? '0 16px 28px rgba(0,0,0,0.34), 0 0 18px rgba(201,168,76,0.14), inset 0 1px 0 rgba(255,255,255,0.06)'
                : '0 10px 20px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {statusLabel ? (
              <div
                className="text-[9px] font-black uppercase leading-none tracking-[0.20em]"
                style={{
                  color: shouldShowPresenceLine ? presenceVisuals.text : 'rgba(232,213,160,0.52)',
                  fontFamily: 'Georgia, serif',
                }}
              >
                {statusLabel}
              </div>
            ) : null}

            {shouldShowPresenceQuote ? (
              <div
                className={`${statusLabel ? 'mt-1.5' : ''} text-[10px] font-black uppercase leading-tight tracking-[0.14em]`}
                style={{ color: presenceVisuals.text, fontFamily: 'Georgia, serif' }}
              >
                “{presenceQuote}”
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
      {/* Cards row.
          - layout="position" so the remaining cards smoothly close the
            gap left by the played one (Framer's automatic FLIP).
          - AnimatePresence with custom exit so the rightmost card lifts
            off (y: -22, scale: 1.06, slight rotate) and fades, mirroring
            a real-world "throw to the table" flick.
          - The flight clone in OpponentCardFlight starts simultaneously
            and overshoots toward the played slot — the two animations
            read as one continuous gesture.
          - min-h preserved so the cluster row doesn't collapse to 0
            while exit-animating. */}
      <div className="flex min-h-[64px] items-center gap-2">
        <AnimatePresence initial={false}>
          {cardIndices.map((index) => (
            <motion.div
              key={`opponent-card-${index}`}
              layout="position"
              initial={{ opacity: 0, y: -8, rotate: index === 0 ? -5 : index === 2 ? 5 : 0 }}
              animate={{ opacity: 1, y: 0, rotate: index === 0 ? -5 : index === 2 ? 5 : 0 }}
              exit={{
                opacity: 0,
                y: -22,
                scale: 1.06,
                rotate: index === 0 ? -10 : index === 2 ? 10 : -2,
                transition: { duration: 0.28, ease: [0.4, 0, 0.6, 1] },
              }}
              transition={{ delay: index * 0.06 }}
            >
              <CardShape faceDown compact />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div
        aria-hidden
        className="pointer-events-none h-3 w-48 rounded-full"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.44) 0%, transparent 72%)',
          filter: 'blur(7px)',
        }}
      />
    </div>
  );
}

// CHANGE (issue E — Vira needs to read "special", not like a normal card):
// Upgraded treatment. The old version had just a gold-caps "Vira" label on
// top with a faint radial glow and the `highlight` floaty animation — too
// close to a regular played card. New treatment:
//   • A compact gold "V" medallion on the top-left corner of the card —
//     like a wax seal. This is the dead giveaway that it's the Vira.
//   • A stronger, tighter gold ring-glow around the card (not the wide
//     ambient radial which was too diffuse).
//   • A tiny "MANILHA DEFINIDA" caption under the label so the player
//     understands *why* this card is special at a glance.
//   • Kept the subdued float animation — doesn't compete with the WIN state.
function ViraCard({ rank, suit }: { rank: string; suit: string }) {
  return (
    <div className="relative flex flex-col items-center gap-1.5">
      <span
        className="text-[11px] font-bold tracking-[0.28em]"
        style={{
          color: '#e8c76a',
          fontFamily: 'Georgia, serif',
          textShadow: '0 2px 4px rgba(0,0,0,0.50)',
        }}
      >
        VIRA
      </span>

      <div className="relative">
        {/* Tight gold ring-glow — immediate visual separator from common cards. */}
        <div
          className="pointer-events-none absolute -inset-[6px] rounded-[24px]"
          style={{
            border: '1px solid rgba(230,195,100,0.42)',
            boxShadow: '0 0 0 1px rgba(255,223,128,0.10), 0 0 24px rgba(201,168,76,0.22)',
          }}
        />
        {/* Soft radial under-glow, kept but tightened. */}
        <div
          className="pointer-events-none absolute -inset-2 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(230,195,100,0.22) 0%, rgba(230,195,100,0.06) 42%, transparent 72%)',
            filter: 'blur(10px)',
          }}
        />

        <div className="relative">
          <CardShape rank={rank} suit={suit} highlight />

          {/* "V" wax-seal medallion on the top-right of the card, above the
              rank. Reads as an official mark, not a sticker. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-2 -top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #f2d488 0%, #c9a84c 58%, #7b5a1d 100%)',
              border: '1px solid rgba(255,223,128,0.76)',
              boxShadow:
                '0 4px 12px rgba(0,0,0,0.42), 0 0 12px rgba(201,168,76,0.38), inset 0 1px 0 rgba(255,255,255,0.38)',
              fontFamily: 'Georgia, serif',
              color: '#1a1204',
              fontWeight: 900,
              fontSize: 12,
              letterSpacing: '0.02em',
            }}
          >
            V
          </div>
        </div>
      </div>

      <span
        className="text-[8px] font-bold uppercase tracking-[0.28em]"
        style={{
          color: 'rgba(232,213,160,0.48)',
          fontFamily: 'Georgia, serif',
        }}
      >
        Manilha definida
      </span>
    </div>
  );
}

// Absorbs "pressure" notifications — modeled after the reference's
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
    <div className="flex w-[108px] shrink-0 flex-col gap-3 self-center">
      <div>
        <div
          className="text-[10px] font-bold uppercase tracking-[0.22em]"
          style={{ color: 'rgba(232,213,160,0.52)' }}
        >
          Valor atual
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span
            className="flex h-10 min-w-10 items-center justify-center rounded-2xl px-3 text-[25px] font-black leading-none"
            style={{
              backgroundImage: valeVisuals.background,
              border: valeVisuals.border,
              boxShadow: valeVisuals.glow,
              color: valeVisuals.textColor,
              fontFamily: 'Georgia, serif',
              textShadow:
                valeTier === 'gold' || valeTier === 'orange'
                  ? '0 1px 0 rgba(255,255,255,0.22)'
                  : '0 2px 8px rgba(0,0,0,0.42)',
            }}
          >
            {currentValue}
          </span>
          <span
            className="text-[10px] font-bold uppercase leading-tight tracking-[0.20em]"
            style={{ color: 'rgba(232,213,160,0.58)' }}
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
          className="mt-1 text-[14px] font-black leading-tight"
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

// CHANGE (issue F — score has too little weight):
// Previously the score lived in a small card as "T1 3  x  T2 1" — legible but
// flat, and too close to the Vale chip. New treatment:
//   • Taller, more opinionated plate with a gold top-border accent and a
//     stronger inner gradient.
//   • Numbers now in a bigger, more confident size with a gold gradient fill
//     (text-gradient-gold vocabulary) — reads as "official scoreboard",
//     not a stat chip.
//   • The "T1/T2" captions stay quiet; the numbers do all the talking.
//   • Leading team gets a subtle gold glow on its number — a quiet signal,
//     not a banner. If tied, both stay neutral.
//   • Round chips below now get bigger taps (6px → 7px dots with more gap).
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

  const t1Leading = scoreT1 > scoreT2;
  const t2Leading = scoreT2 > scoreT1;

  return (
    <div className="flex w-[124px] shrink-0 flex-col items-end gap-3 self-center">
      {/* CHANGE: more prominent scoreboard plate */}
      <div
        className="relative flex items-center gap-3 rounded-[16px] px-4 py-2.5"
        style={{
          background:
            'linear-gradient(180deg, rgba(18,28,46,0.96) 0%, rgba(10,18,32,0.94) 55%, rgba(4,10,20,0.92) 100%)',
          border: '1px solid rgba(230,195,100,0.34)',
          boxShadow:
            '0 14px 30px rgba(0,0,0,0.52), 0 0 18px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,223,128,0.12)',
        }}
      >
        {/* gold top-line accent */}
        <div
          className="pointer-events-none absolute inset-x-4 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,223,128,0.58) 50%, transparent 100%)',
          }}
        />

        <div className="flex flex-col items-center">
          <span
            className="text-[9px] font-black uppercase tracking-[0.24em]"
            style={{ color: 'rgba(232,213,160,0.58)' }}
          >
            T1
          </span>
          <span
            className="text-[28px] font-black leading-none"
            style={{
              color: t1Leading ? '#f2d488' : '#d7c18b',
              fontFamily: 'Georgia, serif',
              textShadow: t1Leading
                ? '0 0 8px rgba(201,168,76,0.38), 0 1px 2px rgba(0,0,0,0.42)'
                : '0 1px 2px rgba(0,0,0,0.4)',
            }}
          >
            {scoreT1}
          </span>
        </div>

        <span
          className="text-[16px] font-black leading-none"
          style={{ color: 'rgba(232,213,160,0.26)', fontFamily: 'Georgia, serif' }}
        >
          ×
        </span>

        <div className="flex flex-col items-center">
          <span
            className="text-[9px] font-black uppercase tracking-[0.24em]"
            style={{ color: 'rgba(232,213,160,0.58)' }}
          >
            T2
          </span>
          <span
            className="text-[28px] font-black leading-none"
            style={{
              color: t2Leading ? '#f2d488' : '#d7c18b',
              fontFamily: 'Georgia, serif',
              textShadow: t2Leading
                ? '0 0 8px rgba(201,168,76,0.38), 0 1px 2px rgba(0,0,0,0.42)'
                : '0 1px 2px rgba(0,0,0,0.4)',
            }}
          >
            {scoreT2}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-2.5">
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
                className="h-[22px] w-[22px] rounded-full"
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
  isCoveredByFlight?: boolean;
  hideEmpty?: boolean;
  winnerBadgeLabel?: string | null;
  loserBadgeLabel?: string | null;
  isTieHighlight?: boolean;
  isLoser?: boolean;
  showOutcomeBadge?: boolean;
};

// CHANGE (issues C & D):
//  C — WIN badge was sitting at `-right-2 top-2` on a 190×164 wrapper that
//      was much larger than the 162×116 card inside. Result: the badge was
//      floating in the wrapper's padding, NOT anchored to the card corner.
//      The fix anchors the badge directly on the card's top-right corner
//      (same relative parent as the card), using a tight negative offset
//      so it reads as a ribbon on the card itself.
//  D — Tie rounds had no visual equivalent to the WIN badge. Added an
//      "EMPATE" badge in silver/slate tones, same mechanical placement as
//      WIN but on BOTH played cards simultaneously so the player sees that
//      neither card won.
function resolveSlotRoundOutcome(params: {
  roundResult: string | null;
  playerId: 'P1' | 'P2' | null;
  canShow: boolean;
}): SlotRoundOutcome {
  const { roundResult, playerId, canShow } = params;

  if (!canShow || !roundResult || !playerId) {
    return null;
  }

  if (roundResult === 'TIE') {
    return 'tie';
  }

  if (roundResult === playerId) {
    return 'win';
  }

  if (roundResult === 'P1' || roundResult === 'P2') {
    return 'loss';
  }

  return null;
}

function formatRoundVerdictCard(card: { rank: string; suit: string } | null): string {
  if (!card) {
    return '—';
  }

  return `${card.rank}${SUIT_SYMBOL_MAP[card.suit] ?? ''}`;
}

function RoundClashVerdict({
  outcome,
  myCard,
  opponentCard,
}: {
  outcome: SlotRoundOutcome;
  myCard: { rank: string; suit: string } | null;
  opponentCard: { rank: string; suit: string } | null;
}) {
  if (!outcome || !myCard || !opponentCard) {
    return null;
  }

  const myCardLabel = formatRoundVerdictCard(myCard);
  const opponentCardLabel = formatRoundVerdictCard(opponentCard);
  const isViewerWin = outcome === 'win';
  const isViewerLoss = outcome === 'loss';
  const isTie = outcome === 'tie';
  const leftAccent = isViewerLoss
    ? 'rgba(255,223,128,0.86)'
    : isTie
      ? 'rgba(203,213,225,0.66)'
      : 'rgba(248,113,113,0.62)';
  const rightAccent = isViewerWin
    ? 'rgba(255,223,128,0.86)'
    : isTie
      ? 'rgba(203,213,225,0.66)'
      : 'rgba(248,113,113,0.62)';
  const verdictTitle = isViewerWin ? 'Rodada sua' : isViewerLoss ? 'Rodada deles' : 'Empate';
  const verdictDetail = isViewerWin
    ? `${myCardLabel} venceu ${opponentCardLabel}`
    : isViewerLoss
      ? `${opponentCardLabel} venceu ${myCardLabel}`
      : `${myCardLabel} e ${opponentCardLabel} se equivaleram`;
  const titleColor = isViewerWin ? '#f8e7b4' : isViewerLoss ? '#ffd6cf' : '#e2e8f0';
  const crownColor = isTie ? '#cbd5e1' : '#f2d488';

  return (
    <motion.div
      // PATCH E — surface the round verdict to assistive tech. The textual
      // content (verdictTitle + verdictDetail) is meaningful — it tells the
      // user who won the round and with which cards. Polite, not assertive,
      // so it doesn't interrupt the truco drama announcement if both happen
      // in quick succession.
      role="status"
      aria-live="polite"
      aria-atomic="true"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.48, ease: [0.2, 0.9, 0.24, 1] }}
      className="pointer-events-none absolute left-1/2 top-1/2 z-[18] h-[226px] w-[392px] -translate-x-1/2 -translate-y-1/2"
    >
      <motion.div
        className="absolute left-1/2 top-[38%] h-[190px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        initial={{ opacity: 0, scale: 0.78 }}
        animate={{ opacity: [0.22, 0.58, 0.34], scale: [0.86, 1.12, 0.98] }}
        transition={{ duration: 1.35, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          background: isTie
            ? 'radial-gradient(circle, rgba(203,213,225,0.18) 0%, rgba(71,85,105,0.10) 38%, transparent 72%)'
            : 'radial-gradient(circle, rgba(255,223,128,0.22) 0%, rgba(127,29,29,0.16) 36%, transparent 74%)',
          filter: 'blur(22px)',
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[37%] h-[3px] w-[390px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        initial={{ opacity: 0, scaleX: 0.12 }}
        animate={{ opacity: [0.18, 1, 0.62], scaleX: [0.22, 1.12, 1] }}
        transition={{ duration: 0.98, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${leftAccent} 19%, rgba(255,244,214,0.96) 50%, ${rightAccent} 81%, transparent 100%)`,
          boxShadow: '0 0 22px rgba(255,223,128,0.38), 0 0 30px rgba(248,113,113,0.20)',
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[37%] flex h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
        initial={{ opacity: 0, scale: 0.68, rotate: -18 }}
        animate={{ opacity: 1, scale: [0.78, 1.18, 1], rotate: 0 }}
        transition={{ duration: 0.9, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          background:
            'radial-gradient(circle at 35% 25%, rgba(255,244,214,0.34) 0%, rgba(18,16,11,0.96) 42%, rgba(7,9,8,0.98) 100%)',
          border: '1px solid rgba(255,223,128,0.66)',
          boxShadow:
            '0 0 28px rgba(255,223,128,0.30), 0 16px 34px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.22)',
        }}
      >
        <span
          className="text-[16px] font-black uppercase tracking-[0.08em]"
          style={{
            color: '#f8e7b4',
            fontFamily: 'Georgia, serif',
            textShadow: '0 2px 8px rgba(0,0,0,0.44)',
          }}
        >
          VS
        </span>
      </motion.div>

      <motion.div
        className="absolute left-1/2 top-[72%] -translate-x-1/2 -translate-y-1/2 text-center"
        initial={{ opacity: 0, y: 14, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.66, delay: 0.24, ease: [0.2, 0.9, 0.24, 1] }}
      >
        <div className="relative px-5 py-3">
          <div
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,223,128,0.42), transparent)',
            }}
          />

          <div
            className="relative rounded-full px-6 py-2.5"
            style={{
              background: 'linear-gradient(180deg, rgba(9,13,12,0.88) 0%, rgba(3,6,7,0.76) 100%)',
              border: '1px solid rgba(255,223,128,0.26)',
              boxShadow: '0 16px 34px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.07)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <div
              className="absolute left-1/2 top-[-14px] -translate-x-1/2 text-[18px] leading-none"
              style={{ color: crownColor, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.48))' }}
            >
              {isTie ? '◆' : '♛'}
            </div>

            <p
              className="text-[16px] font-black uppercase tracking-[0.22em]"
              style={{
                color: titleColor,
                fontFamily: 'Georgia, serif',
                textShadow: '0 2px 10px rgba(0,0,0,0.34)',
              }}
            >
              {verdictTitle}
            </p>
            <p
              className="mt-1 text-[12px] font-bold tracking-[0.08em]"
              style={{ color: 'rgba(240,230,211,0.80)' }}
            >
              {verdictDetail}
            </p>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PlayedSlot({
  label = '',
  card,
  revealKey,
  isWinner,
  isFading,
  rotation,
  isLaunching = false,
  isCoveredByFlight = false,
  hideEmpty = false,
  winnerBadgeLabel = null,
  loserBadgeLabel = null,
  isTieHighlight = false,
  isLoser = false,
  showOutcomeBadge = true,
}: PlayedSlotProps) {
  const shouldRenderCard = Boolean(card) || !hideEmpty;
  const renderedCard = card;
  const shouldRenderVisibleCard = renderedCard !== null;
  const shouldShowSettledCard = !isCoveredByFlight;
  const showWinnerEffects = shouldShowSettledCard && Boolean(renderedCard && isWinner);
  const showTieEffects =
    shouldShowSettledCard && Boolean(renderedCard && isTieHighlight && !isWinner);
  const showLoserEffects =
    shouldShowSettledCard && Boolean(renderedCard && isLoser && !isWinner && !isTieHighlight);
  const nativeOutcomeBadge: SlotRoundOutcome = showOutcomeBadge
    ? showWinnerEffects
      ? 'win'
      : showTieEffects
        ? 'tie'
        : showLoserEffects
          ? 'loss'
          : null
    : null;
  const nativeOutcomeBadgeLabel =
    nativeOutcomeBadge === 'win'
      ? winnerBadgeLabel
      : nativeOutcomeBadge === 'loss'
        ? loserBadgeLabel
        : nativeOutcomeBadge === 'tie'
          ? 'EMPATE'
          : null;
  const cardIdentity = `${renderedCard?.rank ?? 'empty'}${renderedCard?.suit ?? ''}`;
  const slotRevealAnimationKey = `${cardIdentity}-${revealKey}`;
  const wasCoveredByFlightRef = useRef(false);
  const [flightReleaseSettleKey, setFlightReleaseSettleKey] = useState(0);

  useEffect(() => {
    if (wasCoveredByFlightRef.current && !isCoveredByFlight && shouldRenderVisibleCard) {
      setFlightReleaseSettleKey((current) => current + 1);
    }

    wasCoveredByFlightRef.current = isCoveredByFlight;
  }, [cardIdentity, isCoveredByFlight, shouldRenderVisibleCard]);

  const hasJustReleasedFromFlight = flightReleaseSettleKey > 0 && shouldShowSettledCard;
  const shouldPlayFlightReleaseSettle = hasJustReleasedFromFlight && !showWinnerEffects;
  const slotMotionKey = `${slotRevealAnimationKey}-${flightReleaseSettleKey}`;

  void label;
  void isLaunching;

  return (
    <div className="relative flex min-w-[188px] flex-col items-center">
      <div className="relative flex h-[190px] w-[164px] items-center justify-center">
        {showTieEffects ? (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-20 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(203,213,225,0.18) 0%, transparent 72%)',
              filter: 'blur(14px)',
            }}
          />
        ) : null}

        {showWinnerEffects ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-24 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={false}
            animate={{ opacity: [0.2, 0.52, 0.3], scale: [0.82, 1.24, 1.08] }}
            transition={{ duration: 0.82, ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              background:
                'radial-gradient(circle at 50% 50%, rgba(255,230,150,0.38) 0%, rgba(201,168,76,0.18) 44%, transparent 78%)',
              filter: 'blur(22px)',
            }}
          />
        ) : null}

        {shouldRenderCard ? (
          <motion.div
            key={slotMotionKey}
            initial={
              isCoveredByFlight
                ? false
                : hasJustReleasedFromFlight
                  ? {
                      opacity: 1,
                      y: showWinnerEffects ? -8 : showLoserEffects ? 12 : 0,
                      scale: showWinnerEffects ? 1.08 : showLoserEffects ? 0.88 : 1.02,
                      rotate: rotation,
                      rotateY: 0,
                    }
                  : {
                      opacity: 0,
                      y: 10,
                      scale: 0.96,
                      rotate: rotation,
                      rotateY: 22,
                    }
            }
            animate={
              showWinnerEffects
                ? {
                    opacity: 1,
                    y: [-4, -16, -10],
                    scale: [1.04, 1.18, 1.12],
                    rotate: [rotation, rotation + 0.9, rotation + 0.24],
                    rotateY: 0,
                  }
                : {
                    opacity: shouldShowSettledCard ? (isFading || isLoser ? 0.42 : 1) : 0,
                    y: shouldPlayFlightReleaseSettle
                      ? [8, -5, 0]
                      : isLoser && shouldShowSettledCard
                        ? 13
                        : 0,
                    scale: shouldPlayFlightReleaseSettle
                      ? [0.96, 1.055, 1.02]
                      : isFading || isLoser
                        ? 0.87
                        : 1.02,
                    rotate: shouldPlayFlightReleaseSettle
                      ? [rotation - 3, rotation + 1.2, rotation]
                      : rotation,
                    rotateY: shouldPlayFlightReleaseSettle ? [18, 0, 0] : 0,
                  }
            }
            transition={
              showWinnerEffects
                ? {
                    duration: 1.16,
                    times: [0, 0.44, 1],
                    ease: [0.2, 0.9, 0.24, 1],
                  }
                : {
                    duration: isCoveredByFlight
                      ? 0.04
                      : shouldPlayFlightReleaseSettle
                        ? 0.42
                        : showLoserEffects
                          ? 0.48
                          : 0.28,
                    delay: showLoserEffects ? LOSER_DIM_DELAY_MS / 1000 : 0,
                    ease: [0.2, 0.9, 0.24, 1],
                  }
            }
            className="relative z-10"
            style={{
              pointerEvents: isCoveredByFlight ? 'none' : 'auto',
              filter: showWinnerEffects
                ? 'drop-shadow(0 0 34px rgba(255,230,150,0.74)) drop-shadow(0 24px 34px rgba(0,0,0,0.42))'
                : showTieEffects
                  ? 'drop-shadow(0 0 14px rgba(148,163,184,0.28))'
                  : isFading || showLoserEffects
                    ? 'grayscale(0.72) saturate(0.46) brightness(0.58) drop-shadow(0 3px 6px rgba(0,0,0,0.20))'
                    : 'drop-shadow(0 12px 18px rgba(0,0,0,0.22))',
              transition: showLoserEffects
                ? `filter 520ms cubic-bezier(0.2, 0.9, 0.24, 1) ${LOSER_DIM_DELAY_MS}ms`
                : undefined,
            }}
          >
            {shouldRenderVisibleCard ? (
              <>
                {showWinnerEffects ? (
                  <motion.div
                    className="pointer-events-none absolute left-1/2 top-1/2 h-[148px] w-[104px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                    initial={false}
                    animate={{ opacity: [0.2, 0.52, 0.28] }}
                    transition={{ duration: 1.06, ease: 'easeOut' }}
                    style={{
                      background:
                        'radial-gradient(circle at 50% 45%, rgba(255,230,150,0.38) 0%, rgba(201,168,76,0.16) 48%, transparent 78%)',
                      filter: 'blur(18px)',
                    }}
                  />
                ) : null}

                {showLoserEffects ? (
                  <motion.div
                    className="pointer-events-none absolute -inset-2 rounded-[22px]"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.46, delay: LOSER_DIM_DELAY_MS / 1000 }}
                    style={{
                      background:
                        'radial-gradient(circle at 50% 48%, rgba(127,29,29,0.28) 0%, rgba(69,10,10,0.12) 45%, transparent 76%)',
                      filter: 'blur(10px)',
                    }}
                  />
                ) : null}

                <div
                  className="relative rounded-[18px]"
                  style={{
                    boxShadow: showWinnerEffects
                      ? '0 0 0 2px rgba(255,230,150,0.78), 0 0 28px rgba(201,168,76,0.34), 0 20px 34px rgba(0,0,0,0.28)'
                      : showTieEffects
                        ? '0 0 0 1px rgba(203,213,225,0.24)'
                        : showLoserEffects
                          ? '0 0 0 1px rgba(185,28,28,0.14)'
                          : 'none',
                  }}
                >
                  <CardShape
                    rank={renderedCard.rank}
                    suit={renderedCard.suit}
                    winner={showWinnerEffects}
                    highlight={showTieEffects}
                    outcomeBadge={nativeOutcomeBadge}
                    outcomeBadgeLabel={nativeOutcomeBadgeLabel}
                    outcomeBadgeDelayMs={nativeOutcomeBadge ? SETTLED_OUTCOME_BADGE_DELAY_MS : 0}
                  />
                </div>
              </>
            ) : (
              <div
                className="h-[162px] w-[116px] rounded-[18px] border border-dashed"
                style={{
                  background:
                    'radial-gradient(ellipse at 50% 50%, rgba(255,255,255,0.025) 0%, transparent 72%)',
                  borderColor: 'rgba(255,255,255,0.07)',
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
// PATCH F.1 — CenterActionBar v2.
//
// Brief: the original CenterActionBar used four loosely-related pills:
//   - TRUCO! in cherry-red gradient (#ef4444 → #7f1d1d), pure CTA red
//     that clashed with the felt's wine palette and the overall gold rim.
//   - ACEITAR / CORRER as low-contrast translucent chips that read as
//     skeletons rather than premium decisions.
//   - AUMENTAR in flat orange gradient.
//   - All sharing border-radius:999 (full-pill), giving them a "social
//     media" look instead of a "vintage poker chip" look.
//
// v2 contract — every action button speaks the same "metal chip" language:
//   - Same compound boxShadow recipe: an inset highlight rim + outer drop +
//     a tone-aware aura when active.
//   - Two-stop gradient with a depth fold at 55% so the chip reads as
//     stamped, not flat.
//   - Border-radius 14, not 999. Slightly oblong feels more like a token.
//   - Georgia serif at 12px with 0.18em tracking, mirrors the TrucoDrama
//     headline word.
//   - Inactive state is a deep felt-on-felt chip (no white-grey),
//     preserving the table's color identity.
//   - TRUCO! is wine-vinho (#9a1f1f → #4a0c0c), not cherry red, anchored
//     to the same red the table uses for tier:'red' (#7f1d1d).
//   - ACEITAR is gold-bordered dark with a soft gold inset glow.
//   - AUMENTAR is orange-on-amber, escalating intent.
//   - CORRER is silver-edged dark, the only "neutral" option, distinct
//     from ACEITAR by hue not by opacity.
function CenterActionBar({
  availableActions,
  onAction,
  isBetDramaActive = false,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
  isBetDramaActive?: boolean;
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

  // Shared chip skeleton — every action button carries this; tone overrides
  // background/border/color/shadow on top.
  const chipBase = {
    borderRadius: 14,
    minHeight: 38,
    minWidth: 102,
    padding: '8px 16px',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    fontFamily: 'Georgia, serif',
  };

  // Felt-tone neutral chip used when an action is unavailable.
  // Stays inside the table's palette instead of sliding into a white-grey.
  const neutralStyle = {
    background: 'linear-gradient(180deg, rgba(18,26,22,0.78) 0%, rgba(8,14,12,0.80) 100%)',
    border: '1px solid rgba(255,255,255,0.05)',
    color: 'rgba(232,213,160,0.22)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
    cursor: 'not-allowed' as const,
  };

  return (
    <motion.div
      className="relative z-10 flex items-center justify-center gap-2.5"
      animate={{
        opacity: isBetDramaActive ? 0.84 : 1,
        y: isBetDramaActive ? 4 : 0,
        scale: isBetDramaActive ? 0.985 : 1,
      }}
      transition={{ duration: 0.22 }}
    >
      {/* TRUCO! — the user-initiated bet call. Wine-vinho gradient anchored
          to #7f1d1d, double inset highlight + outer aura. Subtle pulse on
          active so the chip reads as "available pressure". */}
      <motion.button
        type="button"
        onClick={() => canTruco && onAction('request-truco')}
        disabled={!canTruco || hasDecision}
        whileHover={canTruco && !hasDecision ? { y: -2, scale: 1.03 } : {}}
        whileTap={canTruco && !hasDecision ? { scale: 0.97 } : {}}
        animate={
          canTruco && !hasDecision
            ? {
                boxShadow: [
                  '0 0 18px rgba(220,38,38,0.28), inset 0 1px 0 rgba(255,210,210,0.22), inset 0 -2px 0 rgba(0,0,0,0.45), 0 12px 22px rgba(0,0,0,0.40)',
                  '0 0 28px rgba(220,38,38,0.42), inset 0 1px 0 rgba(255,210,210,0.26), inset 0 -2px 0 rgba(0,0,0,0.48), 0 14px 26px rgba(0,0,0,0.44)',
                  '0 0 18px rgba(220,38,38,0.28), inset 0 1px 0 rgba(255,210,210,0.22), inset 0 -2px 0 rgba(0,0,0,0.45), 0 12px 22px rgba(0,0,0,0.40)',
                ],
              }
            : {}
        }
        transition={
          canTruco && !hasDecision
            ? { duration: 1.8, repeat: Infinity, ease: [0.4, 0, 0.6, 1] }
            : { duration: 0.22 }
        }
        className="relative overflow-hidden"
        style={{
          ...chipBase,
          ...(canTruco && !hasDecision
            ? {
                background: 'linear-gradient(180deg, #9a1f1f 0%, #6b1414 55%, #3a0808 100%)',
                border: '1px solid rgba(248,113,113,0.55)',
                color: '#ffe8e0',
                textShadow: '0 1px 0 rgba(0,0,0,0.55), 0 0 14px rgba(248,113,113,0.34)',
                cursor: 'pointer',
              }
            : neutralStyle),
        }}
      >
        Truco!
      </motion.button>

      {/* ACEITAR — gold-bordered dark chip. Felt below, gold rim on top.
          Reads as "this is the safe accept", confident without being loud. */}
      <motion.button
        type="button"
        onClick={() => acceptAction && onAction(acceptAction)}
        disabled={!canAccept}
        whileHover={canAccept ? { y: -2, scale: 1.03 } : {}}
        whileTap={canAccept ? { scale: 0.97 } : {}}
        style={{
          ...chipBase,
          ...(canAccept
            ? {
                background: 'linear-gradient(180deg, #1f2a1d 0%, #0f1810 55%, #060c08 100%)',
                border: '1px solid rgba(230,195,100,0.52)',
                color: '#f0d896',
                textShadow: '0 1px 0 rgba(0,0,0,0.55)',
                boxShadow:
                  '0 0 16px rgba(230,195,100,0.20), inset 0 1px 0 rgba(255,235,170,0.18), inset 0 -2px 0 rgba(0,0,0,0.50), 0 12px 22px rgba(0,0,0,0.40)',
                cursor: 'pointer',
              }
            : neutralStyle),
        }}
      >
        Aceitar
      </motion.button>

      {/* AUMENTAR / CORRER — escalation slot. When raise is available, the
          chip is amber (orange/copper, the table's tier:'orange' family).
          When only decline is available, the chip becomes silver-edged
          dark — the runaway move, neutral hue distinct from gold. */}
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
        whileHover={canRaise || canDecline ? { y: -2, scale: 1.03 } : {}}
        whileTap={canRaise || canDecline ? { scale: 0.97 } : {}}
        style={{
          ...chipBase,
          ...(canRaise
            ? {
                background: 'linear-gradient(180deg, #c97919 0%, #8a4f0e 55%, #4a2a06 100%)',
                border: '1px solid rgba(251,191,36,0.62)',
                color: '#fff0d0',
                textShadow: '0 1px 0 rgba(0,0,0,0.55), 0 0 12px rgba(251,191,36,0.30)',
                boxShadow:
                  '0 0 18px rgba(245,158,11,0.30), inset 0 1px 0 rgba(255,224,170,0.24), inset 0 -2px 0 rgba(0,0,0,0.46), 0 12px 22px rgba(0,0,0,0.40)',
                cursor: 'pointer',
              }
            : canDecline
              ? {
                  background: 'linear-gradient(180deg, #1a2028 0%, #0d1318 55%, #060a0d 100%)',
                  border: '1px solid rgba(148,163,184,0.42)',
                  color: '#cbd5e1',
                  textShadow: '0 1px 0 rgba(0,0,0,0.55)',
                  boxShadow:
                    'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 0 rgba(0,0,0,0.46), 0 12px 22px rgba(0,0,0,0.36)',
                  cursor: 'pointer',
                }
              : neutralStyle),
        }}
      >
        {canRaise ? raiseLabel : canDecline ? 'Correr' : 'Aumentar'}
      </motion.button>
    </motion.div>
  );
}

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
  useEffect(() => {
    const timeout = window.setTimeout(
      onDismiss,
      isMatchFinished ? CLIMAX_AUTO_DISMISS_MS + 1000 : CLIMAX_AUTO_DISMISS_MS,
    );

    return () => window.clearTimeout(timeout);
  }, [isMatchFinished, onDismiss]);

  const heroTier: ValeTier = isMyHand ? valueTier : 'red';
  const visuals = getTierVisuals(heroTier);

  const eyebrow = isMatchFinished ? 'Fim da partida' : 'Resultado da mão';
  const outcomeLabel = isMatchFinished
    ? isMyHand
      ? 'Vitória final'
      : 'Derrota final'
    : isMyHand
      ? 'Mão vencida'
      : 'Mão perdida';
  const heading = isMatchFinished
    ? isMyHand
      ? 'Partida nossa'
      : 'Partida deles'
    : isMyHand
      ? 'Mão nossa'
      : 'Mão deles';
  const subheading = isMatchFinished
    ? isMyHand
      ? 'Você fechou a mesa.'
      : 'Eles fecharam a mesa.'
    : isMyHand
      ? 'Você puxou a queda e marcou no placar.'
      : 'Eles levaram a queda e marcaram no placar.';

  const titleColor = isMyHand ? '#fff1b8' : '#fee2e2';
  const accentBackground = isMyHand
    ? 'linear-gradient(135deg, #fff1b8 0%, #f2d488 38%, #c9a84c 72%, #6f4f14 100%)'
    : 'linear-gradient(135deg, #fecaca 0%, #b45309 34%, #7f1d1d 68%, #260707 100%)';
  const accentColor = isMyHand ? '#160f03' : '#fff7ed';
  const borderColor = isMyHand ? 'rgba(255,223,128,0.46)' : 'rgba(248,113,113,0.38)';
  const ambientGlow = isMyHand ? 'rgba(242,212,136,0.24)' : 'rgba(185,28,28,0.24)';
  const pointsBorderColor = isMyHand ? 'rgba(255,223,128,0.30)' : 'rgba(254,202,202,0.22)';
  const pointsBackground = isMyHand
    ? 'linear-gradient(180deg, rgba(255,241,184,0.10), rgba(201,168,76,0.045))'
    : 'linear-gradient(180deg, rgba(254,202,202,0.085), rgba(127,29,29,0.065))';

  const handleKeyDown = (event: { key: string; preventDefault: () => void }) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onDismiss();
    }
  };

  return (
    <motion.div
      className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24 }}
      onClick={onDismiss}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label="Fechar resultado da mão"
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 38%, rgba(242,212,136,0.10) 0%, transparent 36%), rgba(2,6,12,0.72)',
          backdropFilter: 'blur(8px)',
        }}
      />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute h-[360px] w-[360px] rounded-full"
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: [0.18, 0.44, 0.28], scale: [0.9, 1.08, 1] }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ duration: 0.72, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          background: `radial-gradient(circle, ${ambientGlow} 0%, transparent 68%)`,
          filter: 'blur(10px)',
        }}
      />

      <motion.div
        className="relative w-full max-w-[520px] overflow-hidden rounded-[32px] border px-6 py-6 text-left sm:px-7 sm:py-7"
        initial={{ y: 26, scale: 0.92, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 18, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{
          background:
            'linear-gradient(180deg, rgba(22,24,20,0.98) 0%, rgba(11,12,10,0.98) 54%, rgba(5,6,6,0.98) 100%)',
          borderColor,
          boxShadow: `0 36px 80px rgba(0,0,0,0.58), 0 0 54px ${ambientGlow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,223,128,0.72) 50%, transparent 100%)',
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full"
          style={{
            background: `radial-gradient(circle, ${ambientGlow} 0%, transparent 68%)`,
            filter: 'blur(8px)',
          }}
        />

        <div className="relative z-10" role="status" aria-live="assertive" aria-atomic="true">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.28em]"
              style={{
                background: accentBackground,
                color: accentColor,
                boxShadow:
                  '0 12px 24px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.30)',
              }}
            >
              {eyebrow}
            </div>

            <div
              className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                background: 'rgba(255,255,255,0.035)',
                borderColor: 'rgba(255,255,255,0.10)',
                color: 'rgba(232,213,160,0.72)',
              }}
            >
              {outcomeLabel}
            </div>
          </div>

          <h2
            className="mt-5 text-[36px] font-black leading-[0.95] sm:text-[44px]"
            style={{
              color: titleColor,
              fontFamily: 'Georgia, serif',
              textShadow: isMyHand
                ? '0 0 26px rgba(242,212,136,0.22), 0 3px 14px rgba(0,0,0,0.44)'
                : '0 0 24px rgba(248,113,113,0.20), 0 3px 14px rgba(0,0,0,0.46)',
            }}
          >
            {heading}
          </h2>

          <p
            className="mt-3 max-w-[440px] text-[14px] leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.76)' }}
          >
            {subheading}
          </p>

          <div
            className="mt-6 overflow-hidden rounded-[26px] border"
            style={{
              background: pointsBackground,
              borderColor: pointsBorderColor,
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 34px rgba(0,0,0,0.28)',
            }}
          >
            <div className="flex items-center justify-between gap-5 px-5 py-5">
              <div>
                <div
                  className="text-[10px] font-black uppercase tracking-[0.26em]"
                  style={{ color: 'rgba(232,213,160,0.58)' }}
                >
                  Pontos marcados
                </div>

                <div
                  className="mt-1 text-[54px] font-black leading-none"
                  style={{
                    color: isMyHand ? '#f3e7bf' : '#fecaca',
                    fontFamily: 'Georgia, serif',
                    textShadow: '0 4px 16px rgba(0,0,0,0.38)',
                  }}
                >
                  +{awardedPoints}
                </div>
              </div>

              <div
                className="rounded-[18px] border px-4 py-3 text-right"
                style={{
                  background: 'rgba(0,0,0,0.20)',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div
                  className="text-[9px] font-black uppercase tracking-[0.24em]"
                  style={{ color: 'rgba(232,213,160,0.48)' }}
                >
                  Queda
                </div>
                <div
                  className="mt-1 text-[17px] font-black"
                  style={{ color: visuals.textColor, fontFamily: 'Georgia, serif' }}
                >
                  {isMyHand ? 'Nossa' : 'Deles'}
                </div>
              </div>
            </div>
          </div>

          <div
            className="mt-5 text-center text-[9px] font-black uppercase tracking-[0.22em]"
            style={{ color: 'rgba(255,255,255,0.42)' }}
          >
            Toque para continuar
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function MaoDeOnzeTableTension({
  isOpen,
  isDecisionPending,
}: {
  isOpen: boolean;
  isDecisionPending: boolean;
}) {
  if (!isOpen) {
    return null;
  }


  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[28px]"
    >
      <motion.div
        className="absolute inset-x-[4%] top-[5%] h-[90%] rounded-[38px] border"
        animate={{
          opacity: isDecisionPending ? [0.42, 0.72, 0.42] : [0.24, 0.42, 0.24],
          boxShadow: isDecisionPending
            ? [
                'inset 0 0 34px rgba(251,191,36,0.12), 0 0 24px rgba(180,83,9,0.10)',
                'inset 0 0 56px rgba(251,191,36,0.24), 0 0 42px rgba(180,83,9,0.18)',
                'inset 0 0 34px rgba(251,191,36,0.12), 0 0 24px rgba(180,83,9,0.10)',
              ]
            : [
                'inset 0 0 26px rgba(242,212,136,0.10), 0 0 18px rgba(201,168,76,0.08)',
                'inset 0 0 38px rgba(242,212,136,0.16), 0 0 28px rgba(201,168,76,0.12)',
                'inset 0 0 26px rgba(242,212,136,0.10), 0 0 18px rgba(201,168,76,0.08)',
              ],
        }}
        transition={{ duration: isDecisionPending ? 1.25 : 1.9, repeat: Infinity }}
        style={{
          borderColor: isDecisionPending ? 'rgba(255,223,128,0.24)' : 'rgba(255,223,128,0.16)',
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 select-none"
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{
          opacity: isDecisionPending ? [0.08, 0.15, 0.08] : [0.045, 0.085, 0.045],
          scale: isDecisionPending ? [0.98, 1.06, 0.98] : [0.98, 1.03, 0.98],
        }}
        transition={{ duration: isDecisionPending ? 1.4 : 2.2, repeat: Infinity }}
        style={{
          color: '#f2d488',
          fontFamily: 'Georgia, serif',
          fontSize: '190px',
          fontWeight: 900,
          letterSpacing: '-0.08em',
          lineHeight: 0.8,
          textShadow: '0 0 42px rgba(242,212,136,0.34)',
        }}
      >
        11
      </motion.div>

      {isDecisionPending ? (
        <motion.div
          className="absolute left-1/2 top-[15%] -translate-x-1/2 rounded-full border px-5 py-2"
          initial={{ y: -8, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -6, opacity: 0, scale: 0.96 }}
          style={{
            background:
              'linear-gradient(135deg, rgba(25,20,12,0.72) 0%, rgba(71,36,10,0.42) 52%, rgba(18,12,8,0.74) 100%)',
            borderColor: 'rgba(255,223,128,0.24)',
            boxShadow:
              '0 18px 34px rgba(0,0,0,0.28), 0 0 24px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
            backdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center gap-3">
            <span
              className="h-2 w-2 rounded-full"
              style={{
                background: '#f59e0b',
                boxShadow: '0 0 14px rgba(245,158,11,0.62)',
              }}
            />
            <span
              className="text-[10px] font-black uppercase tracking-[0.28em]"
              style={{
                color: '#f6dfa0',
                fontFamily: 'Georgia, serif',
                textShadow: '0 2px 8px rgba(0,0,0,0.34)',
              }}
            >
              Mão de 11
            </span>
            <span
              className="hidden text-[9px] font-black uppercase tracking-[0.22em] sm:inline"
              style={{ color: 'rgba(255,248,225,0.54)' }}
            >
              Decisão de queda
            </span>
          </div>
        </motion.div>
      ) : null}
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
      initial={{ y: 30, opacity: 0, scale: 0.96 }}
      animate={{ y: 0, opacity: 1, scale: 1 }}
      exit={{ y: 22, opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      className="pointer-events-auto fixed inset-x-4 bottom-[292px] z-[110] mx-auto w-full max-w-xl md:bottom-[314px]"
    >
      <div
        className="relative overflow-hidden rounded-[28px] border px-4 py-4 backdrop-blur-xl md:px-5"
        style={{
          background:
            'linear-gradient(180deg, rgba(31,22,12,0.96) 0%, rgba(13,14,14,0.94) 58%, rgba(8,9,10,0.96) 100%)',
          borderColor: 'rgba(255,223,128,0.42)',
          boxShadow:
            '0 30px 62px rgba(0,0,0,0.46), 0 0 42px rgba(201,168,76,0.18), inset 0 1px 0 rgba(255,255,255,0.07)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-6 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,223,128,0.76) 50%, transparent 100%)',
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(245,158,11,0.22) 0%, transparent 68%)',
            filter: 'blur(8px)',
          }}
        />

        <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div
              className="inline-flex rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.26em]"
              style={{
                background: 'rgba(245,158,11,0.10)',
                borderColor: 'rgba(255,223,128,0.28)',
                color: '#f6dfa0',
              }}
            >
              Queda de 11
            </div>

            <h3
              className="mt-2 text-[25px] font-black leading-none md:text-[28px]"
              style={{
                color: '#fff8e1',
                fontFamily: 'Georgia, serif',
                textShadow: '0 0 24px rgba(242,212,136,0.16), 0 3px 12px rgba(0,0,0,0.42)',
              }}
            >
              Aceita jogar a mão?
            </h3>

            <p
              className="mt-2 max-w-[360px] text-[13px] leading-relaxed"
              style={{ color: 'rgba(255,248,225,0.72)' }}
            >
              Você ainda não pode jogar carta. Primeiro escolha se entra na queda ou se corre
              agora.
            </p>
          </div>

          <div className="flex shrink-0 flex-col gap-2 sm:flex-row md:flex-col">
            <motion.button
              type="button"
              onClick={onPlay}
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="whitespace-nowrap rounded-full px-6 py-3 text-[12px] font-black uppercase tracking-[0.16em]"
              style={{
                background:
                  'linear-gradient(135deg, #fff1b8 0%, #e8c76a 42%, #c9a84c 72%, #7a5418 100%)',
                color: '#1a1104',
                border: '1px solid rgba(255,241,184,0.78)',
                boxShadow:
                  '0 16px 30px rgba(0,0,0,0.30), 0 0 20px rgba(201,168,76,0.22), inset 0 1px 0 rgba(255,255,255,0.34)',
              }}
            >
              Aceitar mão
            </motion.button>

            <motion.button
              type="button"
              onClick={onRun}
              whileHover={{ y: -1, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="whitespace-nowrap rounded-full px-6 py-3 text-[12px] font-black uppercase tracking-[0.16em]"
              style={{
                background:
                  'linear-gradient(180deg, rgba(34,42,58,0.98), rgba(12,18,28,0.98))',
                color: '#d6dde8',
                border: '1px solid rgba(148,163,184,0.28)',
                boxShadow: '0 14px 28px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.06)',
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

function MaoDeOnzeAcceptedBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="pointer-events-none absolute right-5 top-[118px] z-[30] md:right-7 md:top-[124px]"
    >
      <div
        className="overflow-hidden rounded-full border px-4 py-2"
        style={{
          background:
            'linear-gradient(135deg, rgba(242,212,136,0.22) 0%, rgba(127,63,18,0.18) 54%, rgba(20,14,8,0.72) 100%)',
          borderColor: 'rgba(255,223,128,0.38)',
          boxShadow:
            '0 14px 30px rgba(0,0,0,0.30), 0 0 24px rgba(201,168,76,0.14), inset 0 1px 0 rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <motion.span
            className="h-2.5 w-2.5 rounded-full"
            animate={{ opacity: [0.72, 1, 0.72], scale: [1, 1.18, 1] }}
            transition={{ duration: 1.3, repeat: Infinity }}
            style={{
              background: '#e8c76a',
              boxShadow: '0 0 12px rgba(201,168,76,0.52)',
            }}
          />

          <span className="flex flex-col leading-none">
            <span
              className="text-[9px] font-black uppercase tracking-[0.24em]"
              style={{ color: 'rgba(255,248,225,0.54)' }}
            >
              Queda ativa
            </span>
            <span
              className="mt-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                color: '#f2d488',
                fontFamily: 'Georgia, serif',
                textShadow: '0 2px 6px rgba(0,0,0,0.28)',
              }}
            >
              Mão de 11 aceita
            </span>
          </span>
        </div>
      </div>
    </motion.div>
  );
}



function PlayerHandTurnCue({ isOpen, isMaoDeOnze }: { isOpen: boolean; isMaoDeOnze: boolean }) {
  if (!isOpen) {
    return null;
  }

  const title = isMaoDeOnze ? 'Queda ativa' : 'Sua vez';
  const subtitle = 'Jogue uma carta';

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="pointer-events-none absolute -inset-x-4 -top-14 bottom-1 z-20 rounded-[34px]"
    >
      <motion.div
        className="absolute inset-x-[14%] bottom-1 h-[102px] rounded-[999px]"
        animate={{ opacity: [0.12, 0.24, 0.14], scale: [0.98, 1.012, 0.99] }}
        transition={{ duration: 1.45, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: isMaoDeOnze
            ? 'radial-gradient(ellipse at 50% 62%, rgba(245,158,11,0.22) 0%, rgba(127,29,29,0.08) 45%, transparent 76%)'
            : 'radial-gradient(ellipse at 50% 62%, rgba(255,223,128,0.18) 0%, rgba(201,168,76,0.08) 45%, transparent 76%)',
          filter: 'blur(16px)',
        }}
      />

      <motion.div
        className="absolute inset-x-[8%] bottom-0 h-[118px] rounded-[36px] border"
        animate={{
          opacity: [0.11, 0.22, 0.13],
          boxShadow: [
            'inset 0 0 12px rgba(255,223,128,0.045), 0 0 12px rgba(201,168,76,0.045)',
            'inset 0 0 20px rgba(255,223,128,0.09), 0 0 18px rgba(201,168,76,0.075)',
            'inset 0 0 12px rgba(255,223,128,0.045), 0 0 12px rgba(201,168,76,0.045)',
          ],
        }}
        transition={{ duration: 1.45, repeat: Infinity, ease: 'easeInOut' }}
        style={{ borderColor: 'rgba(255,223,128,0.10)' }}
      />

      <motion.div
        className="absolute left-1/2 top-0 z-30 flex -translate-x-1/2 items-center gap-2.5 rounded-full border px-4 py-2"
        animate={{
          boxShadow: [
            '0 12px 24px rgba(0,0,0,0.28), 0 0 12px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
            '0 14px 28px rgba(0,0,0,0.32), 0 0 18px rgba(201,168,76,0.16), inset 0 1px 0 rgba(255,255,255,0.10)',
            '0 12px 24px rgba(0,0,0,0.28), 0 0 12px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
          ],
        }}
        transition={{ duration: 1.55, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background:
            'linear-gradient(135deg, rgba(22,18,10,0.94) 0%, rgba(58,42,16,0.82) 54%, rgba(8,10,10,0.96) 100%)',
          borderColor: 'rgba(255,223,128,0.34)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <motion.span
          className="h-2.5 w-2.5 rounded-full"
          animate={{ opacity: [0.72, 1, 0.72], scale: [1, 1.16, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: isMaoDeOnze ? '#f59e0b' : '#e8c76a',
            boxShadow: isMaoDeOnze
              ? '0 0 12px rgba(245,158,11,0.56)'
              : '0 0 12px rgba(232,199,106,0.46)',
          }}
        />

        <span className="flex flex-col leading-none">
          <span
            className="text-[9px] font-black uppercase tracking-[0.24em]"
            style={{ color: 'rgba(255,248,225,0.58)', fontFamily: 'Georgia, serif' }}
          >
            {title}
          </span>
          <span
            className="mt-1 text-[10px] font-black uppercase tracking-[0.22em]"
            style={{
              color: '#f2d488',
              fontFamily: 'Georgia, serif',
              textShadow: '0 2px 6px rgba(0,0,0,0.28)',
            }}
          >
            {subtitle}
          </span>
        </span>
      </motion.div>
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

  const displayScoreLabel = scoreLabel.replace(/\bT1\b/g, 'Nós').replace(/\bT2\b/g, 'Eles');

  const eyebrow = isVictory ? 'Partida nossa' : 'Mesa fechada por eles';
  const title = isVictory ? 'Você fechou a mesa' : 'Eles fecharam a mesa';
  const subtitle = isVictory
    ? 'Mesa dominada. O placar confirmou a queda e a partida ficou do nosso lado.'
    : 'A queda foi deles desta vez. Respira, lê o jogo e volta para buscar a próxima mesa.';
  const outcomeLabel = isVictory ? 'Vitória confirmada' : 'Derrota confirmada';

  const accentBackground = isVictory
    ? 'linear-gradient(135deg, #fff1b8 0%, #f2d488 38%, #c9a84c 72%, #6f4f14 100%)'
    : 'linear-gradient(135deg, #fecaca 0%, #b45309 34%, #7f1d1d 68%, #260707 100%)';
  const accentColor = isVictory ? '#160f03' : '#fff7ed';
  const titleColor = isVictory ? '#fff1b8' : '#fee2e2';
  const borderColor = isVictory ? 'rgba(255,223,128,0.48)' : 'rgba(248,113,113,0.38)';
  const ambientGlow = isVictory ? 'rgba(242,212,136,0.24)' : 'rgba(185,28,28,0.24)';
  const innerGlow = isVictory ? 'rgba(201,168,76,0.16)' : 'rgba(127,29,29,0.22)';
  const scoreBorderColor = isVictory ? 'rgba(255,223,128,0.26)' : 'rgba(254,202,202,0.18)';
  const scoreBackground = isVictory
    ? 'linear-gradient(180deg, rgba(255,241,184,0.08), rgba(201,168,76,0.035))'
    : 'linear-gradient(180deg, rgba(254,202,202,0.075), rgba(127,29,29,0.06))';
  const buttonBackground = isVictory
    ? accentBackground
    : 'linear-gradient(135deg, rgba(127,29,29,0.96) 0%, rgba(124,45,18,0.94) 48%, rgba(41,12,12,0.98) 100%)';
  const buttonBorderColor = isVictory ? 'rgba(255,223,128,0.52)' : 'rgba(248,113,113,0.42)';
  const buttonColor = isVictory ? accentColor : '#fff7ed';

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
          background:
            'radial-gradient(circle at 50% 30%, rgba(242,212,136,0.10) 0%, transparent 34%), rgba(4,6,10,0.78)',
          backdropFilter: 'blur(12px)',
        }}
      />

      <motion.div
        aria-hidden
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        className="pointer-events-none absolute h-[360px] w-[360px] rounded-full"
        style={{
          background: `radial-gradient(circle, ${ambientGlow} 0%, transparent 68%)`,
          filter: 'blur(10px)',
        }}
      />

      <motion.div
        initial={{ y: 28, scale: 0.94, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 18, scale: 0.98, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 220, damping: 24 }}
        className="relative w-full max-w-[590px] overflow-hidden rounded-[34px] border px-6 py-6 sm:px-7 sm:py-7"
        style={{
          background:
            'linear-gradient(180deg, rgba(22,24,20,0.98) 0%, rgba(11,12,10,0.98) 54%, rgba(5,6,6,0.98) 100%)',
          borderColor,
          boxShadow: `0 36px 80px rgba(0,0,0,0.58), 0 0 54px ${innerGlow}, inset 0 1px 0 rgba(255,255,255,0.07)`,
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,223,128,0.74) 50%, transparent 100%)',
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full"
          style={{
            background: `radial-gradient(circle, ${ambientGlow} 0%, transparent 68%)`,
            filter: 'blur(8px)',
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-24 h-72 w-72 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(255,255,255,0.055) 0%, transparent 64%)',
            filter: 'blur(10px)',
          }}
        />

        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.28em]"
              style={{
                background: accentBackground,
                color: accentColor,
                boxShadow:
                  '0 12px 24px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.30)',
              }}
            >
              Partida encerrada
            </div>

            <div
              className="rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em]"
              style={{
                background: 'rgba(255,255,255,0.035)',
                borderColor: 'rgba(255,255,255,0.10)',
                color: 'rgba(232,213,160,0.72)',
              }}
            >
              {outcomeLabel}
            </div>
          </div>

          <p
            className="mt-5 text-[11px] font-black uppercase tracking-[0.30em]"
            style={{ color: isVictory ? 'rgba(255,241,184,0.72)' : 'rgba(254,202,202,0.72)' }}
          >
            {eyebrow}
          </p>

          <h2
            className="mt-2 text-[36px] font-black leading-[0.95] sm:text-[46px]"
            style={{
              color: titleColor,
              fontFamily: 'Georgia, serif',
              textShadow: isVictory
                ? '0 0 26px rgba(242,212,136,0.22), 0 3px 14px rgba(0,0,0,0.44)'
                : '0 0 24px rgba(248,113,113,0.20), 0 3px 14px rgba(0,0,0,0.46)',
            }}
          >
            {title}
          </h2>

          <p
            className="mt-4 max-w-[520px] text-[15px] leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.78)' }}
          >
            {subtitle}
          </p>

          <div
            className="mt-6 overflow-hidden rounded-[26px] border"
            style={{
              background: scoreBackground,
              borderColor: scoreBorderColor,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 34px rgba(0,0,0,0.28)',
            }}
          >
            <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div
                  className="text-[10px] font-black uppercase tracking-[0.26em]"
                  style={{ color: 'rgba(232,213,160,0.58)' }}
                >
                  Placar final
                </div>

                <div
                  className="mt-2 text-[29px] font-black leading-none sm:text-[33px]"
                  style={{
                    color: '#f3e7bf',
                    fontFamily: 'Georgia, serif',
                    textShadow: '0 2px 10px rgba(0,0,0,0.36)',
                  }}
                >
                  {displayScoreLabel}
                </div>
              </div>

              <div
                className="rounded-[18px] border px-4 py-3 text-left sm:text-right"
                style={{
                  background: 'rgba(0,0,0,0.20)',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <div
                  className="text-[9px] font-black uppercase tracking-[0.24em]"
                  style={{ color: 'rgba(232,213,160,0.48)' }}
                >
                  Queda
                </div>
                <div
                  className="mt-1 text-[15px] font-black"
                  style={{ color: isVictory ? '#f2d488' : '#fecaca', fontFamily: 'Georgia, serif' }}
                >
                  {isVictory ? 'Nossa mesa' : 'Mesa deles'}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <motion.button
              type="button"
              onClick={handleBackToLobby}
              whileHover={{ y: -1, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="min-w-[190px] whitespace-nowrap rounded-full px-6 py-3 text-[12px] font-black uppercase tracking-[0.16em]"
              style={{
                background: buttonBackground,
                color: buttonColor,
                border: `1px solid ${buttonBorderColor}`,
                boxShadow:
                  '0 18px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.18)',
              }}
            >
              Voltar ao lobby
            </motion.button>

            <span
              className="text-[11px] leading-relaxed sm:text-right"
              style={{ color: 'rgba(255,255,255,0.48)' }}
            >
              Volte ao lobby, respire e escolha a próxima mesa.
            </span>
          </div>
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
    latestRoundMyPlayedCard,
    latestRoundOpponentPlayedCard,
    tablePhase,
    opponentSeatView,
    mySeatView,
    displayedOpponentPlayedCard,
    displayedMyPlayedCard,
    opponentRevealKey,
    myRevealKey,
    myCardLaunching,
    roundIntroKey,
    currentPrivateViraRank,
    currentPublicViraRank,
    viraRank,
    availableActions,
    onAction,
    myCards,
    canPlayCard,
    launchingCardKey,
    pendingPlayedCard,
    currentPrivateHand,
    currentPublicHand,
    onPlayCard,
    isMyTurn = false,
    isResolvingRound,
    closingTableCards,
  } = props;

  const publicHandForRounds = currentPublicHand;

  const { play } = useGameSound();
  const { fire } = useConfetti();
  const opponentFlightSourceRef = useRef<HTMLDivElement | null>(null);
  const playerFlightSourceRef = useRef<HTMLDivElement | null>(null);
  const playerCardElementRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const opponentPlayedSlotRef = useRef<HTMLDivElement | null>(null);
  const playerPlayedSlotRef = useRef<HTMLDivElement | null>(null);
  const [settledOwnFlightKey, setSettledOwnFlightKey] = useState(0);
  const [settledOpponentFlightKey, setSettledOpponentFlightKey] = useState(0);
  const [activeOwnFlightKey, setActiveOwnFlightKey] = useState(0);
  const ownFlightSequenceRef = useRef(0);
  const lastLocalFlightCardKeyRef = useRef<string | null>(null);
  const lastSettledOpponentRef = useRef(settledOpponentFlightKey);
  const lastSettledOwnRef = useRef(settledOwnFlightKey);

  useEffect(() => {
    if (settledOpponentFlightKey === lastSettledOpponentRef.current) {
      return;
    }

    lastSettledOpponentRef.current = settledOpponentFlightKey;

    if (settledOpponentFlightKey > 0) {
      play('card-impact', 0.42);
    }
  }, [play, settledOpponentFlightKey]);

  useEffect(() => {
    if (settledOwnFlightKey === lastSettledOwnRef.current) {
      return;
    }

    lastSettledOwnRef.current = settledOwnFlightKey;

    if (settledOwnFlightKey > 0) {
      play('card-impact', 0.32);
    }
  }, [play, settledOwnFlightKey]);

  const handlePlayerCardElementChange = useCallback(
    (cardKey: string, element: HTMLButtonElement | null) => {
      if (element) {
        playerCardElementRefs.current[cardKey] = element;
        return;
      }

      delete playerCardElementRefs.current[cardKey];
    },
    [],
  );

  const playerCardFlightSourceElement = launchingCardKey
    ? (playerCardElementRefs.current[launchingCardKey] ?? playerFlightSourceRef.current)
    : playerFlightSourceRef.current;

  useEffect(() => {
    if (!launchingCardKey) {
      return;
    }

    if (lastLocalFlightCardKeyRef.current === launchingCardKey) {
      return;
    }

    ownFlightSequenceRef.current += 1;
    lastLocalFlightCardKeyRef.current = launchingCardKey;
    setActiveOwnFlightKey(ownFlightSequenceRef.current);
  }, [launchingCardKey]);

  const handleOwnFlightDone = useCallback((flightKey: number) => {
    setSettledOwnFlightKey((current) => Math.max(current, flightKey));
    setActiveOwnFlightKey((current) => (current === flightKey ? 0 : current));
  }, []);

  const handleOpponentFlightDone = useCallback((flightKey: number) => {
    setSettledOpponentFlightKey((current) => Math.max(current, flightKey));
  }, []);

  useEffect(() => {
    setActiveOwnFlightKey(0);
    setSettledOwnFlightKey(0);
    setSettledOpponentFlightKey(0);
    lastLocalFlightCardKeyRef.current = null;
  }, [roundIntroKey]);

  const effectiveViraRank = currentPrivateViraRank ?? currentPublicViraRank ?? viraRank;
  const isAwaitingBet = betState === 'awaiting_response';
  const isMaoDeOnze = props.specialState === 'mao_de_onze';
  const isViewerMaoDeOnzeDecision =
    props.specialDecisionPending &&
    (availableActions.canAcceptMaoDeOnze || availableActions.canDeclineMaoDeOnze);
  const isMaoDeOnzeAcceptedState =
    isMaoDeOnze && !props.specialDecisionPending && tablePhase === 'playing';
  const isMatchFinished = tablePhase === 'match_finished';
  const isHandFinished = tablePhase === 'hand_finished';
  const isMaoDeOnzeTensionOpen = isMaoDeOnze && !isHandFinished && !isMatchFinished;

  const activeValueForTier = isAwaitingBet && pendingValue !== null ? pendingValue : currentValue;
  const activeTier = useMemo<ValeTier>(
    () => resolveValeTier(activeValueForTier),
    [activeValueForTier],
  );
  const tableTensionVisuals = useMemo(
    () =>
      resolveTableTensionVisuals({
        activeValue: activeValueForTier,
        isAwaitingBet,
        isMaoDeOnzeTensionOpen,
        isMaoDeOnzeDecisionPending: props.specialDecisionPending,
        isResolvingRound,
        isPlayerTurn: isMyTurn && canPlayCard,
      }),
    [
      activeValueForTier,
      canPlayCard,
      isAwaitingBet,
      isMaoDeOnzeTensionOpen,
      isMyTurn,
      isResolvingRound,
      props.specialDecisionPending,
    ],
  );
  const viewerPlayerId = mapSeatToPlayerId(mySeatView?.seatId);
  const requesterIsMine = Boolean(viewerPlayerId !== null && props.requestedBy === viewerPlayerId);
  const requestedByLabel = requesterIsMine
    ? 'Você pediu'
    : opponentSeatView?.botIdentity?.displayName
      ? opponentSeatView.botIdentity.displayName + ' pediu'
      : 'Adversário pediu';
  const pendingBetValue = pendingValue ?? currentValue;
  const pendingBetWord = (() => {
    switch (pendingBetValue) {
      case 3:
        return 'TRUCO';
      case 6:
        return 'SEIS';
      case 9:
        return 'NOVE';
      case 12:
        return 'DOZE';
      default:
        return String(pendingBetValue);
    }
  })();
  const shouldShowTrucoDrama =
    isAwaitingBet && pendingBetValue > currentValue && !isHandFinished && !isMatchFinished;
  const trucoDramaHeadline = `${requestedByLabel} ${pendingBetWord}`;
  const trucoDramaDetail = requesterIsMine
    ? 'Aguardando resposta.'
    : `A mão passa a valer ${pendingBetValue}.`;
  const trucoDramaAuraColor = (() => {
    switch (activeTier) {
      case 'orange':
        return requesterIsMine ? 'rgba(251,146,60,0.18)' : 'rgba(251,146,60,0.34)';
      case 'red':
      case 'red-pulse':
        return requesterIsMine ? 'rgba(239,68,68,0.20)' : 'rgba(239,68,68,0.38)';
      case 'gold':
      case 'muted':
      default:
        return requesterIsMine ? 'rgba(255,215,128,0.16)' : 'rgba(255,215,128,0.30)';
    }
  })();

  const parseCard = (cardString: string | null) => {
    if (!cardString || cardString.length < 2) {
      return null;
    }

    return {
      rank: cardString.slice(0, -1),
      suit: cardString.slice(-1),
    };
  };

  const parseCardKey = (cardKey: string | null) => {
    if (!cardKey) {
      return null;
    }

    const [rank, suit] = cardKey.split('|');

    if (!rank || !suit) {
      return null;
    }

    return { rank, suit };
  };

  // PATCH 7.4 — Authoritative-or-event-driven felt guard.
  //
  // The previous render guard only trusted `currentPublicHand.rounds`. That
  // protected against stale cards after a hand transition, but it also created
  // a regression with slower pacing: `card-played` can be accepted by
  // useMatchTableTransition before the visual public hand has committed the
  // same card into rounds[]. During that gap, displayedOpponentPlayedCard was
  // valid, but this guard forced the felt to render as empty, killing the bot
  // flight/slot for one frame or more.
  //
  // Keep the stale-hand protection, but allow cards that came from the event
  // transition layer while the table is actively playing. beginHandTransition
  // clears these hook-owned visual cards, so they cannot leak into a new hand.
  const currentHandHasAnyAuthoritativePlayedCard = (currentPublicHand?.rounds ?? []).some(
    (round) => round.playerOneCard !== null || round.playerTwoCard !== null,
  );
  const hasEventDrivenVisualCard = Boolean(
    tablePhase === 'playing' &&
      (displayedMyPlayedCard !== null ||
        displayedOpponentPlayedCard !== null ||
        closingTableCards.mine !== null ||
        closingTableCards.opponent !== null ||
        pendingPlayedCard !== null),
  );
  const currentHandHasAnyPlayedCard =
    currentHandHasAnyAuthoritativePlayedCard || hasEventDrivenVisualCard;

  // PATCH G — Opponent's remaining cards.
  //
  // Each played round records `playerOneCard` and `playerTwoCard`. Whichever
  // belongs to the opponent (based on viewerPlayerId) increments the
  // opponent's "played" count. Starting hand size is 3, so the visible TP
  // cards in OpponentCluster equal `3 - playedCount`. This is the live,
  // round-accurate count: when card-played arrives for the bot, rounds[]
  // updates with the bot's card non-null, the count drops, and the cluster
  // re-renders one card fewer (with AnimatePresence exit).
  const opponentCardsRemaining = useMemo(() => {
    const rounds = currentPublicHand?.rounds ?? [];
    if (viewerPlayerId === null) {
      // Viewer not yet identified — fall back to "full hand minus finished
      // rounds" using the finished flag so we don't render stale 3 cards
      // on first paint of an in-progress hand.
      const finishedCount = rounds.filter((round) => round.finished).length;
      return Math.max(0, 3 - finishedCount);
    }

    const opponentField: 'playerOneCard' | 'playerTwoCard' =
      viewerPlayerId === 'P1' ? 'playerTwoCard' : 'playerOneCard';
    const opponentPlayedCount = rounds.reduce(
      (acc, round) => (round[opponentField] !== null ? acc + 1 : acc),
      0,
    );
    return Math.max(0, 3 - opponentPlayedCount);
  }, [currentPublicHand, viewerPlayerId]);

  const isRoundResolutionFrame = Boolean(
    currentHandHasAnyPlayedCard &&
    (isResolvingRound ||
      displayedResolvedRoundFinished ||
      closingTableCards.mine !== null ||
      closingTableCards.opponent !== null),
  );

  // NOTE: During a resolved-round frame, both played slots must be rendered
  // from one frozen snapshot. Otherwise one side can be cleared/covered by a
  // flight while the other still has a card, producing the broken visual where
  // only PERDEU appears without the matching WIN.
  // NOTE: The latest-round fallback is only allowed while the hook is actively
  // resolving the current round. After clearDisplayedTable runs, authoritative
  // latestRound data can still describe the previous completed round for a few
  // render frames; using it there repaints stale cards and makes the felt look
  // dirty until the next play.
  const canUseLatestRoundFallback = isResolvingRound;

  const resolvedMyCardString = !currentHandHasAnyPlayedCard
    ? null
    : isRoundResolutionFrame
      ? (closingTableCards.mine ??
        displayedMyPlayedCard ??
        (canUseLatestRoundFallback ? latestRoundMyPlayedCard : null))
      : displayedMyPlayedCard;
  const resolvedOpponentCardString = !currentHandHasAnyPlayedCard
    ? null
    : isRoundResolutionFrame
      ? (closingTableCards.opponent ??
        displayedOpponentPlayedCard ??
        (canUseLatestRoundFallback ? latestRoundOpponentPlayedCard : null))
      : displayedOpponentPlayedCard;

  const myCard = parseCard(resolvedMyCardString);
  const opponentCard = parseCard(resolvedOpponentCardString);
  const activeOwnFlightCardKey = activeOwnFlightKey > 0 ? lastLocalFlightCardKeyRef.current : null;
  const pendingOwnFlightCard =
    activeOwnFlightCardKey !== null
      ? parseCardKey(activeOwnFlightCardKey)
      : pendingPlayedCard?.owner === 'mine'
        ? parseCard(pendingPlayedCard.card)
        : null;
  const pendingOwnFlightRevealKey =
    activeOwnFlightKey > 0
      ? activeOwnFlightKey
      : pendingPlayedCard?.owner === 'mine'
        ? pendingPlayedCard.id
        : 0;
  const ownFlightCardString =
    activeOwnFlightCardKey !== null
      ? activeOwnFlightCardKey.replace('|', '')
      : pendingPlayedCard?.owner === 'mine'
        ? pendingPlayedCard.card
        : null;
  const opponentFlightCardString = opponentCard ? `${opponentCard.rank}${opponentCard.suit}` : null;
  const isOwnFlightStillLanding = Boolean(
    activeOwnFlightKey > 0 &&
    settledOwnFlightKey !== activeOwnFlightKey &&
    ownFlightCardString !== null,
  );
  const isStalePendingOwnFlightAfterSettle = Boolean(
    pendingPlayedCard?.owner === 'mine' &&
    activeOwnFlightKey === 0 &&
    settledOwnFlightKey === ownFlightSequenceRef.current &&
    lastLocalFlightCardKeyRef.current?.replace('|', '') === pendingPlayedCard.card,
  );
  const isPendingOwnFlightStillLanding = Boolean(
    pendingPlayedCard?.owner === 'mine' &&
    ownFlightCardString !== null &&
    !isStalePendingOwnFlightAfterSettle,
  );
  const isOpponentFlightStillLanding = Boolean(
    opponentRevealKey > 0 &&
    settledOpponentFlightKey !== opponentRevealKey &&
    opponentFlightCardString !== null,
  );
  const shouldAllowResolvingOwnFlight = Boolean(
    isRoundResolutionFrame &&
    pendingOwnFlightCard &&
    (isOwnFlightStillLanding || isPendingOwnFlightStillLanding),
  );
  const shouldAllowResolvingOpponentFlight = Boolean(
    isRoundResolutionFrame && opponentCard && isOpponentFlightStillLanding,
  );
  // NOTE: A resolver can arrive in the same socket burst as the final
  // `card-played`. When that final card belongs to the viewer, tablePhase can
  // advance before the local flight has finished. Do not suppress an already
  // admitted resolving flight just because the authoritative phase moved on;
  // otherwise the responder card loses its flight and/or its outcome badge.
  const shouldSuppressOwnFlight = Boolean(
    (tablePhase !== 'playing' || isRoundResolutionFrame) && !shouldAllowResolvingOwnFlight,
  );
  const shouldSuppressOpponentFlight = Boolean(
    (tablePhase !== 'playing' || isRoundResolutionFrame) && !shouldAllowResolvingOpponentFlight,
  );
  const shouldRenderOwnFlight = Boolean(
    !shouldSuppressOwnFlight &&
    pendingOwnFlightCard &&
    (isOwnFlightStillLanding || isPendingOwnFlightStillLanding),
  );
  const shouldRenderOpponentFlight = Boolean(
    !shouldSuppressOpponentFlight && opponentCard && isOpponentFlightStillLanding,
  );

  // NOTE: A card may exist in two visual systems for a few frames: the
  // authoritative table slot and the Framer Motion flight clone. The slot stays
  // mounted for layout/ref stability, but its card content is hidden only while
  // the matching flight is actually landing. When a round resolves while a
  // flight is already active, the clone is allowed to finish its landing before
  // the real slot becomes visible with WIN/PERDEU/EMPATE. This keeps the
  // responder card from being killed by the resolution frame without creating
  // a brand-new flight during resolution.
  const shouldHideMySlotForFlight = Boolean(
    shouldRenderOwnFlight &&
    myCard &&
    ownFlightCardString !== null &&
    ownFlightCardString === resolvedMyCardString,
  );
  const shouldHideOpponentSlotForFlight = Boolean(
    shouldRenderOpponentFlight &&
    opponentCard &&
    opponentFlightCardString !== null &&
    opponentFlightCardString === resolvedOpponentCardString,
  );

  const resolvedRoundFinished = displayedResolvedRoundFinished;
  useEffect(() => {
    // NOTE: Do not clear `activeOwnFlightKey` from a derived render flag. The
    // viewer-as-responder path is especially sensitive because `card-played`
    // and `round-resolved` often arrive back-to-back. The flight owns its own
    // lifecycle through `handleOwnFlightDone`; if it is deliberately suppressed,
    // we only mark it as settled so the real slot can safely reveal the badge.
    if (shouldSuppressOwnFlight && activeOwnFlightKey > 0) {
      setSettledOwnFlightKey((current) => Math.max(current, activeOwnFlightKey));
    }

    if (shouldSuppressOpponentFlight) {
      setSettledOpponentFlightKey((current) => Math.max(current, opponentRevealKey));
    }
  }, [
    activeOwnFlightKey,
    opponentRevealKey,
    shouldSuppressOpponentFlight,
    shouldSuppressOwnFlight,
  ]);

  const resolvedRoundResult = isRoundResolutionFrame ? displayedResolvedRoundResult : null;
  const effectiveNextDecisionType =
    currentPrivateHand?.nextDecisionType ?? currentPublicHand?.nextDecisionType ?? null;
  const isBetResponseDecision = effectiveNextDecisionType === 'respond-bet';
  const isRoundResolutionVisualHoldActive = isRoundResolutionFrame || resolvedRoundFinished;

  // PATCH A — Aggregate "any flight clone still on screen" for defense-in-depth
  // gating of the dock and center action bar inside the shell. Even if the
  // matchPage layer correctly suppresses safeCanPlayCard via
  // isAnyCardLandingInProgress, the shell defends itself in case a future
  // consumer wires the shell directly without the suppression layer.
  const isAnyShellFlightStillLanding =
    isOpponentFlightStillLanding || isOwnFlightStillLanding || isPendingOwnFlightStillLanding;

  const shouldHideActionSurfaceForRoundHold =
    (isRoundResolutionVisualHoldActive || isAnyShellFlightStillLanding) && !isBetResponseDecision;

  // CHANGE (cards persisting across hands — apply hand guard to derived
  // booleans too): when currentHandHasAnyPlayedCard is false, all the
  // hook-state-derived booleans below must read as false. Otherwise stale
  // closingTableCards / displayedMyPlayedCard from a previous hand would
  // incorrectly drive shouldBlockHandDock, isShowingResolvedRoundCards,
  // shouldFade*, and the WIN/TIE badges into a new hand.
  const hasAnyClosingCard =
    currentHandHasAnyPlayedCard &&
    (closingTableCards.mine !== null || closingTableCards.opponent !== null);
  const hasAnyDisplayedCard =
    currentHandHasAnyPlayedCard &&
    (displayedMyPlayedCard !== null || displayedOpponentPlayedCard !== null);

  const isShowingResolvedRoundCards = Boolean(
    isRoundResolutionFrame &&
    resolvedRoundResult !== null &&
    (hasAnyClosingCard || hasAnyDisplayedCard || myCard !== null || opponentCard !== null),
  );
  // Kept for legacy debug snapshots / parity. Not used by per-slot badge gating.
  const isResolutionFlightLanding = Boolean(
    isShowingResolvedRoundCards && (shouldHideMySlotForFlight || shouldHideOpponentSlotForFlight),
  );
  // CHANGE (rodada intermediária — badges WIN/PERDEU/EMPATE não apareciam):
  // Previously canShowResolutionBadges was a single global flag gated by
  // `!isResolutionFlightLanding`. That meant: while ANY flight (own or
  // opponent) was still landing, NEITHER slot could show its badge. In the
  // common bot-closes-the-round case, the opponent flight starts at
  // CARD_REVEAL_DELAY_MS (~420 ms) after card-played and lasts
  // FLIGHT_DURATION_MS (~460 ms). During that ~460 ms window the player's
  // own slot — which is already settled and not covered by any flight —
  // had its WIN ribbon suppressed by the opponent's flight, even though
  // each PlayedSlot already independently suppresses its own badge while
  // its own slot is covered (see PlayedSlot.shouldShowSettledCard).
  //
  // Fix: derive an *eligibility* flag (resolvedRoundIsScored) that is
  // independent of either flight, then derive PER-SLOT outcome flags that
  // each only consider their own flight. The actual badge render gate
  // inside PlayedSlot (shouldShowSettledCard = !isCoveredByFlight) still
  // hides each slot's badge during its own flight cover, so we keep the
  // "no badge on a flying clone" invariant without globally muting both
  // sides while either side is still in motion.
  //
  // canShowResolutionBadges is preserved as a coarse "is the resolution
  // scene active" predicate for the surrounding UI (state label, sound
  // gating, etc.) — it now matches resolvedRoundIsScored to keep semantics
  // simple.
  const resolvedRoundIsScored = Boolean(
    isShowingResolvedRoundCards && myCard !== null && opponentCard !== null,
  );
  const canShowResolutionBadges = resolvedRoundIsScored;
  const canShowMyResolutionBadge = Boolean(resolvedRoundIsScored && !shouldHideMySlotForFlight);
  const canShowOpponentResolutionBadge = Boolean(
    resolvedRoundIsScored && !shouldHideOpponentSlotForFlight,
  );

  const myDomainPlayerId = mapSeatToPlayerId(mySeatView?.seatId);
  const opponentDomainPlayerId = mapSeatToPlayerId(opponentSeatView?.seatId);
  const myResolvedOutcome = resolveSlotRoundOutcome({
    roundResult: resolvedRoundResult,
    playerId: myDomainPlayerId,
    canShow: canShowResolutionBadges,
  });
  const opponentResolvedOutcome = resolveSlotRoundOutcome({
    roundResult: resolvedRoundResult,
    playerId: opponentDomainPlayerId,
    canShow: canShowResolutionBadges,
  });

  const shouldFadeMyCard = Boolean(
    currentHandHasAnyPlayedCard &&
    closingTableCards.mine !== null &&
    resolvedMyCardString === closingTableCards.mine &&
    isResolvingRound &&
    myResolvedOutcome !== 'win',
  );
  const shouldFadeOpponentCard = Boolean(
    currentHandHasAnyPlayedCard &&
    closingTableCards.opponent !== null &&
    resolvedOpponentCardString === closingTableCards.opponent &&
    isResolvingRound &&
    opponentResolvedOutcome !== 'win',
  );

  const myCardWon = myResolvedOutcome === 'win';
  const opponentCardWon = opponentResolvedOutcome === 'win';
  const isTieRound = Boolean(canShowResolutionBadges && resolvedRoundResult === 'TIE');
  const myCardLost = myResolvedOutcome === 'loss';
  const opponentCardLost = opponentResolvedOutcome === 'loss';

  const hasPendingBetDecision =
    isAwaitingBet || availableActions.canAcceptBet || availableActions.canDeclineBet;
  const hasPendingSpecialDecision =
    props.specialDecisionPending ||
    availableActions.canAcceptMaoDeOnze ||
    availableActions.canDeclineMaoDeOnze;

  // Optional raise actions must not freeze the hand. In Truco, raising to 6/9/12 is
  // an alternative action on the player's turn, not a mandatory response gate.
  //
  // CHANGE (P0 — interactivity during resolve): the hand dock must also be
  // non-clickable while a round is resolving on the felt. Otherwise a click
  // can land in the resolution-hold window and either cause a server "not
  // your turn" error or visually overlay the next card on top of the
  // resolving scene.
  //
  // We block while:
  //   - a bet/special decision is pending (existing behavior); OR
  //   - a round is currently resolving (the closing scene is on the felt); OR
  //   - the closing-scene cards are still pinned (defensive: covers the brief
  //     clean-frame window between RESOLUTION_HOLD and the next round); OR
  //   - PATCH A: a flight clone (own or opponent) is still on screen. The
  //     hand must not be clickable while a card is visually landing on the
  //     felt, even if the authoritative server state already declared the
  //     player's turn. This is defense-in-depth alongside matchPage's
  //     shouldSuppressPlayableUi.
  const shouldBlockHandDock =
    hasPendingBetDecision ||
    hasPendingSpecialDecision ||
    isResolvingRound ||
    hasAnyClosingCard ||
    isAnyShellFlightStillLanding;


  // NOTE: This is intentionally stricter than canPlayCard. The server may
  // already be ready for the next player while the table is still landing a
  // flight or holding the resolution frame. The turn cue must only appear
  // when the hand is actually clickable and visually safe.
  const isHandDockBlockedForTurnCue = shouldBlockHandDock || isRoundResolutionVisualHoldActive;
  const canShowPlayerTurnCue = Boolean(
    tablePhase === 'playing' &&
      isMyTurn &&
      canPlayCard &&
      myCards.length > 0 &&
      !isHandDockBlockedForTurnCue &&
      !isViewerMaoDeOnzeDecision &&
      !isAwaitingBet &&
      !shouldShowTrucoDrama,
  );
  const shouldMuteBotPresenceForDrama = shouldShowTrucoDrama;
  const isOpponentBotPressureSource = Boolean(
    opponentSeatView?.isBot && !shouldMuteBotPresenceForDrama && isAwaitingBet && !requesterIsMine,
  );
  const isOpponentBotThinking = Boolean(
    tablePhase === 'playing' &&
      opponentSeatView?.isBot &&
      opponentSeatView.isCurrentTurn &&
      !isHandFinished &&
      !isMatchFinished &&
      !isAwaitingBet &&
      !shouldShowTrucoDrama &&
      !isViewerMaoDeOnzeDecision &&
      !isResolvingRound &&
      !isRoundResolutionVisualHoldActive &&
      !isAnyShellFlightStillLanding,
  );
  const isOpponentBotWinningRound = Boolean(
    opponentSeatView?.isBot && canShowResolutionBadges && opponentResolvedOutcome === 'win',
  );
  const isOpponentBotLosingRound = Boolean(
    opponentSeatView?.isBot && canShowResolutionBadges && opponentResolvedOutcome === 'loss',
  );
  const isOpponentBotHighValuePressure = Boolean(
    opponentSeatView?.isBot && activeValueForTier >= 6 && tablePhase === 'playing',
  );
  const botPresenceTone: BotPresenceTone = isOpponentBotPressureSource
    ? 'pressure'
    : isMaoDeOnzeTensionOpen
      ? 'maoDeOnze'
      : isOpponentBotWinningRound
        ? 'wonRound'
        : isOpponentBotLosingRound
          ? 'lostRound'
          : isOpponentBotThinking
            ? 'thinking'
            : isOpponentBotHighValuePressure
              ? 'pressure'
              : 'idle';
  const botPresenceLine = resolveBotPresenceLine({
    seat: opponentSeatView,
    tone: botPresenceTone,
    currentValue: activeValueForTier,
  });
  const shouldShowBotPresenceQuote =
    isOpponentBotPressureSource ||
    isMaoDeOnzeTensionOpen ||
    isOpponentBotWinningRound ||
    isOpponentBotLosingRound ||
    isOpponentBotThinking;
  const botPresenceQuote = shouldShowBotPresenceQuote
    ? resolveBotPresenceQuote({
        seat: opponentSeatView,
        tone: botPresenceTone,
        currentValue: activeValueForTier,
      })
    : null;
  const [heldBotPresence, setHeldBotPresence] = useState<BotPresenceHold | null>(null);
  const botPresenceHoldTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (shouldMuteBotPresenceForDrama || !botPresenceLine || botPresenceTone === 'idle') {
      return;
    }

    const id = Date.now();
    const duration =
      botPresenceTone === 'wonRound' || botPresenceTone === 'lostRound'
        ? 2300
        : botPresenceTone === 'thinking'
          ? 3200
          : botPresenceTone === 'pressure'
            ? 3000
            : 2800;

    if (botPresenceHoldTimeoutRef.current !== null) {
      window.clearTimeout(botPresenceHoldTimeoutRef.current);
    }

    setHeldBotPresence({
      id,
      line: botPresenceLine,
      quote: botPresenceQuote,
      tone: botPresenceTone,
    });

    botPresenceHoldTimeoutRef.current = window.setTimeout(() => {
      setHeldBotPresence((current) => (current?.id === id ? null : current));
      botPresenceHoldTimeoutRef.current = null;
    }, duration);
  }, [botPresenceLine, botPresenceQuote, botPresenceTone, shouldMuteBotPresenceForDrama]);

  useEffect(() => {
    return () => {
      if (botPresenceHoldTimeoutRef.current !== null) {
        window.clearTimeout(botPresenceHoldTimeoutRef.current);
      }
    };
  }, []);

  const visibleBotPresenceTone = shouldMuteBotPresenceForDrama
    ? 'idle'
    : botPresenceLine
      ? botPresenceTone
      : (heldBotPresence?.tone ?? 'idle');
  const visibleBotPresenceLine = shouldMuteBotPresenceForDrama
    ? null
    : (botPresenceLine ?? heldBotPresence?.line ?? null);
  const visibleBotPresenceQuote = shouldMuteBotPresenceForDrama
    ? null
    : (botPresenceQuote ?? heldBotPresence?.quote ?? null);
  const hasOptionalBetAction =
    availableActions.canRequestTruco ||
    availableActions.canRaiseToSix ||
    availableActions.canRaiseToNine ||
    availableActions.canRaiseToTwelve;
  const shouldHideCenterActionBar =
    shouldHideActionSurfaceForRoundHold ||
    isMaoDeOnzeAcceptedState ||
    (canShowPlayerTurnCue && !hasOptionalBetAction);
  const [climaxDismissed, setClimaxDismissed] = useState(false);
  const lastClimaxPhaseRef = useRef<TablePhase | null>(null);

  useEffect(() => {
    if (tablePhase !== 'hand_finished' && tablePhase !== 'match_finished') {
      setClimaxDismissed(false);
      lastClimaxPhaseRef.current = tablePhase;
    } else if (lastClimaxPhaseRef.current !== tablePhase) {
      setClimaxDismissed(false);
      lastClimaxPhaseRef.current = tablePhase;
    }
  }, [tablePhase]);

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
        return { label: `Pedido de ${ask}`, accent: 'escalate' };
      }
      return { label: 'Truco pedido', accent: 'pressure' };
    }

    if (props.specialDecisionPending) {
      return isViewerMaoDeOnzeDecision
        ? { label: 'Decida a mão de 11', accent: 'escalate' }
        : { label: 'Mão de 11', accent: 'escalate' };
    }

    if (isMaoDeOnzeAcceptedState) {
      return { label: 'Mão de 11 aceita', accent: 'win' };
    }

    if (isAnyShellFlightStillLanding) {
      return { label: 'Aguardando', accent: 'neutral' };
    }

    if (canShowResolutionBadges && resolvedRoundResult) {
      if (resolvedRoundResult === 'P1') {
        return { label: 'Rodada sua', accent: 'win' };
      }
      if (resolvedRoundResult === 'P2') {
        return { label: 'Rodada deles', accent: 'loss' };
      }
      return { label: 'Empate', accent: 'neutral' };
    }

    if (isMyTurn && canPlayCard) {
      return { label: 'Em turno', accent: 'neutral' };
    }

    return { label: 'Aguardando', accent: 'neutral' };
  }, [
    canPlayCard,
    canShowResolutionBadges,
    currentValue,
    isAwaitingBet,
    isHandFinished,
    isMatchFinished,
    isMyTurn,
    isAnyShellFlightStillLanding,
    isShowingResolvedRoundCards,
    pendingValue,
    isMaoDeOnzeAcceptedState,
    isViewerMaoDeOnzeDecision,
    props.specialDecisionPending,
    resolvedRoundResult,
    winner,
  ]);

  const roundsForChips = useMemo(() => {
    const rounds = publicHandForRounds?.rounds ?? [];
    return rounds.map((round) => ({
      result: round.result ?? null,
      finished: Boolean(round.finished),
    }));
  }, [publicHandForRounds]);

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
    debugMatchTableShell('render-decision-snapshot', {
      tablePhase,
      isHandFinished,
      isMatchFinished,
      isResolvingRound,
      shouldSuppressCenterTableCards: false,
      suppressHandOutcomeModal: props.suppressHandOutcomeModal ?? false,
      shouldShowHandClimax: Boolean(climax),
      shouldFlyPlayer: myCardLaunching,
      shouldFlyOpponent: shouldHideOpponentSlotForFlight,
      hasExplicitOpponentFlight: shouldHideOpponentSlotForFlight,
      hasExplicitPlayerFlight: shouldHideMySlotForFlight,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      closingTableCards,
      resolvedMyCardString,
      resolvedOpponentCardString,
      centerCards: {
        mine: myCard ? resolvedMyCardString : null,
        opponent: opponentCard ? resolvedOpponentCardString : null,
      },
      parsedCenterCards: {
        mine: myCard,
        opponent: opponentCard,
      },
      resolvedRoundFinished,
      resolvedRoundResult,
      isShowingResolvedRoundCards,
      isResolutionFlightLanding,
      canShowResolutionBadges,
      canShowMyResolutionBadge,
      canShowOpponentResolutionBadge,
      shouldFadeMyCard,
      shouldFadeOpponentCard,
      myDomainPlayerId,
      opponentDomainPlayerId,
      myCardWon,
      opponentCardWon,
      myCardLost,
      opponentCardLost,
      isTieRound,
      canPlayCard,
      isMyTurn,
      myCardsCount: myCards.length,
      launchingCardKey,
      activeOwnFlightKey,
      pendingOwnFlightRevealKey,
      settledOwnFlightKey,
      settledOpponentFlightKey,
      shouldHideMySlotForFlight,
      shouldHideOpponentSlotForFlight,
      canShowPlayerTurnCue,
    });
  }, [
    canPlayCard,
    climax,
    closingTableCards,
    displayedMyPlayedCard,
    displayedOpponentPlayedCard,
    isHandFinished,
    isMatchFinished,
    isMyTurn,
    isResolvingRound,
    isShowingResolvedRoundCards,
    isResolutionFlightLanding,
    canShowResolutionBadges,
    canShowMyResolutionBadge,
    canShowOpponentResolutionBadge,
    isTieRound,
    launchingCardKey,
    activeOwnFlightKey,
    myCard,
    myCardLaunching,
    myCardWon,
    myDomainPlayerId,
    myCards.length,
    opponentCard,
    opponentCardWon,
    opponentDomainPlayerId,
    pendingOwnFlightRevealKey,
    props.suppressHandOutcomeModal,
    resolvedMyCardString,
    resolvedOpponentCardString,
    resolvedRoundFinished,
    resolvedRoundResult,
    shouldFadeMyCard,
    shouldFadeOpponentCard,
    shouldHideMySlotForFlight,
    shouldHideOpponentSlotForFlight,
    canShowPlayerTurnCue,
    settledOwnFlightKey,
    settledOpponentFlightKey,
    tablePhase,
  ]);

  const lastResolutionSoundKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!canShowResolutionBadges || !resolvedRoundResult) {
      lastResolutionSoundKeyRef.current = null;
      return;
    }

    const soundKey = `${resolvedRoundResult}|${props.roundResolvedKey}|${myRevealKey}|${opponentRevealKey}`;

    if (lastResolutionSoundKeyRef.current === soundKey) {
      return;
    }

    lastResolutionSoundKeyRef.current = soundKey;

    if (resolvedRoundResult === 'P1') {
      play('round-win', 0.65);
      return;
    }

    if (resolvedRoundResult === 'P2') {
      play('round-loss', 0.55);
      return;
    }

    if (resolvedRoundResult === 'TIE') {
      play('round-tie', 0.5);
    }
  }, [
    canShowResolutionBadges,
    myRevealKey,
    opponentRevealKey,
    play,
    props.roundResolvedKey,
    resolvedRoundResult,
  ]);

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
      play(isMatchFinished ? 'game-win' : 'hand-win', isMatchFinished ? 0.85 : 0.7);
      return;
    }

    play(isMatchFinished ? 'game-loss' : 'hand-loss', isMatchFinished ? 0.7 : 0.55);
  }, [climax, fire, isMatchFinished, play, tablePhase]);

  const lastDismissedClimaxKeyRef = useRef<string | null>(null);

  const handleClimaxDismiss = useCallback(() => {
    debugMatchTableShell('handClimax:dismiss-clicked', {
      hasClimax: Boolean(climax),
      tablePhase,
      isHandFinished,
      isMatchFinished,
    });

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
    // CHANGE (issue A — cards still being clipped at the bottom):
    // The root container used `overflow-hidden` so the felt grain/stars wouldn't
    // spill past the rounded corners. But that ALSO clipped the player's hand
    // when a card hover-lifted beyond the container bottom edge. Split that
    // into two layers:
    //   1. A decorative background wrapper (inset absolute) keeps overflow-hidden
    //      and hosts grain, stars, arch outline, ambient pulses.
    //   2. The content wrapper uses overflow-visible so the hand can breathe.
    // The rounded-corner clip-path stays on the background only.
    <div
      className="relative flex min-h-[calc(100vh-220px)] w-full flex-col xl:min-h-[720px]"
      style={{
        borderRadius: 28,
        border: `1px solid ${tableTensionVisuals.shellBorderColor}`,
        boxShadow: tableTensionVisuals.shellBoxShadow,
      }}
    >
      {/* CHANGE: decorative background layer — clipped to the rounded corners,
          hosts all the felt/stars/arch/pulse elements so they don't leak. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          borderRadius: 28,
          background: tableTensionVisuals.feltBackground,
        }}
      >
        {/* Felt grain */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.030'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Starfield */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 18% 22%, rgba(255,244,214,0.12) 50%, transparent 100%), radial-gradient(1px 1px at 76% 18%, rgba(255,244,214,0.08) 50%, transparent 100%), radial-gradient(1px 1px at 14% 74%, rgba(255,255,255,0.06) 50%, transparent 100%), radial-gradient(1px 1px at 84% 72%, rgba(255,244,214,0.10) 50%, transparent 100%), radial-gradient(1px 1px at 44% 86%, rgba(255,255,255,0.05) 50%, transparent 100%), radial-gradient(1px 1px at 56% 14%, rgba(255,244,214,0.08) 50%, transparent 100%)',
            backgroundRepeat: 'no-repeat',
            opacity: 0.28,
          }}
        />

        {/* Top arch outline */}
        <div
          className="absolute inset-x-[3%] top-[2%] h-[36%]"
          style={{
            borderTopLeftRadius: '46%',
            borderTopRightRadius: '46%',
            borderTop: `1px solid ${tableTensionVisuals.archTopColor}`,
            borderLeft: `1px solid ${tableTensionVisuals.archSideColor}`,
            borderRight: `1px solid ${tableTensionVisuals.archSideColor}`,
          }}
        />

        {/* Centre ambient */}
        <div
          className="felt-breathe-anim absolute inset-x-[22%] top-[28%] h-[44%] rounded-full"
          style={{
            background: tableTensionVisuals.centreAmbientBackground,
            filter: 'blur(24px)',
          }}
        />

        {/* Central reactive pulse */}
        <motion.div
          key={`centre-pulse-${tableTensionVisuals.pulseKey}`}
          className="absolute left-1/2 top-[46%] z-[1] h-[220px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          initial={{ opacity: 0.12, scale: 0.94 }}
          animate={{
            opacity: tableTensionVisuals.pulseOpacity,
            scale: tableTensionVisuals.pulseScale,
          }}
          transition={{
            duration: tableTensionVisuals.pulseDuration,
            repeat: Infinity,
          }}
          style={{
            background: tableTensionVisuals.pulseBackground,
            filter: 'blur(24px)',
          }}
        />


        <AnimatePresence>
          {shouldShowTrucoDrama ? (
            <motion.div
              key={`table-pressure-aura-${pendingBetValue}-${requesterIsMine}`}
              className="absolute inset-0 rounded-[28px]"
              initial={{ opacity: 0 }}
              animate={{
                opacity: requesterIsMine ? [0.18, 0.28, 0.18] : [0.32, 0.52, 0.32],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: requesterIsMine ? 1.8 : 1.25, repeat: Infinity }}
              style={{
                boxShadow: `
                  inset 0 0 34px ${trucoDramaAuraColor},
                  inset 0 0 92px rgba(0,0,0,0.28),
                  0 0 28px ${trucoDramaAuraColor}
                `,
              }}
            />
          ) : null}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isMaoDeOnzeTensionOpen ? (
          <MaoDeOnzeTableTension
            isOpen={isMaoDeOnzeTensionOpen}
            isDecisionPending={props.specialDecisionPending}
          />
        ) : null}
      </AnimatePresence>

      {/* Content layer — overflow-visible so the player's hand can breathe
          past the pixel-perfect container bottom during hover-lift. */}
      <div className="relative z-[2] flex min-h-0 flex-1 flex-col px-4 pb-5 pt-3">
        <div className="flex flex-1 items-stretch gap-3">
          <LeftContextColumn
            currentValue={currentValue}
            valeTier={activeTier}
            stateLabel={stateInfo.label}
            stateAccent={stateInfo.accent}
          />

          <div className="flex min-w-0 flex-1 flex-col items-center justify-between gap-3 py-1">
            {opponentSeatView ? (
              <div ref={opponentFlightSourceRef}>
                <OpponentCluster
                  seat={opponentSeatView}
                  cardsRemaining={opponentCardsRemaining}
                  isOpponent
                  presenceLine={visibleBotPresenceLine}
                  presenceQuote={visibleBotPresenceQuote}
                  presenceTone={visibleBotPresenceTone}
                  suppressNeutralProfile={shouldMuteBotPresenceForDrama}
                />
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-8">
              <ViraCard rank={effectiveViraRank} suit="C" />

              <div className="relative grid w-[456px] grid-cols-[188px_80px_188px] items-center justify-items-center rounded-[34px] px-2 py-1">
                <AnimatePresence>
                  {shouldHideActionSurfaceForRoundHold &&
                  myResolvedOutcome !== null &&
                  myCard !== null &&
                  opponentCard !== null ? (
                    <RoundClashVerdict
                      outcome={myResolvedOutcome}
                      myCard={myCard}
                      opponentCard={opponentCard}
                    />
                  ) : null}
                </AnimatePresence>

                <RoundClashEffects
                  outcome={myResolvedOutcome}
                  clashKey={`${props.roundResolvedKey}-${myRevealKey}-${opponentRevealKey}`}
                  isOpen={
                    canShowResolutionBadges &&
                    myCard !== null &&
                    opponentCard !== null &&
                    myResolvedOutcome !== null
                  }
                />

                <motion.div
                  ref={opponentPlayedSlotRef}
                  className="relative z-20 col-start-1"
                  animate={
                    canShowResolutionBadges && opponentResolvedOutcome === 'win'
                      ? buildKickAnimation('left')
                      : canShowResolutionBadges && opponentResolvedOutcome === 'loss'
                        ? buildLoserKick('left')
                        : { x: 0, y: 0, rotate: 0, scale: 1 }
                  }
                  transition={{
                    duration: 1.08,
                    times: [0, 0.34, 0.72, 1],
                    ease: [0.2, 0.9, 0.24, 1],
                  }}
                >
                  <PlayedSlot
                    card={opponentCard}
                    revealKey={opponentRevealKey}
                    isWinner={opponentResolvedOutcome === 'win'}
                    isFading={shouldFadeOpponentCard}
                    rotation={-6}
                    isLaunching={shouldHideOpponentSlotForFlight}
                    isCoveredByFlight={shouldHideOpponentSlotForFlight}
                    winnerBadgeLabel="VENCEU"
                    loserBadgeLabel="PERDEU"
                    isTieHighlight={opponentResolvedOutcome === 'tie'}
                    isLoser={opponentResolvedOutcome === 'loss'}
                    showOutcomeBadge
                  />
                </motion.div>

                <div className="relative z-10 col-start-2 flex h-[190px] w-[80px] items-center justify-center" />

                <motion.div
                  ref={playerPlayedSlotRef}
                  className="relative z-20 col-start-3"
                  animate={
                    canShowResolutionBadges && myResolvedOutcome === 'win'
                      ? buildKickAnimation('right')
                      : canShowResolutionBadges && myResolvedOutcome === 'loss'
                        ? buildLoserKick('right')
                        : { x: 0, y: 0, rotate: 0, scale: 1 }
                  }
                  transition={{
                    duration: 1.08,
                    times: [0, 0.34, 0.72, 1],
                    ease: [0.2, 0.9, 0.24, 1],
                  }}
                >
                  <PlayedSlot
                    card={myCard}
                    revealKey={myRevealKey}
                    isWinner={myResolvedOutcome === 'win'}
                    isFading={shouldFadeMyCard}
                    rotation={6}
                    isLaunching={myCardLaunching}
                    isCoveredByFlight={shouldHideMySlotForFlight}
                    winnerBadgeLabel="VENCEU"
                    loserBadgeLabel="PERDEU"
                    isTieHighlight={myResolvedOutcome === 'tie'}
                    isLoser={myResolvedOutcome === 'loss'}
                    showOutcomeBadge
                  />
                </motion.div>
              </div>
            </div>

            <div className="mt-0 min-h-[88px] w-full max-w-[380px]">
              {shouldHideCenterActionBar ? (
                <div aria-hidden className="min-h-[88px]" />
              ) : (
                <CenterActionBar
                  availableActions={availableActions}
                  onAction={onAction}
                  isBetDramaActive={shouldShowTrucoDrama}
                />
              )}
            </div>
          </div>

          <RightScoreColumn scoreT1={scoreT1} scoreT2={scoreT2} rounds={roundsForChips} />
        </div>

        {/* Player hand — shrink-0 so it doesn't squeeze, with a bit more
            vertical air. */}
        <div ref={playerFlightSourceRef} className="relative mt-3 shrink-0 pb-2">
          <AnimatePresence>
            {canShowPlayerTurnCue ? (
              <PlayerHandTurnCue
                isOpen={canShowPlayerTurnCue}
                isMaoDeOnze={isMaoDeOnzeTensionOpen}
              />
            ) : null}
          </AnimatePresence>

          <div className="relative z-10">
            <MatchPlayerHandDock
              myCards={myCards}
              canPlayCard={
                shouldBlockHandDock || isRoundResolutionVisualHoldActive ? false : canPlayCard
              }
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
              onCardElementChange={handlePlayerCardElementChange}
            />
          </div>
        </div>
      </div>

      <PlayerCardFlight
        revealKey={pendingOwnFlightRevealKey}
        card={shouldRenderOwnFlight ? pendingOwnFlightCard : null}
        suppressed={shouldSuppressOwnFlight || !shouldRenderOwnFlight}
        sourceTargetRef={playerFlightSourceRef}
        sourceTargetElement={playerCardFlightSourceElement}
        landTargetRef={playerPlayedSlotRef}
        outcomeBadge={
          canShowResolutionBadges && shouldHideMySlotForFlight ? myResolvedOutcome : null
        }
        outcomeBadgeLabel={
          // PATCH B — Localised to PT to match the loser/tie labels and the
          // rest of the product copy.
          myResolvedOutcome === 'loss' ? 'PERDEU' : myResolvedOutcome === 'win' ? 'VENCEU' : null
        }
        onFlightDone={handleOwnFlightDone}
      />

      <OpponentCardFlight
        revealKey={opponentRevealKey}
        card={shouldRenderOpponentFlight ? opponentCard : null}
        suppressed={shouldSuppressOpponentFlight || !shouldRenderOpponentFlight}
        sourceTargetRef={opponentFlightSourceRef}
        landTargetRef={opponentPlayedSlotRef}
        outcomeBadge={
          canShowResolutionBadges && shouldHideOpponentSlotForFlight
            ? opponentResolvedOutcome
            : null
        }
        outcomeBadgeLabel={
          // PATCH B — Localised to PT to match the loser/tie labels.
          opponentResolvedOutcome === 'loss'
            ? 'PERDEU'
            : opponentResolvedOutcome === 'win'
              ? 'VENCEU'
              : null
        }
        onFlightDone={handleOpponentFlightDone}
      />

      <TrucoDramaOverlay
        isOpen={shouldShowTrucoDrama}
        pendingValue={pendingBetValue}
        requesterIsMine={requesterIsMine}
        tier={activeTier}
        headline={trucoDramaHeadline}
        detail={trucoDramaDetail}
      />

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
        {isMaoDeOnzeAcceptedState ? <MaoDeOnzeAcceptedBadge /> : null}
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
