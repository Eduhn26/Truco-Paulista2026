import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import { BotSpeechBubble } from './botSpeechBubble';
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
import {
  RoundClashEffects,
  buildKickAnimation,
  buildLoserKick,
  type RoundClashAnchor,
} from './roundClashEffects';
import { MaoDeOnzeDecisionStage } from './maoDeOnzeStage';
import { resolveValeTier, type ValeTier } from './matchPresentationSelectors';
import {
  useBotDialogueDirector,
  type BotDialogueActiveSpeech,
  type BotDialogueSignal,
} from './useBotDialogueDirector';
import {
  useRoundResolutionPhase,
  isRevealPhase,
  isHoldPhase,
  isPostSettlePhase,
  isResolutionVisuallyActive,
} from './useRoundResolutionPhase';
import { cardStringToPayload } from '../../services/socket/socketTypes';
import type {
  BotIdentityPayload,
  CardPayload,
  MatchStatePayload,
  PartnerSignalKind,
  PartnerSignalPayload,
  Rank,
} from '../../services/socket/socketTypes';
import { useConfetti } from '../../hooks/useConfetti';
import { useGameSound } from '../../hooks/useGameSound';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
type HandStatusVariant = 'neutral' | 'success' | 'warning';
type SlotRoundOutcome = 'win' | 'team-win' | 'loss' | 'tie' | null;
type DirectRoundOutcome = Exclude<SlotRoundOutcome, 'team-win'>;

function toDirectRoundOutcome(outcome: SlotRoundOutcome): DirectRoundOutcome {
  return outcome === 'team-win' ? 'win' : outcome;
}

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

type SentPartnerSignalFeedback = {
  id: string;
  label: string;
  expiresAt: string;
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
  roomPlayers?: TableSeatView[];
  isOneVsOne: boolean;
  roomMode: string | null;
  currentTurnSeatId: string | null;
  latestPlayedSeatId?: string | null;
  // 2v2 keeps a played-card buffer per seat because all four cards can be on the felt at once.
  seatPlayedCards?: Record<string, string | null>;
  seatCardConsumptionCounts?: Record<string, number>;
  displayedOpponentPlayedCard: string | null;
  displayedMyPlayedCard: string | null;
  opponentRevealKey: number;
  myRevealKey: number;
  myCardLaunching: boolean;
  roundIntroKey: number;
  roundResolvedKey: number;
  currentPrivateViraRank: Rank | null;
  currentPublicViraRank: Rank | null;
  currentPrivateViraCard: string | null;
  currentPublicViraCard: string | null;
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
  partnerSignal?: PartnerSignalPayload | null;
  sentPartnerSignal?: SentPartnerSignalFeedback | null;
  onSendPartnerSignal?: (kind: PartnerSignalKind) => void;
  onHandClimaxDismissed?: () => void;
};

const SUIT_SYMBOL_MAP: Record<string, string> = {
  P: '♣',
  O: '♦',
  C: '♥',
  E: '♠',
};

// The climax overlay releases itself even if the authoritative hand phase stays finished.
const CLIMAX_AUTO_DISMISS_MS = 4400;
const SETTLED_OUTCOME_BADGE_DELAY_MS = 900;
const LOSER_DIM_DELAY_MS = 260;
const MAO_DE_FERRO_OPENING_MS = 2600;

type PartnerSignalPresentation = {
  kind: PartnerSignalKind;
  label: string;
  compactLabel: string;
  description: string;
  icon: string;
  accent: string;
};

type ManilhaPartnerSignalPresentation = PartnerSignalPresentation & {
  suit: 'P' | 'C' | 'E' | 'O';
};

const MANILHA_PARTNER_SIGNAL_OPTIONS: ManilhaPartnerSignalPresentation[] = [
  {
    kind: 'manilha-zap',
    suit: 'P',
    label: 'Zap',
    compactLabel: 'Zap',
    description: 'Piscar um olho.',
    icon: '♣',
    accent: '#f8df96',
  },
  {
    kind: 'manilha-copas',
    suit: 'C',
    label: 'Copas',
    compactLabel: 'Copas',
    description: 'Erguer sobrancelhas.',
    icon: '♥',
    accent: '#fca5a5',
  },
  {
    kind: 'manilha-espadilha',
    suit: 'E',
    label: 'Espadilha',
    compactLabel: 'Espadilha',
    description: 'Encher a bochecha.',
    icon: '♠',
    accent: '#bfdbfe',
  },
  {
    kind: 'manilha-ouros',
    suit: 'O',
    label: 'Ouros',
    compactLabel: 'Ouros',
    description: 'Mostrar a língua.',
    icon: '♦',
    accent: '#fb923c',
  },
];

const TACTICAL_PARTNER_SIGNAL_OPTIONS: PartnerSignalPresentation[] = [
  {
    kind: 'strong-hand',
    label: 'Tô forte',
    compactLabel: 'Tô forte',
    description: 'Tenho jogo bom.',
    icon: '◆',
    accent: '#f8df96',
  },
  {
    kind: 'weak-hand',
    label: 'Tô fraco',
    compactLabel: 'Tô fraco',
    description: 'Preciso cobertura.',
    icon: '□',
    accent: '#dccdaa',
  },
  {
    kind: 'hold',
    label: 'Segura',
    compactLabel: 'Segura',
    description: 'Economiza força.',
    icon: '●',
    accent: '#86efac',
  },
  {
    kind: 'kill-round',
    label: 'Mata essa',
    compactLabel: 'Mata essa',
    description: 'Tenta levar a vaza.',
    icon: '⚔',
    accent: '#f8df96',
  },
  {
    kind: 'low-card',
    label: 'Joga baixo',
    compactLabel: 'Joga baixo',
    description: 'Não queima carta.',
    icon: '↓',
    accent: '#86efac',
  },
  {
    kind: 'pressure',
    label: 'Pressiona',
    compactLabel: 'Pressiona',
    description: 'A mão permite risco.',
    icon: '▲',
    accent: '#fb923c',
  },
  {
    kind: 'avoid-bet',
    label: 'Não compra',
    compactLabel: 'Não compra',
    description: 'Evita pagar aposta.',
    icon: '×',
    accent: '#fca5a5',
  },
];

const LEGACY_PARTNER_SIGNAL_PRESENTATIONS: PartnerSignalPresentation[] = [
  {
    kind: 'has-manilha',
    label: 'Tenho manilha',
    compactLabel: 'Manilha',
    description: 'Tenho força na mão.',
    icon: '★',
    accent: '#f8df96',
  },
  {
    kind: 'strong-manilha',
    label: 'Manilha forte',
    compactLabel: 'Forte',
    description: 'Pode confiar mais.',
    icon: '◆',
    accent: '#f8df96',
  },
  {
    kind: 'weak-manilha',
    label: 'Manilha fraca',
    compactLabel: 'Fraca',
    description: 'Ajuda, com cuidado.',
    icon: '◇',
    accent: '#dccdaa',
  },
  {
    kind: 'no-manilha',
    label: 'Tô sem manilha',
    compactLabel: 'Sem manilha',
    description: 'Não conte com ela.',
    icon: '○',
    accent: '#dccdaa',
  },
];

const PARTNER_SIGNAL_PRESENTATIONS: PartnerSignalPresentation[] = [
  ...MANILHA_PARTNER_SIGNAL_OPTIONS,
  ...TACTICAL_PARTNER_SIGNAL_OPTIONS,
  ...LEGACY_PARTNER_SIGNAL_PRESENTATIONS,
];

function resolvePartnerSignalPresentationByKind(
  kind: PartnerSignalKind,
): PartnerSignalPresentation {
  return (
    PARTNER_SIGNAL_PRESENTATIONS.find((option) => option.kind === kind) ?? {
      kind,
      label: 'Sinal',
      compactLabel: 'Sinal',
      description: 'Comunicação privada.',
      icon: '•',
      accent: '#f8df96',
    }
  );
}

function resolvePartnerSignalPresentationByLabel(label: string): PartnerSignalPresentation {
  return (
    PARTNER_SIGNAL_PRESENTATIONS.find((option) => option.label === label) ?? {
      kind: 'hold',
      label,
      compactLabel: label,
      description: 'Comunicação privada.',
      icon: '•',
      accent: '#f8df96',
    }
  );
}

function isSpecificManilhaPartnerSignal(kind: PartnerSignalKind): boolean {
  return MANILHA_PARTNER_SIGNAL_OPTIONS.some((option) => option.kind === kind);
}

function resolvePartnerSignalDisabledReason({
  kind,
  availableManilhaSignalKinds,
}: {
  kind: PartnerSignalKind;
  availableManilhaSignalKinds: readonly PartnerSignalKind[];
}): string | null {
  if (isSpecificManilhaPartnerSignal(kind) && !availableManilhaSignalKinds.includes(kind)) {
    return 'Você não tem essa manilha';
  }

  return null;
}

function shouldLogMatchTableShellDebug(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }

  if (typeof window === 'undefined') {
    return false;
  }

  const params = new URLSearchParams(window.location.search);

  return params.get('debugMatch') === '1' || params.get('debugTruco') === '1';
}

function debugMatchTableShell(event: string, details: Record<string, unknown> = {}): void {
  if (!shouldLogMatchTableShellDebug()) {
    return;
  }

  console.info('[MATCH_TABLE_SHELL]', event, details);
}

function parseSuitColor(suit: string): boolean {
  return suit === 'C' || suit === 'O';
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

type TeamId = 'T1' | 'T2';
type TwoVersusTwoSeatRole = 'self' | 'partner' | 'rival';
type TwoVersusTwoSeatPosition = 'top' | 'left' | 'right' | 'bottom';

type TwoVersusTwoSeatLayout = {
  self: TableSeatView;
  partner: TableSeatView;
  leftRival: TableSeatView;
  rightRival: TableSeatView;
};

const TURN_ORDER_2V2 = ['T1A', 'T2A', 'T1B', 'T2B'] as const;

function resolveSeatTeamId(seatId: string | null | undefined): TeamId | null {
  if (!seatId) {
    return null;
  }

  if (seatId.startsWith('T1')) {
    return 'T1';
  }

  if (seatId.startsWith('T2')) {
    return 'T2';
  }

  return null;
}

function resolveSeatDisplayName(seat: TableSeatView, role: TwoVersusTwoSeatRole): string {
  if (role === 'self') {
    return 'Você';
  }

  if (seat.isBot) {
    return seat.botIdentity?.displayName ?? 'Bot';
  }

  return seat.publicName ?? seat.displayName ?? (role === 'partner' ? 'Parceiro' : 'Rival');
}

function resolveSeatRoleLabel(seat: TableSeatView, role: TwoVersusTwoSeatRole): string {
  if (role === 'self') {
    return 'Suas cartas';
  }

  if (role === 'partner') {
    return seat.isBot ? 'Parceiro bot' : 'Parceiro humano';
  }

  return seat.isBot ? 'Rival bot' : 'Rival humano';
}

function resolveSeatAccent(role: TwoVersusTwoSeatRole, isCurrentTurn: boolean) {
  if (isCurrentTurn) {
    return {
      background: 'linear-gradient(180deg, rgba(52,37,14,0.94), rgba(9,13,10,0.88))',
      border: 'rgba(255,223,128,0.62)',
      glow: '0 0 28px rgba(201,168,76,0.28), 0 18px 34px rgba(0,0,0,0.42)',
      label: '#f6dfa0',
      dot: '#f6dfa0',
    };
  }

  if (role === 'self' || role === 'partner') {
    return {
      background: 'linear-gradient(180deg, rgba(25,48,34,0.78), rgba(8,15,13,0.72))',
      border: 'rgba(74,222,128,0.22)',
      glow: '0 12px 26px rgba(0,0,0,0.26), 0 0 14px rgba(34,197,94,0.10)',
      label: '#86efac',
      dot: '#4ade80',
    };
  }

  return {
    background: 'linear-gradient(180deg, rgba(16,32,48,0.78), rgba(7,13,20,0.72))',
    border: 'rgba(147,197,253,0.20)',
    glow: '0 12px 26px rgba(0,0,0,0.26), 0 0 14px rgba(59,130,246,0.08)',
    label: '#93c5fd',
    dot: '#93c5fd',
  };
}

function resolveTwoVersusTwoSeatLayout(
  roomPlayers: TableSeatView[],
  mySeatId: string | null,
): TwoVersusTwoSeatLayout | null {
  if (!mySeatId) {
    return null;
  }

  const seatsById = new Map(roomPlayers.map((seat) => [seat.seatId, seat]));
  const self = seatsById.get(mySeatId);
  const myTeamId = resolveSeatTeamId(mySeatId);

  if (!self || !myTeamId) {
    return null;
  }

  const partner = roomPlayers.find((seat) => {
    return seat.seatId !== mySeatId && resolveSeatTeamId(seat.seatId) === myTeamId;
  });
  const mySeatIndex = TURN_ORDER_2V2.indexOf(mySeatId as (typeof TURN_ORDER_2V2)[number]);

  if (!partner || mySeatIndex < 0) {
    return null;
  }

  const rightRivalSeatId = TURN_ORDER_2V2[(mySeatIndex + 1) % TURN_ORDER_2V2.length]!;
  const leftRivalSeatId =
    TURN_ORDER_2V2[(mySeatIndex + TURN_ORDER_2V2.length - 1) % TURN_ORDER_2V2.length]!;
  const rightRival = seatsById.get(rightRivalSeatId);
  const leftRival = seatsById.get(leftRivalSeatId);

  if (!rightRival || !leftRival) {
    return null;
  }

  return {
    self,
    partner,
    leftRival,
    rightRival,
  };
}

type HiddenSeatDeckVariant = 'partner' | 'rival';

function HiddenSeatCardBack({
  index,
  position,
  variant,
  isCurrentTurn,
}: {
  index: number;
  position: TwoVersusTwoSeatPosition;
  variant: HiddenSeatDeckVariant;
  isCurrentTurn: boolean;
}) {
  const rotationByPosition: Record<TwoVersusTwoSeatPosition, number[]> = {
    top: [-14, 0, 14],
    left: [-12, 1, 12],
    right: [12, -1, -12],
    bottom: [-14, 0, 14],
  };
  const yByIndex = [3, -7, 3];

  // NOTE: The right-side deck keeps the same DOM order as the other seats,
  // but its visual stack must be mirrored so the fan opens toward the table.
  const visualStackIndex = position === 'right' ? 2 - index : index;
  const rotation = rotationByPosition[position][visualStackIndex] ?? 0;
  const y = yByIndex[visualStackIndex] ?? 0;
  const zIndex = position === 'right' ? 3 - index : index + 1;

  const isPartner = variant === 'partner';
  const tone = isPartner
    ? {
        glow: 'rgba(34,197,94,0.22)',
        edge: 'rgba(134,239,172,0.34)',
        wash: 'rgba(34,197,94,0.10)',
      }
    : {
        glow: 'rgba(220,38,38,0.24)',
        edge: 'rgba(252,165,165,0.34)',
        wash: 'rgba(220,38,38,0.10)',
      };

  return (
    <motion.div
      layout="position"
      className="relative h-[70px] w-[48px] shrink-0 overflow-hidden rounded-[11px] border sm:h-[88px] sm:w-[60px] sm:rounded-[14px]"
      initial={{ opacity: 0, y: y - 13, rotate: rotation - 5, scale: 0.9 }}
      animate={{ opacity: 1, y, rotate: rotation, scale: 1 }}
      exit={{ opacity: 0, y: -22, rotate: rotation + 12, scale: 0.78 }}
      transition={{ duration: 0.3, ease: [0.2, 0.9, 0.24, 1] }}
      style={{
        marginLeft: index === 0 ? 0 : -28,
        zIndex,
        transformOrigin: '50% 96%',
        background:
          'radial-gradient(circle at 50% 10%, rgba(255,244,214,0.16), transparent 28%), repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0px, rgba(255,255,255,0.045) 1px, transparent 1px, transparent 5px), linear-gradient(180deg, #152c20 0%, #08120f 58%, #020403 100%)',
        borderColor: isCurrentTurn ? 'rgba(255,241,184,0.82)' : 'rgba(232,199,106,0.38)',
        boxShadow: isCurrentTurn
          ? `0 0 22px rgba(242,212,136,0.38), 0 16px 24px rgba(0,0,0,0.56), inset 0 0 0 1px ${tone.edge}`
          : `0 15px 24px rgba(0,0,0,0.54), 0 0 14px ${tone.glow}, inset 0 0 0 1px ${tone.edge}`,
      }}
    >
      <div
        aria-hidden
        className="absolute inset-[7px] rounded-[9px]"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(232,199,106,0.20), transparent 56%), linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.18))',
          border: '1px solid rgba(255,244,214,0.10)',
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.56)',
        }}
      />

      <div
        className="absolute left-1/2 top-1/2 flex h-[40px] w-[40px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[13px] font-black"
        style={{
          color: '#fff1b8',
          fontFamily: 'Georgia, serif',
          background:
            'radial-gradient(circle at 36% 24%, rgba(255,241,184,0.40), transparent 34%), linear-gradient(180deg, rgba(19,27,20,0.98), rgba(3,6,5,0.98))',
          border: '1px solid rgba(232,199,106,0.52)',
          boxShadow:
            '0 0 12px rgba(201,168,76,0.24), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -5px 10px rgba(0,0,0,0.44)',
          textShadow: '0 1px 2px rgba(0,0,0,0.78)',
        }}
      >
        TP
      </div>

      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-3"
        style={{
          background: `linear-gradient(180deg, transparent, ${tone.wash})`,
        }}
      />
    </motion.div>
  );
}

function HiddenSeatCards({
  position,
  cardsRemaining = 3,
  variant,
  isCurrentTurn,
}: {
  position: TwoVersusTwoSeatPosition;
  cardsRemaining?: number;
  variant: HiddenSeatDeckVariant;
  isCurrentTurn: boolean;
}) {
  const safeCount = Math.max(0, Math.min(3, cardsRemaining));
  const cardIndices = Array.from({ length: safeCount }, (_, index) => index);

  return (
    <div
      className="relative flex min-h-[72px] items-center justify-center px-1 sm:min-h-[106px] sm:px-2"
      style={{ perspective: 520 }}
    >
      <AnimatePresence initial={false}>
        {cardIndices.map((index) => (
          <HiddenSeatCardBack
            key={`${position}-${variant}-hidden-card-${index}`}
            index={index}
            position={position}
            variant={variant}
            isCurrentTurn={isCurrentTurn}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function PartnerSignalDock({
  isEnabled,
  lastSignal,
  sentSignal,
  availableManilhaSignalKinds,
  onSendSignal,
}: {
  isEnabled: boolean;
  lastSignal: PartnerSignalPayload | null;
  sentSignal: SentPartnerSignalFeedback | null;
  availableManilhaSignalKinds: readonly PartnerSignalKind[];
  onSendSignal?: (kind: PartnerSignalKind) => void;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isManilhaMenuOpen, setIsManilhaMenuOpen] = useState(false);
  const isDisabled = !isEnabled || !onSendSignal;
  const sentSignalPresentation = sentSignal
    ? resolvePartnerSignalPresentationByLabel(sentSignal.label)
    : null;
  const receivedSignalPresentation = lastSignal
    ? resolvePartnerSignalPresentationByKind(lastSignal.kind)
    : null;

  useEffect(() => {
    if (isDisabled) {
      setIsMenuOpen(false);
      setIsManilhaMenuOpen(false);
    }
  }, [isDisabled]);

  const handleSendSignal = (kind: PartnerSignalKind): void => {
    if (isDisabled || !onSendSignal) {
      return;
    }

    onSendSignal(kind);
    setIsMenuOpen(false);
    setIsManilhaMenuOpen(false);
  };

  const renderSignalButton = (signal: PartnerSignalPresentation) => {
    const disabledReason = resolvePartnerSignalDisabledReason({
      kind: signal.kind,
      availableManilhaSignalKinds,
    });
    const isSignalDisabled = Boolean(disabledReason);

    return (
      <button
        key={signal.kind}
        type="button"
        disabled={isSignalDisabled}
        title={disabledReason ?? signal.label}
        onClick={() => {
          if (isSignalDisabled) {
            return;
          }

          handleSendSignal(signal.kind);
        }}
        className="group relative min-h-[50px] overflow-hidden rounded-[13px] px-2 py-1.5 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:bg-white/[0.055] focus:outline-none focus:ring-1 focus:ring-[#f8df96]/45 disabled:cursor-not-allowed disabled:opacity-45"
        style={{
          border: isSignalDisabled
            ? '1px solid rgba(255,255,255,0.035)'
            : '1px solid rgba(255,255,255,0.06)',
          background: isSignalDisabled
            ? 'linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0.008))'
            : 'radial-gradient(circle at 26% 0%, rgba(255,241,184,0.055), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.014))',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.045)',
        }}
      >
        <span
          aria-hidden
          className="absolute right-2 top-1.5 text-[14px] leading-none opacity-80 transition"
          style={{
            color: isSignalDisabled ? 'rgba(220,205,170,0.36)' : signal.accent,
            textShadow: isSignalDisabled ? 'none' : `0 0 10px ${signal.accent}`,
          }}
        >
          {signal.icon}
        </span>
        <span
          className="block max-w-[82px] text-[9px] font-black leading-none transition"
          style={{ color: isSignalDisabled ? 'rgba(220,205,170,0.50)' : '#f0e6d3' }}
        >
          {signal.compactLabel}
        </span>
        <span className="mt-1 block max-w-[88px] text-[6.5px] font-black uppercase leading-tight tracking-[0.08em] text-[#dccdaa]/54">
          {disabledReason ?? signal.description}
        </span>
      </button>
    );
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-[76]">
      <AnimatePresence>
        {receivedSignalPresentation && !isMenuOpen ? (
          <motion.div
            key={lastSignal?.signalId ?? receivedSignalPresentation.kind}
            className="absolute overflow-hidden rounded-full px-3 py-1.5 backdrop-blur-xl"
            initial={{ opacity: 0, y: 5, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            style={{
              top: 'clamp(4.05rem, 7.6vh, 4.85rem)',
              left: 'calc(50% + clamp(5.1rem, 8.8vw, 7.8rem))',
              width: '166px',
              background:
                'radial-gradient(circle at 18% 0%, rgba(134,239,172,0.14), transparent 42%), linear-gradient(180deg, rgba(8,18,14,0.96), rgba(3,8,6,0.94))',
              border: '1px solid rgba(134,239,172,0.24)',
              boxShadow:
                '0 10px 22px rgba(0,0,0,0.30), 0 0 14px rgba(34,197,94,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
            }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden
                className="text-[13px] leading-none"
                style={{
                  color: receivedSignalPresentation.accent,
                  textShadow: `0 0 10px ${receivedSignalPresentation.accent}`,
                }}
              >
                {receivedSignalPresentation.icon}
              </span>

              <div className="min-w-0">
                <div className="text-[6.5px] font-black uppercase leading-none tracking-[0.16em] text-[#86efac]/78">
                  Sinal da dupla
                </div>
                <div className="mt-1 truncate text-[11px] font-black leading-none text-[#f0e6d3]">
                  {receivedSignalPresentation.compactLabel}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className="pointer-events-auto absolute"
        style={{
          bottom: 'clamp(2.6rem, 6.5vh, 4.2rem)',
          left: 'clamp(1.1rem, 4vw, 3.1rem)',
          width: 'min(236px, calc(100vw - 1.5rem))',
        }}
      >
        <div className="relative flex items-end">
          <motion.button
            type="button"
            disabled={isDisabled}
            onClick={() => setIsMenuOpen((current) => !current)}
            className="relative inline-flex h-8 items-center gap-2 overflow-hidden rounded-full px-3 text-[8px] font-black uppercase tracking-[0.18em] transition disabled:cursor-not-allowed disabled:opacity-45"
            aria-expanded={isMenuOpen}
            {...(!isDisabled
              ? {
                  whileHover: { y: -1, scale: 1.025 },
                  whileTap: { scale: 0.97 },
                }
              : {})}
            style={{
              color: '#f8df96',
              background:
                'radial-gradient(circle at 24% 0%, rgba(255,241,184,0.14), transparent 40%), linear-gradient(180deg, rgba(35,28,14,0.96), rgba(7,11,8,0.92))',
              border: '1px solid rgba(248,223,150,0.34)',
              boxShadow:
                '0 10px 22px rgba(0,0,0,0.32), 0 0 14px rgba(201,168,76,0.12), inset 0 1px 0 rgba(255,255,255,0.10)',
            }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: isMenuOpen ? '#86efac' : '#f8df96',
                boxShadow: isMenuOpen
                  ? '0 0 10px rgba(134,239,172,0.72)'
                  : '0 0 10px rgba(248,223,150,0.58)',
              }}
            />
            Sinais
          </motion.button>

          <AnimatePresence>
            {sentSignalPresentation && sentSignal && !isMenuOpen ? (
              <motion.div
                key={sentSignal.id}
                className="absolute bottom-[calc(100%+8px)] left-0 overflow-hidden rounded-[12px] px-2.5 py-2 backdrop-blur-xl"
                initial={{ opacity: 0, y: 8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                style={{
                  width: 'min(190px, calc(100vw - 1.5rem))',
                  background:
                    'radial-gradient(circle at 12% 0%, rgba(134,239,172,0.15), transparent 38%), linear-gradient(180deg, rgba(8,21,15,0.96), rgba(4,8,7,0.95))',
                  border: '1px solid rgba(134,239,172,0.24)',
                  boxShadow:
                    '0 12px 24px rgba(0,0,0,0.34), 0 0 14px rgba(34,197,94,0.10), inset 0 1px 0 rgba(255,255,255,0.07)',
                }}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black"
                    style={{
                      color: '#082016',
                      background: 'linear-gradient(180deg, #86efac, #22c55e)',
                      boxShadow: '0 0 12px rgba(34,197,94,0.36)',
                    }}
                  >
                    ✓
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-[9px] font-black leading-none text-[#f0e6d3]">
                      Sinal enviado — {sentSignalPresentation.compactLabel}
                    </div>
                    <div className="mt-1 text-[6.5px] font-black uppercase tracking-[0.15em] text-[#dccdaa]/50">
                      Para sua dupla
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {isMenuOpen ? (
              <motion.div
                key="partner-signal-menu"
                className="absolute bottom-[calc(100%+8px)] left-0 overflow-hidden rounded-[18px] p-2 backdrop-blur-xl"
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                style={{
                  width: 'min(236px, calc(100vw - 1.5rem))',
                  background:
                    'radial-gradient(circle at 18% 0%, rgba(248,223,150,0.16), transparent 34%), linear-gradient(180deg, rgba(9,16,13,0.98), rgba(4,8,7,0.97))',
                  border: '1px solid rgba(248,223,150,0.19)',
                  boxShadow:
                    '0 20px 38px rgba(0,0,0,0.44), 0 0 20px rgba(201,168,76,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}
              >
                <div className="flex items-center justify-between gap-3 px-1 pb-2">
                  <div className="text-[7px] font-black uppercase tracking-[0.24em] text-[#c9a84c]">
                    Sinais
                  </div>
                  <span className="text-[6.5px] font-black uppercase tracking-[0.16em] text-[#86efac]/76">
                    Privado
                  </span>
                </div>

                <div className="space-y-1.5">
                  <button
                    type="button"
                    disabled={availableManilhaSignalKinds.length === 0}
                    onClick={() => setIsManilhaMenuOpen((current) => !current)}
                    className="relative flex min-h-[42px] w-full items-center justify-between overflow-hidden rounded-[14px] px-3 py-2 text-left transition enabled:hover:-translate-y-0.5 enabled:hover:bg-white/[0.055] focus:outline-none focus:ring-1 focus:ring-[#f8df96]/45 disabled:cursor-not-allowed disabled:opacity-45"
                    style={{
                      background:
                        'radial-gradient(circle at 18% 0%, rgba(248,223,150,0.12), transparent 38%), linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.014))',
                      border: '1px solid rgba(248,223,150,0.16)',
                      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.055)',
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block text-[9px] font-black uppercase leading-none tracking-[0.16em] text-[#f8df96]">
                        Tenho manilha
                      </span>
                      <span className="mt-1 block text-[6.5px] font-black uppercase tracking-[0.12em] text-[#dccdaa]/58">
                        {availableManilhaSignalKinds.length > 0
                          ? 'Escolha Zap, Copas, Espadilha ou Ouros'
                          : 'Sem manilha na mão'}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="text-[13px] font-black leading-none text-[#f8df96]"
                      style={{ textShadow: '0 0 10px rgba(248,223,150,0.32)' }}
                    >
                      {isManilhaMenuOpen ? '−' : '+'}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isManilhaMenuOpen ? (
                      <motion.div
                        key="partner-signal-manilha-submenu"
                        className="grid grid-cols-2 gap-1.5"
                        initial={{ opacity: 0, y: -4, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        exit={{ opacity: 0, y: -4, height: 0 }}
                        transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
                      >
                        {MANILHA_PARTNER_SIGNAL_OPTIONS.map(renderSignalButton)}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className="grid grid-cols-2 gap-1.5">
                    {TACTICAL_PARTNER_SIGNAL_OPTIONS.map(renderSignalButton)}
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function TableSeatCluster({
  seat,
  role,
  position,
  sourceRef,
}: {
  seat: TableSeatView;
  role: TwoVersusTwoSeatRole;
  position: TwoVersusTwoSeatPosition;
  sourceRef?: (element: HTMLDivElement | null) => void;
}) {
  const visuals = resolveSeatAccent(role, seat.isCurrentTurn);
  const displayName = resolveSeatDisplayName(seat, role);
  const roleLabel = resolveSeatRoleLabel(seat, role);
  const shouldShowHiddenCards = role !== 'self';
  const orientationClass =
    position === 'left' || position === 'right'
      ? 'min-w-[150px] max-w-[170px]'
      : 'min-w-[210px] max-w-[250px]';

  return (
    <motion.div
      ref={sourceRef}
      layout
      className={`pointer-events-none relative rounded-[22px] px-3 py-2.5 backdrop-blur-xl ${orientationClass}`}
      animate={seat.isCurrentTurn ? { y: [0, -2, 0], scale: [1, 1.018, 1] } : { y: 0, scale: 1 }}
      transition={{ duration: 1.45, repeat: seat.isCurrentTurn ? Infinity : 0 }}
      style={{
        background: visuals.background,
        border: `1px solid ${visuals.border}`,
        boxShadow: visuals.glow,
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
              style={{
                background: 'rgba(0,0,0,0.22)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: visuals.label,
              }}
            >
              {seat.seatId}
            </span>
            <span
              className="rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
              style={{
                background: seat.isCurrentTurn ? 'rgba(201,168,76,0.18)' : 'rgba(0,0,0,0.18)',
                border: seat.isCurrentTurn
                  ? '1px solid rgba(255,223,128,0.26)'
                  : '1px solid rgba(255,255,255,0.06)',
                color: seat.isCurrentTurn ? '#f6dfa0' : 'rgba(240,230,211,0.46)',
              }}
            >
              {seat.isCurrentTurn ? 'Turno' : seat.isBot ? 'Bot' : 'Humano'}
            </span>
          </div>

          <div className="mt-1.5 truncate text-[13px] font-black leading-none text-[#f0e6d3]">
            {displayName}
          </div>
          <div
            className="mt-1 truncate text-[8px] font-black uppercase tracking-[0.17em]"
            style={{ color: 'rgba(240,230,211,0.44)' }}
          >
            {roleLabel}
          </div>
        </div>

        <span
          className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
          style={{
            background: visuals.dot,
            boxShadow: seat.isCurrentTurn ? `0 0 12px ${visuals.dot}` : 'none',
          }}
        />
      </div>

      {shouldShowHiddenCards ? (
        <div className="mt-2">
          <HiddenSeatCards
            position={position}
            variant={role === 'partner' ? 'partner' : 'rival'}
            isCurrentTurn={seat.isCurrentTurn}
          />
        </div>
      ) : null}
    </motion.div>
  );
}

type SeatNamePlateOrientation = 'top' | 'left' | 'right';

type SeatNamePlateSuitIdentity = {
  symbol: '♠' | '♥' | '♦';
  label: string;
  background: string;
  border: string;
  color: string;
  glow: string;
  halo: string;
  rail: string;
};

function resolveSeatNamePlateSuitIdentity(
  orientation: SeatNamePlateOrientation,
): SeatNamePlateSuitIdentity {
  if (orientation === 'top') {
    return {
      symbol: '♠',
      label: 'Espadilha',
      background:
        'radial-gradient(circle at 34% 24%, rgba(255,241,184,0.74) 0%, rgba(51,65,85,0.98) 34%, rgba(6,9,12,0.99) 100%)',
      border: 'rgba(255,241,184,0.72)',
      color: '#fff1b8',
      glow: 'rgba(242,212,136,0.34)',
      halo: 'rgba(134,239,172,0.15)',
      rail: 'rgba(255,241,184,0.72)',
    };
  }

  if (orientation === 'left') {
    return {
      symbol: '♥',
      label: 'Copas',
      background:
        'radial-gradient(circle at 34% 24%, rgba(255,241,184,0.54) 0%, rgba(127,29,29,0.98) 42%, rgba(20,6,7,0.99) 100%)',
      border: 'rgba(248,113,113,0.66)',
      color: '#fff1b8',
      glow: 'rgba(248,113,113,0.30)',
      halo: 'rgba(220,38,38,0.18)',
      rail: 'rgba(248,113,113,0.54)',
    };
  }

  return {
    symbol: '♦',
    label: 'Ouro',
    background:
      'radial-gradient(circle at 34% 24%, rgba(255,241,184,0.58) 0%, rgba(180,83,9,0.98) 38%, rgba(69,10,10,0.99) 100%)',
    border: 'rgba(251,191,36,0.64)',
    color: '#fff1b8',
    glow: 'rgba(245,158,11,0.30)',
    halo: 'rgba(245,158,11,0.16)',
    rail: 'rgba(251,191,36,0.58)',
  };
}

function SeatNamePlate2v2({
  seat,
  role,
  orientation,
  sourceRef,
  cardsRemaining,
}: {
  seat: TableSeatView;
  role: 'partner' | 'rival';
  orientation: SeatNamePlateOrientation;
  sourceRef?: (element: HTMLDivElement | null) => void;
  cardsRemaining: number;
}) {
  const displayName = resolveSeatDisplayName(seat, role);
  const subtitle = resolveSeatRoleLabel(seat, role);
  const isPartner = role === 'partner';
  const suitIdentity = resolveSeatNamePlateSuitIdentity(orientation);
  const cardsPosition: TwoVersusTwoSeatPosition =
    orientation === 'top' ? 'top' : orientation === 'left' ? 'left' : 'right';
  const size =
    orientation === 'top'
      ? { width: 'clamp(156px, 38vw, 218px)', deckWidth: 'clamp(126px, 32vw, 174px)' }
      : { width: 'clamp(126px, 34vw, 206px)', deckWidth: 'clamp(110px, 30vw, 168px)' };
  const tone = isPartner
    ? {
        accent: '#86efac',
        accentDim: 'rgba(34,197,94,0.18)',
        railBg:
          'radial-gradient(circle at 18% 0%, rgba(134,239,172,0.18), transparent 36%), linear-gradient(180deg, rgba(11,34,23,0.98), rgba(4,12,9,0.94))',
        railBorder: seat.isCurrentTurn ? 'rgba(255,241,184,0.86)' : 'rgba(134,239,172,0.32)',
        name: '#f4fff7',
        subtitle: 'rgba(187,247,208,0.66)',
        shadow: 'rgba(34,197,94,0.22)',
      }
    : {
        accent: '#fca5a5',
        accentDim: 'rgba(220,38,38,0.20)',
        railBg:
          'radial-gradient(circle at 18% 0%, rgba(252,165,165,0.18), transparent 36%), linear-gradient(180deg, rgba(48,12,15,0.98), rgba(13,4,5,0.94))',
        railBorder: seat.isCurrentTurn ? 'rgba(255,241,184,0.86)' : 'rgba(252,165,165,0.34)',
        name: '#fff5ee',
        subtitle: 'rgba(252,165,165,0.64)',
        shadow: 'rgba(220,38,38,0.22)',
      };
  const safeCardsRemaining = Math.max(0, Math.min(3, cardsRemaining));

  return (
    <motion.div
      ref={sourceRef}
      className="pointer-events-none relative flex flex-col items-center"
      style={{
        width: size.width,
        filter: seat.isCurrentTurn
          ? 'drop-shadow(0 0 24px rgba(242,212,136,0.42)) drop-shadow(0 15px 20px rgba(0,0,0,0.38))'
          : 'drop-shadow(0 13px 18px rgba(0,0,0,0.42))',
      }}
    >
      {seat.isCurrentTurn ? (
        <motion.div
          aria-hidden
          className="absolute -inset-x-7 -inset-y-4 rounded-[34px]"
          animate={{ opacity: [0.46, 0.76, 0.5], scale: [0.98, 1.025, 1] }}
          transition={{ duration: 1.45, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(ellipse at 50% 36%, rgba(255,241,184,0.26), rgba(201,168,76,0.10) 45%, transparent 76%)',
            filter: 'blur(5px)',
          }}
        />
      ) : null}

      <div
        className="relative z-20 flex h-[48px] w-full items-center rounded-full border px-[7px] backdrop-blur-md"
        style={{
          background: tone.railBg,
          borderColor: tone.railBorder,
          boxShadow: seat.isCurrentTurn
            ? '0 0 0 1px rgba(255,241,184,0.20), 0 0 28px rgba(201,168,76,0.38), 0 13px 22px rgba(0,0,0,0.46), inset 0 1px 0 rgba(255,255,255,0.12)'
            : `0 11px 18px rgba(0,0,0,0.44), 0 0 14px ${tone.shadow}, inset 0 1px 0 rgba(255,255,255,0.08)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-x-8 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,244,214,0.62), transparent)',
          }}
        />

        <div
          aria-hidden
          className="absolute inset-x-7 bottom-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent, ${suitIdentity.rail}, transparent)`,
            opacity: 0.5,
          }}
        />

        <div
          aria-hidden
          className="absolute -left-3 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full"
          style={{
            background: `radial-gradient(circle, ${suitIdentity.halo} 0%, transparent 72%)`,
            filter: 'blur(7px)',
          }}
        />

        <motion.div
          className="relative z-20 flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full"
          animate={
            seat.isCurrentTurn
              ? { scale: [1, 1.08, 1], rotate: [-4, 4, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{
            duration: 1.35,
            repeat: seat.isCurrentTurn ? Infinity : 0,
            ease: 'easeInOut',
          }}
          style={{
            background: suitIdentity.background,
            border: `1px solid ${suitIdentity.border}`,
            boxShadow: seat.isCurrentTurn
              ? `0 0 22px ${suitIdentity.glow}, 0 0 18px rgba(255,241,184,0.30), inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -7px 14px rgba(0,0,0,0.46)`
              : `0 0 16px ${suitIdentity.glow}, inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -7px 14px rgba(0,0,0,0.44)`,
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
              color: suitIdentity.color,
              fontFamily: 'Georgia, serif',
              textShadow: '0 2px 6px rgba(0,0,0,0.58)',
            }}
          >
            {suitIdentity.symbol}
          </span>
        </motion.div>

        <div className="relative min-w-0 flex-1 px-3">
          <div
            aria-hidden
            className="absolute bottom-1.5 left-2 right-2 h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${suitIdentity.rail}, transparent)`,
              opacity: 0.28,
            }}
          />

          <div
            className="truncate text-[14px] font-black uppercase leading-none tracking-[0.05em]"
            style={{
              color: tone.name,
              fontFamily: 'Georgia, serif',
              textShadow: seat.isCurrentTurn
                ? '0 0 12px rgba(255,241,184,0.28), 0 2px 6px rgba(0,0,0,0.54)'
                : '0 2px 6px rgba(0,0,0,0.46)',
            }}
          >
            {displayName}
          </div>

          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <span
              className="truncate text-[6.5px] font-black uppercase tracking-[0.17em]"
              style={{ color: tone.subtitle }}
            >
              {subtitle}
            </span>

            <span
              aria-hidden
              className="h-1 w-1 shrink-0 rounded-full"
              style={{
                background: suitIdentity.border,
                opacity: 0.82,
                boxShadow: `0 0 7px ${suitIdentity.glow}`,
              }}
            />

            <span
              className="truncate text-[6.5px] font-black uppercase tracking-[0.16em]"
              style={{
                color: suitIdentity.color,
                fontFamily: 'Georgia, serif',
                opacity: 0.78,
                textShadow: `0 0 8px ${suitIdentity.glow}`,
              }}
            >
              {suitIdentity.label}
            </span>
          </div>
        </div>

        <div
          aria-hidden
          className="relative z-20 flex h-[34px] w-[24px] shrink-0 items-center justify-center rounded-full"
          style={{
            background: 'linear-gradient(180deg, rgba(255,241,184,0.18), rgba(201,168,76,0.06))',
            border: '1px solid rgba(255,241,184,0.18)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <span
            className="h-2 w-2 rounded-full"
            style={{
              background: seat.isCurrentTurn ? '#fff1b8' : tone.accent,
              boxShadow: seat.isCurrentTurn
                ? '0 0 12px rgba(255,241,184,0.76)'
                : `0 0 8px ${tone.accentDim}`,
            }}
          />
        </div>

        {seat.isCurrentTurn ? (
          <span
            className="absolute -right-3 -top-2 rounded-full px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em]"
            style={{
              background: 'linear-gradient(180deg, rgba(255,241,184,0.98), rgba(201,168,76,0.94))',
              border: '1px solid rgba(255,244,214,0.78)',
              color: '#251706',
              boxShadow: '0 0 12px rgba(201,168,76,0.38), 0 5px 10px rgba(0,0,0,0.34)',
            }}
          >
            Turno
          </span>
        ) : null}
      </div>

      <div
        className="relative z-10 mt-[2px] flex h-[76px] items-start justify-center sm:mt-[4px] sm:h-[108px]"
        style={{ width: size.deckWidth }}
      >
        <div
          aria-hidden
          className="absolute left-1/2 -top-[14px] h-[27px] w-[94px] -translate-x-1/2 rounded-b-full border-x border-b"
          style={{
            borderColor: 'rgba(232,199,106,0.28)',
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(232,199,106,0.20), transparent 64%), linear-gradient(180deg, rgba(255,244,214,0.08), rgba(5,8,7,0.00))',
            boxShadow: 'inset 0 -7px 12px rgba(0,0,0,0.18), 0 7px 12px rgba(0,0,0,0.18)',
          }}
        />

        <div
          aria-hidden
          className="absolute left-1/2 -top-[1px] h-px w-[72px] -translate-x-1/2"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(255,244,214,0.34), transparent)',
          }}
        />

        <div
          aria-hidden
          className="absolute left-1/2 top-[66px] h-[34px] w-[156px] -translate-x-1/2 rounded-[50%]"
          style={{
            background: `radial-gradient(ellipse at 50% 50%, ${tone.shadow}, transparent 68%)`,
            filter: 'blur(9px)',
          }}
        />

        <HiddenSeatCards
          position={cardsPosition}
          cardsRemaining={safeCardsRemaining}
          variant={role}
          isCurrentTurn={seat.isCurrentTurn}
        />
      </div>
    </motion.div>
  );
}

type RadialSlotPosition = 'top' | 'left' | 'right' | 'bottom';

const ROTATION_BY_RADIAL_POSITION: Record<RadialSlotPosition, number> = {
  top: -6,
  left: 12,
  right: -12,
  bottom: 6,
};

const ROUND_CLASH_ANCHOR_BY_POSITION: Record<
  RadialSlotPosition,
  {
    x: string;
    y: string;
  }
> = {
  top: { x: '50%', y: '30%' },
  left: { x: '34%', y: '55%' },
  right: { x: '66%', y: '55%' },
  bottom: { x: '50%', y: '76%' },
};

const ROUND_CLASH_TONE_BY_OUTCOME: Record<
  Exclude<SlotRoundOutcome, null>,
  RoundClashAnchor['tone']
> = {
  win: 'winner',
  'team-win': 'partner',
  loss: 'loser',
  tie: 'tie',
};

function isVisibleSeatCard(card: string | null | undefined): card is string {
  return typeof card === 'string' && card.length > 0 && card !== 'HIDDEN';
}

const TRUCO_RANK_ORDER: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const TRUCO_MANILHA_SUIT_STRENGTH: Record<string, number> = {
  O: 0,
  E: 1,
  C: 2,
  P: 3,
};

function resolveManilhaRank(viraRank: Rank): Rank {
  const viraIndex = TRUCO_RANK_ORDER.indexOf(viraRank);

  if (viraIndex === -1) {
    return '5';
  }

  return TRUCO_RANK_ORDER[(viraIndex + 1) % TRUCO_RANK_ORDER.length]!;
}

function resolveManilhaSignalKindBySuit(suit: string): PartnerSignalKind | null {
  if (suit === 'P') return 'manilha-zap';
  if (suit === 'C') return 'manilha-copas';
  if (suit === 'E') return 'manilha-espadilha';
  if (suit === 'O') return 'manilha-ouros';

  return null;
}

function getTwoVersusTwoCardStrength(card: string | null | undefined, viraRank: Rank): number {
  if (!isVisibleSeatCard(card) || card.length < 2) {
    return Number.NEGATIVE_INFINITY;
  }

  const rank = card.slice(0, card.length - 1) as Rank;
  const suit = card.slice(-1);
  const manilhaRank = resolveManilhaRank(viraRank);
  const rankIndex = TRUCO_RANK_ORDER.indexOf(rank);

  if (rank === manilhaRank) {
    return 100 + (TRUCO_MANILHA_SUIT_STRENGTH[suit] ?? 0);
  }

  return rankIndex;
}

function inferTwoVersusTwoWinningSeatId({
  roundResult,
  winningSeatId,
  seatLayout,
  seatPlayedCards,
  viraRank,
}: {
  roundResult: string | null;
  winningSeatId: string | null;
  seatLayout: TwoVersusTwoSeatLayout | null;
  seatPlayedCards: Record<string, string | null>;
  viraRank: Rank;
}): string | null {
  if (winningSeatId && isVisibleSeatCard(seatPlayedCards[winningSeatId])) {
    return winningSeatId;
  }

  if (!seatLayout || !roundResult || roundResult === 'TIE') {
    return null;
  }

  const winningTeamId = roundResult === 'P1' ? 'T1' : roundResult === 'P2' ? 'T2' : null;

  if (!winningTeamId) {
    return null;
  }

  const candidateSeats = [
    seatLayout.self,
    seatLayout.partner,
    seatLayout.leftRival,
    seatLayout.rightRival,
  ].filter((seat) => resolveSeatTeamId(seat.seatId) === winningTeamId);

  return (
    candidateSeats
      .map((seat) => ({
        seatId: seat.seatId,
        strength: getTwoVersusTwoCardStrength(seatPlayedCards[seat.seatId], viraRank),
      }))
      .filter((candidate) => Number.isFinite(candidate.strength))
      .sort((left, right) => right.strength - left.strength)[0]?.seatId ?? null
  );
}

function resolveTwoVersusTwoSlotOutcome({
  seatId,
  card,
  canShow,
  roundResult,
  winningSeatId,
}: {
  seatId: string;
  card: string | null;
  canShow: boolean;
  roundResult: string | null;
  winningSeatId: string | null;
}): SlotRoundOutcome {
  if (!canShow || !isVisibleSeatCard(card) || !roundResult) {
    return null;
  }

  if (roundResult === 'TIE') {
    return 'tie';
  }

  if (winningSeatId === seatId) {
    return 'win';
  }

  const winningTeamId = roundResult === 'P1' ? 'T1' : roundResult === 'P2' ? 'T2' : null;
  const seatTeamId = resolveSeatTeamId(seatId);

  // The non-hero card from the winning pair gets a secondary badge, independent of viewer perspective.
  if (winningTeamId !== null && seatTeamId === winningTeamId) {
    return 'team-win';
  }

  return 'loss';
}

type TwoVersusTwoVerdictTone = 'mine' | 'rival' | 'tie';

type TwoVersusTwoVerdict = {
  title: string;
  subtitle: string | null;
  tone: TwoVersusTwoVerdictTone;
};

type TwoVersusTwoRoundVerdictTone = 'ours' | 'theirs' | 'tie';

function resolveTwoVersusTwoRoundVerdictTone(
  outcome: DirectRoundOutcome,
): TwoVersusTwoRoundVerdictTone {
  if (outcome === 'win') {
    return 'ours';
  }

  if (outcome === 'loss') {
    return 'theirs';
  }

  return 'tie';
}

function TwoVersusTwoRoundVerdictPlaque({
  verdict,
  outcome,
}: {
  verdict: TwoVersusTwoVerdict;
  outcome: DirectRoundOutcome;
}) {
  const tone = resolveTwoVersusTwoRoundVerdictTone(outcome);
  const title =
    tone === 'ours'
      ? 'Nós vencemos a vaza'
      : tone === 'theirs'
        ? 'Eles venceram a vaza'
        : 'Vaza empatada';
  const detail =
    verdict.subtitle ??
    (tone === 'ours'
      ? 'Nossa dupla bateu a vaza.'
      : tone === 'theirs'
        ? 'Eles bateram a vaza.'
        : 'Ninguém levou a mesa.');

  return (
    <RoundVerdictPlaque
      tone={tone}
      title={title}
      detail={detail}
      variant="two-vs-two"
      style={{
        left: 'clamp(28px, 9.8vw, 184px)',
        bottom: 'clamp(-8px, 1vh, 14px)',
        width: 'min(268px, calc(100% - 28px))',
      }}
    />
  );
}

function describeCardForVerdict(card: string | null | undefined): string | null {
  if (!card || card.length < 2 || card === 'HIDDEN') {
    return null;
  }

  const rank = card.slice(0, card.length - 1);
  const suit = card.slice(-1);
  const symbol = SUIT_SYMBOL_MAP[suit];

  if (!symbol) {
    return null;
  }

  return `${rank}${symbol}`;
}

function formatTwoVersusTwoVerdictLabel({
  roundResult,
  winningSeatId,
  seatLayout,
  seatPlayedCards,
  viraRank,
}: {
  roundResult: string | null;
  winningSeatId: string | null;
  seatLayout: TwoVersusTwoSeatLayout | null;
  seatPlayedCards: Record<string, string | null>;
  viraRank: Rank;
}): TwoVersusTwoVerdict | null {
  if (!roundResult) {
    return null;
  }

  if (roundResult === 'TIE') {
    return {
      title: 'Vaza amarrada',
      subtitle: 'Ninguém levou a mesa',
      tone: 'tie',
    };
  }

  if (!seatLayout) {
    return {
      title: 'Vaza decidida',
      subtitle: null,
      tone: 'tie',
    };
  }

  const winningTeamId = roundResult === 'P1' ? 'T1' : roundResult === 'P2' ? 'T2' : null;

  if (!winningTeamId) {
    return {
      title: 'Vaza decidida',
      subtitle: null,
      tone: 'tie',
    };
  }

  const myTeamId = resolveSeatTeamId(seatLayout.self.seatId);
  const myTeamWon = winningTeamId === myTeamId;

  // Some snapshots only identify the winning team; infer the exact hero card from visible seat cards.
  const winnerSeatId =
    inferTwoVersusTwoWinningSeatId({
      roundResult,
      winningSeatId,
      seatLayout,
      seatPlayedCards,
      viraRank,
    }) ??
    winningSeatId ??
    (myTeamWon ? seatLayout.partner.seatId : seatLayout.leftRival.seatId);

  const title = myTeamWon ? 'Nós vencemos a vaza' : 'Eles venceram a vaza';
  const tone: TwoVersusTwoVerdictTone = myTeamWon ? 'mine' : 'rival';

  const winnerCardLabel = describeCardForVerdict(seatPlayedCards[winnerSeatId]);

  // Compare against the strongest visible card from the losing team, not against seat layout positions.
  const losingTeamId = winningTeamId === 'T1' ? 'T2' : 'T1';
  const strongestLosingSeatId =
    Object.entries(seatPlayedCards)
      .filter(([seatId, card]) => {
        if (seatId === winnerSeatId) return false;
        if (resolveSeatTeamId(seatId) !== losingTeamId) return false;
        return typeof card === 'string' && card.length >= 2;
      })
      .map(([seatId]) => ({
        seatId,
        strength: getTwoVersusTwoCardStrength(seatPlayedCards[seatId], viraRank),
      }))
      .filter((candidate) => Number.isFinite(candidate.strength))
      .sort((left, right) => right.strength - left.strength)[0]?.seatId ?? null;

  const losingCardLabel = describeCardForVerdict(
    strongestLosingSeatId ? seatPlayedCards[strongestLosingSeatId] : null,
  );

  let subtitle: string | null = null;
  if (winnerCardLabel) {
    subtitle = losingCardLabel
      ? `${winnerCardLabel} bateu ${losingCardLabel}`
      : `Maior carta: ${winnerCardLabel}`;
  }

  return { title, subtitle, tone };
}

function TwoVersusTwoSeatCompass({
  seatLayout,
  currentTurnSeatId,
  onSeatSourceElementChange,
}: {
  seatLayout: TwoVersusTwoSeatLayout | null;
  currentTurnSeatId: string | null;
  onSeatSourceElementChange: (seatId: string, element: HTMLDivElement | null) => void;
}) {
  if (!seatLayout) {
    return null;
  }

  const currentSeat = [
    seatLayout.self,
    seatLayout.partner,
    seatLayout.leftRival,
    seatLayout.rightRival,
  ].find((seat) => seat.seatId === currentTurnSeatId);
  const currentTurnLabel = currentSeat
    ? currentSeat.isMine
      ? 'Sua vez'
      : currentSeat.isBot
        ? `Bot em turno · ${currentSeat.seatId}`
        : resolveSeatTeamId(currentSeat.seatId) === resolveSeatTeamId(seatLayout.self.seatId)
          ? `Parceiro em turno · ${currentSeat.seatId}`
          : `Rival em turno · ${currentSeat.seatId}`
    : 'Aguardando turno';

  return (
    <div className="pointer-events-none absolute inset-0 z-[26] hidden xl:block">
      <div className="absolute left-5 top-[44%] -translate-y-1/2">
        <TableSeatCluster
          seat={seatLayout.leftRival}
          role="rival"
          position="left"
          sourceRef={(element) => onSeatSourceElementChange(seatLayout.leftRival.seatId, element)}
        />
      </div>

      <div className="absolute right-5 top-[44%] -translate-y-1/2">
        <TableSeatCluster
          seat={seatLayout.rightRival}
          role="rival"
          position="right"
          sourceRef={(element) => onSeatSourceElementChange(seatLayout.rightRival.seatId, element)}
        />
      </div>

      <div className="absolute bottom-[112px] left-1/2 -translate-x-1/2">
        <TableSeatCluster
          seat={seatLayout.self}
          role="self"
          position="bottom"
          sourceRef={(element) => onSeatSourceElementChange(seatLayout.self.seatId, element)}
        />
      </div>

      <div
        className="absolute left-1/2 top-[112px] min-w-[176px] -translate-x-1/2 rounded-full px-3 py-2 text-center backdrop-blur-xl"
        style={{
          background: 'linear-gradient(180deg, rgba(8,13,16,0.82), rgba(5,8,10,0.68))',
          border: '1px solid rgba(201,168,76,0.15)',
          boxShadow: '0 14px 30px rgba(0,0,0,0.22)',
        }}
      >
        <div className="text-[8px] font-black uppercase tracking-[0.22em] text-amber-200/52">
          Mesa 2v2
        </div>
        <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#f0e6d3]">
          {currentTurnLabel}
        </div>
      </div>
    </div>
  );
}

// Structural 2v2 table: each seat owns a source anchor and a dedicated played-card slot.
function TwoVersusTwoQuadrant({
  seatLayout,
  seatPlayedCards,
  seatsCoveredByFlight,
  cardsRemainingBySeat,
  botDialogues,
  onSeatSourceElementChange,
  onPartnerSlotRef,
  onLeftRivalSlotRef,
  onRightRivalSlotRef,
  onMySlotRef,
  seatOutcomes,
  roundVerdict,
  isRoundVerdictOpen,
  isRoundClashOpen,
  isResolutionSceneActive,
}: {
  seatLayout: TwoVersusTwoSeatLayout | null;
  seatPlayedCards: Record<string, string | null>;
  cardsRemainingBySeat: Record<string, number>;
  botDialogues: Record<string, BotDialogueActiveSpeech | undefined>;
  seatsCoveredByFlight: Record<string, boolean>;
  onSeatSourceElementChange: (seatId: string, element: HTMLDivElement | null) => void;
  onPartnerSlotRef: (element: HTMLDivElement | null) => void;
  onLeftRivalSlotRef: (element: HTMLDivElement | null) => void;
  onRightRivalSlotRef: (element: HTMLDivElement | null) => void;
  onMySlotRef: (element: HTMLDivElement | null) => void;
  seatOutcomes: Record<string, SlotRoundOutcome>;
  roundVerdict: TwoVersusTwoVerdict | null;
  isRoundVerdictOpen: boolean;
  isRoundClashOpen: boolean;
  isResolutionSceneActive: boolean;
}) {
  if (!seatLayout) {
    return <div className="flex w-full items-center justify-center py-6" />;
  }

  const partnerCard = seatPlayedCards[seatLayout.partner.seatId] ?? null;
  const leftRivalCard = seatPlayedCards[seatLayout.leftRival.seatId] ?? null;
  const rightRivalCard = seatPlayedCards[seatLayout.rightRival.seatId] ?? null;
  const myCard = seatPlayedCards[seatLayout.self.seatId] ?? null;

  const isPartnerCovered = Boolean(seatsCoveredByFlight[seatLayout.partner.seatId]);
  const isLeftRivalCovered = Boolean(seatsCoveredByFlight[seatLayout.leftRival.seatId]);
  const isRightRivalCovered = Boolean(seatsCoveredByFlight[seatLayout.rightRival.seatId]);
  const isMyCovered = Boolean(seatsCoveredByFlight[seatLayout.self.seatId]);
  const partnerOutcome = seatOutcomes[seatLayout.partner.seatId] ?? null;
  const leftRivalOutcome = seatOutcomes[seatLayout.leftRival.seatId] ?? null;
  const rightRivalOutcome = seatOutcomes[seatLayout.rightRival.seatId] ?? null;
  const myOutcome = seatOutcomes[seatLayout.self.seatId] ?? null;
  const viewerTeamOutcome = toDirectRoundOutcome(myOutcome);
  const heroSeatId =
    Object.entries(seatOutcomes).find(([, outcome]) => outcome === 'win')?.[0] ?? null;
  const clashOutcome: DirectRoundOutcome = heroSeatId !== null ? 'win' : viewerTeamOutcome;
  const roundClashKey = [
    roundVerdict?.title ?? 'no-title',
    roundVerdict?.subtitle ?? 'no-subtitle',
    heroSeatId ?? 'no-hero',
    partnerCard ?? 'empty',
    leftRivalCard ?? 'empty',
    rightRivalCard ?? 'empty',
    myCard ?? 'empty',
  ].join('|');
  const roundClashAnchors = [
    {
      seatId: seatLayout.partner.seatId,
      position: 'top' as const,
      outcome: partnerOutcome,
    },
    {
      seatId: seatLayout.leftRival.seatId,
      position: 'left' as const,
      outcome: leftRivalOutcome,
    },
    {
      seatId: seatLayout.rightRival.seatId,
      position: 'right' as const,
      outcome: rightRivalOutcome,
    },
    {
      seatId: seatLayout.self.seatId,
      position: 'bottom' as const,
      outcome: myOutcome,
    },
  ].flatMap<RoundClashAnchor>((entry) => {
    if (entry.outcome === null) {
      return [];
    }

    const anchor = ROUND_CLASH_ANCHOR_BY_POSITION[entry.position];

    return [
      {
        id: entry.seatId,
        x: anchor.x,
        y: anchor.y,
        tone: ROUND_CLASH_TONE_BY_OUTCOME[entry.outcome],
      },
    ];
  });

  // The impact pulse is a pre-verdict beat; it should not compete with the resolution scene.
  const allFourLanded =
    isVisibleSeatCard(partnerCard) &&
    isVisibleSeatCard(leftRivalCard) &&
    isVisibleSeatCard(rightRivalCard) &&
    isVisibleSeatCard(myCard) &&
    !isPartnerCovered &&
    !isLeftRivalCovered &&
    !isRightRivalCovered &&
    !isMyCovered &&
    !isResolutionSceneActive;
  const feltPulseKey = `${partnerCard ?? ''}|${leftRivalCard ?? ''}|${rightRivalCard ?? ''}|${myCard ?? ''}`;

  const verdictAccent =
    roundVerdict?.tone === 'mine'
      ? 'rgba(74,222,128,0.52)'
      : roundVerdict?.tone === 'rival'
        ? 'rgba(248,113,113,0.48)'
        : 'rgba(201,168,76,0.46)';

  const verdictAccentSoft =
    roundVerdict?.tone === 'mine'
      ? 'rgba(45,106,79,0.22)'
      : roundVerdict?.tone === 'rival'
        ? 'rgba(127,29,29,0.22)'
        : 'rgba(201,168,76,0.16)';

  const verdictBadgeLabel =
    roundVerdict?.tone === 'mine' ? 'NÓS' : roundVerdict?.tone === 'rival' ? 'ELES' : 'VAZA';

  return (
    <div className="relative flex w-full flex-1 flex-col items-center justify-center gap-y-0 py-0 sm:gap-y-1">
      <AnimatePresence>
        {allFourLanded ? <FeltImpactPulse key={`felt-pulse-${feltPulseKey}`} isActive /> : null}
      </AnimatePresence>
      <RoundClashEffects
        outcome={clashOutcome}
        clashKey={roundClashKey}
        isOpen={isRoundClashOpen && clashOutcome !== null}
        variant="card-anchor"
        anchors={roundClashAnchors}
      />

      <div className="pointer-events-none absolute inset-0 z-[46]">
        <div className="absolute left-1/2 top-[24px] translate-x-[118px] sm:translate-x-[132px] xl:translate-x-[146px]">
          <BotSpeechBubble
            text={botDialogues[seatLayout.partner.seatId]?.text ?? null}
            relationship="partner"
            placement="partner-right"
            event={botDialogues[seatLayout.partner.seatId]?.event ?? null}
          />
        </div>

        <div className="absolute left-[22%] top-[37%] -translate-x-1/2">
          <BotSpeechBubble
            text={botDialogues[seatLayout.leftRival.seatId]?.text ?? null}
            relationship="rival"
            placement="card-above"
            event={botDialogues[seatLayout.leftRival.seatId]?.event ?? null}
          />
        </div>

        <div className="absolute right-[22%] top-[37%] translate-x-1/2">
          <BotSpeechBubble
            text={botDialogues[seatLayout.rightRival.seatId]?.text ?? null}
            relationship="rival"
            placement="card-above"
            event={botDialogues[seatLayout.rightRival.seatId]?.event ?? null}
          />
        </div>
      </div>

      <div className="relative z-[12] -mb-7 flex w-full -translate-y-4 scale-[0.78] justify-center sm:-mb-4 sm:-translate-y-5 sm:scale-100 xl:-translate-y-6">
        <SeatNamePlate2v2
          seat={seatLayout.partner}
          role="partner"
          orientation="top"
          sourceRef={(element) => onSeatSourceElementChange(seatLayout.partner.seatId, element)}
          cardsRemaining={cardsRemainingBySeat[seatLayout.partner.seatId] ?? 3}
        />
      </div>

      <div
        ref={onPartnerSlotRef}
        className="relative mb-0 mt-0 flex h-[54px] w-[64px] items-center justify-center sm:mb-2 sm:mt-6 sm:h-[88px] sm:w-[104px]"
      >
        <div className="relative flex h-[82px] w-[58px] items-center justify-center sm:h-[128px] sm:w-[90px]">
          <RadialPlayedCard
            card={partnerCard}
            position="top"
            isCoveredByFlight={isPartnerCovered}
            outcome={partnerOutcome}
          />
        </div>
      </div>

      <div className="grid w-full max-w-full grid-cols-[minmax(0,1fr)_42px_minmax(0,1fr)] items-center gap-x-0 gap-y-0 lg:max-w-[1280px] lg:grid-cols-[1fr_auto_1fr] lg:gap-x-4 lg:gap-y-2 2xl:gap-x-8">
        <div className="flex translate-x-0 flex-col items-center justify-start gap-0 pl-0 lg:flex-row lg:items-center lg:gap-5 lg:translate-x-16 xl:translate-x-24">
          <SeatNamePlate2v2
            seat={seatLayout.leftRival}
            role="rival"
            orientation="left"
            sourceRef={(element) => onSeatSourceElementChange(seatLayout.leftRival.seatId, element)}
            cardsRemaining={cardsRemainingBySeat[seatLayout.leftRival.seatId] ?? 3}
          />
          <div
            ref={onLeftRivalSlotRef}
            className="relative flex h-[72px] w-[56px] shrink-0 translate-x-0 items-center justify-center sm:h-[96px] sm:w-[72px] lg:h-[138px] lg:w-[108px] lg:translate-x-16 xl:translate-x-24"
          >
            <div className="relative flex h-[82px] w-[58px] items-center justify-center sm:h-[128px] sm:w-[90px]">
              <RadialPlayedCard
                card={leftRivalCard}
                position="left"
                isCoveredByFlight={isLeftRivalCovered}
                outcome={leftRivalOutcome}
              />
            </div>
          </div>
        </div>

        <div
          className="relative flex h-[72px] w-[42px] items-center justify-center sm:h-[96px] sm:w-[56px] lg:h-[138px] lg:w-[80px]"
          aria-hidden
        >
          <motion.div
            className="absolute h-[120px] w-[120px] rounded-full"
            animate={{
              opacity: isResolutionSceneActive ? 0 : 0.55,
              scale: isResolutionSceneActive ? 0.94 : 1,
            }}
            transition={{ duration: 0.36, ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              background:
                'radial-gradient(circle, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.06) 38%, transparent 72%)',
              filter: 'blur(14px)',
            }}
          />
        </div>

        <div className="flex translate-x-0 flex-col-reverse items-center justify-end gap-0 pr-0 lg:flex-row lg:items-center lg:gap-5 lg:-translate-x-16 xl:-translate-x-24">
          <div
            ref={onRightRivalSlotRef}
            className="relative flex h-[72px] w-[56px] shrink-0 translate-x-0 items-center justify-center sm:h-[96px] sm:w-[72px] lg:h-[138px] lg:w-[108px] lg:-translate-x-16 xl:-translate-x-24"
          >
            <div className="relative flex h-[82px] w-[58px] items-center justify-center sm:h-[128px] sm:w-[90px]">
              <RadialPlayedCard
                card={rightRivalCard}
                position="right"
                isCoveredByFlight={isRightRivalCovered}
                outcome={rightRivalOutcome}
              />
            </div>
          </div>
          <SeatNamePlate2v2
            seat={seatLayout.rightRival}
            role="rival"
            orientation="right"
            sourceRef={(element) =>
              onSeatSourceElementChange(seatLayout.rightRival.seatId, element)
            }
            cardsRemaining={cardsRemainingBySeat[seatLayout.rightRival.seatId] ?? 3}
          />
        </div>
      </div>

      <div
        ref={onMySlotRef}
        className="relative -mt-1 flex h-[58px] w-[64px] items-center justify-center sm:mt-2 sm:h-[112px] sm:w-[104px]"
      >
        <RadialPlayedCard
          card={myCard}
          position="bottom"
          isCoveredByFlight={isMyCovered}
          outcome={myOutcome}
        />
      </div>

      <AnimatePresence>
        {isRoundVerdictOpen && roundVerdict ? (
          <TwoVersusTwoRoundVerdictPlaque
            key={`two-vs-two-verdict-${roundVerdict.title}-${roundVerdict.subtitle ?? 'no-sub'}`}
            verdict={roundVerdict}
            outcome={viewerTeamOutcome}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function FeltImpactPulse({ isActive }: { isActive: boolean }) {
  if (!isActive) {
    return null;
  }

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.85, 0] }}
      transition={{ duration: 1.1, ease: [0.2, 0.9, 0.24, 1] }}
    >
      <motion.div
        className="absolute rounded-full"
        initial={{ width: 60, height: 60, opacity: 0.0 }}
        animate={{
          width: [60, 280, 360],
          height: [60, 280, 360],
          opacity: [0.0, 0.55, 0.0],
        }}
        transition={{ duration: 0.95, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          background:
            'radial-gradient(circle, rgba(255,223,128,0.32) 0%, rgba(201,168,76,0.18) 38%, rgba(8,12,10,0) 70%)',
          filter: 'blur(4px)',
          boxShadow: '0 0 36px rgba(255,223,128,0.18)',
        }}
      />

      <motion.div
        className="absolute rounded-full"
        initial={{ width: 80, height: 80, opacity: 0.0 }}
        animate={{
          width: [80, 420, 540],
          height: [80, 420, 540],
          opacity: [0.0, 0.22, 0.0],
        }}
        transition={{ duration: 1.05, ease: [0.2, 0.9, 0.24, 1], delay: 0.05 }}
        style={{
          border: '1px solid rgba(255,223,128,0.34)',
          background: 'transparent',
        }}
      />
    </motion.div>
  );
}

function RadialPlayedCard({
  card,
  position,
  isCoveredByFlight = false,
  outcome = null,
  partnerSide = 'neutral',
}: {
  card: string | null;
  position: RadialSlotPosition;
  isCoveredByFlight?: boolean;
  outcome?: SlotRoundOutcome;
  partnerSide?: 'ours' | 'theirs' | 'neutral';
}) {
  if (!card || card.length < 2 || isCoveredByFlight) {
    return <div aria-hidden className="h-[82px] w-[58px] sm:h-[128px] sm:w-[90px]" />;
  }

  const rank = card.slice(0, card.length - 1);
  const suit = card.slice(-1);
  const isRed = suit === 'C' || suit === 'O';
  const symbol = SUIT_SYMBOL_MAP[suit] ?? '';
  const rotation = ROTATION_BY_RADIAL_POSITION[position];
  const isWinner = outcome === 'win';
  const isTeamWinner = outcome === 'team-win';
  const isLoser = outcome === 'loss';
  const isTie = outcome === 'tie';

  const isRivalWinner = partnerSide === 'theirs' && (isWinner || isTeamWinner);

  const outcomeLabel = isWinner
    ? 'VENCEU'
    : isTeamWinner
      ? 'DUPLA'
      : isLoser
        ? 'PERDEU'
        : isTie
          ? 'EMPATE'
          : null;

  const badgeVisuals = isWinner
    ? {
        background: isRivalWinner
          ? 'linear-gradient(135deg, #fff1b8 0%, #f2d488 40%, #d9a441 76%, #5c250f 100%)'
          : 'linear-gradient(135deg, #fff1b8 0%, #f2d488 40%, #c9a84c 76%, #6f4f14 100%)',
        border: '1px solid rgba(255,241,184,0.92)',
        color: '#160f03',
        shadow: isRivalWinner
          ? '0 8px 18px rgba(0,0,0,0.42), 0 0 18px rgba(242,212,136,0.42), 0 0 12px rgba(248,113,113,0.16)'
          : '0 8px 18px rgba(0,0,0,0.42), 0 0 24px rgba(242,212,136,0.58)',
      }
    : isTeamWinner
      ? {
          background: 'linear-gradient(135deg, #fff7d8 0%, #ecd48f 42%, #c39c43 78%, #6b5320 100%)',
          border: '1px solid rgba(255,236,177,0.76)',
          color: '#2a1903',
          shadow: '0 7px 14px rgba(0,0,0,0.32), 0 0 14px rgba(201,168,76,0.24)',
        }
      : isLoser
        ? {
            background:
              'linear-gradient(135deg, rgba(56,20,20,0.96) 0%, rgba(71,25,25,0.96) 52%, rgba(22,10,10,0.98) 100%)',
            border: '1px solid rgba(248,113,113,0.22)',
            color: 'rgba(255,232,224,0.68)',
            shadow: '0 7px 13px rgba(0,0,0,0.30), 0 0 10px rgba(127,29,29,0.14)',
          }
        : isTie
          ? {
              background:
                'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 42%, #64748b 78%, #334155 100%)',
              border: '1px solid rgba(226,232,240,0.82)',
              color: '#0f172a',
              shadow: '0 8px 16px rgba(0,0,0,0.36), 0 0 16px rgba(148,163,184,0.34)',
            }
          : null;

  const badgePositionClass =
    position === 'top'
      ? 'left-1/2 top-[-20px] -translate-x-1/2'
      : position === 'bottom'
        ? 'left-1/2 top-[-16px] -translate-x-1/2'
        : 'left-1/2 top-[-22px] -translate-x-1/2';

  const winnerAura =
    isWinner || isTeamWinner
      ? isRivalWinner
        ? {
            core: 'rgba(242,212,136,0.36)',
            outer: 'rgba(248,113,113,0.10)',
            border: 'rgba(255,223,128,0.58)',
          }
        : {
            core: 'rgba(255,230,150,0.44)',
            outer: 'rgba(201,168,76,0.18)',
            border: 'rgba(255,223,128,0.72)',
          }
      : null;

  return (
    <motion.div
      initial={{ scale: 0.74, opacity: 0, rotate: rotation - 5, y: -18 }}
      animate={{
        scale: isWinner
          ? [0.9, 1.08, 1]
          : isTeamWinner
            ? [0.9, 1.02, 0.97]
            : isLoser
              ? [0.9, 0.94, 0.92]
              : [0.74, 0.96, 0.96],
        opacity: isLoser ? 0.52 : isTeamWinner ? 0.96 : 1,
        rotate: isWinner
          ? [rotation, rotation + 1.2, rotation]
          : isLoser
            ? rotation + (rotation >= 0 ? -2.2 : 2.2)
            : rotation,
        y: isWinner ? [0, -6, 0] : isTeamWinner ? [0, -3, 0] : isLoser ? [0, 4, 0] : 0,
        filter: isLoser
          ? 'saturate(0.50) brightness(0.82)'
          : isWinner
            ? 'saturate(1.05) brightness(1.04)'
            : 'saturate(1) brightness(1)',
      }}
      transition={{
        duration: isWinner ? 0.82 : isTeamWinner ? 0.5 : 0.4,
        ease: [0.2, 0.9, 0.24, 1],
      }}
      className="relative h-[82px] w-[58px] rounded-[10px] bg-[#fdf6e3] shadow-[0_12px_24px_rgba(0,0,0,0.42),inset_0_0_0_1px_rgba(0,0,0,0.04)] sm:h-[128px] sm:w-[90px] sm:rounded-[14px]"
      style={{
        color: isRed ? '#c0392b' : '#1a1a2e',
        fontFamily: 'Georgia, serif',
        transformOrigin: '50% 50%',
        zIndex: isWinner ? 28 : isTeamWinner ? 16 : isLoser ? 1 : 2,
        border: isWinner
          ? `1px solid ${winnerAura?.border ?? 'rgba(255,223,128,0.92)'}`
          : isTeamWinner
            ? '1px solid rgba(232,199,106,0.56)'
            : isTie
              ? '1px solid rgba(226,232,240,0.62)'
              : isLoser
                ? '1px solid rgba(80,80,80,0.20)'
                : '1px solid rgba(0,0,0,0.08)',
        boxShadow: isWinner
          ? isRivalWinner
            ? '0 0 0 2px rgba(255,223,128,0.42), 0 0 28px rgba(242,212,136,0.34), 0 0 16px rgba(248,113,113,0.10), 0 26px 46px rgba(0,0,0,0.50)'
            : '0 0 0 2px rgba(255,223,128,0.62), 0 0 36px rgba(201,168,76,0.46), 0 28px 52px rgba(0,0,0,0.52)'
          : isTeamWinner
            ? '0 0 0 1px rgba(232,199,106,0.34), 0 0 20px rgba(201,168,76,0.18), 0 14px 28px rgba(0,0,0,0.40)'
            : isLoser
              ? '0 8px 18px rgba(0,0,0,0.42), inset 0 0 0 1px rgba(0,0,0,0.06)'
              : undefined,
      }}
    >
      {winnerAura ? (
        <>
          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-[-1] h-[150px] w-[126px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ opacity: 0, scale: 0.72 }}
            animate={{
              opacity: isWinner ? [0.24, 0.58, 0.36] : [0.14, 0.3, 0.2],
              scale: isWinner ? [0.82, 1.22, 1.04] : [0.84, 1.06, 0.98],
            }}
            transition={{
              duration: isWinner ? 0.92 : 0.72,
              ease: [0.2, 0.9, 0.24, 1],
            }}
            style={{
              background: `radial-gradient(circle at 50% 48%, ${winnerAura.core} 0%, ${winnerAura.outer} 45%, transparent 76%)`,
              filter: 'blur(18px)',
            }}
          />

          <motion.div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 z-[-1] h-[168px] w-[168px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ opacity: 0, scale: 0.42, rotate: rotation }}
            animate={{
              opacity: isWinner ? [0, 0.28, 0] : [0, 0.12, 0],
              scale: isWinner ? [0.48, 1.08, 1.26] : [0.44, 0.86, 1],
              rotate: rotation + 12,
            }}
            transition={{
              duration: isWinner ? 0.78 : 0.58,
              ease: [0.2, 0.9, 0.24, 1],
            }}
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgba(255,223,128,0.0) 22deg, rgba(255,223,128,0.32) 26deg, transparent 31deg, transparent 78deg, rgba(255,223,128,0.22) 83deg, transparent 90deg, transparent 142deg, rgba(255,223,128,0.26) 148deg, transparent 155deg, transparent 216deg, rgba(255,223,128,0.22) 222deg, transparent 230deg, transparent 292deg, rgba(255,223,128,0.24) 298deg, transparent 306deg, transparent 360deg)',
              filter: 'blur(0.8px)',
            }}
          />
        </>
      ) : null}

      {isLoser ? (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -inset-3 z-[-1] rounded-[24px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.42 }}
          transition={{ duration: 0.38, delay: LOSER_DIM_DELAY_MS / 1000 }}
          style={{
            background:
              'radial-gradient(circle at 50% 48%, rgba(127,29,29,0.18) 0%, rgba(69,10,10,0.08) 48%, transparent 78%)',
            filter: 'blur(12px)',
          }}
        />
      ) : null}

      <div className="absolute left-2 top-1.5 flex flex-col items-center leading-none">
        <span className="text-[15px] font-black">{rank}</span>
        <span className="text-[12px] leading-none">{symbol}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[32px] leading-none">{symbol}</span>
      </div>

      <div className="absolute bottom-1.5 right-2 flex rotate-180 flex-col items-center leading-none">
        <span className="text-[15px] font-black">{rank}</span>
        <span className="text-[12px] leading-none">{symbol}</span>
      </div>

      {outcomeLabel && badgeVisuals ? (
        <motion.div
          aria-hidden
          className={`pointer-events-none absolute z-30 rounded-full px-3 py-1.5 ${badgePositionClass}`}
          initial={{ opacity: 0, scale: 0.76, y: 8, rotate: isLoser ? -5 : 5 }}
          animate={{
            opacity: 1,
            scale: isWinner ? [0.86, 1.1, 1] : [0.86, 1.05, 0.98],
            y: 0,
            rotate: isLoser ? -3 : 4,
          }}
          transition={{
            duration: 0.42,
            delay: SETTLED_OUTCOME_BADGE_DELAY_MS / 1000,
            times: [0, 0.58, 1],
            ease: [0.2, 0.9, 0.24, 1],
          }}
          style={{
            background: badgeVisuals.background,
            border: badgeVisuals.border,
            boxShadow: badgeVisuals.shadow,
          }}
        >
          <span
            className="relative z-10 text-[9px] font-black uppercase leading-none tracking-[0.18em]"
            style={{ color: badgeVisuals.color, fontFamily: 'Georgia, serif' }}
          >
            {outcomeLabel}
          </span>
        </motion.div>
      ) : null}
    </motion.div>
  );
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
  const resolvedOutcomeBadgeLabel =
    outcomeBadgeLabel ??
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
          ? {
              y: [-1, -4, -2],
              rotate: [0, 0.35, 0],
              scale: [1.01, 1.035, 1.02],
            }
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
          initial={{
            opacity: 0,
            scale: 0.74,
            y: 8,
            rotate: outcomeBadge === 'loss' ? -8 : 8,
          }}
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

function OpponentCluster({
  seat,
  cardsRemaining,
  isOpponent,
  presenceLine = null,
  presenceQuote = null,
  presenceTone = 'idle',
}: {
  seat: TableSeatView;
  cardsRemaining: number;
  isOpponent: boolean;
  presenceLine?: string | null;
  presenceQuote?: string | null;
  presenceTone?: BotPresenceTone;
}) {
  const safeCount = Math.max(0, Math.min(3, cardsRemaining));
  const cardIndices = Array.from({ length: safeCount }, (_, index) => index);

  const isCurrentTurn = seat.isCurrentTurn;
  const displayName = seat.isMine
    ? 'Você'
    : seat.isBot
      ? (seat.botIdentity?.displayName ?? 'Bot')
      : (seat.publicName ?? seat.displayName ?? seat.seatId);
  const avatar = resolveSeatAvatar(seat, displayName);
  const presenceVisuals = getBotPresenceVisuals(presenceTone);
  const shouldShowPresenceLine = presenceLine !== null;
  const shouldShowPresenceQuote = presenceQuote !== null;
  const shouldPulsePresence = presenceTone !== 'idle';
  const statusLabel = shouldShowPresenceLine ? presenceLine : null;

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
          transition={{
            duration: 1.1,
            repeat: shouldPulsePresence ? Infinity : 0,
          }}
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
            key={
              String(presenceTone) +
              '-' +
              String(statusLabel ?? 'profile') +
              '-' +
              String(presenceQuote ?? 'no-quote')
            }
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
                style={{
                  color: presenceVisuals.text,
                  fontFamily: 'Georgia, serif',
                }}
              >
                “{presenceQuote}”
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex min-h-[64px] items-center gap-2">
        <AnimatePresence initial={false}>
          {cardIndices.map((index) => (
            <motion.div
              key={`opponent-card-${index}`}
              layout="position"
              initial={{
                opacity: 0,
                y: -8,
                rotate: index === 0 ? -5 : index === 2 ? 5 : 0,
              }}
              animate={{
                opacity: 1,
                y: 0,
                rotate: index === 0 ? -5 : index === 2 ? 5 : 0,
              }}
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
          filter: 'blur(8px)',
        }}
      />
    </div>
  );
}

function ViraCard({
  rank,
  suit,
  compact = false,
  revealKey,
  revealActive = false,
}: {
  rank: string;
  suit: string;
  compact?: boolean;
  revealKey?: string;
  revealActive?: boolean;
}) {
  return (
    <motion.div
      key={revealKey ?? `${rank}-${suit}`}
      className={`relative flex flex-col items-center ${compact ? 'gap-1' : 'gap-1.5'}`}
      initial={
        revealActive
          ? {
              opacity: 0,
              y: compact ? -14 : -20,
              rotateY: -88,
              scale: compact ? 0.86 : 0.82,
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
          className={`pointer-events-none absolute ${compact ? '-inset-5' : '-inset-7'} rounded-[30px]`}
          initial={{ opacity: 0, scale: 0.74 }}
          animate={{ opacity: [0, 0.52, 0], scale: [0.74, 1.12, 1.22] }}
          transition={{ duration: 0.9, delay: 0.36, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            background:
              'radial-gradient(circle, rgba(255,241,184,0.36) 0%, rgba(232,199,106,0.18) 38%, transparent 72%)',
            filter: 'blur(6px)',
          }}
        />
      ) : null}

      <span
        className={`${compact ? 'text-[9px]' : 'text-[11px]'} font-bold tracking-[0.28em]`}
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
          className={`pointer-events-none absolute ${compact ? '-inset-[4px]' : '-inset-[6px]'} rounded-[24px]`}
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
          <CardShape rank={rank} suit={suit} highlight compact={compact} />

          <div
            aria-hidden
            className={`pointer-events-none absolute ${compact ? '-right-1.5 -top-1.5 h-6 w-6' : '-right-2 -top-2 h-7 w-7'} z-20 flex items-center justify-center rounded-full`}
            style={{
              background:
                'radial-gradient(circle at 35% 30%, #f2d488 0%, #c9a84c 58%, #7b5a1d 100%)',
              border: '1px solid rgba(255,223,128,0.76)',
              boxShadow:
                '0 4px 12px rgba(0,0,0,0.42), 0 0 12px rgba(201,168,76,0.38), inset 0 1px 0 rgba(255,255,255,0.38)',
              fontFamily: 'Georgia, serif',
              color: '#1a1204',
              fontWeight: 900,
              fontSize: compact ? 10 : 12,
              letterSpacing: '0.02em',
            }}
          >
            V
          </div>
        </div>
      </div>

      <motion.span
        className={`${compact ? 'text-[7px]' : 'text-[8px]'} font-bold uppercase tracking-[0.28em]`}
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
  isOneVsOne,
}: {
  currentValue: number;
  valeTier: ValeTier;
  stateLabel: string;
  stateAccent: 'neutral' | 'pressure' | 'escalate' | 'win' | 'loss';
  isOneVsOne: boolean;
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
    <div
      className={`flex shrink-0 flex-col gap-3 ${isOneVsOne ? 'w-[108px] self-center' : 'w-[96px] self-start pt-3'}`}
    >
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
  isOneVsOne,
}: {
  scoreT1: number;
  scoreT2: number;
  rounds: { result: string | null; finished: boolean }[];
  isOneVsOne: boolean;
}) {
  const maxChips = 3;
  const chips = Array.from({ length: maxChips }, (_, index) => rounds[index] ?? null);
  const playedCount = rounds.filter((round) => round.finished).length;

  const t1Leading = scoreT1 > scoreT2;
  const t2Leading = scoreT2 > scoreT1;

  return (
    <div
      className={`flex shrink-0 flex-col items-end gap-3 ${isOneVsOne ? 'w-[124px] self-center' : 'w-[106px] self-start pt-3'}`}
    >
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
          style={{
            color: 'rgba(232,213,160,0.26)',
            fontFamily: 'Georgia, serif',
          }}
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
                    transition={{
                      duration: 0.46,
                      delay: LOSER_DIM_DELAY_MS / 1000,
                    }}
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
              <div aria-hidden className="h-[162px] w-[116px]" />
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
  isBetDramaActive = false,
  isSurfaceLocked = false,
  betState,
  currentValue,
  pendingValue,
  requestedByMe,
  teamBetDecision = null,
  partnerAdvice = null,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
  isBetDramaActive?: boolean;
  isSurfaceLocked?: boolean;
  betState: string;
  currentValue: number;
  pendingValue: number | null;
  requestedByMe: boolean;
  teamBetDecision?: NonNullable<MatchStatePayload['currentHand']>['teamBetDecision'];
  partnerAdvice?: NonNullable<MatchStatePayload['currentHand']>['partnerAdvice'];
}) {
  const canAccept = availableActions.canAcceptBet || availableActions.canAcceptMaoDeOnze;
  const canDecline = availableActions.canDeclineBet || availableActions.canDeclineMaoDeOnze;
  // Betting authority can differ from card turn in 2v2, so this surface trusts availableActions.
  const canRaise =
    availableActions.canRaiseToSix ||
    availableActions.canRaiseToNine ||
    availableActions.canRaiseToTwelve;
  const canTruco = availableActions.canRequestTruco;

  // The drama overlay is visual; mandatory bet responses must remain clickable.
  const hardInteractionLocked = isSurfaceLocked;

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

  // Pending bet decisions take priority over optional open betting controls.
  const isDecideMode = canAccept || canDecline;
  const isWaitingMode = !isDecideMode && betState === 'awaiting_response';
  const isOpenMode = !isDecideMode && !isWaitingMode && (canTruco || canRaise);
  const actionValue = pendingValue ?? currentValue;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const declineConfirmationAutoWarnSeconds = 5;

  useEffect(() => {
    if (!teamBetDecision?.expiresAt) {
      return;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => window.clearInterval(interval);
  }, [teamBetDecision?.expiresAt]);

  useEffect(() => {
    setConfirmingDecline(false);
  }, [partnerAdvice?.action, teamBetDecision?.decisionId]);

  const decisionExpiresAtMs = teamBetDecision?.expiresAt
    ? Date.parse(teamBetDecision.expiresAt)
    : Number.NaN;
  const remainingSeconds = Number.isFinite(decisionExpiresAtMs)
    ? Math.max(0, Math.ceil((decisionExpiresAtMs - nowMs) / 1000))
    : null;
  const shouldConfirmDeclineAgainstAdvice = Boolean(
    partnerAdvice && partnerAdvice.action !== 'decline' && availableActions.canDeclineBet,
  );
  const declineConfirmationLabel =
    partnerAdvice?.action === 'raise' ? 'Parceiro quer pressionar.' : 'Parceiro recomenda pagar.';
  const isDeclineConfirmationActive = Boolean(
    shouldConfirmDeclineAgainstAdvice &&
    (confirmingDecline ||
      (remainingSeconds !== null && remainingSeconds <= declineConfirmationAutoWarnSeconds)),
  );
  const partnerAdviceLabel = partnerAdvice?.label ?? 'Parceiro pensando...';

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
  };

  const acceptStyle = {
    background: 'linear-gradient(180deg, #fff1b8 0%, #d6ae4a 46%, #725116 100%)',
    border: '1px solid rgba(255,241,184,0.76)',
    color: '#1d1203',
    textShadow: '0 1px 0 rgba(255,255,255,0.30)',
    boxShadow:
      '0 0 24px rgba(242,212,136,0.36), inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -3px 0 rgba(78,46,8,0.55), 0 14px 24px rgba(0,0,0,0.42)',
  };

  const declineStyle = {
    background: 'linear-gradient(180deg, #302126 0%, #171217 54%, #08080b 100%)',
    border: '1px solid rgba(190,92,92,0.46)',
    color: '#f1d6cf',
    textShadow: '0 1px 0 rgba(0,0,0,0.62), 0 0 10px rgba(248,113,113,0.16)',
    boxShadow:
      '0 0 14px rgba(127,29,29,0.16), inset 0 1px 0 rgba(255,230,210,0.08), inset 0 -2px 0 rgba(0,0,0,0.52), 0 12px 22px rgba(0,0,0,0.38)',
  };

  const raiseStyle = {
    background: 'linear-gradient(180deg, #d79a36 0%, #9b5b13 50%, #3f2407 100%)',
    border: '1px solid rgba(255,210,124,0.72)',
    color: '#fff1cc',
    textShadow: '0 1px 0 rgba(0,0,0,0.62), 0 0 14px rgba(251,191,36,0.32)',
    boxShadow:
      '0 0 22px rgba(245,158,11,0.34), inset 0 1px 0 rgba(255,234,179,0.30), inset 0 -2px 0 rgba(0,0,0,0.50), 0 13px 24px rgba(0,0,0,0.42)',
  };

  const waitingStyle = {
    background: 'linear-gradient(180deg, rgba(29,35,31,0.96) 0%, rgba(12,17,15,0.94) 100%)',
    border: '1px solid rgba(232,213,160,0.24)',
    color: 'rgba(232,213,160,0.66)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 20px rgba(0,0,0,0.30)',
    cursor: 'default' as const,
  };

  const renderChip = (
    label: string,
    onClick: (() => void) | null,
    style: Record<string, unknown>,
    key: string,
  ) => {
    const clickable = onClick !== null && !hardInteractionLocked;

    return (
      <motion.button
        key={key}
        type="button"
        onClick={clickable ? onClick : undefined}
        disabled={!clickable}
        whileHover={clickable ? { y: -2, scale: 1.035 } : {}}
        whileTap={clickable ? { y: 0, scale: 0.97 } : {}}
        className="relative overflow-hidden"
        style={{
          ...chipBase,
          ...style,
          cursor: clickable ? 'pointer' : ((style.cursor as string | undefined) ?? 'default'),
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
        <span className="relative z-10">{label}</span>
      </motion.button>
    );
  };

  const handleDecisionAction = (action: MatchAction): void => {
    if (
      action === 'decline-bet' &&
      shouldConfirmDeclineAgainstAdvice &&
      !isDeclineConfirmationActive
    ) {
      setConfirmingDecline(true);
      return;
    }

    setConfirmingDecline(false);
    onAction(action);
  };

  if (!isOpenMode && !isDecideMode && !isWaitingMode) {
    return <div aria-hidden style={{ minHeight: 48 }} />;
  }

  if (isWaitingMode && !isBetDramaActive) {
    const label = requestedByMe ? 'Aguardando resposta' : 'Parceiro responde';

    return (
      <motion.div
        className="relative z-10 flex items-center justify-center"
        animate={{
          opacity: hardInteractionLocked ? 0.72 : 1,
          y: hardInteractionLocked ? 4 : 0,
        }}
        transition={{ duration: 0.22 }}
      >
        {renderChip(label, null, waitingStyle, 'waiting')}
      </motion.div>
    );
  }

  if (isWaitingMode) {
    return <div aria-hidden style={{ minHeight: 48 }} />;
  }

  if (isDecideMode) {
    const chips: Array<{
      key: string;
      label: string;
      click: (() => void) | null;
      style: Record<string, unknown>;
    }> = [];

    if (canAccept && acceptAction) {
      chips.push({
        key: 'accept',
        label: availableActions.canAcceptMaoDeOnze ? 'Aceitar Mão 11' : 'Aceitar',
        click: () => handleDecisionAction(acceptAction),
        style: acceptStyle,
      });
    }

    if (canDecline && declineAction) {
      chips.push({
        key: 'decline',
        label: isDeclineConfirmationActive
          ? 'Correr mesmo'
          : availableActions.canDeclineMaoDeOnze
            ? 'Recusar Mão 11'
            : 'Correr',
        click: () => handleDecisionAction(declineAction),
        style: declineStyle,
      });
    }

    if (canRaise && raiseAction) {
      chips.push({
        key: 'raise',
        label: raiseLabel,
        click: () => handleDecisionAction(raiseAction),
        style: raiseStyle,
      });
    }

    return (
      <motion.div
        className="relative z-10 flex items-center justify-center"
        animate={{
          opacity: hardInteractionLocked ? 0.72 : 1,
          y: hardInteractionLocked ? 4 : 0,
          scale: hardInteractionLocked ? 0.985 : 1,
        }}
        transition={{ duration: 0.22 }}
      >
        <div
          className="relative flex w-full max-w-[320px] -translate-y-14 flex-col items-center justify-center gap-2 rounded-[26px] border px-2 py-2 backdrop-blur-xl sm:max-w-none sm:flex-row sm:gap-2.5 sm:px-3 sm:py-2.5 sm:translate-y-0 xl:-translate-x-[330px]"
          style={{
            background:
              'linear-gradient(135deg, rgba(16,12,8,0.94) 0%, rgba(47,25,18,0.88) 48%, rgba(5,7,8,0.96) 100%)',
            borderColor: 'rgba(255,223,128,0.30)',
            boxShadow:
              '0 18px 34px rgba(0,0,0,0.40), 0 0 26px rgba(201,168,76,0.14), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <div
            aria-hidden
            className="absolute inset-x-5 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.62) 50%, transparent 100%)',
            }}
          />

          {teamBetDecision ? (
            <div className="flex max-w-[240px] flex-col items-center gap-1 text-center sm:items-start sm:text-left">
              <span
                className="text-[8px] font-black uppercase tracking-[0.24em]"
                style={{
                  color: 'rgba(255,241,184,0.52)',
                  fontFamily: 'Georgia, serif',
                }}
              >
                Conselho da dupla
              </span>
              <span
                className="text-[11px] font-black uppercase tracking-[0.12em]"
                style={{
                  color: '#fff1b8',
                  fontFamily: 'Georgia, serif',
                  textShadow: '0 0 12px rgba(242,212,136,0.18)',
                }}
              >
                {isDeclineConfirmationActive ? declineConfirmationLabel : partnerAdviceLabel}
              </span>
              {remainingSeconds !== null ? (
                <span
                  className="text-[9px] font-black uppercase tracking-[0.18em]"
                  style={{
                    color:
                      remainingSeconds <= declineConfirmationAutoWarnSeconds
                        ? '#fecaca'
                        : 'rgba(232,213,160,0.70)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                >
                  {remainingSeconds}s para decidir
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="hidden min-w-[96px] flex-col leading-none xl:flex">
            <span
              className="text-[8px] font-black uppercase tracking-[0.26em]"
              style={{
                color: 'rgba(255,241,184,0.54)',
                fontFamily: 'Georgia, serif',
              }}
            >
              Decisão
            </span>
            <span
              className="mt-1.5 text-[11px] font-black uppercase tracking-[0.18em]"
              style={{
                color: '#f2d488',
                fontFamily: 'Georgia, serif',
                textShadow: '0 0 10px rgba(242,212,136,0.22)',
              }}
            >
              Vale {actionValue}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:gap-2.5">
            {chips.map((chip) => renderChip(chip.label, chip.click, chip.style, chip.key))}
          </div>
        </div>
      </motion.div>
    );
  }

  const openChipLabel = canRaise ? raiseLabel : 'Truco!';
  const openChipStyle = canRaise ? raiseStyle : trucoStyle;
  const openChipAction: MatchAction | null = canRaise
    ? raiseAction
    : canTruco
      ? 'request-truco'
      : null;

  return (
    <motion.div
      className="relative z-10 flex items-center justify-center"
      animate={{
        opacity: hardInteractionLocked ? 0.72 : 1,
        y: hardInteractionLocked ? 4 : 0,
        scale: hardInteractionLocked ? 0.985 : 1,
      }}
      transition={{
        duration: 0.22,
      }}
    >
      <motion.div
        className="relative flex items-center justify-center rounded-[24px] border px-2.5 py-2 backdrop-blur-xl"
        animate={
          !canRaise && !hardInteractionLocked
            ? {
                boxShadow: [
                  '0 16px 30px rgba(0,0,0,0.34), 0 0 18px rgba(220,38,38,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
                  '0 20px 38px rgba(0,0,0,0.42), 0 0 28px rgba(220,38,38,0.24), inset 0 1px 0 rgba(255,255,255,0.12)',
                  '0 16px 30px rgba(0,0,0,0.34), 0 0 18px rgba(220,38,38,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
                ],
              }
            : {
                boxShadow:
                  '0 16px 30px rgba(0,0,0,0.36), 0 0 20px rgba(201,168,76,0.14), inset 0 1px 0 rgba(255,255,255,0.08)',
              }
        }
        transition={{
          duration: !canRaise ? 1.7 : 0.22,
          repeat: !canRaise ? Infinity : 0,
          ease: 'easeInOut',
        }}
        style={{
          background:
            'linear-gradient(135deg, rgba(18,14,9,0.92) 0%, rgba(50,34,13,0.84) 52%, rgba(5,7,8,0.96) 100%)',
          borderColor: canRaise ? 'rgba(255,223,128,0.34)' : 'rgba(248,113,113,0.34)',
        }}
      >
        {openChipAction !== null
          ? renderChip(openChipLabel, () => onAction(openChipAction), openChipStyle, 'open')
          : null}
      </motion.div>
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
            'radial-gradient(ellipse 60% 55% at 50% 50%, rgba(2,6,12,0.55) 0%, rgba(2,6,12,0.40) 60%, rgba(2,6,12,0.32) 100%), radial-gradient(circle at 50% 38%, rgba(242,212,136,0.10) 0%, transparent 36%)',
          backdropFilter: 'blur(4px)',
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
                  style={{
                    color: visuals.textColor,
                    fontFamily: 'Georgia, serif',
                  }}
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
      fontSize: '188px',
      letterSpacing: '-0.08em',
      valueColor: 'rgba(236,253,245,0.90)',
      valueShadow: '0 0 20px rgba(74,222,128,0.34), 0 0 44px rgba(45,106,79,0.20)',
      frameBorder: 'rgba(74,222,128,0.18)',
      frameShadow: [
        'inset 0 0 24px rgba(74,222,128,0.08), 0 0 18px rgba(45,106,79,0.06)',
        'inset 0 0 38px rgba(74,222,128,0.14), 0 0 28px rgba(45,106,79,0.10)',
        'inset 0 0 24px rgba(74,222,128,0.08), 0 0 18px rgba(45,106,79,0.06)',
      ],
      glowBackground:
        'radial-gradient(circle, rgba(74,222,128,0.18) 0%, rgba(45,106,79,0.08) 44%, transparent 74%)',
      ambientBackground:
        'radial-gradient(ellipse at 50% 48%, rgba(255,223,128,0.06) 0%, rgba(201,168,76,0.04) 34%, transparent 68%), radial-gradient(ellipse at 88% 54%, rgba(45,106,79,0.10) 0%, transparent 42%)',
      railBackground:
        'linear-gradient(180deg, transparent 0%, rgba(255,223,128,0.34) 44%, rgba(201,168,76,0.26) 64%, transparent 100%)',
      centreWashBackground:
        'radial-gradient(circle, rgba(255,223,128,0.09) 0%, rgba(201,168,76,0.05) 42%, transparent 72%)',
      pulseDuration: 1.72,
      opacity: [0.12, 0.24, 0.14],
    };
  }

  return null;
}

function AcceptedValueTableTension({ isOpen, value }: { isOpen: boolean; value: number }) {
  const visuals = resolveAcceptedValueTensionVisuals(value);

  if (!isOpen || visuals === null) {
    return null;
  }

  // NOTE: Accepted bet watermarks are intentionally separate from pending bet
  // drama. The pending overlay asks for a decision; this layer keeps the felt
  // emotionally aligned with an already accepted value.
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
          className="relative -mt-1 text-center"
          animate={{ opacity: [0.58, 1, 0.58] }}
          transition={{
            duration: visuals.pulseDuration,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          style={{
            color: visuals.valueColor,
            fontFamily: 'Georgia, serif',
            fontSize: '16px',
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

function MaoDeOnzeAcceptedBadge() {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.24, ease: [0.2, 0.9, 0.24, 1] }}
      className="pointer-events-none absolute right-5 top-[112px] z-[46] w-[360px] max-w-[calc(100%-2rem)] md:right-7 md:top-[126px]"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="event-banner-shell event-banner--special relative overflow-hidden px-4 py-3">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-7 top-0 h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.76) 50%, transparent 100%)',
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-36 w-36 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(255,223,128,0.24) 0%, transparent 68%)',
            filter: 'blur(8px)',
          }}
        />

        <div className="relative flex items-center gap-3">
          <motion.span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[17px] font-black"
            initial={{ scale: 0.78, rotate: -8 }}
            animate={{
              scale: [0.78, 1.12, 1],
              rotate: [-8, 4, 0],
            }}
            transition={{ duration: 0.38, ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              background: 'linear-gradient(180deg, #fff1b8 0%, #e8c76a 55%, #8a6420 100%)',
              border: '1px solid rgba(255,241,184,0.74)',
              color: '#1a1200',
              boxShadow: '0 0 18px rgba(255,223,128,0.28), inset 0 1px 0 rgba(255,255,255,0.30)',
              fontFamily: 'Georgia, serif',
            }}
          >
            ✓
          </motion.span>

          <span className="min-w-0 flex-1 leading-none">
            <span className="event-banner-kicker block text-[9px] font-black uppercase tracking-[0.28em]">
              Queda ativa
            </span>

            <span className="event-banner-title mt-1 block text-[17px] font-black uppercase leading-none tracking-[0.08em]">
              Mão de 11 aceita
            </span>
          </span>
        </div>

        <div className="event-banner-copy mt-3 rounded-full px-3 py-1.5 text-center text-[9px] font-black uppercase tracking-[0.16em]">
          Vale 3 pontos · decida e jogue.
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
          background:
            'linear-gradient(135deg, rgba(27,20,10,0.98) 0%, rgba(70,49,18,0.90) 48%, rgba(7,10,9,0.98) 100%)',
          border: 'rgba(255,223,128,0.50)',
          glow: 'rgba(201,168,76,0.28)',
          accent: '#e8c76a',
          accentSoft: 'rgba(201,168,76,0.18)',
          eyebrow: 'rgba(255,248,225,0.60)',
          title: '#f6dfa0',
          icon: '♠',
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
          top: -62,
          maxWidth: 340,
          background: cueVisuals.background,
          borderColor: cueVisuals.border,
          backdropFilter: 'blur(14px)',
        }}
        animate={{
          boxShadow: [
            `0 14px 28px rgba(0,0,0,0.38), 0 0 16px ${cueVisuals.glow}, inset 0 1px 0 rgba(255,255,255,0.10)`,
            `0 18px 34px rgba(0,0,0,0.44), 0 0 28px ${cueVisuals.glow}, inset 0 1px 0 rgba(255,255,255,0.14)`,
            `0 14px 28px rgba(0,0,0,0.38), 0 0 16px ${cueVisuals.glow}, inset 0 1px 0 rgba(255,255,255,0.10)`,
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

function BetDecisionCue({
  isOpen,
  pendingValue,
  requestedByLabel,
}: {
  isOpen: boolean;
  pendingValue: number | null;
  requestedByLabel: string;
}) {
  if (!isOpen) {
    return null;
  }

  const askLabel =
    pendingValue !== null && pendingValue >= 6
      ? `${requestedByLabel} pediu ${pendingValue}`
      : `${requestedByLabel} pediu truco`;

  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.96 }}
      transition={{ duration: 0.26, ease: 'easeOut' }}
      className="pointer-events-none flex w-full justify-center"
    >
      <motion.div
        className="flex items-center gap-3 rounded-2xl border px-5 py-2.5"
        animate={{
          boxShadow: [
            '0 14px 28px rgba(0,0,0,0.36), 0 0 18px rgba(220,38,38,0.20), inset 0 1px 0 rgba(255,255,255,0.10)',
            '0 18px 34px rgba(0,0,0,0.42), 0 0 28px rgba(220,38,38,0.32), inset 0 1px 0 rgba(255,255,255,0.14)',
            '0 14px 28px rgba(0,0,0,0.36), 0 0 18px rgba(220,38,38,0.20), inset 0 1px 0 rgba(255,255,255,0.10)',
          ],
        }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background:
            'linear-gradient(135deg, rgba(28,10,10,0.96) 0%, rgba(74,18,18,0.84) 52%, rgba(8,8,8,0.96) 100%)',
          borderColor: 'rgba(248,113,113,0.46)',
          backdropFilter: 'blur(14px)',
          maxWidth: 360,
        }}
      >
        <motion.span
          className="h-3 w-3 shrink-0 rounded-full"
          animate={{ opacity: [0.7, 1, 0.7], scale: [1, 1.2, 1] }}
          transition={{ duration: 1.0, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: '#f87171',
            boxShadow: '0 0 14px rgba(248,113,113,0.72)',
          }}
        />

        <span className="flex flex-col leading-none">
          <span
            className="text-[11px] font-black uppercase tracking-[0.28em]"
            style={{
              color: 'rgba(255,232,224,0.66)',
              fontFamily: 'Georgia, serif',
            }}
          >
            {askLabel}
          </span>
          <span
            className="mt-1.5 text-[13px] font-black uppercase tracking-[0.24em]"
            style={{
              color: '#ffe0d4',
              fontFamily: 'Georgia, serif',
              textShadow: '0 2px 6px rgba(0,0,0,0.36)',
            }}
          >
            SUA DECISÃO
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

  const displayScoreLabel =
    viewerPlayerId === 'P2'
      ? scoreLabel.replace(/\bT2\b/g, 'Nós').replace(/\bT1\b/g, 'Eles')
      : scoreLabel.replace(/\bT1\b/g, 'Nós').replace(/\bT2\b/g, 'Eles');

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
            style={{
              color: isVictory ? 'rgba(255,241,184,0.72)' : 'rgba(254,202,202,0.72)',
            }}
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
                  style={{
                    color: isVictory ? '#f2d488' : '#fecaca',
                    fontFamily: 'Georgia, serif',
                  }}
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

// The vira stays outside the conflict area so round resolution can own the table center.
function ViraSlot({
  rank,
  suit,
  isMutedDuringVerdict,
  revealKey,
  revealActive,
}: {
  rank: Rank;
  suit: string;
  isMutedDuringVerdict: boolean;
  revealKey: string;
  revealActive: boolean;
}) {
  return (
    <motion.div
      key={revealKey}
      className="pointer-events-none absolute left-1 top-1 z-[6] origin-top-left scale-[0.66] sm:left-9 sm:top-5 sm:scale-100"
      initial={revealActive ? { opacity: 0, y: -18, rotate: -3, scale: 0.84 } : false}
      animate={{
        opacity: isMutedDuringVerdict ? 0.78 : 1,
        y: 0,
        rotate: 0,
        scale: isMutedDuringVerdict ? 0.96 : 1,
      }}
      transition={{ duration: revealActive ? 0.54 : 0.24, ease: [0.2, 0.9, 0.24, 1] }}
    >
      <div
        className="rounded-[18px] px-2.5 pb-2 pt-1.5"
        style={{
          background: 'linear-gradient(180deg, rgba(31,24,14,0.78), rgba(10,9,7,0.64))',
          border: revealActive
            ? '1px solid rgba(255,241,184,0.42)'
            : '1px solid rgba(232,199,106,0.26)',
          boxShadow: revealActive
            ? '0 12px 28px rgba(0,0,0,0.46), 0 0 28px rgba(232,199,106,0.20), inset 0 1px 0 rgba(255,255,255,0.08)'
            : '0 10px 24px rgba(0,0,0,0.42), 0 0 18px rgba(201,168,76,0.08), inset 0 1px 0 rgba(255,255,255,0.06)',
          backdropFilter: 'blur(6px)',
        }}
      >
        <ViraCard
          rank={rank}
          suit={suit}
          compact
          revealKey={revealKey}
          revealActive={revealActive}
        />
      </div>
    </motion.div>
  );
}

export function MatchTableShell2v2(props: MatchTableShellProps) {
  const {
    betState,
    currentValue,
    pendingValue,
    winner,
    awardedPoints,
    displayedResolvedRoundFinished,
    displayedResolvedRoundResult,
    latestRound,
    latestRoundMyPlayedCard,
    latestRoundOpponentPlayedCard,
    tablePhase,
    opponentSeatView,
    mySeatView,
    roomPlayers = [],
    latestPlayedSeatId = null,
    seatPlayedCards = {},
    seatCardConsumptionCounts = {},
    displayedOpponentPlayedCard,
    displayedMyPlayedCard,
    opponentRevealKey,
    myRevealKey,
    myCardLaunching,
    roundIntroKey,
    currentPrivateViraRank,
    currentPublicViraRank,
    currentPrivateViraCard,
    currentPublicViraCard,
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
    playedRoundsCount,
    isMyTurn = false,
    isResolvingRound,
    closingTableCards,
  } = props;

  const publicHandForRounds = currentPublicHand;

  const { play } = useGameSound();
  const { fire } = useConfetti();
  const opponentFlightSourceRef = useRef<HTMLDivElement | null>(null);
  const playerFlightSourceRef = useRef<HTMLDivElement | null>(null);
  const twoVersusTwoSeatSourceRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // 2v2 slots are viewer-relative: partner top, rivals on the sides, player bottom.
  const partnerPlayedSlotRef = useRef<HTMLDivElement | null>(null);
  const leftRivalPlayedSlotRef = useRef<HTMLDivElement | null>(null);
  const rightRivalPlayedSlotRef = useRef<HTMLDivElement | null>(null);
  const myPlayedSlot2v2Ref = useRef<HTMLDivElement | null>(null);
  const nonSelfSeatFlightSourceRef = useRef<HTMLElement | null>(null);
  const playerCardElementRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const opponentPlayedSlotRef = useRef<HTMLDivElement | null>(null);
  const playerPlayedSlotRef = useRef<HTMLDivElement | null>(null);
  const [settledOwnFlightKey, setSettledOwnFlightKey] = useState(0);
  const [settledOpponentFlightKey, setSettledOpponentFlightKey] = useState(0);
  const [activeOwnFlightKey, setActiveOwnFlightKey] = useState(0);
  const [activeNonSelfSeatFlightKey, setActiveNonSelfSeatFlightKey] = useState(0);
  const [settledNonSelfSeatFlightKey, setSettledNonSelfSeatFlightKey] = useState(0);
  const ownFlightSequenceRef = useRef(0);
  const nonSelfSeatFlightSequenceRef = useRef(0);
  const lastNonSelfSeatFlightSignatureRef = useRef<string | null>(null);
  const lastLocalFlightCardKeyRef = useRef<string | null>(null);
  const lastSettledOpponentRef = useRef(settledOpponentFlightKey);
  const lastSettledOwnRef = useRef(settledOwnFlightKey);

  // Per-seat flight keys let each 2v2 card animate from its own hand to its own slot.
  const [activeSeatFlightKeys, setActiveSeatFlightKeys] = useState<Record<string, number>>({});
  const [settledSeatFlightKeys, setSettledSeatFlightKeys] = useState<Record<string, number>>({});
  const lastSeatPlayedCardRef = useRef<Record<string, string | null>>({});
  const seatFlightSequenceRef = useRef(0);

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

  useEffect(() => {
    // Each new seat card starts exactly one flight for that seat.
    const previous = lastSeatPlayedCardRef.current;
    const newCardSeats: string[] = [];
    const clearedSeats: string[] = [];

    for (const seatId of Object.keys(seatPlayedCards)) {
      const card = seatPlayedCards[seatId] ?? null;
      const prev = previous[seatId] ?? null;

      if (card !== prev) {
        previous[seatId] = card;
        if (card) {
          newCardSeats.push(seatId);

          if (seatId !== mySeatView?.seatId) {
            const origin =
              resolveSeatTeamId(seatId) === resolveSeatTeamId(mySeatView?.seatId)
                ? 'partner'
                : 'rival';
            playCardLaunchSound(play, origin);
          }
        } else {
          clearedSeats.push(seatId);
        }
      }
    }

    for (const seatId of Object.keys(previous)) {
      if (!(seatId in seatPlayedCards)) {
        delete previous[seatId];
        clearedSeats.push(seatId);
      }
    }

    if (newCardSeats.length === 0 && clearedSeats.length === 0) {
      return;
    }

    setActiveSeatFlightKeys((current) => {
      const next = { ...current };
      let dirty = false;
      for (const seatId of newCardSeats) {
        seatFlightSequenceRef.current += 1;
        next[seatId] = seatFlightSequenceRef.current;
        dirty = true;
      }
      for (const seatId of clearedSeats) {
        if (next[seatId] !== undefined) {
          delete next[seatId];
          dirty = true;
        }
      }
      return dirty ? next : current;
    });
  }, [mySeatView?.seatId, play, seatPlayedCards]);

  useEffect(() => {
    setActiveSeatFlightKeys({});
    setSettledSeatFlightKeys({});
    lastSeatPlayedCardRef.current = {};
  }, [roundIntroKey]);

  const handleSeatFlightDone = useCallback((seatId: string, flightKey: number) => {
    setSettledSeatFlightKeys((current) => {
      if ((current[seatId] ?? 0) >= flightKey) {
        return current;
      }
      return { ...current, [seatId]: flightKey };
    });
  }, []);

  const lastImpactedSeatKeyRef = useRef<string>('');
  useEffect(() => {
    const signature = Object.entries(settledSeatFlightKeys)
      .map(([seat, key]) => `${seat}:${key}`)
      .sort()
      .join('|');

    if (signature === lastImpactedSeatKeyRef.current) {
      return;
    }

    lastImpactedSeatKeyRef.current = signature;

    if (signature.length > 0) {
      playCardLandingSound(play, 'seat');
    }
  }, [play, settledSeatFlightKeys]);

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

  const twoVersusTwoSeatLayout = props.isOneVsOne
    ? null
    : resolveTwoVersusTwoSeatLayout(roomPlayers, mySeatView?.seatId ?? null);

  const seatsCoveredByFlight = useMemo<Record<string, boolean>>(() => {
    // While the clone is flying, the settled slot hides its duplicate static card.
    const next: Record<string, boolean> = {};
    for (const seatId of Object.keys(activeSeatFlightKeys)) {
      const active = activeSeatFlightKeys[seatId] ?? 0;
      const settled = settledSeatFlightKeys[seatId] ?? 0;
      if (active > 0 && settled < active) {
        next[seatId] = true;
      }
    }
    return next;
  }, [activeSeatFlightKeys, settledSeatFlightKeys]);
  const isAnySeatFlightStillLanding = useMemo(
    () => Object.values(seatsCoveredByFlight).some(Boolean),
    [seatsCoveredByFlight],
  );

  const partnerSeatId = twoVersusTwoSeatLayout?.partner.seatId ?? null;
  const leftRivalSeatId = twoVersusTwoSeatLayout?.leftRival.seatId ?? null;
  const rightRivalSeatId = twoVersusTwoSeatLayout?.rightRival.seatId ?? null;
  // Stable ref-like wrappers avoid restarting flight layout effects on every render.
  const partnerSourceRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return partnerSeatId ? (twoVersusTwoSeatSourceRefs.current[partnerSeatId] ?? null) : null;
      },
    }),
    [partnerSeatId],
  );
  const leftRivalSourceRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return leftRivalSeatId
          ? (twoVersusTwoSeatSourceRefs.current[leftRivalSeatId] ?? null)
          : null;
      },
    }),
    [leftRivalSeatId],
  );
  const rightRivalSourceRef = useMemo<RefObject<HTMLElement | null>>(
    () => ({
      get current() {
        return rightRivalSeatId
          ? (twoVersusTwoSeatSourceRefs.current[rightRivalSeatId] ?? null)
          : null;
      },
    }),
    [rightRivalSeatId],
  );

  const handleTwoVersusTwoSeatSourceElementChange = useCallback(
    (seatId: string, element: HTMLDivElement | null) => {
      if (element) {
        twoVersusTwoSeatSourceRefs.current[seatId] = element;
        return;
      }

      delete twoVersusTwoSeatSourceRefs.current[seatId];
    },
    [],
  );

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

  const handleNonSelfSeatFlightDone = useCallback((flightKey: number) => {
    setSettledNonSelfSeatFlightKey((current) => Math.max(current, flightKey));
    setActiveNonSelfSeatFlightKey((current) => (current === flightKey ? 0 : current));
  }, []);

  useEffect(() => {
    setActiveOwnFlightKey(0);
    setActiveNonSelfSeatFlightKey(0);
    setSettledOwnFlightKey(0);
    setSettledOpponentFlightKey(0);
    setSettledNonSelfSeatFlightKey(0);
    lastLocalFlightCardKeyRef.current = null;
    lastNonSelfSeatFlightSignatureRef.current = null;
  }, [roundIntroKey]);

  const effectiveViraCardSource = currentPrivateViraCard ?? currentPublicViraCard;
  const effectiveViraCard =
    effectiveViraCardSource !== null ? cardStringToPayload(effectiveViraCardSource) : null;
  const effectiveViraRank =
    effectiveViraCard?.rank ?? currentPrivateViraRank ?? currentPublicViraRank ?? viraRank;
  const effectiveViraSuit = effectiveViraCard?.suit ?? 'P';
  const isNewHandOpeningLocked = isViraRevealActive;
  const isAwaitingBet = betState === 'awaiting_response';
  const scoreT1 = Number(props.scoreLabel?.match(/T1\s+(\d+)/)?.[1] ?? '0');
  const scoreT2 = Number(props.scoreLabel?.match(/T2\s+(\d+)/)?.[1] ?? '0');
  const isMaoDeFerroScoreState = scoreT1 === 11 && scoreT2 === 11;
  const isMaoDeOnzeScoreState = scoreT1 === 11 || scoreT2 === 11;
  const isMaoDeOnzeContractState = props.specialState === 'mao_de_onze';
  const isPureMaoDeOnzeScoreState = isMaoDeOnzeScoreState && !isMaoDeFerroScoreState;
  const isPureMaoDeOnzeContractState = isMaoDeOnzeContractState && !isMaoDeFerroScoreState;
  const maoDeOnzeVisualHandKey = `mao-de-onze-${roundIntroKey}`;
  const maoDeFerroVisualHandKey = `mao-de-ferro-${roundIntroKey}`;

  const [lockedMaoDeOnzeVisualHandKey, setLockedMaoDeOnzeVisualHandKey] = useState<string | null>(
    null,
  );
  const [lockedMaoDeFerroVisualHandKey, setLockedMaoDeFerroVisualHandKey] = useState<string | null>(
    null,
  );

  // NOTE: Score snapshots can arrive before the previous hand's visual result is done.
  // Only a clean playing frame may start the special-hand atmosphere; once started,
  // the lock keeps the decisive mood alive through hand and match result overlays.
  const canStartSpecialHandAtmosphere =
    tablePhase === 'playing' && !isResolvingRound && !displayedResolvedRoundFinished;
  const isMaoDeOnzeVisualSourceOpen =
    isPureMaoDeOnzeContractState || (isPureMaoDeOnzeScoreState && canStartSpecialHandAtmosphere);
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
    isPureMaoDeOnzeContractState && !props.specialDecisionPending && tablePhase === 'playing';
  const isMatchFinished = tablePhase === 'match_finished';
  const isHandFinished = tablePhase === 'hand_finished';
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
  const viewerPlayerId = mapSeatToPlayerId(mySeatView?.seatId);
  const viewerOutcomePlayerId = viewerPlayerId ?? 'P1';
  const viewerWonHandOrMatch = Boolean(winner !== null && winner === viewerOutcomePlayerId);
  const requesterIsMine = Boolean(viewerPlayerId !== null && props.requestedBy === viewerPlayerId);
  const requestedByLabel = requesterIsMine
    ? props.isOneVsOne
      ? 'Você pediu'
      : 'Sua dupla pediu'
    : props.isOneVsOne
      ? opponentSeatView?.botIdentity?.displayName
        ? `${opponentSeatView.botIdentity.displayName} pediu`
        : 'Adversário pediu'
      : 'Rivais pediram';
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
  const isBetResponseWindow =
    isAwaitingBet || availableActions.canAcceptBet || availableActions.canDeclineBet;
  const shouldShowTrucoDrama =
    isBetResponseWindow && pendingBetValue >= 3 && !isHandFinished && !isMatchFinished;
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

  // Event-driven cards bridge the gap before the authoritative snapshot includes the play.
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

  const hasAnyTwoVersusTwoSeatPlayedCard = Object.values(seatPlayedCards).some(isVisibleSeatCard);

  const hasOwnTwoVersusTwoCardOnTable = Boolean(
    !props.isOneVsOne &&
    twoVersusTwoSeatLayout !== null &&
    (isVisibleSeatCard(seatPlayedCards[twoVersusTwoSeatLayout.self.seatId]) ||
      seatsCoveredByFlight[twoVersusTwoSeatLayout.self.seatId]),
  );

  const hasMandatoryBetDecision =
    availableActions.canAcceptBet ||
    availableActions.canDeclineBet ||
    availableActions.canAcceptMaoDeOnze ||
    availableActions.canDeclineMaoDeOnze;
  const hasOpenBetAction =
    availableActions.canRequestTruco ||
    availableActions.canRaiseToSix ||
    availableActions.canRaiseToNine ||
    availableActions.canRaiseToTwelve;
  const shouldDockOpenBetActionBesideTurnCue = Boolean(
    !props.isOneVsOne &&
    !hasOwnTwoVersusTwoCardOnTable &&
    !isAwaitingBet &&
    !hasMandatoryBetDecision &&
    hasOpenBetAction,
  );

  const centerActionBarClassName = props.isOneVsOne
    ? 'relative z-20 mt-0 min-h-[88px] w-full max-w-[380px]'
    : hasOwnTwoVersusTwoCardOnTable
      ? 'pointer-events-auto absolute bottom-[4px] left-1/2 z-50 flex w-full max-w-[340px] -translate-x-1/2 flex-col items-center gap-1 px-2 md:bottom-[6px] md:w-auto md:max-w-none md:translate-x-[430px] md:gap-2 md:px-0'
      : shouldDockOpenBetActionBesideTurnCue
        ? 'pointer-events-auto absolute bottom-[12px] left-1/2 z-50 flex w-full max-w-[340px] -translate-x-1/2 flex-col items-center gap-1 px-2 md:bottom-[22px] md:w-auto md:max-w-none md:translate-x-[190px] md:gap-2 md:px-0'
        : 'pointer-events-auto absolute bottom-[12px] left-1/2 z-50 flex w-full max-w-[340px] -translate-x-1/2 flex-col items-center gap-1 px-2 md:bottom-[22px] md:w-auto md:max-w-none md:translate-x-[75px] md:gap-2 md:px-0';
  const maoDeFerroOpeningKey = isMaoDeFerroScoreState
    ? `mao-de-ferro-${roundIntroKey}-${scoreT1}-${scoreT2}`
    : null;

  const [dismissedMaoDeFerroOpeningKey, setDismissedMaoDeFerroOpeningKey] = useState<string | null>(
    null,
  );

  const isMaoDeFerroOpeningOpen = Boolean(
    !props.isOneVsOne &&
    isMaoDeFerroScoreState &&
    maoDeFerroOpeningKey !== null &&
    dismissedMaoDeFerroOpeningKey !== maoDeFerroOpeningKey &&
    tablePhase === 'playing' &&
    !props.specialDecisionPending &&
    !isAwaitingBet &&
    !isResolvingRound &&
    !currentHandHasAnyPlayedCard &&
    !hasAnyTwoVersusTwoSeatPlayedCard,
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

  const opponentCardsRemaining = useMemo(() => {
    const rounds = currentPublicHand?.rounds ?? [];
    if (viewerPlayerId === null) {
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

  const displayedOpponentCardsRemaining = isNewHandOpeningLocked ? 0 : opponentCardsRemaining;

  const isRoundResolutionFrame = Boolean(
    currentHandHasAnyPlayedCard &&
    (isResolvingRound ||
      displayedResolvedRoundFinished ||
      closingTableCards.mine !== null ||
      closingTableCards.opponent !== null),
  );

  // Latest-round fallback is only safe during the active resolution window.
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
  const latestPlayedSeat = latestPlayedSeatId
    ? (roomPlayers.find((seat) => seat.seatId === latestPlayedSeatId) ?? null)
    : null;
  const viewerSeatId = mySeatView?.seatId ?? null;
  const viewerTeamId = resolveSeatTeamId(viewerSeatId);
  const latestPlayedSeatTeamId = resolveSeatTeamId(latestPlayedSeat?.seatId);
  const latestPlayedSeatIsViewer = Boolean(
    latestPlayedSeat !== null && viewerSeatId !== null && latestPlayedSeat.seatId === viewerSeatId,
  );
  const latestPlayedSeatIsViewerTeam = Boolean(
    latestPlayedSeatTeamId !== null &&
    viewerTeamId !== null &&
    latestPlayedSeatTeamId === viewerTeamId,
  );
  const shouldUseTwoVersusTwoSeatFlight = Boolean(
    !props.isOneVsOne && latestPlayedSeat !== null && !latestPlayedSeatIsViewer,
  );
  const nonSelfSeatFlightCard = shouldUseTwoVersusTwoSeatFlight
    ? latestPlayedSeatIsViewerTeam
      ? myCard
      : opponentCard
    : null;
  const nonSelfSeatFlightCardString = nonSelfSeatFlightCard
    ? `${nonSelfSeatFlightCard.rank}${nonSelfSeatFlightCard.suit}`
    : null;
  const nonSelfSeatFlightSignature =
    shouldUseTwoVersusTwoSeatFlight && latestPlayedSeat && nonSelfSeatFlightCardString
      ? [
          latestPlayedSeat.seatId,
          latestPlayedSeatIsViewerTeam ? 'viewer-team' : 'rival-team',
          nonSelfSeatFlightCardString,
          playedRoundsCount,
        ].join('|')
      : null;
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
  // Resolving flights are allowed to finish even when the authoritative phase advances first.
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

  useEffect(() => {
    if (!nonSelfSeatFlightSignature) {
      return;
    }

    if (lastNonSelfSeatFlightSignatureRef.current === nonSelfSeatFlightSignature) {
      return;
    }

    nonSelfSeatFlightSequenceRef.current += 1;
    lastNonSelfSeatFlightSignatureRef.current = nonSelfSeatFlightSignature;
    setSettledNonSelfSeatFlightKey(0);
    setActiveNonSelfSeatFlightKey(nonSelfSeatFlightSequenceRef.current);
  }, [nonSelfSeatFlightSignature]);

  const isNonSelfSeatFlightStillLanding = Boolean(
    shouldUseTwoVersusTwoSeatFlight &&
    activeNonSelfSeatFlightKey > 0 &&
    settledNonSelfSeatFlightKey !== activeNonSelfSeatFlightKey &&
    nonSelfSeatFlightCard !== null,
  );
  const shouldRenderNonSelfSeatFlight = Boolean(
    shouldUseTwoVersusTwoSeatFlight && nonSelfSeatFlightCard && isNonSelfSeatFlightStillLanding,
  );
  nonSelfSeatFlightSourceRef.current = shouldUseTwoVersusTwoSeatFlight
    ? (twoVersusTwoSeatSourceRefs.current[latestPlayedSeatId ?? ''] ??
      opponentFlightSourceRef.current)
    : opponentFlightSourceRef.current;
  const nonSelfSeatFlightLandTargetRef = latestPlayedSeatIsViewerTeam
    ? playerPlayedSlotRef
    : opponentPlayedSlotRef;

  // A slot stays mounted for layout stability, but hides its card while the matching clone lands.
  const shouldHideMySlotForFlight = Boolean(
    shouldRenderOwnFlight &&
    myCard &&
    ownFlightCardString !== null &&
    ownFlightCardString === resolvedMyCardString,
  );
  const shouldHideOpponentSlotForFlight = Boolean(
    props.isOneVsOne &&
    shouldRenderOpponentFlight &&
    opponentCard &&
    opponentFlightCardString !== null &&
    opponentFlightCardString === resolvedOpponentCardString,
  );
  const shouldHideMySlotForSeatFlight = Boolean(
    shouldRenderNonSelfSeatFlight &&
    latestPlayedSeatIsViewerTeam &&
    nonSelfSeatFlightCardString !== null &&
    nonSelfSeatFlightCardString === resolvedMyCardString,
  );
  const shouldHideOpponentSlotForSeatFlight = Boolean(
    shouldRenderNonSelfSeatFlight &&
    !latestPlayedSeatIsViewerTeam &&
    nonSelfSeatFlightCardString !== null &&
    nonSelfSeatFlightCardString === resolvedOpponentCardString,
  );

  const resolvedRoundFinished = displayedResolvedRoundFinished;
  useEffect(() => {
    // Suppressed flights are marked settled instead of being reset from derived render flags.
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

  // The shell also guards its own clickable surfaces against local flight state.
  const isAnyShellFlightStillLanding =
    isOpponentFlightStillLanding ||
    isOwnFlightStillLanding ||
    isPendingOwnFlightStillLanding ||
    isAnySeatFlightStillLanding;

  const shouldHideActionSurfaceForRoundHold =
    isRoundResolutionVisualHoldActive && !isBetResponseDecision;

  // Stale closing cards must not leak into a fresh hand.
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
  const isResolutionFlightLanding = Boolean(
    isShowingResolvedRoundCards && (shouldHideMySlotForFlight || shouldHideOpponentSlotForFlight),
  );
  // Badge eligibility is per slot so one landing clone does not mute the other settled card.
  const resolvedRoundIsScored = Boolean(
    isShowingResolvedRoundCards && myCard !== null && opponentCard !== null,
  );
  const canShowResolutionBadges = resolvedRoundIsScored;

  // Resolution phases choreograph settle, effects, badges, and verdict without changing global timing.
  const roundResolutionPhase = useRoundResolutionPhase({
    isResolvingRound: props.isResolvingRound,
    roundResolvedKey: props.roundResolvedKey,
  });
  const isClashEffectsOpen = canShowResolutionBadges && isRevealPhase(roundResolutionPhase);
  const isVerdictBannerOpen = canShowResolutionBadges && isHoldPhase(roundResolutionPhase);
  const canShowOutcomeBadges = canShowResolutionBadges && isPostSettlePhase(roundResolutionPhase);
  const isResolutionPhaseActive = isResolutionVisuallyActive(roundResolutionPhase);

  const twoVersusTwoVisibleCardsCount =
    Object.values(seatPlayedCards).filter(isVisibleSeatCard).length;
  const twoVersusTwoCardsRemainingBySeat = useMemo<Record<string, number>>(() => {
    const seatIds =
      twoVersusTwoSeatLayout !== null
        ? [
            twoVersusTwoSeatLayout.partner.seatId,
            twoVersusTwoSeatLayout.leftRival.seatId,
            twoVersusTwoSeatLayout.rightRival.seatId,
          ]
        : roomPlayers.filter((seat) => !seat.isMine).map((seat) => seat.seatId);

    return seatIds.reduce<Record<string, number>>((acc, seatId) => {
      // TP stacks follow visual consumption, not snapshot cleanup.
      const consumedCount = Math.max(0, Math.min(3, seatCardConsumptionCounts[seatId] ?? 0));

      acc[seatId] = 3 - consumedCount;

      return acc;
    }, {});
  }, [roomPlayers, seatCardConsumptionCounts, twoVersusTwoSeatLayout]);
  const displayedTwoVersusTwoCardsRemainingBySeat = useMemo<Record<string, number>>(() => {
    if (!isNewHandOpeningLocked) {
      return twoVersusTwoCardsRemainingBySeat;
    }

    const seatIds =
      twoVersusTwoSeatLayout !== null
        ? [
            twoVersusTwoSeatLayout.partner.seatId,
            twoVersusTwoSeatLayout.leftRival.seatId,
            twoVersusTwoSeatLayout.rightRival.seatId,
          ]
        : roomPlayers.filter((seat) => !seat.isMine).map((seat) => seat.seatId);

    return seatIds.reduce<Record<string, number>>((acc, seatId) => {
      acc[seatId] = 0;

      return acc;
    }, {});
  }, [
    isNewHandOpeningLocked,
    roomPlayers,
    twoVersusTwoCardsRemainingBySeat,
    twoVersusTwoSeatLayout,
  ]);

  const twoVersusTwoRoundResult = latestRound?.result ?? resolvedRoundResult;
  const twoVersusTwoWinningSeatId = latestRound?.winningSeatId ?? null;
  const inferredTwoVersusTwoWinningSeatId = useMemo(
    () =>
      inferTwoVersusTwoWinningSeatId({
        roundResult: twoVersusTwoRoundResult,
        winningSeatId: twoVersusTwoWinningSeatId,
        seatLayout: twoVersusTwoSeatLayout,
        seatPlayedCards,
        viraRank: effectiveViraRank,
      }),
    [
      effectiveViraRank,
      seatPlayedCards,
      twoVersusTwoRoundResult,
      twoVersusTwoSeatLayout,
      twoVersusTwoWinningSeatId,
    ],
  );
  const canShowTwoVersusTwoResolutionBadges = Boolean(
    !props.isOneVsOne &&
    isRoundResolutionVisualHoldActive &&
    twoVersusTwoVisibleCardsCount >= 4 &&
    twoVersusTwoRoundResult !== null,
  );
  const twoVersusTwoSeatOutcomes = useMemo<Record<string, SlotRoundOutcome>>(() => {
    // Outcome badges wait until cards have settled on the felt.
    const canShowOutcomeBadgesNow =
      canShowTwoVersusTwoResolutionBadges && isPostSettlePhase(roundResolutionPhase);

    if (!twoVersusTwoSeatLayout || !canShowOutcomeBadgesNow) {
      return {};
    }

    const seats = [
      twoVersusTwoSeatLayout.partner,
      twoVersusTwoSeatLayout.leftRival,
      twoVersusTwoSeatLayout.rightRival,
      twoVersusTwoSeatLayout.self,
    ];

    return seats.reduce<Record<string, SlotRoundOutcome>>((acc, seat) => {
      acc[seat.seatId] = resolveTwoVersusTwoSlotOutcome({
        seatId: seat.seatId,
        card: seatPlayedCards[seat.seatId] ?? null,
        canShow: canShowOutcomeBadgesNow,
        roundResult: twoVersusTwoRoundResult,
        winningSeatId: inferredTwoVersusTwoWinningSeatId,
      });

      return acc;
    }, {});
  }, [
    canShowTwoVersusTwoResolutionBadges,
    roundResolutionPhase,
    seatPlayedCards,
    twoVersusTwoRoundResult,
    twoVersusTwoSeatLayout,
    inferredTwoVersusTwoWinningSeatId,
  ]);
  const twoVersusTwoRoundVerdict = formatTwoVersusTwoVerdictLabel({
    roundResult: twoVersusTwoRoundResult,
    winningSeatId: inferredTwoVersusTwoWinningSeatId,
    seatLayout: twoVersusTwoSeatLayout,
    seatPlayedCards,
    viraRank: effectiveViraRank,
  });
  const canShowMyResolutionBadge = Boolean(
    resolvedRoundIsScored && !shouldHideMySlotForFlight && canShowOutcomeBadges,
  );
  const canShowOpponentResolutionBadge = Boolean(
    resolvedRoundIsScored && !shouldHideOpponentSlotForFlight && canShowOutcomeBadges,
  );

  const myDomainPlayerId = mapSeatToPlayerId(mySeatView?.seatId);
  const opponentDomainPlayerId = mapSeatToPlayerId(opponentSeatView?.seatId);
  // 1v1 outcomes follow the same phase gate as the 2v2 path.
  const myResolvedOutcome = resolveSlotRoundOutcome({
    roundResult: resolvedRoundResult,
    playerId: myDomainPlayerId,
    canShow: canShowOutcomeBadges,
  });
  const opponentResolvedOutcome = resolveSlotRoundOutcome({
    roundResult: resolvedRoundResult,
    playerId: opponentDomainPlayerId,
    canShow: canShowOutcomeBadges,
  });
  const myDirectResolvedOutcome = toDirectRoundOutcome(myResolvedOutcome);
  const opponentDirectResolvedOutcome = toDirectRoundOutcome(opponentResolvedOutcome);

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

  // Card play is blocked while the felt is resolving, even if the server is ready for the next turn.
  const shouldBlockHandDock =
    hasPendingBetDecision ||
    hasPendingSpecialDecision ||
    isResolvingRound ||
    hasAnyClosingCard ||
    isAnyShellFlightStillLanding;

  // In 2v2, MatchPage owns the final safe play gate and can outlive local animation flags.
  const shouldTrustOuterPlayableGateForOwnTwoVersusTwoTurn = Boolean(
    !props.isOneVsOne &&
    tablePhase === 'playing' &&
    isMyTurn &&
    canPlayCard &&
    !hasPendingBetDecision &&
    !hasPendingSpecialDecision,
  );
  const effectiveShouldBlockHandDock =
    shouldBlockHandDock && !shouldTrustOuterPlayableGateForOwnTwoVersusTwoTurn;
  const effectiveIsRoundResolutionVisualHoldActive =
    isRoundResolutionVisualHoldActive && !shouldTrustOuterPlayableGateForOwnTwoVersusTwoTurn;
  const effectiveIsResolutionPhaseActive =
    isResolutionPhaseActive && !shouldTrustOuterPlayableGateForOwnTwoVersusTwoTurn;
  const canPlayCardInHandDock = Boolean(
    canPlayCard &&
    !isNewHandOpeningLocked &&
    !effectiveShouldBlockHandDock &&
    !effectiveIsRoundResolutionVisualHoldActive &&
    !effectiveIsResolutionPhaseActive,
  );

  const isHandDockBlockedForTurnCue = !canPlayCardInHandDock;
  // Optional betting actions must not hide the normal card-turn cue.
  const canShowPlayerTurnCue = Boolean(
    tablePhase === 'playing' &&
    isMyTurn &&
    canPlayCardInHandDock &&
    myCards.length > 0 &&
    !isHandDockBlockedForTurnCue &&
    !isViewerMaoDeOnzeDecision &&
    !isAwaitingBet &&
    !shouldShowTrucoDrama &&
    !isMaoDeFerroOpeningOpen &&
    !isNewHandOpeningLocked,
  );

  const isCenterActionDecisionMode = Boolean(
    availableActions.canAcceptBet ||
    availableActions.canDeclineBet ||
    availableActions.canAcceptMaoDeOnze ||
    availableActions.canDeclineMaoDeOnze,
  );

  const isCenterActionWaitingMode = Boolean(
    !isCenterActionDecisionMode && betState === 'awaiting_response',
  );

  const isCenterActionOpenBetMode = Boolean(
    !isCenterActionDecisionMode &&
    !isCenterActionWaitingMode &&
    (availableActions.canRequestTruco ||
      availableActions.canRaiseToSix ||
      availableActions.canRaiseToNine ||
      availableActions.canRaiseToTwelve),
  );

  const viewerSeatHasPlayedCard = Boolean(
    viewerSeatId !== null && isVisibleSeatCard(seatPlayedCards[viewerSeatId]),
  );

  const twoVersusTwoActionBarPositionClass = useMemo(() => {
    if (props.isOneVsOne) {
      return '';
    }

    if (isCenterActionDecisionMode) {
      return viewerSeatHasPlayedCard
        ? 'bottom-[22px] left-1/2 translate-x-[170px]'
        : 'bottom-[22px] left-1/2 translate-x-[56px]';
    }

    if (isCenterActionOpenBetMode && canShowPlayerTurnCue) {
      return 'bottom-[22px] left-1/2 translate-x-[238px]';
    }

    return 'bottom-[22px] left-1/2 translate-x-[170px]';
  }, [
    canShowPlayerTurnCue,
    isCenterActionDecisionMode,
    isCenterActionOpenBetMode,
    props.isOneVsOne,
    viewerSeatHasPlayedCard,
  ]);

  // Bet-response decisions use their own cue so they never compete with card-turn messaging.
  const isViewerBetResponseDecision = Boolean(
    isAwaitingBet &&
    !requesterIsMine &&
    (availableActions.canAcceptBet || availableActions.canDeclineBet),
  );
  const canShowBetDecisionCue = Boolean(
    isViewerBetResponseDecision &&
    !shouldShowTrucoDrama &&
    !isResolvingRound &&
    !isRoundResolutionVisualHoldActive,
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

  const botDialogueSeats = useMemo(
    () =>
      twoVersusTwoSeatLayout
        ? [
            {
              seatId: twoVersusTwoSeatLayout.partner.seatId,
              isBot: twoVersusTwoSeatLayout.partner.isBot,
              relationship: 'partner' as const,
              profile: twoVersusTwoSeatLayout.partner.botIdentity?.profile ?? null,
            },
            {
              seatId: twoVersusTwoSeatLayout.leftRival.seatId,
              isBot: twoVersusTwoSeatLayout.leftRival.isBot,
              relationship: 'rival' as const,
              profile: twoVersusTwoSeatLayout.leftRival.botIdentity?.profile ?? null,
            },
            {
              seatId: twoVersusTwoSeatLayout.rightRival.seatId,
              isBot: twoVersusTwoSeatLayout.rightRival.isBot,
              relationship: 'rival' as const,
              profile: twoVersusTwoSeatLayout.rightRival.botIdentity?.profile ?? null,
            },
          ]
        : [],
    [twoVersusTwoSeatLayout],
  );

  const botDialogueSignals = useMemo<BotDialogueSignal[]>(() => {
    if (props.isOneVsOne || !twoVersusTwoSeatLayout) {
      return [];
    }

    const signals: BotDialogueSignal[] = [];
    const trackedSeats = [
      twoVersusTwoSeatLayout.partner,
      twoVersusTwoSeatLayout.leftRival,
      twoVersusTwoSeatLayout.rightRival,
    ];

    const pushSignal = ({
      seat,
      event,
      priority,
      suffix,
    }: {
      seat: TableSeatView | null;
      event: BotDialogueSignal['event'];
      priority: number;
      suffix: string;
    }) => {
      if (!seat?.isBot) {
        return;
      }

      signals.push({
        seatId: seat.seatId,
        event,
        priority,
        key: `${seat.seatId}:${event}:${suffix}`,
      });
    };

    if (
      latestPlayedSeat?.isBot &&
      !latestPlayedSeat.isMine &&
      tablePhase === 'playing' &&
      !isRoundResolutionVisualHoldActive &&
      isVisibleSeatCard(seatPlayedCards[latestPlayedSeat.seatId])
    ) {
      pushSignal({
        seat: latestPlayedSeat,
        event: 'bot-played-card',
        priority: 42,
        suffix: `${roundIntroKey}:${playedRoundsCount}:${
          seatPlayedCards[latestPlayedSeat.seatId] ?? 'card'
        }`,
      });
    }

    if (isMaoDeFerroTensionOpen) {
      trackedSeats.forEach((seat) => {
        pushSignal({
          seat,
          event: 'mao-de-ferro-pressure',
          priority: 72,
          suffix: `${roundIntroKey}:ferro:${scoreT1}-${scoreT2}`,
        });
      });
    } else if (isMaoDeOnzeTensionOpen) {
      trackedSeats.forEach((seat) => {
        pushSignal({
          seat,
          event: 'mao-de-onze-pressure',
          priority: 66,
          suffix: `${roundIntroKey}:onze:${scoreT1}-${scoreT2}`,
        });
      });
    }

    if (isAwaitingBet && props.requestedBy !== null) {
      const requesterSeat =
        trackedSeats.find((seat) => mapSeatToPlayerId(seat.seatId) === props.requestedBy) ?? null;
      const event =
        pendingValue !== null && pendingValue > currentValue
          ? 'bot-raised-bet'
          : 'bot-requested-truco';

      pushSignal({
        seat: requesterSeat,
        event,
        priority: 80,
        suffix: `${roundIntroKey}:${playedRoundsCount}:${props.requestedBy}:${pendingValue ?? currentValue}`,
      });
    }

    if (canShowTwoVersusTwoResolutionBadges) {
      trackedSeats.forEach((seat) => {
        const outcome = twoVersusTwoSeatOutcomes[seat.seatId] ?? null;
        const seatTeamId = resolveSeatTeamId(seat.seatId);
        const viewerTeam = resolveSeatTeamId(twoVersusTwoSeatLayout.self.seatId);
        const isPartnerTeam =
          seatTeamId !== null && viewerTeam !== null && seatTeamId === viewerTeam;

        if (outcome === 'win' || outcome === 'team-win') {
          pushSignal({
            seat,
            event: isPartnerTeam ? 'partner-won-round' : 'bot-won-round',
            priority: 58,
            suffix: `${roundIntroKey}:${playedRoundsCount}:${twoVersusTwoRoundResult ?? 'round'}`,
          });
          return;
        }

        if (outcome === 'loss') {
          pushSignal({
            seat,
            event: isPartnerTeam ? 'partner-lost-round' : 'bot-lost-round',
            priority: 52,
            suffix: `${roundIntroKey}:${playedRoundsCount}:${twoVersusTwoRoundResult ?? 'round'}`,
          });
        }
      });
    }

    return signals;
  }, [
    canShowTwoVersusTwoResolutionBadges,
    currentValue,
    isAwaitingBet,
    isMaoDeFerroTensionOpen,
    isMaoDeOnzeTensionOpen,
    isRoundResolutionVisualHoldActive,
    latestPlayedSeat,
    pendingValue,
    playedRoundsCount,
    props.isOneVsOne,
    props.requestedBy,
    roundIntroKey,
    scoreT1,
    scoreT2,
    seatPlayedCards,
    tablePhase,
    twoVersusTwoRoundResult,
    twoVersusTwoSeatLayout,
    twoVersusTwoSeatOutcomes,
  ]);

  const botDialoguesBySeat = useBotDialogueDirector({
    seats: botDialogueSeats,
    signals: botDialogueSignals,
    currentValue: activeValueForTier,
    isMuted:
      props.isOneVsOne || shouldShowTrucoDrama || isNewHandOpeningLocked || isMaoDeFerroOpeningOpen,
  });

  const hasActiveTwoVersusTwoBotDialogue = Object.values(botDialoguesBySeat).some(Boolean);
  const shouldHoldHandClimaxForBotDialogue = Boolean(
    !props.isOneVsOne && (isHandFinished || isMatchFinished) && hasActiveTwoVersusTwoBotDialogue,
  );

  const shouldHideCenterActionBar =
    isNewHandOpeningLocked || isMaoDeOnzeAcceptedState || isViewerMaoDeOnzeDecision;

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
      return {
        label: 'Partida encerrada',
        accent: viewerWonHandOrMatch ? 'win' : 'loss',
      };
    }

    if (isHandFinished && winner !== null) {
      return viewerWonHandOrMatch
        ? { label: 'Mão nossa', accent: 'win' }
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
      if (resolvedRoundResult === viewerOutcomePlayerId) {
        return { label: 'Rodada sua', accent: 'win' };
      }
      if (resolvedRoundResult === 'P1' || resolvedRoundResult === 'P2') {
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
    isMaoDeFerroTensionOpen,
    isViewerMaoDeOnzeDecision,
    props.specialDecisionPending,
    resolvedRoundResult,
    viewerOutcomePlayerId,
    viewerWonHandOrMatch,
    winner,
  ]);

  const roundsForChips = useMemo(() => {
    const rounds = publicHandForRounds?.rounds ?? [];
    return rounds.map((round) => ({
      result: round.result ?? null,
      finished: Boolean(round.finished),
    }));
  }, [publicHandForRounds]);

  void roundsForChips;

  const climax = (() => {
    if (props.suppressHandOutcomeModal) {
      return null;
    }

    if (climaxDismissed) {
      return null;
    }

    if (shouldHoldHandClimaxForBotDialogue) {
      return null;
    }

    if ((isHandFinished || isMatchFinished) && winner !== null && awardedPoints !== null) {
      return {
        isMyHand: viewerWonHandOrMatch,
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
      shouldHoldHandClimaxForBotDialogue,
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
    shouldHoldHandClimaxForBotDialogue,
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
      resolvedRoundResult === 'TIE'
        ? 'tie'
        : resolvedRoundResult === viewerOutcomePlayerId
          ? 'win'
          : 'loss',
    );
  }, [
    canShowResolutionBadges,
    myRevealKey,
    opponentRevealKey,
    play,
    props.roundResolvedKey,
    resolvedRoundResult,
    viewerOutcomePlayerId,
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

  const canUsePartnerSignals =
    !props.isOneVsOne &&
    tablePhase === 'playing' &&
    !isHandFinished &&
    !isMatchFinished &&
    !isNewHandOpeningLocked &&
    !isMaoDeFerroOpeningOpen &&
    Boolean(currentPrivateHand);
  const myManilhaRank = props.currentPrivateViraRank
    ? resolveManilhaRank(props.currentPrivateViraRank)
    : null;
  const availableManilhaSignalKinds = useMemo(() => {
    if (!myManilhaRank) {
      return [];
    }

    return props.myCards.reduce<PartnerSignalKind[]>((signals, card) => {
      if (card.rank !== myManilhaRank) {
        return signals;
      }

      const signalKind = resolveManilhaSignalKindBySuit(card.suit);

      if (signalKind && !signals.includes(signalKind)) {
        signals.push(signalKind);
      }

      return signals;
    }, []);
  }, [myManilhaRank, props.myCards]);

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
    <div
      className="premium-table-shell relative flex h-full min-h-0 w-full flex-col overflow-visible"
      style={{
        borderRadius: 38,
        border: `1px solid ${tableTensionVisuals.shellBorderColor}`,
        boxShadow: `0 34px 88px rgba(0,0,0,0.58), ${tableTensionVisuals.shellBoxShadow}`,
      }}
    >
      <div aria-hidden className="premium-table-rail pointer-events-none absolute inset-[5px]" />
      <div
        aria-hidden
        className="premium-table-gold-bezel pointer-events-none absolute inset-[11px]"
      />

      <div
        aria-hidden
        className="premium-table-felt-layer pointer-events-none absolute inset-[15px] overflow-hidden"
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
              'linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(0deg, rgba(0,0,0,0.18) 1px, transparent 1px)',
            backgroundSize: '14px 14px, 18px 18px',
            opacity: 0.16,
          }}
        />

        <div className="premium-table-play-oval absolute inset-x-[6%] inset-y-[9%]" />

        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at 50% 46%, rgba(255,244,214,0.13) 0%, rgba(201,168,76,0.045) 28%, transparent 58%), radial-gradient(ellipse at 50% 50%, transparent 0%, transparent 54%, rgba(0,0,0,0.34) 100%)',
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
              transition={{
                duration: requesterIsMine ? 1.8 : 1.25,
                repeat: Infinity,
              }}
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

      {!props.isOneVsOne && twoVersusTwoSeatLayout ? (
        <PartnerSignalDock
          isEnabled={canUsePartnerSignals}
          lastSignal={props.partnerSignal ?? null}
          sentSignal={props.sentPartnerSignal ?? null}
          availableManilhaSignalKinds={availableManilhaSignalKinds}
          {...(props.onSendPartnerSignal ? { onSendSignal: props.onSendPartnerSignal } : {})}
        />
      ) : null}

      <div
        className={`relative z-[3] flex min-h-0 flex-1 flex-col ${props.isOneVsOne ? 'px-2 pb-1 pt-1 sm:px-4 sm:pb-5 sm:pt-3' : 'px-0.5 pb-0 pt-0.5 sm:px-3 sm:pb-2 sm:pt-1'}`}
      >
        {isNewHandOpeningLocked ? (
          <div aria-hidden className="absolute left-5 top-5 z-20 h-[164px] w-[106px]" />
        ) : (
          <ViraSlot
            rank={effectiveViraRank}
            suit={effectiveViraSuit}
            revealKey={viraRevealKey ?? `vira-${effectiveViraRank}`}
            revealActive={false}
            isMutedDuringVerdict={canShowResolutionBadges || canShowTwoVersusTwoResolutionBadges}
          />
        )}

        <div
          className={`flex min-h-0 flex-1 items-stretch ${props.isOneVsOne ? 'gap-1 sm:gap-3' : 'gap-0 sm:gap-2'}`}
        >
          <div
            className={`relative flex min-h-0 min-w-0 flex-1 flex-col items-center ${props.isOneVsOne ? 'justify-between gap-1 py-0 sm:gap-3 sm:py-1' : 'justify-between gap-0 py-0'}`}
          >
            {props.isOneVsOne ? (
              <>
                {opponentSeatView ? (
                  <div ref={opponentFlightSourceRef}>
                    <OpponentCluster
                      seat={opponentSeatView}
                      cardsRemaining={displayedOpponentCardsRemaining}
                      isOpponent
                      presenceLine={visibleBotPresenceLine}
                      presenceQuote={visibleBotPresenceQuote}
                      presenceTone={visibleBotPresenceTone}
                    />
                  </div>
                ) : null}

                <div className="flex items-center justify-center">
                  <div className="relative grid w-[268px] grid-cols-[116px_36px_116px] items-center justify-items-center rounded-[28px] px-0 py-0 sm:w-[456px] sm:grid-cols-[188px_80px_188px] sm:rounded-[34px] sm:px-2 sm:py-1">
                    <AnimatePresence>
                      {isVerdictBannerOpen &&
                      myResolvedOutcome !== null &&
                      myCard !== null &&
                      opponentCard !== null ? (
                        <RoundClashVerdict
                          outcome={myDirectResolvedOutcome}
                          myCard={myCard}
                          opponentCard={opponentCard}
                        />
                      ) : null}
                    </AnimatePresence>

                    <RoundClashEffects
                      outcome={myDirectResolvedOutcome}
                      clashKey={`${props.roundResolvedKey}-${myRevealKey}-${opponentRevealKey}`}
                      isOpen={
                        isClashEffectsOpen &&
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
                        isLaunching={
                          shouldHideOpponentSlotForFlight || shouldHideOpponentSlotForSeatFlight
                        }
                        isCoveredByFlight={
                          shouldHideOpponentSlotForFlight || shouldHideOpponentSlotForSeatFlight
                        }
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
                        isLaunching={myCardLaunching || shouldHideMySlotForSeatFlight}
                        isCoveredByFlight={
                          shouldHideMySlotForFlight || shouldHideMySlotForSeatFlight
                        }
                        winnerBadgeLabel="VENCEU"
                        loserBadgeLabel="PERDEU"
                        isTieHighlight={myResolvedOutcome === 'tie'}
                        isLoser={myResolvedOutcome === 'loss'}
                        showOutcomeBadge
                      />
                    </motion.div>
                  </div>
                </div>
              </>
            ) : (
              <TwoVersusTwoQuadrant
                seatLayout={twoVersusTwoSeatLayout}
                seatPlayedCards={isNewHandOpeningLocked ? {} : seatPlayedCards}
                seatsCoveredByFlight={seatsCoveredByFlight}
                cardsRemainingBySeat={displayedTwoVersusTwoCardsRemainingBySeat}
                botDialogues={botDialoguesBySeat}
                onSeatSourceElementChange={handleTwoVersusTwoSeatSourceElementChange}
                onPartnerSlotRef={(el) => {
                  partnerPlayedSlotRef.current = el;
                }}
                onLeftRivalSlotRef={(el) => {
                  leftRivalPlayedSlotRef.current = el;
                }}
                onRightRivalSlotRef={(el) => {
                  rightRivalPlayedSlotRef.current = el;
                }}
                onMySlotRef={(el) => {
                  myPlayedSlot2v2Ref.current = el;
                }}
                seatOutcomes={twoVersusTwoSeatOutcomes}
                roundVerdict={twoVersusTwoRoundVerdict}
                isRoundVerdictOpen={
                  canShowTwoVersusTwoResolutionBadges && isHoldPhase(roundResolutionPhase)
                }
                isRoundClashOpen={
                  canShowTwoVersusTwoResolutionBadges && isRevealPhase(roundResolutionPhase)
                }
                isResolutionSceneActive={
                  canShowTwoVersusTwoResolutionBadges && isResolutionPhaseActive
                }
              />
            )}

            <div className={centerActionBarClassName}>
              {!props.isOneVsOne ? (
                <BetDecisionCue
                  isOpen={canShowBetDecisionCue && !isResolutionPhaseActive}
                  pendingValue={pendingValue}
                  requestedByLabel={requesterIsMine ? 'Você' : requestedByLabel}
                />
              ) : null}

              {shouldHideCenterActionBar || isResolutionPhaseActive ? (
                <div aria-hidden className={props.isOneVsOne ? 'min-h-[88px]' : 'min-h-[40px]'} />
              ) : (
                <CenterActionBar
                  availableActions={availableActions}
                  onAction={onAction}
                  isBetDramaActive={shouldShowTrucoDrama}
                  isSurfaceLocked={shouldHideActionSurfaceForRoundHold}
                  betState={betState}
                  currentValue={currentValue}
                  pendingValue={pendingValue}
                  requestedByMe={requesterIsMine}
                  teamBetDecision={currentPrivateHand?.teamBetDecision ?? null}
                  partnerAdvice={currentPrivateHand?.partnerAdvice ?? null}
                />
              )}
            </div>
          </div>
        </div>

        <div
          ref={playerFlightSourceRef}
          className={
            props.isOneVsOne
              ? 'relative mt-0 shrink-0 pb-0 sm:mt-3 sm:pb-2'
              : 'relative -mt-9 shrink-0 pb-0 sm:-mt-3 sm:pb-4 md:-mt-4 md:pb-5'
          }
        >
          <AnimatePresence>
            {canShowPlayerTurnCue ? (
              <PlayerHandTurnCue
                isOpen={canShowPlayerTurnCue}
                isMaoDeOnze={isMaoDeOnzeTensionOpen}
                isMaoDeFerro={isMaoDeFerroTensionOpen}
              />
            ) : null}
          </AnimatePresence>

          <div className={props.isOneVsOne ? 'relative z-10 mt-1 sm:mt-2' : 'relative z-10 mt-0'}>
            <MatchPlayerHandDock
              myCards={isNewHandOpeningLocked ? [] : myCards}
              canPlayCard={isNewHandOpeningLocked ? false : canPlayCardInHandDock}
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
        suppressed={!props.isOneVsOne || shouldSuppressOwnFlight || !shouldRenderOwnFlight}
        sourceTargetRef={playerFlightSourceRef}
        sourceTargetElement={playerCardFlightSourceElement}
        landTargetRef={playerPlayedSlotRef}
        outcomeBadge={
          canShowResolutionBadges && shouldHideMySlotForFlight ? myDirectResolvedOutcome : null
        }
        outcomeBadgeLabel={
          myResolvedOutcome === 'loss' ? 'PERDEU' : myResolvedOutcome === 'win' ? 'VENCEU' : null
        }
        onFlightDone={handleOwnFlightDone}
      />

      <OpponentCardFlight
        revealKey={opponentRevealKey}
        card={props.isOneVsOne && shouldRenderOpponentFlight ? opponentCard : null}
        suppressed={
          !props.isOneVsOne || shouldSuppressOpponentFlight || !shouldRenderOpponentFlight
        }
        sourceTargetRef={opponentFlightSourceRef}
        landTargetRef={opponentPlayedSlotRef}
        outcomeBadge={
          canShowResolutionBadges && shouldHideOpponentSlotForFlight
            ? opponentDirectResolvedOutcome
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

      <OpponentCardFlight
        revealKey={activeNonSelfSeatFlightKey}
        card={props.isOneVsOne && shouldRenderNonSelfSeatFlight ? nonSelfSeatFlightCard : null}
        suppressed={!props.isOneVsOne || !shouldRenderNonSelfSeatFlight}
        sourceTargetRef={nonSelfSeatFlightSourceRef}
        landTargetRef={nonSelfSeatFlightLandTargetRef}
        outcomeBadge={
          canShowResolutionBadges &&
          (shouldHideMySlotForSeatFlight || shouldHideOpponentSlotForSeatFlight)
            ? latestPlayedSeatIsViewerTeam
              ? myDirectResolvedOutcome
              : opponentDirectResolvedOutcome
            : null
        }
        outcomeBadgeLabel={
          latestPlayedSeatIsViewerTeam
            ? myResolvedOutcome === 'loss'
              ? 'PERDEU'
              : myResolvedOutcome === 'win'
                ? 'VENCEU'
                : null
            : opponentResolvedOutcome === 'loss'
              ? 'PERDEU'
              : opponentResolvedOutcome === 'win'
                ? 'VENCEU'
                : null
        }
        onFlightDone={handleNonSelfSeatFlightDone}
      />

      {!props.isOneVsOne && twoVersusTwoSeatLayout ? (
        <>
          <OpponentCardFlight
            revealKey={activeSeatFlightKeys[twoVersusTwoSeatLayout.partner.seatId] ?? 0}
            card={
              seatsCoveredByFlight[twoVersusTwoSeatLayout.partner.seatId]
                ? parseCard(seatPlayedCards[twoVersusTwoSeatLayout.partner.seatId] ?? null)
                : null
            }
            suppressed={!seatsCoveredByFlight[twoVersusTwoSeatLayout.partner.seatId]}
            sourceTargetRef={partnerSourceRef}
            landTargetRef={partnerPlayedSlotRef}
            onFlightDone={(key) => handleSeatFlightDone(twoVersusTwoSeatLayout.partner.seatId, key)}
          />

          <OpponentCardFlight
            revealKey={activeSeatFlightKeys[twoVersusTwoSeatLayout.leftRival.seatId] ?? 0}
            card={
              seatsCoveredByFlight[twoVersusTwoSeatLayout.leftRival.seatId]
                ? parseCard(seatPlayedCards[twoVersusTwoSeatLayout.leftRival.seatId] ?? null)
                : null
            }
            suppressed={!seatsCoveredByFlight[twoVersusTwoSeatLayout.leftRival.seatId]}
            sourceTargetRef={leftRivalSourceRef}
            landTargetRef={leftRivalPlayedSlotRef}
            onFlightDone={(key) =>
              handleSeatFlightDone(twoVersusTwoSeatLayout.leftRival.seatId, key)
            }
          />

          <OpponentCardFlight
            revealKey={activeSeatFlightKeys[twoVersusTwoSeatLayout.rightRival.seatId] ?? 0}
            card={
              seatsCoveredByFlight[twoVersusTwoSeatLayout.rightRival.seatId]
                ? parseCard(seatPlayedCards[twoVersusTwoSeatLayout.rightRival.seatId] ?? null)
                : null
            }
            suppressed={!seatsCoveredByFlight[twoVersusTwoSeatLayout.rightRival.seatId]}
            sourceTargetRef={rightRivalSourceRef}
            landTargetRef={rightRivalPlayedSlotRef}
            onFlightDone={(key) =>
              handleSeatFlightDone(twoVersusTwoSeatLayout.rightRival.seatId, key)
            }
          />

          <PlayerCardFlight
            revealKey={activeSeatFlightKeys[twoVersusTwoSeatLayout.self.seatId] ?? 0}
            card={
              seatsCoveredByFlight[twoVersusTwoSeatLayout.self.seatId]
                ? parseCard(seatPlayedCards[twoVersusTwoSeatLayout.self.seatId] ?? null)
                : null
            }
            suppressed={!seatsCoveredByFlight[twoVersusTwoSeatLayout.self.seatId]}
            sourceTargetRef={playerFlightSourceRef}
            sourceTargetElement={playerCardFlightSourceElement}
            landTargetRef={myPlayedSlot2v2Ref}
            onFlightDone={(key) => handleSeatFlightDone(twoVersusTwoSeatLayout.self.seatId, key)}
          />
        </>
      ) : null}

      <TrucoDramaOverlay
        isOpen={shouldShowTrucoDrama}
        pendingValue={pendingBetValue}
        requesterIsMine={requesterIsMine}
        tier={activeTier}
        headline={trucoDramaHeadline}
        detail={trucoDramaDetail}
        layout={props.isOneVsOne ? 'default' : 'two-versus-two'}
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
        {isMaoDeOnzeAcceptedState && !isMaoDeFerroScoreState ? <MaoDeOnzeAcceptedBadge /> : null}
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
            isVictory={viewerWonHandOrMatch}
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
