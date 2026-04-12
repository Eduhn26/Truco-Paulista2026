import { useMemo } from 'react';
import { buildMatchContractPresentation } from './matchPresentationSelectors';
import { cardStringToPayload } from '../../services/socket/socketTypes';
import type {
  CardPayload,
  MatchStatePayload,
  RoomStatePayload,
} from '../../services/socket/socketTypes';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;

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
  handFinished: boolean;
  matchFinished: boolean;
  canStartHand: boolean;
  nextDecisionType: string;
} & ReturnType<typeof buildMatchContractPresentation>;

export function useMatchPageViewModel({
  matchId,
  mySeat,
  roomState,
  publicMatchState,
  privateMatchState,
}: {
  matchId: string | undefined;
  mySeat: string | null;
  roomState: RoomStatePayload | null;
  publicMatchState: MatchStatePayload | null;
  privateMatchState: MatchStatePayload | null;
}) {
  return useMemo<MatchViewModel>(() => {
    const resolvedMatchId = matchId ?? 'no-match';
    const isOneVsOne = true;

    const roomPlayers: TableSeatView[] = TABLE_SEAT_ORDER_1V1.map((seatId) => {
      const player = roomState?.players.find((entry) => entry.seatId === seatId);

      return {
        seatId,
        ready: player?.ready ?? false,
        isBot: player?.isBot ?? false,
        isCurrentTurn: roomState?.currentTurnSeatId === seatId,
        isMine: seatId === mySeat,
      };
    });

    const mySeatView = roomPlayers.find((player) => player.isMine) ?? null;
    const opponentSeatView = roomPlayers.find((player) => !player.isMine) ?? null;

    const currentPublicHand = publicMatchState?.currentHand ?? null;
    const currentPrivateHand = privateMatchState?.currentHand ?? null;

    // NOTE: Private state is the source for the viewer hand, but start-next-hand
    // semantics must still survive whenever either projection already carries them.
    const effectiveHand = currentPrivateHand ?? currentPublicHand;
    const nextDecisionType = effectiveHand?.nextDecisionType ?? 'idle';

    const myIsPlayerOne = mySeat === 'T1A';
    const rawViewerCards = myIsPlayerOne
      ? currentPrivateHand?.playerOneHand ?? []
      : currentPrivateHand?.playerTwoHand ?? [];

    const myCards = rawViewerCards
      .map((card) => cardStringToPayload(card))
      .filter((card): card is CardPayload => card !== null);

    const rounds = currentPublicHand?.rounds ?? [];
    const latestRound = rounds.length > 0 ? (rounds[rounds.length - 1] ?? null) : null;

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

    const handFinished =
      nextDecisionType === 'start-next-hand' || Boolean(currentPublicHand?.finished);
    const matchFinished = publicMatchState?.state === 'finished';

    // NOTE: Subsequent hands must respect the authoritative nextDecisionType even
    // if room ready flags are temporarily stale.
    const canStartHand = Boolean(
      !matchFinished &&
        (nextDecisionType === 'start-next-hand' ||
          (publicMatchState?.state === 'waiting' && roomState?.canStart === true)),
    );

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
      scoreLabel: `T1 ${publicMatchState?.score.playerOne ?? 0} × T2 ${publicMatchState?.score.playerTwo ?? 0}`,
      currentPublicHand,
      currentPrivateHand,
      handFinished,
      matchFinished,
      canStartHand,
      nextDecisionType,
    };
  }, [matchId, mySeat, roomState, publicMatchState, privateMatchState]);
}
