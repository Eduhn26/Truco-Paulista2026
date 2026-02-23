import type { PlayerProfileRepository } from '@game/application/ports/player-profile.repository';

export type RankingEntryDto = {
  playerToken: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
};

export class GetRankingUseCase {
  constructor(private readonly repo: PlayerProfileRepository) {}

  async execute(dto?: { limit?: number }): Promise<RankingEntryDto[]> {
    const limit = dto?.limit ?? 20;

    const profiles = await this.repo.listTop(limit);

    return profiles.map((p) => ({
      playerToken: p.playerToken,
      rating: p.rating,
      wins: p.wins,
      losses: p.losses,
      matchesPlayed: p.matchesPlayed,
    }));
  }
}