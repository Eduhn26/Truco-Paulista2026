import type { MatchRepository } from '@game/application/ports/match.repository';
import type { StartHandRequestDto } from '@game/application/dtos/requests/start-hand.request.dto';
import type { StartHandResponseDto } from '@game/application/dtos/responses/start-hand.response.dto';
import { assertRank } from '@game/domain/value-objects/rank';
import type { Rank } from '@game/domain/value-objects/rank';

// Application use case: starts a new hand for an existing match and persists the updated state.
export class StartHandUseCase {
  constructor(private readonly matchRepository: MatchRepository) {}

  async execute(request: StartHandRequestDto): Promise<StartHandResponseDto> {
    const matchId = this.normalizeMatchId(request.matchId);
    const viraRank = this.normalizeViraRank(request.viraRank);

    const match = await this.matchRepository.getById(matchId);
    if (!match) {
      throw new Error('match not found');
    }

    match.start(viraRank);
    await this.matchRepository.save(matchId, match);

    return { matchId };
  }

  private normalizeMatchId(value: string): string {
    const normalized = value.trim();
    if (normalized.length === 0) {
      throw new Error('matchId is required');
    }
    return normalized;
  }

  private normalizeViraRank(value: string): Rank {
    const normalized = value.trim();
    assertRank(normalized);
    return normalized;
  }
}
