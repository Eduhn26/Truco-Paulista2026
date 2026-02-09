import type { MatchRepository } from '../ports/match.repository';
import type { ViewMatchStateRequestDto } from '../dtos/requests/view-match-state.request.dto';
import type { ViewMatchStateResponseDto } from '../dtos/responses/view-match-state.response.dto';

import { mapMatchToViewMatchState } from '../mappers/match-to-view-match-state.mapper';

export class ViewMatchStateUseCase {
  constructor(private readonly matchRepository: MatchRepository) {}

  async execute(request: ViewMatchStateRequestDto): Promise<ViewMatchStateResponseDto> {
    if (!request.matchId || request.matchId.trim().length === 0) {
      throw new Error('matchId is required');
    }

    const match = await this.matchRepository.getById(request.matchId);
    if (!match) {
      throw new Error('match not found');
    }

    return mapMatchToViewMatchState(request.matchId, match);
  }
}
