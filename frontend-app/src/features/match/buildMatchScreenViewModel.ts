import type { ComponentProps } from 'react';

import { MatchLiveStatePanel } from './matchLiveStatePanel';
import { MatchPageHeader } from './matchPageHeader';
import { MatchRoundsHistoryPanel } from './matchRoundsHistoryPanel';
import { MatchTableShell } from './matchTableShell';
import type {
  CardPayload,
  MatchStatePayload,
  Rank,
  RoomStatePayload,
} from '../../services/socket/socketTypes';

type HeaderProps = ComponentProps<typeof MatchPageHeader>;
type TableShellProps = ComponentProps<typeof MatchTableShell>;
type LiveStatePanelProps = ComponentProps<typeof MatchLiveStatePanel>;
type RoundsHistoryProps = ComponentProps<typeof MatchRoundsHistoryPanel>;

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
};

type MatchScreenSourceViewModel = {
  resolvedMatchId: string;
  mySeat: string | null;
  isOneVsOne: boolean;
  mySeatView: TableSeatView | null;
  opponentSeatView: TableSeatView | null;
  myCards: CardPayload[];
  myPlayedCard: string | null;
  opponentPlayedCard: string | null;
  scoreLabel: string;
  currentTurnSeatId: string | null;
  canStartHand: boolean;
  canPlayCard: boolean;
  currentValue: number;
  betState: string;
  pendingValue: number | null;
  requestedBy: string | null;
  specialState: string;
  specialDecisionPending: boolean;
  specialDecisionBy: string | null;
  winner: string | null;
  awardedPoints: number | null;
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  handFinished: boolean;
  tablePhase:
    | 'missing_context'
    | 'waiting'
    | 'playing'
    | 'hand_finished'
    | 'match_finished';
  handStatusLabel: string;
  handStatusTone: 'neutral' | 'success' | 'warning';
  latestRound: NonNullable<MatchStatePayload['currentHand']>['rounds'][number] | null;
  rounds: NonNullable<MatchStatePayload['currentHand']>['rounds'];
  playedRoundsCount: number;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
};

type MatchScreenTransitionState = {
  displayedMyPlayedCard: string | null;
  displayedOpponentPlayedCard: string | null;
  resolvedRoundResult: string | null;
  opponentRevealKey: number;
  pendingPlayedCard: {
    owner: 'mine' | 'opponent';
    id: number;
  } | null;
  roundIntroKey: number;
  roundResolvedKey: number;
  launchingCardKey: string | null;
  isResolvingRound: boolean;
  closingTableCards: {
    mine: string | null;
    opponent: string | null;
  };
};

type BuildMatchScreenViewModelParams = {
  connectionStatus: 'offline' | 'online';
  canRenderLiveState: boolean;
  hasHydratedMatchState: boolean;
  publicState: string;
  privateState: string;
  roomMode: RoomStatePayload['mode'] | null;
  viewModel: MatchScreenSourceViewModel;
  effectiveMyCards: CardPayload[];
  viraRank: Rank;
  displayedMyPlayedCard: string | null;
  displayedOpponentPlayedCard: string | null;
  showSecondary: boolean;
  eventLog: string[];
  liveTableTransition: MatchScreenTransitionState;
};

type MatchScreenViewModel = {
  headerProps: Pick<
    HeaderProps,
    'connectionStatus' | 'resolvedMatchId' | 'mySeat' | 'viraRank' | 'canStartHand'
  >;
  serverStateBanner: {
    isHidden: boolean;
    label: string;
    connectionStatusLabel: string;
    toneColor: string;
  };
  tableShellProps: Omit<TableShellProps, 'onAction' | 'onPlayCard'>;
  secondaryToggleLabel: string;
  showSecondary: boolean;
  roundsHistoryProps: RoundsHistoryProps;
  liveStatePanelProps: LiveStatePanelProps;
  eventLogText: string;
};

export function buildMatchScreenViewModel({
  connectionStatus,
  canRenderLiveState,
  hasHydratedMatchState,
  publicState,
  privateState,
  roomMode,
  viewModel,
  effectiveMyCards,
  viraRank,
  displayedOpponentPlayedCard,
  displayedMyPlayedCard,
  showSecondary,
  eventLog,
  liveTableTransition,
}: BuildMatchScreenViewModelParams): MatchScreenViewModel {
  return {
    headerProps: {
      connectionStatus,
      resolvedMatchId: viewModel.resolvedMatchId,
      mySeat: viewModel.mySeat,
      viraRank,
      canStartHand: viewModel.canStartHand,
    },
    serverStateBanner: {
      isHidden: hasHydratedMatchState,
      label: 'Aguardando estado do servidor…',
      connectionStatusLabel: connectionStatus,
      toneColor:
        connectionStatus === 'online'
          ? 'rgba(45,106,79,0.7)'
          : 'rgba(192,57,43,0.5)',
    },
    tableShellProps: {
      handStatusLabel: viewModel.handStatusLabel,
      handStatusTone: viewModel.handStatusTone,
      betState: viewModel.betState,
      currentValue: viewModel.currentValue,
      pendingValue: viewModel.pendingValue,
      requestedBy: viewModel.requestedBy,
      specialState: viewModel.specialState,
      specialDecisionPending: viewModel.specialDecisionPending,
      specialDecisionBy: viewModel.specialDecisionBy,
      winner: viewModel.winner,
      awardedPoints: viewModel.awardedPoints,
      latestRound: viewModel.latestRound,
      latestRoundMyPlayedCard: viewModel.myPlayedCard,
      latestRoundOpponentPlayedCard: viewModel.opponentPlayedCard,
      displayedResolvedRoundFinished: liveTableTransition.isResolvingRound,
      displayedResolvedRoundResult: liveTableTransition.isResolvingRound
        ? liveTableTransition.resolvedRoundResult
        : null,
      tablePhase: viewModel.tablePhase,
      canStartHand: viewModel.canStartHand,
      scoreLabel: viewModel.scoreLabel,
      opponentSeatView: viewModel.opponentSeatView,
      mySeatView: viewModel.mySeatView,
      isOneVsOne: viewModel.isOneVsOne,
      roomMode: roomMode ?? null,
      currentTurnSeatId: viewModel.currentTurnSeatId,
      displayedOpponentPlayedCard,
      displayedMyPlayedCard,
      opponentRevealKey: liveTableTransition.opponentRevealKey,
      myRevealKey:
        liveTableTransition.pendingPlayedCard?.owner === 'mine'
          ? liveTableTransition.pendingPlayedCard.id
          : 0,
      myCardLaunching:
        liveTableTransition.pendingPlayedCard?.owner === 'mine' && !viewModel.myPlayedCard,
      roundIntroKey: liveTableTransition.roundIntroKey,
      roundResolvedKey: liveTableTransition.roundResolvedKey,
      currentPrivateViraRank: viewModel.currentPrivateHand?.viraRank ?? null,
      currentPublicViraRank: viewModel.currentPublicHand?.viraRank ?? null,
      viraRank,
      availableActions: viewModel.availableActions,
      myCards: effectiveMyCards,
      canPlayCard: viewModel.canPlayCard,
      launchingCardKey: liveTableTransition.launchingCardKey,
      currentPrivateHand: viewModel.currentPrivateHand,
      currentPublicHand: viewModel.currentPublicHand,
      playedRoundsCount: viewModel.playedRoundsCount,
      isMyTurn: viewModel.currentTurnSeatId === viewModel.mySeat,
      isResolvingRound: liveTableTransition.isResolvingRound,
      closingTableCards: liveTableTransition.closingTableCards,
    },
    secondaryToggleLabel: `${showSecondary ? '▲' : '▼'} Painel técnico`,
    showSecondary,
    roundsHistoryProps: {
      rounds: viewModel.rounds,
      latestRound: viewModel.latestRound,
      playedRoundsCount: viewModel.playedRoundsCount,
    },
    liveStatePanelProps: {
      connectionStatus,
      resolvedMatchId: viewModel.resolvedMatchId,
      publicState,
      privateState,
      mySeat: viewModel.mySeat,
      currentTurnSeatId: viewModel.currentTurnSeatId,
      canStartHand: viewModel.canStartHand,
      canPlayCard: viewModel.canPlayCard,
      betState: viewModel.betState,
      specialStateLabel: formatSpecialState(viewModel.specialState),
      availableActionsSummary: formatAvailableActionsSummary(viewModel.availableActions),
      canRenderLiveState,
    },
    eventLogText: eventLog.length > 0 ? eventLog.join('\n') : 'Sem eventos.',
  };
}

function formatAvailableActionsSummary(
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
): string {
  const enabled = [
    availableActions.canRequestTruco ? 'truco' : null,
    availableActions.canRaiseToSix ? 'raise6' : null,
    availableActions.canRaiseToNine ? 'raise9' : null,
    availableActions.canRaiseToTwelve ? 'raise12' : null,
    availableActions.canAcceptBet ? 'acceptBet' : null,
    availableActions.canDeclineBet ? 'declineBet' : null,
    availableActions.canAcceptMaoDeOnze ? 'accept11' : null,
    availableActions.canDeclineMaoDeOnze ? 'decline11' : null,
    availableActions.canAttemptPlayCard ? 'playCard' : null,
  ].filter((action): action is string => action !== null);

  return enabled.length > 0 ? enabled.join(', ') : 'none';
}

function formatSpecialState(value: string): string {
  if (value === 'mao_de_onze') return 'Mão de 11';
  if (value === 'mao_de_ferro') return 'Mão de ferro';
  if (value === 'normal') return 'Normal';
  return value;
}