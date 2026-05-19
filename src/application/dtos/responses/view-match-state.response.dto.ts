import type {
  HandBetState,
  HandMode,
  HandSpecialState,
  HandValue,
} from '@game/domain/entities/hand';
import type { SeatId } from '@game/domain/entities/round';
import type { MatchState } from '@game/domain/value-objects/match-state';
import type { PlayerId } from '@game/domain/value-objects/player-id';
import type { Rank } from '@game/domain/value-objects/rank';
import type { RoundResult } from '@game/domain/value-objects/round-result';

export type NextDecisionType =
  | 'idle'
  | 'play-card'
  | 'respond-bet'
  | 'resolve-mao-de-onze'
  | 'start-next-hand'
  | 'match-finished';

export type ViewMatchStateRoundPlayDto = {
  ownerId: string;
  seatId: SeatId | null;
  playerId: PlayerId;
  card: string;
};

export type ViewMatchStateRoundDto = {
  playerOneCard: string | null;
  playerTwoCard: string | null;
  result: RoundResult | null;
  finished: boolean;
  seatPlays?: Partial<Record<SeatId, string | null>>;
  orderedPlays?: ViewMatchStateRoundPlayDto[];
  winningSeatId?: SeatId | null;
};

export type ViewMatchStateResponseDto = {
  matchId: string;
  state: MatchState;
  score: {
    playerOne: number;
    playerTwo: number;
  };
  currentHand: null | {
    viraRank: Rank;
    mode: HandMode;
    finished: boolean;
    viewerPlayerId: PlayerId | null;
    viewerSeatId: SeatId | null;
    currentValue: HandValue;
    betState: HandBetState;
    pendingValue: HandValue | null;
    requestedBy: PlayerId | null;
    specialState: HandSpecialState;
    specialDecisionPending: boolean;
    specialDecisionBy: PlayerId | null;
    winner: PlayerId | null;
    awardedPoints: HandValue | null;
    currentRoundIndex: number;
    lastRoundResult: RoundResult | null;
    nextDecisionType: NextDecisionType;
    viewerCanActNow: boolean;
    pendingBotAction: boolean;
    availableActions: {
      canRequestTruco: boolean;
      canRaiseToSix: boolean;
      canRaiseToNine: boolean;
      canRaiseToTwelve: boolean;
      canAcceptBet: boolean;
      canDeclineBet: boolean;
      canAcceptMaoDeOnze: boolean;
      canDeclineMaoDeOnze: boolean;
      canAttemptPlayCard: boolean;
    };
    playerOneHand: string[];
    playerTwoHand: string[];
    seatHands?: Partial<Record<SeatId, string[]>>;
    rounds: ViewMatchStateRoundDto[];
  };
};
