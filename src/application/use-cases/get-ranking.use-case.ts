import type { PlayerProfileRepository } from '@game/application/ports/player-profile.repository';

type RankingEntryDto = {
  profileId: string;
  userId: string;
  rating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
};

type GetRankingRequestDto = {
  limit?: number;
};

type GetRankingResponseDto = {
  ranking: RankingEntryDto[];
};

export class GetRankingUseCase {
  constructor(private readonly repo: PlayerProfileRepository) {}

  async execute(request?: GetRankingRequestDto): Promise<GetRankingResponseDto> {
    const limit = this.normalizeLimit(request?.limit);
    const profiles = await this.repo.listTop(limit);

    return {
      ranking: profiles.map((profile) => ({
        profileId: profile.id,
        userId: profile.userId,
        rating: profile.rating,
        wins: profile.wins,
        losses: profile.losses,
        matchesPlayed: profile.matchesPlayed,
      })),
    };
  }

  private normalizeLimit(limit?: number): number {
    if (limit === undefined) {
      return 10;
    }

    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('limit must be a positive integer');
    }

    return limit;
  }
}