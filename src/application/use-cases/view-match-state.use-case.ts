import { Inject, Injectable } from '@nestjs/common';

import type { MatchRepository } from '@game/application/ports/match.repository';
import {
  type ViewMatchStateRequestDto,
  type ViewMatchStateResponseDto,
} from '@game/application/dtos/responses/view-match-state.response.dto';
import { mapMatchToViewMatchState } from '@game/application/mappers/match-to-view-match-state.mapper';
import { MATCH_REPOSITORY } from '@game/modules/game.tokens';

@Injectable()
export class ViewMatchStateUseCase {
  constructor(
    @Inject(MATCH_REPOSITORY)
    private readonly matchRepository: MatchRepository,
  ) {}

  async execute(request: ViewMatchStateRequestDto): Promise<ViewMatchStateResponseDto> {
    const matchId = request.matchId.trim();

    if (!matchId) {
      throw new Error('matchId is required');
    }

    const match = await this.matchRepository.getById(matchId);

    if (!match) {
      throw new Error('match not found');
    }

    return mapMatchToViewMatchState(matchId, match, request.viewerPlayerId);
  }
}
