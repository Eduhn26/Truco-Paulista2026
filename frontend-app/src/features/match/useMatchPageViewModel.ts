import { useMemo } from 'react';

import {
  buildMatchContractPresentation,
  type MatchStatusTone,
  type TablePhase,
} from './matchPresentationSelectors';
import { cardStringToPayload } from '../../services/socket/socketTypes';
import type {
  CardPayload,
  MatchStatePayload,
  PlayerAssignedPayload,
  RoomStatePayload,
} from '../../services/socket/socketTypes';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;
const TABLE_SEAT_ORDER_2V2 = ['T1B', 'T2A', 'T1A', 'T2B'] as const;

export type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
};

type LatestRoundView = NonNullable<MatchStatePayload['currentHand']>['rounds'][number] | null;

type AvailableActions = NonNullable<MatchStatePayload['currentHand']>['availableActions'];

export type MatchPageViewModel = {
  resolvedMatchId: string;
  mySeat: string | null;
  isOneVsOne: boolean;
  roomPlayers: TableSeatView[];
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
  availableActions: AvailableActions;
  handFinished: boolean;
  matchFinished: boolean;
  tablePhase: TablePhase;
  handStatusLabel: string;
  handStatusTone: MatchStatusTone;
  latestRound: LatestRoundView;
  rounds: NonNullable<MatchStatePayload['currentHand']>['rounds'];
  playedRoundsCount: number;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
};

type UseMatchPageViewModelParams = {
  effectiveMatchId: string;
  playerAssigned: PlayerAssignedPayload | null;
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
};

type UseMatchPageViewModelResult = {
  viewModel: MatchPageViewModel;
  hasHydratedMatchState: boolean;
};

export function useMatchPageViewModel(
  params: UseMatchPageViewModelParams,
): UseMatchPageViewModelResult {
  const { effectiveMatchId, playerAssigned, roomState, publicMatchState, privateMatchState } =
    params;

  return useMemo(() => {
    const resolvedMatchId =
      privateMatchState?.matchId ||
      publicMatchState?.matchId ||
      roomState?.matchId ||
      effectiveMatchId;

    const mySeat = playerAssigned?.seatId ?? null;
    const currentPublicHand = publicMatchState?.currentHand ?? null;
    const currentPrivateHand = privateMatchState?.currentHand ?? null;
    const isOneVsOne = roomState?.mode === '1v1';
    const visibleSeatOrder = isOneVsOne ? TABLE_SEAT_ORDER_1V1 : TABLE_SEAT_ORDER_2V2;

    const roomPlayers: TableSeatView[] = visibleSeatOrder.map((seatId) => {
      const player = roomState?.players.find((entry) => entry.seatId === seatId);

      return {
        seatId,
        ready: player?.ready ?? false,
        isBot: player?.isBot ?? false,
        isCurrentTurn: roomState?.currentTurnSeatId === seatId,
        isMine: mySeat === seatId,
      };
    });

    const mySeatView = roomPlayers.find((seat) => seat.isMine) ?? null;
    const opponentSeatView = roomPlayers.find((seat) => !seat.isMine) ?? null;

    const myCards = getViewerCards(currentPrivateHand);
    const effectiveHand = currentPrivateHand ?? currentPublicHand;
    const availableActions = effectiveHand?.availableActions ?? emptyAvailableActions();

    const myIsPlayerOne = mySeat === 'T1A' || mySeat === 'T1B';
    const rounds = currentPublicHand?.rounds ?? [];
    const playedRounds = rounds.filter(
      (round) => round.playerOneCard !== null || round.playerTwoCard !== null,
    );
    const latestRound = playedRounds.length > 0 ? (playedRounds[playedRounds.length - 1] ?? null) : null;

    const myPlayedCard = latestRound
      ? myIsPlayerOne
        ? latestRound.playerOneCard
        : latestRound.playerTwoCard
      : null;

    const opponentPlayedCard = latestRound
      ? myIsPlayerOne
        ? latestRound.playerTwoCard
        : latestRound.playerOneCard
      : null;

    const handFinished = Boolean(currentPublicHand?.finished);
    const canStartHand = Boolean(roomState?.canStart && publicMatchState?.state === 'waiting');
    const isMyTurn = Boolean(mySeat && roomState?.currentTurnSeatId === mySeat);
    const canPlayCard = Boolean(
      availableActions.canAttemptPlayCard && mySeat && myCards.length > 0 && !handFinished,
    );

    const contractPresentation = buildMatchContractPresentation({
      publicMatchState,
      roomState,
      canStartHand,
      canPlayCard,
      isMyTurn,
      myCardsCount: myCards.length,
    });

    return {
      viewModel: {
        resolvedMatchId,
        mySeat,
        isOneVsOne,
        roomPlayers,
        mySeatView,
        opponentSeatView,
        myCards,
        myPlayedCard,
        opponentPlayedCard,
        scoreLabel: `T1 ${publicMatchState?.score.playerOne ?? 0} × T2 ${
          publicMatchState?.score.playerTwo ?? 0
        }`,
        currentTurnSeatId: contractPresentation.currentTurnSeatId,
        canStartHand: contractPresentation.canStartHand,
        canPlayCard: contractPresentation.canPlayCard,
        currentValue: contractPresentation.currentValue,
        betState: contractPresentation.betState,
        pendingValue: contractPresentation.pendingValue,
        requestedBy: contractPresentation.requestedBy,
        specialState: contractPresentation.specialState,
        specialDecisionPending: contractPresentation.specialDecisionPending,
        specialDecisionBy: contractPresentation.specialDecisionBy,
        winner: contractPresentation.winner,
        awardedPoints: contractPresentation.awardedPoints,
        availableActions: contractPresentation.availableActions,
        handFinished: contractPresentation.handFinished,
        matchFinished: contractPresentation.matchFinished,
        tablePhase: contractPresentation.tablePhase,
        handStatusLabel: contractPresentation.handStatusLabel,
        handStatusTone: contractPresentation.handStatusTone,
        latestRound: contractPresentation.latestRound,
        rounds: contractPresentation.rounds,
        playedRoundsCount: contractPresentation.playedRoundsCount,
        currentPublicHand,
        currentPrivateHand,
      },
      hasHydratedMatchState: Boolean(roomState || publicMatchState || privateMatchState || playerAssigned),
    };
  }, [effectiveMatchId, playerAssigned, privateMatchState, publicMatchState, roomState]);
}

function getViewerCards(currentPrivateHand: MatchStatePayload['currentHand'] | null): CardPayload[] {
  if (!currentPrivateHand) {
    return [];
  }

  const rawViewerHand =
    currentPrivateHand.viewerPlayerId === 'P1'
      ? currentPrivateHand.playerOneHand
      : currentPrivateHand.viewerPlayerId === 'P2'
        ? currentPrivateHand.playerTwoHand
        : [];

  // NOTE: The private contract is viewer-aware through viewerPlayerId plus the
  // two explicit hand arrays. We derive the visible hand from that contract
  // instead of assuming a separate viewerHand field that does not exist.
  return rawViewerHand
    .map((card) => cardStringToPayload(card))
    .filter((card): card is CardPayload => card !== null);
}

function emptyAvailableActions(): AvailableActions {
  return {
    canRequestTruco: false,
    canRaiseToSix: false,
    canRaiseToNine: false,
    canRaiseToTwelve: false,
    canAcceptBet: false,
    canDeclineBet: false,
    canAcceptMaoDeOnze: false,
    canDeclineMaoDeOnze: false,
    canAttemptPlayCard: false,
  };
}