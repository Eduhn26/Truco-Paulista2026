import type { MatchRepository } from '@game/application/ports/match.repository';
import type { CreateMatchRequestDto } from '@game/application/dtos/requests/create-match.request.dto';
import type { CreateMatchResponseDto } from '@game/application/dtos/responses/create-match.response.dto';
import { Match } from '@game/domain/entities/match';

// Application use case: creates a match and persists it via MatchRepository.
export class CreateMatchUseCase {
  constructor(private readonly matchRepository: MatchRepository) {}

  async execute(request: CreateMatchRequestDto): Promise<CreateMatchResponseDto> {
    const pointsToWin = this.normalizePointsToWin(request.pointsToWin);

    const match = new Match(pointsToWin);
    const matchId = await this.matchRepository.create(match);

    return { matchId };
  }

  private normalizePointsToWin(value: number | undefined): number {
    if (value === undefined) return 12;

    if (!Number.isInteger(value)) {
      throw new Error('pointsToWin must be an integer');
    }

    if (value <= 0) {
      throw new Error('pointsToWin must be greater than 0');
    }

    return value;
  }
}
