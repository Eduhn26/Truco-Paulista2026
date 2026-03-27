import type { Match } from '../../domain/entities/match';
import { Round } from '../../domain/entities/round';
import type { ViewMatchStateResponseDto } from '../dtos/responses/view-match-state.response.dto';

export function mapMatchToViewMatchState(matchId: string, match: Match): ViewMatchStateResponseDto {
  const score = match.getScore();
  const currentHand = match.getCurrentHand();

  return {
    matchId,
    state: match.getState(),
    score: {
      playerOne: score.playerOne,
      playerTwo: score.playerTwo,
    },
    currentHand: currentHand
      ? {
          viraRank: currentHand.toSnapshot().viraRank,
          finished: currentHand.toSnapshot().finished,
          playerOneHand: currentHand.getPlayerHand('P1').map((card) => card.toString()),
          playerTwoHand: currentHand.getPlayerHand('P2').map((card) => card.toString()),
          rounds: currentHand.toSnapshot().rounds.map((round) => ({
            playerOneCard: round.plays.P1 ?? null,
            playerTwoCard: round.plays.P2 ?? null,
            result: round.finished ? Round.fromSnapshot(round).getResult() : null,
            finished: round.finished,
          })),
        }
      : null,
  };
}