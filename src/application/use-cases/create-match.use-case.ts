import type { MatchRepository } from '@game/application/ports/match.repository';
import type {
  CreateMatchRequestDto,
  MatchMode,
} from '@game/application/dtos/requests/create-match.request.dto';
import type { CreateMatchResponseDto } from '@game/application/dtos/responses/create-match.response.dto';
import { Match } from '@game/domain/entities/match';

export class CreateMatchUseCase {
  constructor(private readonly matchRepository: MatchRepository) {}

  async execute(request: CreateMatchRequestDto): Promise<CreateMatchResponseDto> {
    const pointsToWin = this.normalizePointsToWin(request.pointsToWin);

    // Match mode is kept at the application boundary because the Domain aggregate
    // only owns match rules and scoring, not room composition.
    this.normalizeMode(request.mode);

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

  private normalizeMode(value: MatchMode | undefined): MatchMode {
    if (value === undefined) return '2v2';

    if (value !== '1v1' && value !== '2v2') {
      throw new Error('mode must be either "1v1" or "2v2"');
    }

    return value;
  }
}
