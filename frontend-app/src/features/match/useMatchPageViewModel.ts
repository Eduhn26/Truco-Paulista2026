import { useMemo } from 'react';
import { buildMatchContractPresentation } from './matchPresentationSelectors';
import { cardStringToPayload } from '../../services/socket/socketTypes';
import type {
  BotIdentityPayload,
  CardPayload,
  MatchStatePayload,
  RoomStatePayload,
} from '../../services/socket/socketTypes';

const TABLE_SEAT_ORDER_1V1 = ['T2A', 'T1A'] as const;


const EMPTY_AVAILABLE_ACTIONS = {
  canRequestTruco: false,
  canRaiseToSix: false,
  canRaiseToNine: false,
  canRaiseToTwelve: false,
  canAcceptBet: false,
  canDeclineBet: false,
  canAcceptMaoDeOnze: false,
  canDeclineMaoDeOnze: false,
  canAttemptPlayCard: false,
} satisfies NonNullable<MatchStatePayload['currentHand']>['availableActions'];

export type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
  botIdentity: BotIdentityPayload | null;
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

    const currentPublicHand = publicMatchState?.currentHand ?? null;
    const currentPrivateHand = privateMatchState?.currentHand ?? null;

    // Private hand is the viewer-authoritative source for actions. Public hand
    // remains the source for shared table history such as rounds and score.
    const viewerActionHand = currentPrivateHand;
    const availableActions = viewerActionHand?.availableActions ?? EMPTY_AVAILABLE_ACTIONS;
    const nextDecisionType =
      viewerActionHand?.nextDecisionType ?? currentPublicHand?.nextDecisionType ?? 'idle';

    const viewerCanActNow = Boolean(viewerActionHand?.viewerCanActNow);
    const inferredCurrentTurnSeatId =
      viewerCanActNow && mySeat !== null ? mySeat : (roomState?.currentTurnSeatId ?? null);

    const roomPlayers: TableSeatView[] = TABLE_SEAT_ORDER_1V1.map((seatId) => {
      const player = roomState?.players.find((entry) => entry.seatId === seatId);

      return {
        seatId,
        ready: player?.ready ?? false,
        isBot: player?.isBot ?? false,
        isCurrentTurn: inferredCurrentTurnSeatId === seatId,
        isMine: seatId === mySeat,
        botIdentity: player?.botIdentity ?? null,
      };
    });

    const mySeatView = roomPlayers.find((player) => player.isMine) ?? null;
    const opponentSeatView = roomPlayers.find((player) => !player.isMine) ?? null;

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

    const canPlayCard = Boolean(mySeat && availableActions.canAttemptPlayCard);
    const isMyTurn = Boolean(
      mySeat && (canPlayCard || viewerCanActNow || inferredCurrentTurnSeatId === mySeat),
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
      availableActions,
      canPlayCard,
      currentTurnSeatId: inferredCurrentTurnSeatId,
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
