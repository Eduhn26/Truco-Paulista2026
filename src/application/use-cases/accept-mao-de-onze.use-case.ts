import type { MatchRepository } from '@game/application/ports/match.repository';
import type { AcceptMaoDeOnzeRequestDto } from '@game/application/dtos/requests/accept-mao-de-onze.request.dto';
import type { AcceptMaoDeOnzeResponseDto } from '@game/application/dtos/responses/accept-mao-de-onze.response.dto';
import type { PlayerId } from '@game/domain/value-objects/player-id';

function ensureRequired(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${field} is required`);
  }

  return normalized;
}

function normalizePlayerId(value: string): PlayerId {
  const normalized = value.trim().toUpperCase();

  if (normalized === 'P1' || normalized === 'P2') {
    return normalized;
  }

  throw new Error('invalid playerId');
}

export class AcceptMaoDeOnzeUseCase {
  constructor(private readonly matchRepository: MatchRepository) {}

  async execute(request: AcceptMaoDeOnzeRequestDto): Promise<AcceptMaoDeOnzeResponseDto> {
    const matchId = ensureRequired(request.matchId, 'matchId');
    const playerId = normalizePlayerId(ensureRequired(request.playerId, 'playerId'));

    const match = await this.matchRepository.getById(matchId);

    if (!match) {
      throw new Error('match not found');
    }

    match.acceptMaoDeOnze(playerId);
    await this.matchRepository.save(matchId, match);

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
}
