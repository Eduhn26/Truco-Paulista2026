import type { MatchRepository } from '@game/application/ports/match.repository';
import type { StartHandRequestDto } from '@game/application/dtos/requests/start-hand.request.dto';
import type { StartHandResponseDto } from '@game/application/dtos/responses/start-hand.response.dto';
import type { HandMode } from '@game/domain/entities/hand';
import { assertRank, type Rank } from '@game/domain/value-objects/rank';

export class StartHandUseCase {
  constructor(private readonly matchRepository: MatchRepository) {}

  async execute(request: StartHandRequestDto): Promise<StartHandResponseDto> {
    const matchId = this.normalizeMatchId(request.matchId);
    const viraRank = this.normalizeOptionalViraRank(request.viraRank);
    const mode = this.normalizeMode(request.mode);

    const match = await this.matchRepository.getById(matchId);
    if (!match) {
      throw new Error('match not found');
    }

    match.start(viraRank, mode);
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

  private normalizeOptionalViraRank(value?: string): Rank | undefined {
    if (value === undefined) {
      return undefined;
    }

    const normalized = value.trim();
    assertRank(normalized);
    return normalized;
  }

  private normalizeMode(value?: HandMode): HandMode {
    if (value === '2v2') {
      return '2v2';
    }

    return '1v1';
  }
}
