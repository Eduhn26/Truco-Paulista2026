import type { Match } from '../../domain/entities/match';
import type { ViewMatchStateResponseDto } from '../dtos/responses/view-match-state.response.dto';

export function mapMatchToViewMatchState(matchId: string, match: Match): ViewMatchStateResponseDto {
  const score = match.getScore();

  return {
    matchId,
    state: match.getState(),
    score: {
      playerOne: score.playerOne,
      playerTwo: score.playerTwo,
    },
  };
}
