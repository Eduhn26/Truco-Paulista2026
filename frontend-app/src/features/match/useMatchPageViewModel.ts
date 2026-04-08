import { useMemo } from 'react';

import { buildMatchContractPresentation } from './matchPresentationSelectors';
import { cardStringToPayload } from '../../services/socket/socketTypes';
import type {
  CardPayload,
  MatchStatePayload,
  PlayerAssignedPayload,
  RoomStatePayload,
} from '../../services/socket/socketTypes';
import type { MatchContractPresentation, MatchStatusTone, TablePhase } from './matchPresentationSelectors';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;
const TABLE_SEAT_ORDER_2V2 = ['T1B', 'T2A', 'T1A', 'T2B'] as const;

export type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
};

export type MatchViewModel = {
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
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
} & MatchContractPresentation;

type UseMatchPageViewModelParams = {
  effectiveMatchId: string;
  playerAssigned: PlayerAssignedPayload | null;
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
};

function getViewerCards(
  currentPrivateHand: MatchStatePayload['currentHand'] | null,
): CardPayload[] {
  if (!currentPrivateHand) {
    return [];
  }

  const rawViewerHand =
    currentPrivateHand.viewerPlayerId === 'P1'
      ? currentPrivateHand.playerOneHand
      : currentPrivateHand.viewerPlayerId === 'P2'
        ? currentPrivateHand.playerTwoHand
        : [];

  return rawViewerHand
    .map((card) => cardStringToPayload(card))
    .filter((card): card is CardPayload => card !== null);
}

export function useMatchPageViewModel(
  params: UseMatchPageViewModelParams,
): MatchViewModel {
  const { effectiveMatchId, playerAssigned, roomState, publicMatchState, privateMatchState } =
    params;

  return useMemo<MatchViewModel>(() => {
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

    const myIsPlayerOne = mySeat === 'T1A' || mySeat === 'T1B';
    const rounds = currentPublicHand?.rounds ?? [];
    const playedRounds = rounds.filter(
      (round) => round.playerOneCard !== null || round.playerTwoCard !== null,
    );
    const latestRound =
      playedRounds.length > 0 ? (playedRounds[playedRounds.length - 1] ?? null) : null;

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
    const matchFinished = publicMatchState?.state === 'finished';
    const canStartHand = Boolean(roomState?.canStart && publicMatchState?.state === 'waiting');
    const isMyTurn = Boolean(mySeat && roomState?.currentTurnSeatId === mySeat);
    const canPlayCard = Boolean(
      effectiveHand?.availableActions.canAttemptPlayCard &&
        mySeat &&
        myCards.length > 0 &&
        !handFinished,
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
      ...contractPresentation,
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
      currentPublicHand,
      currentPrivateHand,
    };
  }, [effectiveMatchId, playerAssigned, privateMatchState, publicMatchState, roomState]);
}

export type { MatchStatusTone, TablePhase };
