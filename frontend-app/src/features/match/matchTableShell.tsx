import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { MatchActionSurface } from './matchActionSurface';
import type { MatchAction } from './matchActionTypes';
import { MatchPlayerHandDock } from './matchPlayerHandDock';
import {
  playCardLandingSound,
  playCardLaunchSound,
  playRoundVerdictSound,
} from './matchSoundDirector';
import { OpponentCardFlight } from './opponentCardFlight';
import { PlayerCardFlight } from './playerCardFlight';
import { RoundVerdictPlaque } from './roundVerdictPlaque';
import { TrucoDramaOverlay } from './trucoDramaOverlay';
import { buildKickAnimation, buildLoserKick } from './roundClashEffects';
import {
  PremiumOutcomeSeal,
  PremiumWinnerRays,
  PremiumWinnerSheen,
  PremiumLoserBurn,
} from './premiumOutcomeChrome';
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
  displayName: string | null;
  publicName: string | null;
  publicSlug: string | null;
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
  isViraRevealActive?: boolean;
  viraRevealKey?: string;
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
  P: '♣',
  O: '♦',
  C: '♥',
  E: '♠',
};

// The climax overlay dismisses itself even while backend state remains hand_finished.
const CLIMAX_AUTO_DISMISS_MS = 4400;
// Badge timing follows the visual impact instead of the first authoritative snapshot.
const SETTLED_OUTCOME_BADGE_DELAY_MS = 900;
const LOSER_DIM_DELAY_MS = 260;
const MAO_DE_FERRO_OPENING_MS = 2600;

function debugMatchTableShell(event: string, details: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info('[MATCH_TABLE_SHELL]', event, details);
}

function parseSuitColor(suit: string): boolean {
  return suit === 'C' || suit === 'O';
}

function normalizePlayerId(value: string | null | undefined): 'P1' | 'P2' | null {
  if (value === 'P1' || value === 'P2') {
    return value;
  }

  return null;
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

function parseScoreValue(scoreLabel: string, teamId: 'T1' | 'T2'): number | null {
  const match = scoreLabel.match(new RegExp(`${teamId}\\s+(\\d+)`));

  if (!match) {
    return null;
  }

  const rawValue = match[1];

  if (!rawValue) {
    return null;
  }

  return Number(rawValue);
}

function formatViewerScoreLabel(scoreLabel: string, viewerPlayerId: 'P1' | 'P2' | null): string {
  const scoreT1 = parseScoreValue(scoreLabel, 'T1');
  const scoreT2 = parseScoreValue(scoreLabel, 'T2');

  if (scoreT1 === null || scoreT2 === null) {
    return scoreLabel.replace(/\bT1\b/g, 'Nós').replace(/\bT2\b/g, 'Eles');
  }

  if (viewerPlayerId === 'P2') {
    return `Nós ${scoreT2} × Eles ${scoreT1}`;
  }

  return `Nós ${scoreT1} × Eles ${scoreT2}`;
}

function isViewerPlayer(
  playerId: string | null | undefined,
  viewerPlayerId: 'P1' | 'P2' | null,
): boolean {
  return viewerPlayerId !== null && playerId === viewerPlayerId;
}

function didViewerWin(
  winner: string | null | undefined,
  viewerPlayerId: 'P1' | 'P2' | null,
): boolean {
  if (viewerPlayerId === null) {
    // Preserve the single-player assumption until the private viewer perspective hydrates.
    return winner === 'P1';
  }

  return winner === viewerPlayerId;
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
  isMaoDeFerroTensionOpen,
  isMaoDeOnzeDecisionPending,
  isResolvingRound,
  isPlayerTurn,
}: {
  activeValue: number;
  isAwaitingBet: boolean;
  isMaoDeOnzeTensionOpen: boolean;
  isMaoDeFerroTensionOpen: boolean;
  isMaoDeOnzeDecisionPending: boolean;
  isResolvingRound: boolean;
  isPlayerTurn: boolean;
}): TableTensionVisuals {
  const buildShellShadow = (outerGlow: string, insetGlow: string) =>
    `0 0 0 1px rgba(0,0,0,0.50), 0 32px 82px rgba(0,0,0,0.64), ${outerGlow}, inset 0 0 220px rgba(0,0,0,0.48), ${insetGlow}, inset 0 1px 0 rgba(255,255,255,0.04)`;

  const pulseTuple = (first: number, second: number, third: number): [number, number, number] => [
    first,
    second,
    third,
  ];

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
        pulseScale:
          activeValue >= 9 ? pulseTuple(0.96, 1.055, 0.98) : pulseTuple(0.98, 1.025, 0.98),
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

  if (isMaoDeFerroTensionOpen) {
    return withMomentPulse({
      shellBorderColor: 'rgba(255,241,184,0.46)',
      shellBoxShadow: buildShellShadow(
        '0 0 68px rgba(255,223,128,0.24), 0 0 120px rgba(127,29,29,0.18)',
        'inset 0 0 110px rgba(255,223,128,0.16), inset 0 0 180px rgba(127,29,29,0.12)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(255,223,128,0.30) 0%, rgba(180,83,9,0.18) 22%, rgba(127,29,29,0.14) 42%, transparent 62%), radial-gradient(ellipse at 50% 52%, #30210f 0%, #18150d 30%, #0c100b 60%, #030506 100%)',
      archTopColor: 'rgba(255,241,184,0.42)',
      archSideColor: 'rgba(255,223,128,0.22)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(255,223,128,0.34) 0%, rgba(180,83,9,0.16) 38%, rgba(127,29,29,0.10) 58%, transparent 76%)',
      pulseKey: 'mao-de-ferro',
      pulseOpacity: [0.34, 0.72, 0.34],
      pulseScale: [0.92, 1.12, 0.96],
      pulseDuration: 1.05,
      pulseBackground:
        'radial-gradient(circle, rgba(255,241,184,0.42) 0%, rgba(255,223,128,0.24) 32%, rgba(127,29,29,0.12) 58%, transparent 78%)',
    });
  }

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
      shellBorderColor: 'rgba(254,226,226,0.42)',
      shellBoxShadow: buildShellShadow(
        '0 0 72px rgba(248,113,113,0.28), 0 0 118px rgba(127,29,29,0.18)',
        'inset 0 0 86px rgba(248,113,113,0.22), inset 0 0 160px rgba(127,29,29,0.16)',
      ),
      feltBackground:
        'radial-gradient(ellipse 130% 92% at 50% -6%, rgba(254,202,202,0.30) 0%, rgba(220,38,38,0.18) 24%, rgba(127,29,29,0.16) 46%, transparent 66%), radial-gradient(ellipse at 50% 52%, #2d1715 0%, #171310 30%, #0b0e0c 60%, #030506 100%)',
      archTopColor: 'rgba(254,226,226,0.42)',
      archSideColor: 'rgba(248,113,113,0.22)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(254,202,202,0.26) 0%, rgba(248,113,113,0.16) 32%, rgba(127,29,29,0.10) 56%, transparent 76%)',
      pulseKey: 'vale-12',
      pulseOpacity: [0.24, 0.54, 0.28],
      pulseScale: [0.94, 1.095, 0.97],
      pulseDuration: 1.08,
      pulseBackground:
        'radial-gradient(circle, rgba(254,226,226,0.34) 0%, rgba(248,113,113,0.20) 34%, rgba(127,29,29,0.14) 58%, transparent 78%)',
    });
  }

  if (activeValue >= 9) {
    return withMomentPulse({
      shellBorderColor: 'rgba(248,113,113,0.30)',
      shellBoxShadow: buildShellShadow(
        '0 0 54px rgba(220,38,38,0.18), 0 0 82px rgba(127,29,29,0.10)',
        'inset 0 0 70px rgba(220,38,38,0.16), inset 0 0 120px rgba(127,29,29,0.10)',
      ),
      feltBackground:
        'radial-gradient(ellipse 125% 92% at 50% -6%, rgba(248,113,113,0.22) 0%, rgba(220,38,38,0.14) 24%, rgba(127,29,29,0.10) 44%, transparent 64%), radial-gradient(ellipse at 50% 55%, #241914 0%, #121611 34%, #0a100d 62%, #040708 100%)',
      archTopColor: 'rgba(248,113,113,0.28)',
      archSideColor: 'rgba(220,38,38,0.13)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(248,113,113,0.18) 0%, rgba(220,38,38,0.10) 36%, rgba(127,29,29,0.06) 58%, transparent 74%)',
      pulseKey: 'vale-9',
      pulseOpacity: [0.18, 0.36, 0.2],
      pulseScale: [0.96, 1.06, 0.98],
      pulseDuration: 1.32,
      pulseBackground:
        'radial-gradient(circle, rgba(248,113,113,0.26) 0%, rgba(220,38,38,0.14) 40%, rgba(127,29,29,0.10) 62%, transparent 78%)',
    });
  }

  if (activeValue >= 6) {
    return withMomentPulse({
      shellBorderColor: 'rgba(251,191,36,0.30)',
      shellBoxShadow: buildShellShadow(
        '0 0 46px rgba(245,158,11,0.18), 0 0 76px rgba(146,64,14,0.08)',
        'inset 0 0 62px rgba(245,158,11,0.14), inset 0 0 96px rgba(146,64,14,0.08)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(251,191,36,0.24) 0%, rgba(245,158,11,0.13) 22%, rgba(146,64,14,0.08) 44%, transparent 62%), radial-gradient(ellipse at 50% 55%, #1d2415 0%, #111913 34%, #0a110e 62%, #040708 100%)',
      archTopColor: 'rgba(251,191,36,0.28)',
      archSideColor: 'rgba(245,158,11,0.12)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(251,191,36,0.16) 0%, rgba(245,158,11,0.08) 38%, rgba(146,64,14,0.04) 58%, transparent 72%)',
      pulseKey: 'vale-6',
      pulseOpacity: [0.14, 0.28, 0.16],
      pulseScale: [0.97, 1.042, 0.98],
      pulseDuration: 1.55,
      pulseBackground:
        'radial-gradient(circle, rgba(251,191,36,0.22) 0%, rgba(245,158,11,0.10) 42%, rgba(146,64,14,0.06) 64%, transparent 76%)',
    });
  }

  if (activeValue >= 3) {
    return withMomentPulse({
      shellBorderColor: 'rgba(255,223,128,0.24)',
      shellBoxShadow: buildShellShadow(
        '0 0 34px rgba(201,168,76,0.12), 0 0 60px rgba(74,222,128,0.06)',
        'inset 0 0 52px rgba(201,168,76,0.08), inset 0 0 90px rgba(45,106,79,0.06)',
      ),
      feltBackground:
        'radial-gradient(ellipse 120% 92% at 50% -6%, rgba(255,223,128,0.18) 0%, rgba(201,168,76,0.12) 20%, rgba(46,92,53,0.10) 42%, transparent 62%), radial-gradient(ellipse at 50% 55%, #142719 0%, #0d1a16 34%, #08110f 62%, #04090a 100%)',
      archTopColor: 'rgba(255,223,128,0.22)',
      archSideColor: 'rgba(201,168,76,0.10)',
      centreAmbientBackground:
        'radial-gradient(circle, rgba(255,223,128,0.12) 0%, rgba(201,168,76,0.07) 36%, rgba(36,78,44,0.045) 58%, transparent 72%)',
      pulseKey: 'vale-3',
      pulseOpacity: [0.12, 0.22, 0.13],
      pulseScale: [0.98, 1.028, 0.99],
      pulseDuration: 1.78,
      pulseBackground:
        'radial-gradient(circle, rgba(255,223,128,0.16) 0%, rgba(201,168,76,0.08) 42%, rgba(36,78,44,0.05) 64%, transparent 76%)',
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
  // Outcome chrome stays inside the card so badges and winner effects share one visual system.
  const isWinnerOutcome = outcomeBadge === 'win';
  const isLoserOutcome = outcomeBadge === 'loss';
  const isTieOutcome = outcomeBadge === 'tie';

  if (faceDown) {
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
        compact ? 'h-[100px] w-[72px]' : 'h-[112px] w-[80px] sm:h-[162px] sm:w-[116px]'
      }`}
      style={{
        background: 'linear-gradient(180deg, #fefdf8 0%, #f8f5ec 50%, #f5f0e4 100%)',
        borderColor:
          winner || isWinnerOutcome
            ? 'rgba(255,223,128,0.96)'
            : isLoserOutcome
              ? 'rgba(192,57,43,0.55)'
              : isTieOutcome
                ? 'rgba(226,232,240,0.85)'
                : 'rgba(0,0,0,0.14)',
        boxShadow:
          winner || isWinnerOutcome
            ? '0 0 0 3px rgba(255,223,128,0.78), 0 0 0 5px rgba(212,177,94,0.34), 0 0 64px 8px rgba(255,210,120,0.55), 0 30px 56px rgba(0,0,0,0.62)'
            : isLoserOutcome
              ? '0 0 0 1px rgba(192,57,43,0.45), 0 0 22px rgba(122,26,24,0.32), 0 6px 14px rgba(0,0,0,0.50)'
              : isTieOutcome
                ? '0 0 0 2px rgba(203,213,225,0.62), 0 0 38px 4px rgba(203,213,225,0.28), 0 18px 36px rgba(0,0,0,0.50)'
                : highlight
                  ? '0 0 16px rgba(201,168,76,0.14), 0 20px 36px rgba(0,0,0,0.32)'
                  : '0 6px 14px rgba(0,0,0,0.30), 0 18px 34px rgba(0,0,0,0.36)',
      }}
    >
      {isWinnerOutcome ? <PremiumWinnerSheen borderRadius={18} /> : null}

      {isLoserOutcome ? <PremiumLoserBurn borderRadius={18} delayMs={LOSER_DIM_DELAY_MS} /> : null}

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
          className={`${compact ? 'text-[18px]' : 'text-[20px] sm:text-[28px]'} font-black`}
          style={{ color: isRed ? '#b91c1c' : '#0f172a' }}
        >
          {rank}
        </span>
        <span
          className={`${compact ? 'text-[14px]' : 'text-[15px] sm:text-[20px]'} font-black leading-none`}
          style={{ color: isRed ? '#ef4444' : '#111827' }}
        >
          {symbol}
        </span>
      </div>

      <div
        className={`absolute inset-0 flex items-center justify-center ${
          compact ? 'text-[26px]' : 'text-[34px] sm:text-[48px]'
        } font-black`}
        style={{ color: isRed ? '#ef4444' : '#111827', opacity: 0.92 }}
      >
        {symbol}
      </div>

      <div className="absolute bottom-2 right-2.5 rotate-180 leading-none">
        <span
          className={`${compact ? 'text-[14px]' : 'text-[15px] sm:text-[20px]'} font-black`}
          style={{ color: isRed ? '#ef4444' : '#111827' }}
        >
          {symbol}
        </span>
      </div>

      {outcomeBadge ? (
        <PremiumOutcomeSeal
          outcome={outcomeBadge}
          delayMs={outcomeBadgeDelayMs}
          label={outcomeBadgeLabel}
          compact={compact}
        />
      ) : null}
    </motion.div>
  );
}

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

function resolvePlayerDisplayName(seat: TableSeatView): string {
  if (seat.isMine) {
    return 'Você';
  }

  if (seat.isBot) {
    return seat.botIdentity?.displayName ?? 'Bot';
  }

  return seat.publicName ?? seat.displayName ?? seat.seatId;
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
        quoteBackground: 'linear-gradient(180deg, rgba(32,25,14,0.94), rgba(10,14,12,0.90))',
      };
    case 'pressure':
      return {
        background: 'linear-gradient(180deg, rgba(69,18,18,0.94), rgba(20,13,11,0.90))',
        border: '1px solid rgba(248,113,113,0.38)',
        dot: '#f59e0b',
        dotGlow: '0 0 16px rgba(245,158,11,0.68)',
        text: '#fed7aa',
        quoteBorder: 'rgba(248,113,113,0.32)',
        quoteBackground: 'linear-gradient(180deg, rgba(73,22,18,0.94), rgba(14,10,9,0.92))',
      };
    case 'maoDeOnze':
      return {
        background: 'linear-gradient(180deg, rgba(73,43,12,0.94), rgba(18,14,9,0.90))',
        border: '1px solid rgba(255,223,128,0.36)',
        dot: '#e8c76a',
        dotGlow: '0 0 14px rgba(232,199,106,0.58)',
        text: '#f2d488',
        quoteBorder: 'rgba(255,223,128,0.28)',
        quoteBackground: 'linear-gradient(180deg, rgba(68,43,14,0.94), rgba(14,11,8,0.92))',
      };
    case 'wonRound':
      return {
        background: 'linear-gradient(180deg, rgba(75,46,15,0.96), rgba(18,16,10,0.90))',
        border: '1px solid rgba(255,223,128,0.42)',
        dot: '#f2d488',
        dotGlow: '0 0 16px rgba(242,212,136,0.64)',
        text: '#fff1b8',
        quoteBorder: 'rgba(255,223,128,0.30)',
        quoteBackground: 'linear-gradient(180deg, rgba(52,37,14,0.94), rgba(10,12,10,0.92))',
      };
    case 'lostRound':
      return {
        background: 'linear-gradient(180deg, rgba(33,43,38,0.94), rgba(10,16,15,0.90))',
        border: '1px solid rgba(148,163,184,0.26)',
        dot: '#94a3b8',
        dotGlow: '0 0 12px rgba(148,163,184,0.34)',
        text: '#cbd5e1',
        quoteBorder: 'rgba(148,163,184,0.22)',
        quoteBackground: 'linear-gradient(180deg, rgba(23,31,31,0.94), rgba(8,12,12,0.92))',
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

function OneVsOneHiddenCardBack({
  index,
  isOpponent,
  isCurrentTurn,
}: {
  index: number;
  isOpponent: boolean;
  isCurrentTurn: boolean;
}) {
  const rotationByIndex = [-13, 0, 13];
  const yByIndex = [4, -10, 4];
  const rotation = rotationByIndex[index] ?? 0;
  const y = yByIndex[index] ?? 0;

  const tone = isOpponent
    ? {
        glow: 'rgba(220,38,38,0.24)',
        edge: 'rgba(252,165,165,0.34)',
        wash: 'rgba(220,38,38,0.10)',
      }
    : {
        glow: 'rgba(34,197,94,0.22)',
        edge: 'rgba(134,239,172,0.34)',
        wash: 'rgba(34,197,94,0.10)',
      };

  return (
    <motion.div
      layout="position"
      className="relative h-[113px] w-[78px] shrink-0 overflow-hidden rounded-[18px] border"
      initial={{ opacity: 0, y: y - 16, rotate: rotation - 5, scale: 0.9 }}
      animate={{ opacity: 1, y, rotate: rotation, scale: 1 }}
      exit={{ opacity: 0, y: -28, rotate: rotation + 12, scale: 0.78 }}
      transition={{ duration: 0.3, ease: [0.2, 0.9, 0.24, 1] }}
      style={{
        marginLeft: index === 0 ? 0 : -38,
        zIndex: index + 1,
        transformOrigin: '50% 96%',
        background:
          'radial-gradient(circle at 50% 10%, rgba(255,244,214,0.16), transparent 28%), repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 5px), linear-gradient(180deg, #152c20 0%, #08120f 58%, #020403 100%)',
        borderColor: isCurrentTurn ? 'rgba(255,241,184,0.82)' : 'rgba(232,199,106,0.38)',
        boxShadow: isCurrentTurn
          ? `0 0 26px rgba(242,212,136,0.38), 0 18px 28px rgba(0,0,0,0.56), inset 0 0 0 1px ${tone.edge}`
          : `0 18px 28px rgba(0,0,0,0.54), 0 0 17px ${tone.glow}, inset 0 0 0 1px ${tone.edge}`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-[9px] rounded-[12px]"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(232,199,106,0.20), transparent 56%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.18))',
          border: '1px solid rgba(255,244,214,0.10)',
          boxShadow: 'inset 0 0 15px rgba(0,0,0,0.56)',
        }}
      />

      <div
        className="absolute left-1/2 top-1/2 flex h-[50px] w-[50px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[16px] font-black"
        style={{
          color: '#fff1b8',
          fontFamily: 'Georgia, serif',
          background:
            'radial-gradient(circle at 36% 24%, rgba(255,241,184,0.40), transparent 34%), linear-gradient(180deg, rgba(19,27,20,0.98), rgba(3,6,5,0.98))',
          border: '1px solid rgba(232,199,106,0.52)',
          boxShadow:
            '0 0 15px rgba(201,168,76,0.24), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -6px 12px rgba(0,0,0,0.44)',
          textShadow: '0 1px 2px rgba(0,0,0,0.78)',
        }}
      >
        TP
      </div>

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-4"
        style={{
          background: `linear-gradient(180deg, transparent, ${tone.wash})`,
        }}
      />
    </motion.div>
  );
}

function OneVsOneHiddenDeck({
  cardsRemaining,
  isOpponent,
  isCurrentTurn,
}: {
  cardsRemaining: number;
  isOpponent: boolean;
  isCurrentTurn: boolean;
}) {
  const safeCount = Math.max(0, Math.min(3, cardsRemaining));
  const cardIndices = Array.from({ length: safeCount }, (_, index) => index);

  return (
    <div
      className="relative flex min-h-[126px] items-center justify-center px-2"
      style={{ perspective: 520 }}
    >
      <AnimatePresence initial={false}>
        {cardIndices.map((index) => (
          <OneVsOneHiddenCardBack
            key={`one-vs-one-hidden-card-${index}`}
            index={index}
            isOpponent={isOpponent}
            isCurrentTurn={isCurrentTurn}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// Hidden opponent cards shrink from authoritative played-card counts while the flight
// clone owns the throw animation.
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
  const safeCount = Math.max(0, Math.min(3, cardsRemaining));

  const isCurrentTurn = seat.isCurrentTurn;
  const displayName = resolvePlayerDisplayName(seat);
  const profileLabel =
    seat.isBot && seat.botIdentity ? resolveProfileLabel(seat.botIdentity.profile) : null;
  const presenceVisuals = getBotPresenceVisuals(presenceTone);
  const shouldShowPresenceLine = presenceLine !== null;
  const shouldShowPresenceQuote = presenceQuote !== null;
  const shouldPulsePresence = presenceTone !== 'idle';
  const isSpokenTaunt = shouldShowPresenceQuote;
  const presencePlaqueBackground = isSpokenTaunt
    ? presenceVisuals.quoteBackground
    : presenceVisuals.background;
  const presencePlaqueBorder = isSpokenTaunt ? presenceVisuals.quoteBorder : presenceVisuals.border;
  const presencePlaqueShadow = isSpokenTaunt
    ? '0 16px 28px rgba(0,0,0,0.34), 0 0 18px rgba(201,168,76,0.14), inset 0 1px 0 rgba(255,255,255,0.06)'
    : '0 8px 18px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.04)';

  // NOTE: Dynamic speech can still replace the profile label, but the current
  // 1v1 layout passes null while we keep the table compact.
  const statusLabel = shouldShowPresenceLine
    ? presenceLine
    : suppressNeutralProfile
      ? null
      : profileLabel;

  const plateRoleLabel = isOpponent
    ? seat.isBot
      ? 'Rival bot'
      : 'Rival humano'
    : seat.isBot
      ? 'Parceiro bot'
      : 'Parceiro humano';

  const oneVsOnePlateSuitIdentities = [
    {
      symbol: '♣',
      label: 'Zap',
      background:
        'radial-gradient(circle at 34% 24%, rgba(255,241,184,0.62) 0%, rgba(42,57,38,0.98) 38%, rgba(6,13,9,0.99) 100%)',
      border: 'rgba(232,199,106,0.58)',
      color: '#fff1b8',
      glow: 'rgba(201,168,76,0.26)',
      halo: 'rgba(201,168,76,0.12)',
      rail: 'rgba(232,199,106,0.50)',
    },
    {
      symbol: '♥',
      label: 'Copas',
      background:
        'radial-gradient(circle at 34% 24%, rgba(255,241,184,0.58) 0%, rgba(127,29,29,0.98) 42%, rgba(20,6,7,0.99) 100%)',
      border: 'rgba(248,113,113,0.62)',
      color: '#fff1b8',
      glow: 'rgba(248,113,113,0.28)',
      halo: 'rgba(220,38,38,0.16)',
      rail: 'rgba(248,113,113,0.52)',
    },
    {
      symbol: '♦',
      label: 'Ouro',
      background:
        'radial-gradient(circle at 34% 24%, rgba(255,241,184,0.60) 0%, rgba(180,83,9,0.96) 38%, rgba(69,10,10,0.99) 100%)',
      border: 'rgba(251,191,36,0.62)',
      color: '#fff1b8',
      glow: 'rgba(245,158,11,0.28)',
      halo: 'rgba(245,158,11,0.14)',
      rail: 'rgba(251,191,36,0.54)',
    },
    {
      symbol: '♠',
      label: 'Espadilha',
      background:
        'radial-gradient(circle at 34% 24%, rgba(255,241,184,0.70) 0%, rgba(51,65,85,0.98) 34%, rgba(6,9,12,0.99) 100%)',
      border: 'rgba(255,241,184,0.68)',
      color: '#fff1b8',
      glow: 'rgba(242,212,136,0.30)',
      halo: 'rgba(148,163,184,0.14)',
      rail: 'rgba(255,241,184,0.60)',
    },
  ] as const;

  const suitIdentitySeed = `${seat.botIdentity?.avatarKey ?? 'bot'}:${seat.seatId}:${displayName}`;
  const plateSuitIdentityIndex =
    Array.from(suitIdentitySeed).reduce((total, character) => {
      return total + character.charCodeAt(0);
    }, 0) % oneVsOnePlateSuitIdentities.length;

  const plateSuitIdentity = oneVsOnePlateSuitIdentities[plateSuitIdentityIndex]!;

  const plateVisuals = isOpponent
    ? {
        railBg:
          'radial-gradient(circle at 18% 0%, rgba(252,165,165,0.14), transparent 36%), linear-gradient(180deg, rgba(56,14,18,0.98), rgba(18,7,9,0.95))',
        railBorder: isCurrentTurn ? 'rgba(255,241,184,0.86)' : 'rgba(248,113,113,0.28)',
        name: '#fff5ee',
        subtitle: 'rgba(252,165,165,0.64)',
        shadow: 'rgba(127,29,29,0.22)',
      }
    : {
        railBg:
          'radial-gradient(circle at 18% 0%, rgba(134,239,172,0.14), transparent 36%), linear-gradient(180deg, rgba(14,38,26,0.98), rgba(6,14,11,0.94))',
        railBorder: isCurrentTurn ? 'rgba(255,241,184,0.86)' : 'rgba(134,239,172,0.26)',
        name: '#f4fff7',
        subtitle: 'rgba(187,247,208,0.64)',
        shadow: 'rgba(34,197,94,0.18)',
      };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <motion.div
        animate={
          shouldPulsePresence
            ? { scale: [1, 1.018, 1], y: [0, -1, 0] }
            : isCurrentTurn
              ? { scale: [1, 1.012, 1] }
              : {}
        }
        transition={{
          duration: shouldPulsePresence ? 1.35 : 2.2,
          repeat: shouldPulsePresence || isCurrentTurn ? Infinity : 0,
        }}
        className="relative flex w-[252px] flex-col items-center"
        style={{
          filter: isCurrentTurn
            ? 'drop-shadow(0 0 22px rgba(242,212,136,0.40)) drop-shadow(0 13px 18px rgba(0,0,0,0.36))'
            : 'drop-shadow(0 13px 18px rgba(0,0,0,0.42))',
        }}
      >
        {isCurrentTurn ? (
          <motion.div
            aria-hidden
            className="absolute -inset-x-6 -inset-y-3 rounded-[32px]"
            animate={{ opacity: [0.34, 0.58, 0.38], scale: [0.98, 1.018, 1] }}
            transition={{ duration: 1.55, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background:
                'radial-gradient(ellipse at 50% 36%, rgba(255,241,184,0.22), rgba(201,168,76,0.08) 44%, transparent 76%)',
              filter: 'blur(5px)',
            }}
          />
        ) : null}

        <div
          className="relative z-20 flex h-[46px] w-full items-center rounded-full border px-[7px] pr-[34px] backdrop-blur-md"
          style={{
            background: plateVisuals.railBg,
            borderColor: plateVisuals.railBorder,
            boxShadow: isCurrentTurn
              ? '0 0 0 1px rgba(255,241,184,0.20), 0 0 24px rgba(201,168,76,0.34), 0 12px 20px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.12)'
              : `0 11px 18px rgba(0,0,0,0.44), 0 0 14px ${plateVisuals.shadow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-x-8 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,244,214,0.62), transparent)',
            }}
          />

          <div
            aria-hidden
            className="absolute inset-x-7 bottom-0 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${plateSuitIdentity.rail}, transparent)`,
              opacity: 0.5,
            }}
          />

          <div
            aria-hidden
            className="absolute -left-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full"
            style={{
              background: `radial-gradient(circle, ${plateSuitIdentity.halo} 0%, transparent 72%)`,
              filter: 'blur(7px)',
            }}
          />

          <motion.div
            className="relative z-20 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full"
            animate={
              isCurrentTurn ? { scale: [1, 1.06, 1], rotate: [-3, 3, 0] } : { scale: 1, rotate: 0 }
            }
            transition={{
              duration: 1.35,
              repeat: isCurrentTurn ? Infinity : 0,
              ease: 'easeInOut',
            }}
            style={{
              background: plateSuitIdentity.background,
              border: `1px solid ${plateSuitIdentity.border}`,
              boxShadow: isCurrentTurn
                ? `0 0 20px ${plateSuitIdentity.glow}, 0 0 16px rgba(255,241,184,0.28), inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -7px 14px rgba(0,0,0,0.46)`
                : `0 0 16px ${plateSuitIdentity.glow}, inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -7px 14px rgba(0,0,0,0.44)`,
            }}
          >
            <div
              aria-hidden
              className="absolute inset-[5px] rounded-full"
              style={{
                border: '1px solid rgba(255,241,184,0.24)',
                boxShadow: 'inset 0 0 12px rgba(0,0,0,0.42)',
              }}
            />

            <span
              className="relative text-[22px] font-black leading-none"
              style={{
                color: plateSuitIdentity.color,
                fontFamily: 'Georgia, serif',
                textShadow: '0 2px 6px rgba(0,0,0,0.58)',
              }}
            >
              {plateSuitIdentity.symbol}
            </span>
          </motion.div>

          <div className="relative min-w-0 flex-1 px-3">
            <div
              aria-hidden
              className="absolute bottom-1.5 left-2 right-2 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${plateSuitIdentity.rail}, transparent)`,
                opacity: 0.28,
              }}
            />

            <div
              className="truncate text-[13px] font-black uppercase leading-none tracking-[0.04em]"
              style={{
                color: plateVisuals.name,
                fontFamily: 'Georgia, serif',
                textShadow: isCurrentTurn
                  ? '0 0 12px rgba(255,241,184,0.28), 0 2px 6px rgba(0,0,0,0.54)'
                  : '0 2px 6px rgba(0,0,0,0.46)',
              }}
            >
              {displayName}
            </div>

            <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
              <span
                className="truncate text-[6.5px] font-black uppercase tracking-[0.17em]"
                style={{ color: plateVisuals.subtitle }}
              >
                {plateRoleLabel}
              </span>

              <span
                aria-hidden
                className="h-1 w-1 shrink-0 rounded-full"
                style={{
                  background: plateSuitIdentity.border,
                  opacity: 0.82,
                  boxShadow: `0 0 7px ${plateSuitIdentity.glow}`,
                }}
              />

              <span
                className="truncate text-[6.5px] font-black uppercase tracking-[0.16em]"
                style={{
                  color: plateSuitIdentity.color,
                  fontFamily: 'Georgia, serif',
                  opacity: 0.78,
                  textShadow: `0 0 8px ${plateSuitIdentity.glow}`,
                }}
              >
                {plateSuitIdentity.label}
              </span>
            </div>
          </div>

          <div
            aria-hidden
            className="absolute right-[9px] top-1/2 z-20 flex h-[28px] w-[20px] -translate-y-1/2 items-center justify-center rounded-full"
            style={{
              background: isCurrentTurn
                ? 'linear-gradient(180deg, rgba(255,241,184,0.26), rgba(201,168,76,0.10))'
                : 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.10))',
              border: isCurrentTurn
                ? '1px solid rgba(255,244,214,0.34)'
                : '1px solid rgba(255,255,255,0.10)',
              boxShadow: isCurrentTurn
                ? '0 0 14px rgba(201,168,76,0.30), inset 0 1px 0 rgba(255,255,255,0.12)'
                : 'inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <motion.span
              className="h-2.5 w-2.5 rounded-full"
              animate={isCurrentTurn ? { opacity: [0.72, 1, 0.72], scale: [1, 1.14, 1] } : {}}
              transition={{
                duration: 1.2,
                repeat: isCurrentTurn ? Infinity : 0,
                ease: 'easeInOut',
              }}
              style={{
                background: isCurrentTurn
                  ? 'radial-gradient(circle at 35% 28%, rgba(255,255,255,0.95), #f2d488 38%, #8a6a28 100%)'
                  : seat.isBot
                    ? presenceVisuals.dot
                    : 'rgba(148,163,184,0.42)',
                boxShadow: isCurrentTurn
                  ? '0 0 10px rgba(242,212,136,0.58), 0 0 18px rgba(201,168,76,0.32)'
                  : seat.isBot
                    ? presenceVisuals.dotGlow
                    : 'none',
              }}
            />
          </div>
        </div>
      </motion.div>

      <AnimatePresence mode="popLayout">
        {statusLabel || shouldShowPresenceQuote ? (
          <motion.div
            key={
              String(presenceTone) +
              '-' +
              String(statusLabel ?? 'profile') +
              '-' +
              String(presenceQuote ?? 'no-quote')
            }
            initial={{ opacity: 0, y: 5, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-none relative z-30 -mt-0.5 max-w-[238px]"
          >
            <div
              className={`relative overflow-visible rounded-[15px] border text-center backdrop-blur-md ${
                shouldShowPresenceQuote ? 'px-3.5 py-2' : 'px-3 py-1.5'
              }`}
              style={{
                background: presencePlaqueBackground,
                borderColor: presencePlaqueBorder,
                boxShadow: presencePlaqueShadow,
              }}
            >
              <span
                aria-hidden
                className="absolute bottom-[-5px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 border-b border-r"
                style={{
                  background: presencePlaqueBackground,
                  borderColor: presencePlaqueBorder,
                }}
              />

              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-5 top-0 h-px"
                style={{
                  background:
                    'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.52) 50%, transparent 100%)',
                }}
              />

              <span
                aria-hidden
                className="pointer-events-none absolute -right-7 -top-8 h-16 w-16 rounded-full"
                style={{
                  background:
                    'radial-gradient(circle, rgba(255,241,184,0.12) 0%, transparent 68%)',
                  filter: 'blur(5px)',
                }}
              />

              {statusLabel ? (
                <div className="flex items-center justify-center gap-1.5">
                  <motion.span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    animate={
                      shouldPulsePresence
                        ? { opacity: [0.62, 1, 0.62], scale: [1, 1.18, 1] }
                        : {}
                    }
                    transition={{
                      duration: 1.05,
                      repeat: shouldPulsePresence ? Infinity : 0,
                      ease: 'easeInOut',
                    }}
                    style={{
                      background: presenceVisuals.dot,
                      boxShadow: presenceVisuals.dotGlow,
                    }}
                  />

                  <div
                    className="truncate text-[8px] font-black uppercase leading-none tracking-[0.22em]"
                    style={{
                      color: shouldShowPresenceLine
                        ? presenceVisuals.text
                        : 'rgba(232,213,160,0.52)',
                      fontFamily: 'Georgia, serif',
                    }}
                  >
                    {statusLabel}
                  </div>
                </div>
              ) : null}

              {shouldShowPresenceQuote ? (
                <div
                  className={`${statusLabel ? 'mt-1.5' : ''} text-[9.5px] font-black uppercase leading-tight tracking-[0.13em]`}
                  style={{
                    color: presenceVisuals.text,
                    fontFamily: 'Georgia, serif',
                    textShadow: '0 2px 6px rgba(0,0,0,0.44)',
                  }}
                >
                  “{presenceQuote}”
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <OneVsOneHiddenDeck
        cardsRemaining={safeCount}
        isOpponent={isOpponent}
        isCurrentTurn={isCurrentTurn}
      />

      <div
        aria-hidden
        className="pointer-events-none h-3 w-36 rounded-full"
        style={{
          background: 'radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.44) 0%, transparent 72%)',
          filter: 'blur(7px)',
        }}
      />
    </div>
  );
}

// Vira uses a separate visual treatment because it defines the manilha for the hand.
function ViraCard({
  rank,
  suit,
  revealKey,
  revealActive = false,
}: {
  rank: string;
  suit: string;
  revealKey?: string;
  revealActive?: boolean;
}) {
  return (
    <motion.div
      key={revealKey ?? `${rank}-${suit}`}
      className="relative flex flex-col items-center gap-1.5"
      initial={
        revealActive
          ? {
              opacity: 0,
              y: -20,
              rotateY: -88,
              scale: 0.82,
              filter: 'brightness(1.45) saturate(1.22)',
            }
          : false
      }
      animate={{
        opacity: 1,
        y: 0,
        rotateY: 0,
        scale: 1,
        filter: 'brightness(1) saturate(1)',
      }}
      transition={{ duration: revealActive ? 0.72 : 0.22, ease: [0.2, 0.9, 0.24, 1] }}
      style={{ transformPerspective: 900, transformStyle: 'preserve-3d' }}
    >
      {revealActive ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-7 rounded-[30px]"
          initial={{ opacity: 0, scale: 0.74 }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.74, 1.12, 1.22] }}
          transition={{ duration: 0.9, delay: 0.36, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            background:
              'radial-gradient(circle, rgba(255,241,184,0.36) 0%, rgba(232,199,106,0.18) 38%, transparent 72%)',
            filter: 'blur(6px)',
          }}
        />
      ) : null}

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
        <div
          className="pointer-events-none absolute -inset-[6px] rounded-[24px]"
          style={{
            border: revealActive
              ? '1px solid rgba(255,241,184,0.66)'
              : '1px solid rgba(230,195,100,0.42)',
            boxShadow: revealActive
              ? '0 0 0 1px rgba(255,223,128,0.18), 0 0 34px rgba(232,199,106,0.32)'
              : '0 0 0 1px rgba(255,223,128,0.10), 0 0 24px rgba(201,168,76,0.22)',
          }}
        />

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

      <motion.span
        className="text-[8px] font-bold uppercase tracking-[0.28em]"
        animate={revealActive ? { opacity: [0.55, 1, 0.7] } : { opacity: 1 }}
        transition={{ duration: 0.68, delay: revealActive ? 0.42 : 0 }}
        style={{
          color: 'rgba(232,213,160,0.48)',
          fontFamily: 'Georgia, serif',
        }}
      >
        Manilha definida
      </motion.span>
    </motion.div>
  );
}

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
    <div className="hidden w-[108px] shrink-0 flex-col gap-3 self-center lg:flex">
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
    <div className="hidden w-[124px] shrink-0 flex-col items-end gap-3 self-center lg:flex">
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
  const tone = isViewerWin ? 'ours' : isViewerLoss ? 'theirs' : 'tie';
  const title = isViewerWin
    ? 'Nós vencemos a vaza'
    : isViewerLoss
      ? 'Eles venceram a vaza'
      : 'Vaza empatada';
  const detail = isViewerWin
    ? `${myCardLabel} bateu ${opponentCardLabel}`
    : isViewerLoss
      ? `${opponentCardLabel} bateu ${myCardLabel}`
      : `${myCardLabel} e ${opponentCardLabel} se equivaleram`;

  return (
    <RoundVerdictPlaque
      tone={tone}
      title={title}
      detail={detail}
      style={{
        left: -386,
        bottom: -212,
        width: 292,
      }}
    />
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
  const winnerRayTone = rotation < 0 ? 'rival' : 'gold';
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
    <div className="relative flex min-w-[116px] flex-col items-center sm:min-w-[188px]">
      <div className="relative flex h-[126px] w-[112px] items-center justify-center sm:h-[190px] sm:w-[164px]">
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

        {showWinnerEffects ? <PremiumWinnerRays size={320} tone={winnerRayTone} /> : null}

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
                    opacity: shouldShowSettledCard ? (isFading || isLoser ? 0.68 : 1) : 0,
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
                    ? 'grayscale(0.58) saturate(0.62) brightness(0.68) drop-shadow(0 3px 6px rgba(0,0,0,0.22))'
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
                className="h-[112px] w-[80px] rounded-[18px] border border-dashed sm:h-[162px] sm:w-[116px]"
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
// Bet actions share one chip language so request, accept, raise and run feel related.
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
  // Some 1v1 snapshots expose accept before decline; Truco still allows running on a bet response.
  const canDeclineBetResponse = availableActions.canDeclineBet || availableActions.canAcceptBet;
  const canDecline = canDeclineBetResponse || availableActions.canDeclineMaoDeOnze;
  const canRaise =
    availableActions.canRaiseToSix ||
    availableActions.canRaiseToNine ||
    availableActions.canRaiseToTwelve;
  const canTruco = availableActions.canRequestTruco;

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
  const declineAction: MatchAction | null = canDeclineBetResponse
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

  const chipBase = {
    alignItems: 'center',
    borderRadius: 18,
    display: 'inline-flex',
    justifyContent: 'center',
    lineHeight: 1,
    minHeight: 46,
    minWidth: 112,
    padding: '10px 20px',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    fontFamily: 'Georgia, serif',
  };

  const trucoStyle = {
    minHeight: 46,
    minWidth: 112,
    padding: '10px 20px',
    fontSize: 12,
    background: 'linear-gradient(180deg, #b64135 0%, #8b211d 42%, #56100f 72%, #250505 100%)',
    border: '1px solid rgba(255,223,128,0.76)',
    color: '#fff1d6',
    textShadow: '0 1px 0 rgba(0,0,0,0.70), 0 0 12px rgba(255,223,128,0.22)',
    boxShadow:
      '0 0 0 1px rgba(255,241,184,0.18), 0 0 16px rgba(248,113,113,0.28), 0 0 20px rgba(201,168,76,0.18), inset 0 1px 0 rgba(255,241,184,0.34), inset 0 -3px 0 rgba(0,0,0,0.46), 0 13px 24px rgba(0,0,0,0.42)',
    cursor: 'pointer' as const,
  };

  const acceptStyle = {
    background: 'linear-gradient(180deg, #1f2a1d 0%, #0f1810 55%, #060c08 100%)',
    border: '1px solid rgba(230,195,100,0.52)',
    color: '#f0d896',
    textShadow: '0 1px 0 rgba(0,0,0,0.55)',
    boxShadow:
      '0 0 16px rgba(230,195,100,0.20), inset 0 1px 0 rgba(255,235,170,0.18), inset 0 -2px 0 rgba(0,0,0,0.50), 0 12px 22px rgba(0,0,0,0.40)',
    cursor: 'pointer' as const,
  };

  const declineStyle = {
    background: 'linear-gradient(180deg, #1a2028 0%, #0d1318 55%, #060a0d 100%)',
    border: '1px solid rgba(148,163,184,0.42)',
    color: '#cbd5e1',
    textShadow: '0 1px 0 rgba(0,0,0,0.55)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.06), inset 0 -2px 0 rgba(0,0,0,0.46), 0 12px 22px rgba(0,0,0,0.36)',
    cursor: 'pointer' as const,
  };

  const raiseStyle = {
    background: 'linear-gradient(180deg, #c97919 0%, #8a4f0e 55%, #4a2a06 100%)',
    border: '1px solid rgba(251,191,36,0.62)',
    color: '#fff0d0',
    textShadow: '0 1px 0 rgba(0,0,0,0.55), 0 0 12px rgba(251,191,36,0.30)',
    boxShadow:
      '0 0 18px rgba(245,158,11,0.30), inset 0 1px 0 rgba(255,224,170,0.24), inset 0 -2px 0 rgba(0,0,0,0.46), 0 12px 22px rgba(0,0,0,0.40)',
    cursor: 'pointer' as const,
  };

  const decisionMode = canAccept || canDecline;
  const chips: Array<{
    key: string;
    label: string;
    action: MatchAction;
    style: Record<string, unknown>;
    pulse?: boolean;
  }> = [];

  if (decisionMode) {
    if (canAccept && acceptAction !== null) {
      chips.push({
        key: 'accept',
        label: availableActions.canAcceptMaoDeOnze ? 'Aceitar Mão 11' : 'Aceitar',
        action: acceptAction,
        style: acceptStyle,
      });
    }

    if (canDecline && declineAction !== null) {
      chips.push({
        key: 'decline',
        label:
          availableActions.canDeclineMaoDeOnze && !canDeclineBetResponse
            ? 'Recusar Mão 11'
            : 'Fugir',
        action: declineAction,
        style: declineStyle,
      });
    }

    if (canRaise && raiseAction !== null) {
      chips.push({
        key: 'raise',
        label: raiseLabel,
        action: raiseAction,
        style: raiseStyle,
      });
    }
  } else if (canRaise && raiseAction !== null) {
    chips.push({
      key: 'raise',
      label: raiseLabel,
      action: raiseAction,
      style: raiseStyle,
    });
  } else if (canTruco) {
    chips.push({
      key: 'truco',
      label: 'Truco!',
      action: 'request-truco',
      style: trucoStyle,
      pulse: true,
    });
  }

  if (chips.length === 0) {
    return <div aria-hidden className="min-h-[38px]" />;
  }

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
      {chips.map((chip) => (
        <motion.button
          key={chip.key}
          type="button"
          onClick={() => onAction(chip.action)}
          whileHover={{ y: -2, scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          animate={
            chip.pulse
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
            chip.pulse
              ? { duration: 1.8, repeat: Infinity, ease: [0.4, 0, 0.6, 1] }
              : { duration: 0.22 }
          }
          className="relative overflow-hidden"
          style={{
            ...chipBase,
            ...chip.style,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-4 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.58) 50%, transparent 100%)',
            }}
          />

          <span
            aria-hidden
            className="pointer-events-none absolute -right-8 -top-10 h-20 w-20 rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 66%)',
              filter: 'blur(4px)',
            }}
          />

          <span className="relative z-10">{chip.label}</span>
        </motion.button>
      ))}
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
                boxShadow: '0 12px 24px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.30)',
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
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 18px 34px rgba(0,0,0,0.28)',
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
  isMaoDeFerro,
}: {
  isOpen: boolean;
  isDecisionPending: boolean;
  isMaoDeFerro: boolean;
}) {
  if (!isOpen) {
    return null;
  }

  const watermark = isMaoDeFerro ? '11×11' : '11';
  const subtitle = isMaoDeFerro ? 'Mão de ferro' : 'Mão de onze';
  const watermarkClassName =
    'absolute right-[6.5%] top-[61%] -translate-y-1/2 select-none text-center';

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
          opacity: isMaoDeFerro
            ? [0.52, 0.86, 0.52]
            : isDecisionPending
              ? [0.42, 0.72, 0.42]
              : [0.24, 0.42, 0.24],
          boxShadow: isMaoDeFerro
            ? [
                'inset 0 0 44px rgba(255,223,128,0.16), 0 0 34px rgba(180,83,9,0.14)',
                'inset 0 0 76px rgba(255,223,128,0.30), 0 0 62px rgba(180,83,9,0.24)',
                'inset 0 0 44px rgba(255,223,128,0.16), 0 0 34px rgba(180,83,9,0.14)',
              ]
            : isDecisionPending
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
        transition={{
          duration: isMaoDeFerro ? 1.05 : isDecisionPending ? 1.25 : 1.9,
          repeat: Infinity,
        }}
        style={{
          borderColor: isMaoDeFerro
            ? 'rgba(255,241,184,0.34)'
            : isDecisionPending
              ? 'rgba(255,223,128,0.24)'
              : 'rgba(255,223,128,0.16)',
        }}
      />

      <motion.div
        className={watermarkClassName}
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{
          opacity: isMaoDeFerro
            ? [0.22, 0.46, 0.26]
            : isDecisionPending
              ? [0.18, 0.38, 0.22]
              : [0.14, 0.28, 0.16],
          scale: isMaoDeFerro ? [0.96, 1.05, 0.98] : [0.97, 1.06, 0.99],
        }}
        transition={{
          duration: isMaoDeFerro ? 1.08 : 1.22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <motion.div
          className="absolute left-1/2 top-1/2 h-[200px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          animate={{
            opacity: isMaoDeFerro ? [0.18, 0.34, 0.2] : [0.14, 0.28, 0.16],
            scale: isMaoDeFerro ? [0.94, 1.08, 0.98] : [0.96, 1.06, 0.99],
          }}
          transition={{
            duration: isMaoDeFerro ? 1.08 : 1.22,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            background: isMaoDeFerro
              ? 'radial-gradient(circle, rgba(255,223,128,0.28) 0%, rgba(127,29,29,0.12) 44%, transparent 74%)'
              : 'radial-gradient(circle, rgba(242,212,136,0.24) 0%, rgba(201,168,76,0.12) 44%, transparent 74%)',
            filter: 'blur(18px)',
          }}
        />

        <div
          className="relative"
          style={{
            color: isMaoDeFerro ? 'rgba(255,241,184,0.94)' : 'rgba(242,212,136,0.92)',
            fontFamily: 'Georgia, serif',
            fontSize: isMaoDeFerro ? '148px' : '198px',
            fontWeight: 900,
            letterSpacing: isMaoDeFerro ? '-0.10em' : '-0.08em',
            lineHeight: 0.8,
            textShadow: isMaoDeFerro
              ? '0 0 24px rgba(255,223,128,0.64), 0 0 54px rgba(255,223,128,0.34), 0 0 90px rgba(127,29,29,0.22)'
              : '0 0 22px rgba(242,212,136,0.54), 0 0 48px rgba(242,212,136,0.26)',
          }}
        >
          {watermark}
        </div>

        <motion.div
          className="relative -mt-1 text-center"
          animate={{ opacity: [0.58, 1, 0.58] }}
          transition={{
            duration: isMaoDeFerro ? 1.08 : 1.22,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            color: isMaoDeFerro ? 'rgba(255,241,184,0.90)' : 'rgba(242,212,136,0.88)',
            fontFamily: 'Georgia, serif',
            fontSize: '16px',
            fontWeight: 900,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            textShadow: '0 0 14px rgba(255,223,128,0.24), 0 2px 8px rgba(0,0,0,0.34)',
          }}
        >
          {subtitle}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

type AcceptedValueTensionVisuals = {
  watermark: string;
  subtitle: string;
  fontSize: string;
  letterSpacing: string;
  valueColor: string;
  valueShadow: string;
  frameBorder: string;
  frameShadow: [string, string, string];
  glowBackground: string;
  ambientBackground: string;
  railBackground: string;
  centreWashBackground: string;
  pulseDuration: number;
  opacity: [number, number, number];
};

function resolveAcceptedValueTensionVisuals(value: number): AcceptedValueTensionVisuals | null {
  if (value >= 12) {
    return {
      watermark: '12',
      subtitle: 'Vale doze',
      fontSize: '176px',
      letterSpacing: '-0.12em',
      valueColor: 'rgba(255,226,226,0.92)',
      valueShadow:
        '0 0 24px rgba(248,113,113,0.60), 0 0 54px rgba(220,38,38,0.32), 0 0 90px rgba(127,29,29,0.24)',
      frameBorder: 'rgba(254,202,202,0.24)',
      frameShadow: [
        'inset 0 0 30px rgba(248,113,113,0.10), 0 0 24px rgba(127,29,29,0.10)',
        'inset 0 0 54px rgba(248,113,113,0.20), 0 0 44px rgba(127,29,29,0.18)',
        'inset 0 0 30px rgba(248,113,113,0.10), 0 0 24px rgba(127,29,29,0.10)',
      ],
      glowBackground:
        'radial-gradient(circle, rgba(248,113,113,0.28) 0%, rgba(127,29,29,0.14) 44%, transparent 74%)',
      ambientBackground:
        'radial-gradient(ellipse at 50% 48%, rgba(254,226,226,0.09) 0%, rgba(248,113,113,0.07) 34%, transparent 68%), radial-gradient(ellipse at 88% 54%, rgba(127,29,29,0.18) 0%, transparent 42%)',
      railBackground:
        'linear-gradient(180deg, transparent 0%, rgba(254,226,226,0.58) 42%, rgba(248,113,113,0.44) 62%, transparent 100%)',
      centreWashBackground:
        'radial-gradient(circle, rgba(254,226,226,0.16) 0%, rgba(248,113,113,0.09) 38%, transparent 70%)',
      pulseDuration: 1.12,
      opacity: [0.18, 0.42, 0.22],
    };
  }

  if (value >= 9) {
    return {
      watermark: '9',
      subtitle: 'Vale nove',
      fontSize: '198px',
      letterSpacing: '-0.08em',
      valueColor: 'rgba(255,210,164,0.90)',
      valueShadow: '0 0 22px rgba(251,146,60,0.54), 0 0 48px rgba(220,38,38,0.24)',
      frameBorder: 'rgba(251,146,60,0.22)',
      frameShadow: [
        'inset 0 0 28px rgba(251,146,60,0.10), 0 0 22px rgba(127,29,29,0.08)',
        'inset 0 0 48px rgba(251,146,60,0.19), 0 0 38px rgba(127,29,29,0.14)',
        'inset 0 0 28px rgba(251,146,60,0.10), 0 0 22px rgba(127,29,29,0.08)',
      ],
      glowBackground:
        'radial-gradient(circle, rgba(251,146,60,0.24) 0%, rgba(127,29,29,0.10) 44%, transparent 74%)',
      ambientBackground:
        'radial-gradient(ellipse at 50% 48%, rgba(251,146,60,0.08) 0%, rgba(220,38,38,0.06) 34%, transparent 68%), radial-gradient(ellipse at 88% 54%, rgba(127,29,29,0.13) 0%, transparent 42%)',
      railBackground:
        'linear-gradient(180deg, transparent 0%, rgba(251,191,36,0.48) 44%, rgba(248,113,113,0.32) 64%, transparent 100%)',
      centreWashBackground:
        'radial-gradient(circle, rgba(251,146,60,0.13) 0%, rgba(220,38,38,0.07) 42%, transparent 72%)',
      pulseDuration: 1.28,
      opacity: [0.16, 0.34, 0.18],
    };
  }

  if (value >= 6) {
    return {
      watermark: '6',
      subtitle: 'Vale seis',
      fontSize: '194px',
      letterSpacing: '-0.08em',
      valueColor: 'rgba(255,223,150,0.90)',
      valueShadow: '0 0 22px rgba(245,158,11,0.48), 0 0 46px rgba(201,168,76,0.22)',
      frameBorder: 'rgba(251,191,36,0.20)',
      frameShadow: [
        'inset 0 0 26px rgba(245,158,11,0.08), 0 0 18px rgba(201,168,76,0.07)',
        'inset 0 0 42px rgba(245,158,11,0.16), 0 0 30px rgba(201,168,76,0.12)',
        'inset 0 0 26px rgba(245,158,11,0.08), 0 0 18px rgba(201,168,76,0.07)',
      ],
      glowBackground:
        'radial-gradient(circle, rgba(245,158,11,0.20) 0%, rgba(201,168,76,0.09) 44%, transparent 74%)',
      ambientBackground:
        'radial-gradient(ellipse at 50% 48%, rgba(251,191,36,0.07) 0%, rgba(245,158,11,0.05) 34%, transparent 68%), radial-gradient(ellipse at 88% 54%, rgba(146,64,14,0.09) 0%, transparent 42%)',
      railBackground:
        'linear-gradient(180deg, transparent 0%, rgba(251,191,36,0.40) 44%, rgba(245,158,11,0.30) 64%, transparent 100%)',
      centreWashBackground:
        'radial-gradient(circle, rgba(251,191,36,0.10) 0%, rgba(245,158,11,0.06) 42%, transparent 72%)',
      pulseDuration: 1.55,
      opacity: [0.14, 0.28, 0.16],
    };
  }

  if (value >= 3) {
    return {
      watermark: '3',
      subtitle: 'Vale três',
      fontSize: '196px',
      letterSpacing: '-0.08em',
      valueColor: 'rgba(255,241,184,0.88)',
      valueShadow:
        '0 0 22px rgba(255,223,128,0.42), 0 0 48px rgba(74,222,128,0.24), 0 0 78px rgba(45,106,79,0.18)',
      frameBorder: 'rgba(255,223,128,0.20)',
      frameShadow: [
        'inset 0 0 28px rgba(255,223,128,0.08), 0 0 20px rgba(74,222,128,0.08)',
        'inset 0 0 48px rgba(255,223,128,0.15), 0 0 36px rgba(74,222,128,0.14)',
        'inset 0 0 28px rgba(255,223,128,0.08), 0 0 20px rgba(74,222,128,0.08)',
      ],
      glowBackground:
        'radial-gradient(circle, rgba(255,223,128,0.22) 0%, rgba(74,222,128,0.14) 38%, rgba(45,106,79,0.08) 56%, transparent 76%)',
      ambientBackground:
        'radial-gradient(ellipse at 50% 48%, rgba(255,223,128,0.06) 0%, rgba(201,168,76,0.04) 34%, transparent 68%), radial-gradient(ellipse at 88% 54%, rgba(45,106,79,0.10) 0%, transparent 42%)',
      railBackground:
        'linear-gradient(180deg, transparent 0%, rgba(255,223,128,0.34) 44%, rgba(201,168,76,0.26) 64%, transparent 100%)',
      centreWashBackground:
        'radial-gradient(circle, rgba(255,223,128,0.09) 0%, rgba(201,168,76,0.05) 42%, transparent 72%)',
      pulseDuration: 1.48,
      opacity: [0.18, 0.38, 0.22],
    };
  }
  return null;
}

function AcceptedValueTableTension({ isOpen, value }: { isOpen: boolean; value: number }) {
  const visuals = resolveAcceptedValueTensionVisuals(value);

  if (!isOpen || visuals === null) {
    return null;
  }

  // NOTE: Accepted bet watermarks are separate from pending bet drama.
  // Pending drama asks for a decision; this layer keeps the felt aligned
  // with a value that is already active on the table.
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="pointer-events-none absolute inset-0 z-[1] overflow-hidden rounded-[28px]"
    >
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: visuals.opacity }}
        transition={{
          duration: visuals.pulseDuration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute inset-0"
        style={{ background: visuals.ambientBackground }}
      />

      <motion.div
        aria-hidden
        className="absolute left-1/2 top-[48%] h-[240px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        animate={{ opacity: [0.08, 0.22, 0.1], scale: [0.96, 1.08, 0.99] }}
        transition={{
          duration: visuals.pulseDuration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          background: visuals.centreWashBackground,
          filter: 'blur(28px)',
        }}
      />

      <motion.div
        aria-hidden
        className="absolute bottom-[11%] left-[14%] right-[14%] h-px rounded-full"
        animate={{ opacity: [0.14, 0.36, 0.16] }}
        transition={{
          duration: visuals.pulseDuration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          background: visuals.railBackground,
          boxShadow: `0 0 18px ${visuals.valueColor}`,
        }}
      />

      <motion.div
        aria-hidden
        className="absolute bottom-[16%] right-[8%] top-[16%] w-px rounded-full"
        animate={{ opacity: [0.16, 0.42, 0.18] }}
        transition={{
          duration: visuals.pulseDuration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          background: visuals.railBackground,
          boxShadow: `0 0 20px ${visuals.valueColor}`,
        }}
      />

      <motion.div
        className="absolute inset-x-[4%] top-[5%] h-[90%] rounded-[38px] border"
        animate={{
          opacity: visuals.opacity,
          boxShadow: visuals.frameShadow,
        }}
        transition={{
          duration: visuals.pulseDuration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        style={{
          borderColor: visuals.frameBorder,
        }}
      />

      <motion.div
        className="absolute right-[6.5%] top-[61%] -translate-y-1/2 select-none text-center"
        initial={{ opacity: 0, scale: 0.82 }}
        animate={{
          opacity: visuals.opacity,
          scale: [0.97, 1.06, 0.99],
        }}
        transition={{
          duration: visuals.pulseDuration,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        <motion.div
          className="absolute left-1/2 top-1/2 h-[200px] w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          animate={{
            opacity: [0.14, 0.3, 0.16],
            scale: [0.96, 1.08, 0.99],
          }}
          transition={{
            duration: visuals.pulseDuration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            background: visuals.glowBackground,
            filter: 'blur(18px)',
          }}
        />

        <div
          className="relative"
          style={{
            color: visuals.valueColor,
            fontFamily: 'Georgia, serif',
            fontSize: visuals.fontSize,
            fontWeight: 900,
            letterSpacing: visuals.letterSpacing,
            lineHeight: 0.8,
            textShadow: visuals.valueShadow,
          }}
        >
          {visuals.watermark}
        </div>

        <motion.div
          className="relative mt-5 text-center"
          animate={{ opacity: [0.58, 1, 0.58] }}
          transition={{
            duration: visuals.pulseDuration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            color: visuals.valueColor,
            fontFamily: 'Georgia, serif',
            fontSize: '15px',
            fontWeight: 900,
            letterSpacing: '0.24em',
            textTransform: 'uppercase',
            textShadow: '0 0 14px rgba(255,223,128,0.20), 0 2px 8px rgba(0,0,0,0.34)',
          }}
        >
          {visuals.subtitle}
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function MaoDeFerroOpeningStage() {
  return (
    <motion.div
      role="status"
      aria-live="assertive"
      aria-atomic="true"
      className="pointer-events-none absolute inset-0 z-[52] flex items-start justify-center px-4 pt-[118px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.24, ease: [0.2, 0.9, 0.24, 1] }}
    >
      <motion.div
        aria-hidden
        className="absolute top-[108px] h-[300px] w-[520px] rounded-full"
        initial={{ opacity: 0, scale: 0.78 }}
        animate={{ opacity: [0.18, 0.48, 0.24], scale: [0.86, 1.08, 1] }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 1.1, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          background:
            'radial-gradient(circle, rgba(255,223,128,0.24) 0%, rgba(127,29,29,0.16) 42%, transparent 72%)',
          filter: 'blur(16px)',
        }}
      />

      <motion.div
        className="relative overflow-hidden rounded-[34px] border px-7 py-6 text-center"
        initial={{ y: 22, scale: 0.9, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 12, scale: 0.97, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
        style={{
          background:
            'linear-gradient(180deg, rgba(24,19,10,0.97) 0%, rgba(12,10,8,0.94) 58%, rgba(5,6,6,0.94) 100%)',
          borderColor: 'rgba(255,223,128,0.42)',
          boxShadow:
            '0 30px 70px rgba(0,0,0,0.56), 0 0 48px rgba(201,168,76,0.18), inset 0 1px 0 rgba(255,255,255,0.08)',
          backdropFilter: 'blur(14px)',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-8 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.86) 50%, transparent 100%)',
          }}
        />

        <motion.div
          className="mx-auto flex h-14 w-24 items-center justify-center rounded-full text-[22px] font-black"
          initial={{ scale: 0.74, rotate: -8 }}
          animate={{ scale: [0.74, 1.12, 1], rotate: [-8, 4, 0] }}
          transition={{ duration: 0.46, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            background: 'linear-gradient(180deg, #fff1b8 0%, #e8c76a 56%, #8a6420 100%)',
            border: '1px solid rgba(255,241,184,0.78)',
            color: '#1a1200',
            boxShadow: '0 0 24px rgba(255,223,128,0.30), inset 0 1px 0 rgba(255,255,255,0.34)',
            fontFamily: 'Georgia, serif',
          }}
        >
          11 × 11
        </motion.div>

        <p
          className="mt-5 text-[11px] font-black uppercase tracking-[0.32em]"
          style={{ color: 'rgba(255,241,184,0.62)' }}
        >
          Queda decisiva
        </p>

        <h2
          className="mt-2 text-[42px] font-black uppercase leading-none tracking-[0.08em]"
          style={{
            color: '#fff1b8',
            fontFamily: 'Georgia, serif',
            textShadow: '0 0 28px rgba(242,212,136,0.26), 0 3px 14px rgba(0,0,0,0.46)',
          }}
        >
          Mão de ferro
        </h2>

        <div
          className="mx-auto mt-4 max-w-[360px] rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em]"
          style={{
            background: 'linear-gradient(180deg, rgba(255,241,184,0.10), rgba(201,168,76,0.045))',
            border: '1px solid rgba(255,223,128,0.24)',
            color: 'rgba(255,248,225,0.78)',
          }}
        >
          Sem correr · vale a mesa
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
              Você ainda não pode jogar carta. Primeiro escolha se entra na queda ou se corre agora.
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
                background: 'linear-gradient(180deg, rgba(34,42,58,0.98), rgba(12,18,28,0.98))',
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

function PlayerHandTurnCue({
  isOpen,
  isMaoDeOnze,
  isMaoDeFerro,
}: {
  isOpen: boolean;
  isMaoDeOnze: boolean;
  isMaoDeFerro: boolean;
}) {
  if (!isOpen) {
    return null;
  }

  const eyebrow = isMaoDeFerro ? 'MÃO DE FERRO' : isMaoDeOnze ? 'QUEDA ATIVA' : 'SUA VEZ';
  const subtitle = isMaoDeFerro
    ? 'VALE A PARTIDA'
    : isMaoDeOnze
      ? 'DECIDA E JOGUE'
      : 'JOGUE UMA CARTA';

  const cueVisuals = isMaoDeFerro
    ? {
        background:
          'linear-gradient(135deg, rgba(64,34,10,0.98) 0%, rgba(118,56,16,0.90) 48%, rgba(11,8,6,0.98) 100%)',
        border: 'rgba(255,241,184,0.58)',
        glow: 'rgba(255,223,128,0.34)',
        accent: '#fff1b8',
        accentSoft: 'rgba(255,223,128,0.20)',
        eyebrow: 'rgba(255,241,184,0.72)',
        title: '#fff1b8',
        icon: '11',
      }
    : isMaoDeOnze
      ? {
          background:
            'linear-gradient(135deg, rgba(50,26,8,0.98) 0%, rgba(110,54,12,0.88) 48%, rgba(10,9,7,0.98) 100%)',
          border: 'rgba(245,158,11,0.56)',
          glow: 'rgba(245,158,11,0.32)',
          accent: '#f6dfa0',
          accentSoft: 'rgba(245,158,11,0.20)',
          eyebrow: 'rgba(255,237,213,0.68)',
          title: '#f6dfa0',
          icon: '11',
        }
      : {
          background: 'linear-gradient(135deg, #2a1d0b 0%, #5a3b12 46%, #1a1208 72%, #070806 100%)',
          border: 'rgba(255,223,128,0.72)',
          glow: 'rgba(201,168,76,0.42)',
          accent: '#f2d488',
          accentSoft: 'rgba(201,168,76,0.28)',
          eyebrow: 'rgba(255,248,225,0.76)',
          title: '#fff1b8',
          icon: '♣',
        };

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className="pointer-events-none absolute -inset-x-4 top-0 bottom-1 z-20 rounded-[34px]"
    >
      <motion.div
        className="absolute inset-x-[16%] bottom-2 h-[96px] rounded-[999px]"
        animate={{ opacity: [0.12, 0.28, 0.15], scale: [0.985, 1.018, 0.99] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: `radial-gradient(ellipse at 50% 62%, ${cueVisuals.glow} 0%, rgba(201,168,76,0.08) 44%, transparent 76%)`,
          filter: 'blur(18px)',
        }}
      />

      <motion.div
        className="absolute left-1/2 z-30 flex h-[46px] min-w-[296px] -translate-x-1/2 items-center gap-3 overflow-hidden rounded-[18px] border px-3.5"
        style={{
          top: -40,
          maxWidth: 340,
          background: cueVisuals.background,
          borderColor: cueVisuals.border,
          backdropFilter: 'blur(8px)',
          opacity: 1,
          isolation: 'isolate',
        }}
        animate={{
          boxShadow: [
            `0 0 0 1px rgba(255,241,184,0.18), 0 16px 30px rgba(0,0,0,0.52), 0 0 18px ${cueVisuals.glow}, inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -8px 16px rgba(0,0,0,0.34)`,
            `0 0 0 1px rgba(255,241,184,0.26), 0 20px 38px rgba(0,0,0,0.58), 0 0 30px ${cueVisuals.glow}, inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -8px 16px rgba(0,0,0,0.38)`,
            `0 0 0 1px rgba(255,241,184,0.18), 0 16px 30px rgba(0,0,0,0.52), 0 0 18px ${cueVisuals.glow}, inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -8px 16px rgba(0,0,0,0.34)`,
          ],
        }}
        transition={{ duration: 1.7, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div
          aria-hidden
          className="absolute inset-x-5 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.78) 50%, transparent 100%)',
          }}
        />

        <div
          aria-hidden
          className="absolute -right-10 -top-12 h-28 w-28 rounded-full"
          style={{
            background: `radial-gradient(circle, ${cueVisuals.accentSoft} 0%, transparent 68%)`,
            filter: 'blur(7px)',
          }}
        />

        <div
          aria-hidden
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full"
          style={{
            background: `linear-gradient(180deg, transparent 0%, ${cueVisuals.accent} 48%, transparent 100%)`,
            boxShadow: `0 0 12px ${cueVisuals.glow}`,
          }}
        />

        <motion.span
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
          animate={{ scale: [1, 1.07, 1], rotate: [-2, 2, -2] }}
          transition={{ duration: 1.45, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(circle at 35% 24%, rgba(255,250,219,0.98) 0%, rgba(255,223,128,0.88) 30%, rgba(201,168,76,0.95) 62%, rgba(63,40,12,0.98) 100%)',
            border: '1px solid rgba(255,241,184,0.68)',
            color: '#1a1204',
            fontFamily: 'Georgia, serif',
            boxShadow:
              '0 0 18px rgba(201,168,76,0.34), inset 0 1px 0 rgba(255,255,255,0.30), inset 0 -5px 10px rgba(0,0,0,0.32)',
          }}
        >
          {cueVisuals.icon}
        </motion.span>

        <span className="flex min-w-0 flex-1 flex-col leading-none">
          <span
            className="text-[9px] font-black uppercase tracking-[0.30em]"
            style={{
              color: cueVisuals.eyebrow,
              fontFamily: 'Georgia, serif',
            }}
          >
            {eyebrow}
          </span>

          <span
            className="mt-1.5 truncate text-[13px] font-black uppercase tracking-[0.24em]"
            style={{
              color: cueVisuals.title,
              fontFamily: 'Georgia, serif',
              textShadow: '0 2px 6px rgba(0,0,0,0.42), 0 0 12px rgba(201,168,76,0.16)',
            }}
          >
            {subtitle}
          </span>
        </span>

        <motion.span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          animate={{ opacity: [0.64, 1, 0.64], scale: [1, 1.22, 1] }}
          transition={{ duration: 1.05, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: cueVisuals.accent,
            boxShadow: `0 0 14px ${cueVisuals.glow}`,
          }}
        />
      </motion.div>
    </motion.div>
  );
}

function MatchResultModal({
  isOpen,
  isVictory,
  scoreLabel,
  viewerPlayerId,
}: {
  isOpen: boolean;
  isVictory: boolean;
  scoreLabel: string;
  viewerPlayerId: 'P1' | 'P2' | null;
}) {
  if (!isOpen) {
    return null;
  }

  const displayScoreLabel = formatViewerScoreLabel(scoreLabel, viewerPlayerId);

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
            background: 'radial-gradient(circle, rgba(255,255,255,0.055) 0%, transparent 64%)',
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
                boxShadow: '0 12px 24px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.30)',
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
                boxShadow: '0 18px 32px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.18)',
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
    isViraRevealActive = false,
    viraRevealKey,
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
  const [visualOpponentConsumedCount, setVisualOpponentConsumedCount] = useState(0);
  const ownFlightSequenceRef = useRef(0);
  const lastLocalFlightCardKeyRef = useRef<string | null>(null);
  const consumedOpponentRevealKeysRef = useRef<Set<number>>(new Set());
  const lastSettledOpponentRef = useRef(settledOpponentFlightKey);
  const lastSettledOwnRef = useRef(settledOwnFlightKey);
  const lastOpponentLaunchSoundKeyRef = useRef(0);
  useEffect(() => {
    if (settledOpponentFlightKey === lastSettledOpponentRef.current) {
      return;
    }

    lastSettledOpponentRef.current = settledOpponentFlightKey;

    if (settledOpponentFlightKey > 0) {
      playCardLandingSound(play, 'opponent');
    }
  }, [play, settledOpponentFlightKey]);

  useEffect(() => {
    if (settledOwnFlightKey === lastSettledOwnRef.current) {
      return;
    }

    lastSettledOwnRef.current = settledOwnFlightKey;

    if (settledOwnFlightKey > 0) {
      playCardLandingSound(play, 'own');
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
    lastOpponentLaunchSoundKeyRef.current = 0;
  }, [roundIntroKey]);

  const effectiveViraRank = currentPrivateViraRank ?? currentPublicViraRank ?? viraRank;
  const isNewHandOpeningLocked = isViraRevealActive;
  const isAwaitingBet = betState === 'awaiting_response';
  const scoreT1 = parseScoreValue(props.scoreLabel, 'T1') ?? 0;
  const scoreT2 = parseScoreValue(props.scoreLabel, 'T2') ?? 0;
  const isMaoDeFerroScoreState = scoreT1 === 11 && scoreT2 === 11;
  const isMaoDeOnzeScoreState = scoreT1 === 11 || scoreT2 === 11;
  const isMaoDeOnzeContractState = props.specialState === 'mao_de_onze';
  const maoDeOnzeVisualHandKey = `mao-de-onze-${roundIntroKey}`;
  const maoDeFerroVisualHandKey = `mao-de-ferro-${roundIntroKey}`;

  const [lockedMaoDeOnzeVisualHandKey, setLockedMaoDeOnzeVisualHandKey] = useState<string | null>(
    null,
  );
  const [lockedMaoDeFerroVisualHandKey, setLockedMaoDeFerroVisualHandKey] = useState<string | null>(
    null,
  );

  const canStartSpecialHandAtmosphere =
    tablePhase === 'playing' && !isResolvingRound && !displayedResolvedRoundFinished;

  const isMaoDeOnzeVisualSourceOpen =
    isMaoDeOnzeContractState || (isMaoDeOnzeScoreState && canStartSpecialHandAtmosphere);

  const isMaoDeFerroVisualSourceOpen = isMaoDeFerroScoreState && canStartSpecialHandAtmosphere;

  useEffect(() => {
    if (isMaoDeOnzeVisualSourceOpen) {
      setLockedMaoDeOnzeVisualHandKey(maoDeOnzeVisualHandKey);
    }

    if (isMaoDeFerroVisualSourceOpen) {
      setLockedMaoDeFerroVisualHandKey(maoDeFerroVisualHandKey);
    }
  }, [
    isMaoDeFerroVisualSourceOpen,
    isMaoDeOnzeVisualSourceOpen,
    maoDeFerroVisualHandKey,
    maoDeOnzeVisualHandKey,
  ]);

  const isMaoDeOnzeVisualLocked = lockedMaoDeOnzeVisualHandKey === maoDeOnzeVisualHandKey;
  const isMaoDeFerroVisualLocked = lockedMaoDeFerroVisualHandKey === maoDeFerroVisualHandKey;
  const isMaoDeOnze =
    isMaoDeOnzeVisualSourceOpen || isMaoDeOnzeVisualLocked || isMaoDeFerroVisualLocked;
  const isViewerMaoDeOnzeDecision =
    props.specialDecisionPending &&
    (availableActions.canAcceptMaoDeOnze || availableActions.canDeclineMaoDeOnze);
  const isMaoDeOnzeAcceptedState =
    isMaoDeOnzeContractState && !props.specialDecisionPending && tablePhase === 'playing';
  const isMatchFinished = tablePhase === 'match_finished';
  const isHandFinished = tablePhase === 'hand_finished';

  // NOTE: Special-hand atmosphere must survive scoring snapshots. When a Mão de 11
  // or Mão de Ferro ends the match, the score no longer stays at 11, but the table
  // should keep the decisive-hand mood until the result modal takes over.
  const isMaoDeOnzeTensionOpen =
    isMaoDeOnze && tablePhase !== 'missing_context' && tablePhase !== 'waiting';
  const isMaoDeFerroTensionOpen =
    (isMaoDeFerroVisualSourceOpen || isMaoDeFerroVisualLocked) && isMaoDeOnzeTensionOpen;
  const isAcceptedValueTensionOpen = Boolean(
    !isMaoDeOnzeTensionOpen &&
    !isAwaitingBet &&
    currentValue >= 3 &&
    tablePhase !== 'missing_context' &&
    tablePhase !== 'waiting',
  );
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
        isMaoDeFerroTensionOpen,
        isMaoDeOnzeDecisionPending: props.specialDecisionPending,
        isResolvingRound,
        isPlayerTurn: isMyTurn && canPlayCard,
      }),
    [
      activeValueForTier,
      canPlayCard,
      isAwaitingBet,
      isMaoDeOnzeTensionOpen,
      isMaoDeFerroTensionOpen,
      isMyTurn,
      isResolvingRound,
      props.specialDecisionPending,
    ],
  );
  const viewerPlayerId =
    normalizePlayerId(currentPrivateHand?.viewerPlayerId) ?? mapSeatToPlayerId(mySeatView?.seatId);
  const viewerWonCurrentHand = didViewerWin(winner, viewerPlayerId);
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

  // Event-driven cards may bridge the gap before the authoritative snapshot catches up.
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

  const maoDeFerroOpeningKey = isMaoDeFerroScoreState
    ? `mao-de-ferro-${roundIntroKey}-${scoreT1}-${scoreT2}`
    : null;

  const [dismissedMaoDeFerroOpeningKey, setDismissedMaoDeFerroOpeningKey] = useState<string | null>(
    null,
  );

  const isMaoDeFerroOpeningOpen = Boolean(
    isMaoDeFerroScoreState &&
    maoDeFerroOpeningKey !== null &&
    dismissedMaoDeFerroOpeningKey !== maoDeFerroOpeningKey &&
    tablePhase === 'playing' &&
    !props.specialDecisionPending &&
    !isAwaitingBet &&
    !isResolvingRound &&
    !currentHandHasAnyPlayedCard,
  );

  useEffect(() => {
    if (!isMaoDeFerroOpeningOpen || maoDeFerroOpeningKey === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setDismissedMaoDeFerroOpeningKey(maoDeFerroOpeningKey);
    }, MAO_DE_FERRO_OPENING_MS);

    return () => window.clearTimeout(timeout);
  }, [isMaoDeFerroOpeningOpen, maoDeFerroOpeningKey]);

  // Opponent hand size comes from authoritative round cards, not animation state.
  // NOTE: The authoritative snapshot may arrive before or after the flight animation.
  // The TP stack uses visual consumption, while this count remains only as a hydration fallback.
  const authoritativeOpponentPlayedCount = useMemo(() => {
    const rounds = currentPublicHand?.rounds ?? [];

    if (viewerPlayerId === null) {
      const finishedCount = rounds.filter((round) => round.finished).length;
      return Math.max(0, Math.min(3, finishedCount));
    }

    const opponentField: 'playerOneCard' | 'playerTwoCard' =
      viewerPlayerId === 'P1' ? 'playerTwoCard' : 'playerOneCard';

    const opponentPlayedCount = rounds.reduce(
      (acc, round) => (round[opponentField] !== null ? acc + 1 : acc),
      0,
    );

    return Math.max(0, Math.min(3, opponentPlayedCount));
  }, [currentPublicHand, viewerPlayerId]);

  const isFreshOpponentHiddenDeckResetFrame = Boolean(
    tablePhase === 'playing' &&
    props.playedRoundsCount === 0 &&
    authoritativeOpponentPlayedCount === 0 &&
    !isResolvingRound &&
    !displayedResolvedRoundFinished &&
    displayedMyPlayedCard === null &&
    displayedOpponentPlayedCard === null &&
    closingTableCards.mine === null &&
    closingTableCards.opponent === null &&
    pendingPlayedCard === null,
  );

  useEffect(() => {
    if (!isFreshOpponentHiddenDeckResetFrame) {
      return;
    }

    consumedOpponentRevealKeysRef.current.clear();
    setVisualOpponentConsumedCount(0);
  }, [isFreshOpponentHiddenDeckResetFrame]);

  const isRoundResolutionFrame = Boolean(
    currentHandHasAnyPlayedCard &&
    (isResolvingRound ||
      displayedResolvedRoundFinished ||
      closingTableCards.mine !== null ||
      closingTableCards.opponent !== null),
  );

  // Resolved-round frames use one frozen snapshot so verdicts never render one-sided.
  // Latest-round fallback is only safe while the transition hook is actively resolving.
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
  const hasUnconsumedOpponentFlight = Boolean(
    opponentRevealKey > 0 &&
    opponentFlightCardString !== null &&
    !consumedOpponentRevealKeysRef.current.has(opponentRevealKey),
  );

  useEffect(() => {
    if (!hasUnconsumedOpponentFlight) {
      return;
    }

    consumedOpponentRevealKeysRef.current.add(opponentRevealKey);
    setVisualOpponentConsumedCount((current) => Math.min(3, current + 1));
  }, [hasUnconsumedOpponentFlight, opponentRevealKey]);

  const effectiveOpponentConsumedCount = Math.min(
    3,
    visualOpponentConsumedCount + (hasUnconsumedOpponentFlight ? 1 : 0),
  );

  const shouldUseAuthoritativeOpponentCount = Boolean(
    effectiveOpponentConsumedCount === 0 &&
    opponentRevealKey <= 0 &&
    authoritativeOpponentPlayedCount > 0,
  );

  const opponentCardsRemaining = Math.max(
    0,
    3 -
      (shouldUseAuthoritativeOpponentCount
        ? authoritativeOpponentPlayedCount
        : effectiveOpponentConsumedCount),
  );
  const displayedOpponentCardsRemaining = isNewHandOpeningLocked ? 0 : opponentCardsRemaining;

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
  // A resolving flight may outlive the authoritative phase during socket bursts.
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

  // The slot stays mounted while a matching flight clone owns the visible landing.
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

  useEffect(() => {
    if (!shouldRenderOpponentFlight || !opponentCard || opponentRevealKey <= 0) {
      return;
    }

    if (lastOpponentLaunchSoundKeyRef.current === opponentRevealKey) {
      return;
    }

    lastOpponentLaunchSoundKeyRef.current = opponentRevealKey;
    playCardLaunchSound(play, 'opponent');
  }, [opponentCard, opponentRevealKey, play, shouldRenderOpponentFlight]);

  const resolvedRoundFinished = displayedResolvedRoundFinished;
  useEffect(() => {
    // The flight lifecycle owns cleanup; suppressed flights are only marked as settled.
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
  const viewerWonResolvedRound = isViewerPlayer(resolvedRoundResult, viewerPlayerId);
  const effectiveNextDecisionType =
    currentPrivateHand?.nextDecisionType ?? currentPublicHand?.nextDecisionType ?? null;
  const isBetResponseDecision = effectiveNextDecisionType === 'respond-bet';
  const isRoundResolutionVisualHoldActive = isRoundResolutionFrame || resolvedRoundFinished;

  // Shell-level flight gating protects future consumers that bypass matchPage safeguards.
  const isAnyShellFlightStillLanding =
    isOpponentFlightStillLanding || isOwnFlightStillLanding || isPendingOwnFlightStillLanding;

  const shouldHideActionSurfaceForRoundHold =
    (isRoundResolutionVisualHoldActive || isAnyShellFlightStillLanding) && !isBetResponseDecision;

  // Hand guards prevent stale visual state from leaking into the next hand.
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
  // Badge eligibility is global, but each slot waits for its own flight cover to clear.
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

  // Optional raises are not mandatory gates; visual resolution and flights still block card play.
  const shouldBlockHandDock =
    hasPendingBetDecision ||
    hasPendingSpecialDecision ||
    isMaoDeFerroOpeningOpen ||
    isResolvingRound ||
    hasAnyClosingCard ||
    isAnyShellFlightStillLanding;

  // The turn cue follows visual safety, not only server-side card availability.
  const isHandDockBlockedForTurnCue = shouldBlockHandDock || isRoundResolutionVisualHoldActive;
  const canShowPlayerTurnCue = Boolean(
    tablePhase === 'playing' &&
    isMyTurn &&
    canPlayCard &&
    myCards.length > 0 &&
    !isHandDockBlockedForTurnCue &&
    !isViewerMaoDeOnzeDecision &&
    !isAwaitingBet &&
    !shouldShowTrucoDrama &&
    !isMaoDeFerroOpeningOpen &&
    !isNewHandOpeningLocked,
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
  // NOTE: In 1v1, thinking is only a compact rival status. Spoken taunts are
  // reserved for pressure, special hands and round outcomes.
  const shouldShowBotPresenceQuote =
    isOpponentBotPressureSource ||
    isMaoDeOnzeTensionOpen ||
    isOpponentBotWinningRound ||
    isOpponentBotLosingRound;
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
    if (
      shouldMuteBotPresenceForDrama ||
      !botPresenceLine ||
      botPresenceTone === 'idle' ||
      botPresenceTone === 'thinking'
    ) {
      return;
    }

    const id = Date.now();
    const duration =
      botPresenceTone === 'wonRound' || botPresenceTone === 'lostRound'
        ? 2300
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

  const shouldDockOpenBetActionBesideTurnCue = Boolean(
    canShowPlayerTurnCue &&
    hasOptionalBetAction &&
    !hasPendingBetDecision &&
    !hasPendingSpecialDecision &&
    !shouldShowTrucoDrama,
  );

  const shouldHideCenterActionBar =
    isNewHandOpeningLocked ||
    shouldHideActionSurfaceForRoundHold ||
    isMaoDeFerroOpeningOpen ||
    isMaoDeOnzeAcceptedState ||
    shouldDockOpenBetActionBesideTurnCue ||
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
      return { label: 'Partida encerrada', accent: viewerWonCurrentHand ? 'win' : 'loss' };
    }

    if (isHandFinished && winner !== null) {
      return viewerWonCurrentHand
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

    if (isMaoDeFerroTensionOpen) {
      return { label: 'Mão de ferro', accent: 'escalate' };
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
      if (resolvedRoundResult === 'TIE') {
        return { label: 'Empate', accent: 'neutral' };
      }

      return viewerWonResolvedRound
        ? { label: 'Rodada sua', accent: 'win' }
        : { label: 'Rodada deles', accent: 'loss' };
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
    isMaoDeFerroTensionOpen,
    isViewerMaoDeOnzeDecision,
    props.specialDecisionPending,
    resolvedRoundResult,
    viewerWonCurrentHand,
    viewerWonResolvedRound,
    winner,
  ]);

  const roundsForChips = useMemo(() => {
    const rounds = publicHandForRounds?.rounds ?? [];
    return rounds.map((round) => ({
      result: round.result ?? null,
      finished: Boolean(round.finished),
    }));
  }, [publicHandForRounds]);

  const climax = (() => {
    if (props.suppressHandOutcomeModal) {
      return null;
    }

    if (climaxDismissed) {
      return null;
    }

    if ((isHandFinished || isMatchFinished) && winner !== null && awardedPoints !== null) {
      return {
        isMyHand: viewerWonCurrentHand,
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

    playRoundVerdictSound(
      play,
      resolvedRoundResult === 'TIE' ? 'tie' : viewerWonResolvedRound ? 'win' : 'loss',
    );
  }, [
    canShowResolutionBadges,
    myRevealKey,
    opponentRevealKey,
    play,
    props.roundResolvedKey,
    resolvedRoundResult,
    viewerWonResolvedRound,
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
    // NOTE: The match page owns viewport height. The table shell must stretch
    // inside that arena instead of forcing a minimum height that can crop the
    // player hand on shorter browser viewports.
    <div
      className="relative flex h-full min-h-0 w-full flex-col overflow-visible"
      style={{
        borderRadius: 28,
        border: `1px solid ${tableTensionVisuals.shellBorderColor}`,
        boxShadow: tableTensionVisuals.shellBoxShadow,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          borderRadius: 28,
          background: tableTensionVisuals.feltBackground,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.030'/%3E%3C/svg%3E\")",
          }}
        />

        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 18% 22%, rgba(255,244,214,0.12) 50%, transparent 100%), radial-gradient(1px 1px at 76% 18%, rgba(255,244,214,0.08) 50%, transparent 100%), radial-gradient(1px 1px at 14% 74%, rgba(255,255,255,0.06) 50%, transparent 100%), radial-gradient(1px 1px at 84% 72%, rgba(255,244,214,0.10) 50%, transparent 100%), radial-gradient(1px 1px at 44% 86%, rgba(255,255,255,0.05) 50%, transparent 100%), radial-gradient(1px 1px at 56% 14%, rgba(255,244,214,0.08) 50%, transparent 100%)',
            backgroundRepeat: 'no-repeat',
            opacity: 0.28,
          }}
        />

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

        <div
          className="felt-breathe-anim absolute inset-x-[22%] top-[28%] h-[44%] rounded-full"
          style={{
            background: tableTensionVisuals.centreAmbientBackground,
            filter: 'blur(24px)',
          }}
        />

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
            isMaoDeFerro={isMaoDeFerroTensionOpen}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isAcceptedValueTensionOpen ? (
          <AcceptedValueTableTension isOpen={isAcceptedValueTensionOpen} value={currentValue} />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMaoDeFerroOpeningOpen ? <MaoDeFerroOpeningStage /> : null}
      </AnimatePresence>

      <div className="relative z-[2] flex min-h-0 flex-1 flex-col px-2 pb-1 pt-1 sm:px-4 sm:pb-5 sm:pt-3">
        <div className="flex min-h-0 flex-1 items-stretch gap-1 sm:gap-3">
          <LeftContextColumn
            currentValue={currentValue}
            valeTier={activeTier}
            stateLabel={stateInfo.label}
            stateAccent={stateInfo.accent}
          />

          <div className="flex min-w-0 flex-1 flex-col items-center justify-between gap-1 py-0 sm:gap-3 sm:py-1">
            {opponentSeatView ? (
              <div ref={opponentFlightSourceRef} className="-translate-y-[6px] scale-[0.82] sm:-translate-y-[12px] sm:scale-100">
                <OpponentCluster
                  seat={opponentSeatView}
                  cardsRemaining={displayedOpponentCardsRemaining}
                  isOpponent
                  presenceLine={visibleBotPresenceLine}
                  presenceQuote={visibleBotPresenceQuote}
                  presenceTone={visibleBotPresenceTone}
                  suppressNeutralProfile
                />
              </div>
            ) : null}

            <div className="flex translate-y-[8px] items-center justify-center gap-1 sm:translate-y-[42px] sm:gap-8">
              {isNewHandOpeningLocked ? (
                <div aria-hidden className="h-[118px] w-[58px] sm:h-[210px] sm:w-[124px]" />
              ) : (
                <div className="flex w-[58px] shrink-0 origin-center scale-[0.70] justify-center sm:w-auto sm:scale-100">
                  <ViraCard
                    rank={effectiveViraRank}
                    suit="C"
                    {...(viraRevealKey ? { revealKey: viraRevealKey } : {})}
                    revealActive={false}
                  />
                </div>
              )}

              <div className="relative grid w-[268px] grid-cols-[116px_36px_116px] items-center justify-items-center rounded-[28px] px-0 py-0 sm:w-[456px] sm:grid-cols-[188px_80px_188px] sm:rounded-[34px] sm:px-2 sm:py-1">
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

                <div className="relative z-10 col-start-2 flex h-[126px] w-[36px] items-center justify-center sm:h-[190px] sm:w-[80px]" />

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

            <div className="mt-0 min-h-[56px] w-full max-w-[340px] sm:min-h-[88px] sm:max-w-[380px]">
              {shouldHideCenterActionBar ? (
                <div aria-hidden className="min-h-[56px] sm:min-h-[88px]" />
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

        <div ref={playerFlightSourceRef} className="relative mt-1 shrink-0 pb-0 sm:mt-3 sm:pb-2">
          <AnimatePresence>
            {canShowPlayerTurnCue ? (
              <PlayerHandTurnCue
                isOpen={canShowPlayerTurnCue}
                isMaoDeOnze={isMaoDeOnzeTensionOpen}
                isMaoDeFerro={isMaoDeFerroTensionOpen}
              />
            ) : null}
          </AnimatePresence>

          {shouldDockOpenBetActionBesideTurnCue ? (
            <div className="pointer-events-auto absolute left-1/2 top-[-30px] z-40 flex -translate-x-1/2 items-center sm:top-[-34px] sm:translate-x-[178px]">
              <CenterActionBar
                availableActions={availableActions}
                onAction={onAction}
                isBetDramaActive={shouldShowTrucoDrama}
              />
            </div>
          ) : null}

          <div className="relative z-10">
            <MatchPlayerHandDock
              myCards={isNewHandOpeningLocked ? [] : myCards}
              canPlayCard={
                isNewHandOpeningLocked || shouldBlockHandDock || isRoundResolutionVisualHoldActive ? false : canPlayCard
              }
              tablePhase={tablePhase}
              launchingCardKey={launchingCardKey}
              currentPrivateHand={currentPrivateHand}
              currentPublicHand={currentPublicHand}
              onPlayCard={onPlayCard}
              isMyTurn={isNewHandOpeningLocked ? false : isMyTurn}
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
            isVictory={viewerWonCurrentHand}
            scoreLabel={props.scoreLabel}
            viewerPlayerId={viewerPlayerId}
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





