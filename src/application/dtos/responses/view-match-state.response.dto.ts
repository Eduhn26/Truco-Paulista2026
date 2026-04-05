import type { HandBetState, HandSpecialState, HandValue } from '@game/domain/entities/hand';
import type { MatchState } from '@game/domain/value-objects/match-state';
import type { PlayerId } from '@game/domain/value-objects/player-id';
import type { Rank } from '@game/domain/value-objects/rank';
import type { RoundResult } from '@game/domain/value-objects/round-result';

export type ViewMatchStateResponseDto = {
  matchId: string;
  state: MatchState;
  score: {
    playerOne: number;
    playerTwo: number;
  };
  currentHand: null | {
    viraRank: Rank;
    finished: boolean;
    viewerPlayerId: PlayerId | null;
    currentValue: HandValue;
    betState: HandBetState;
    pendingValue: HandValue | null;
    requestedBy: PlayerId | null;
    specialState: HandSpecialState;
    specialDecisionPending: boolean;
    specialDecisionBy: PlayerId | null;
    winner: PlayerId | null;
    awardedPoints: HandValue | null;
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
    rounds: Array<{
      playerOneCard: string | null;
      playerTwoCard: string | null;
      result: RoundResult | null;
      finished: boolean;
    }>;
  };
};
