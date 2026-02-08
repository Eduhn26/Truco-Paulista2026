import { Card } from '@game/domain/value-objects/card';
import type { PlayerId } from '@game/domain/value-objects/player-id';

import type { PlayCardRequestDto } from '../dtos/requests/play-card.request.dto';
import type { PlayCardResponseDto } from '../dtos/responses/play-card.response.dto';
import type { MatchRepository } from '../ports/match.repository';

function ensureRequired(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function normalizePlayerId(value: string): PlayerId {
  const normalized = value.trim().toUpperCase();

  if (normalized === 'P1' || normalized === 'P2') {
    return normalized;
  }

  throw new Error('invalid playerId');
}

export class PlayCardUseCase {
  constructor(private readonly matchRepository: MatchRepository) {}

  async execute(request: PlayCardRequestDto): Promise<PlayCardResponseDto> {
    const matchId = ensureRequired(request.matchId, 'matchId');
    const playerId = normalizePlayerId(ensureRequired(request.playerId, 'playerId'));
    const cardValue = ensureRequired(request.card, 'card').toUpperCase();

    const match = await this.matchRepository.getById(matchId);
    if (!match) throw new Error('match not found');

    match.play(playerId, Card.from(cardValue));

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
