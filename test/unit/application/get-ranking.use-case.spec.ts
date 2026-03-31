import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

class FakePlayerProfileRepository implements PlayerProfileRepository {
  private readonly store = new Map<string, PlayerProfileSnapshot>();
  public lastListTopLimit: number | null = null;

  seed(profile: PlayerProfileSnapshot): void {
    this.store.set(profile.userId, profile);
  }

  findByUserId(userId: string): Promise<PlayerProfileSnapshot | null> {
    return Promise.resolve(this.store.get(userId) ?? null);
  }

  createForUser(userId: string): Promise<PlayerProfileSnapshot> {
    const created: PlayerProfileSnapshot = {
      id: `profile-${userId}`,
      userId,
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    };

    this.store.set(userId, created);

    return Promise.resolve(created);
  }

  save(profile: PlayerProfileSnapshot): Promise<void> {
    this.store.set(profile.userId, profile);

    return Promise.resolve();
  }

  listTop(limit: number): Promise<PlayerProfileSnapshot[]> {
    this.lastListTopLimit = limit;

    return Promise.resolve(
      Array.from(this.store.values())
        .sort((a, b) => b.rating - a.rating)
        .slice(0, limit),
    );
  }
}

describe('GetRankingUseCase', () => {
  it('uses 10 as the default limit', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetRankingUseCase(repo);

    const result = await useCase.execute();

    expect(repo.lastListTopLimit).toBe(10);
    expect(result).toEqual({ ranking: [] });
  });

  it('passes a custom limit to the repository', async () => {
    const repo = new FakePlayerProfileRepository();

    repo.seed({
      id: 'p1',
      userId: 'user-1',
      rating: 1200,
      wins: 10,
      losses: 2,
      matchesPlayed: 12,
    });

    repo.seed({
      id: 'p2',
      userId: 'user-2',
      rating: 1100,
      wins: 7,
      losses: 4,
      matchesPlayed: 11,
    });

    repo.seed({
      id: 'p3',
      userId: 'user-3',
      rating: 1300,
      wins: 14,
      losses: 1,
      matchesPlayed: 15,
    });

    const useCase = new GetRankingUseCase(repo);
    const result = await useCase.execute({ limit: 2 });

    expect(repo.lastListTopLimit).toBe(2);
    expect(result).toEqual({
      ranking: [
        {
          profileId: 'p3',
          userId: 'user-3',
          rating: 1300,
          wins: 14,
          losses: 1,
          matchesPlayed: 15,
        },
        {
          profileId: 'p1',
          userId: 'user-1',
          rating: 1200,
          wins: 10,
          losses: 2,
          matchesPlayed: 12,
        },
      ],
    });
  });

  it('returns an empty ranking when there are no profiles', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetRankingUseCase(repo);

    const result = await useCase.execute({ limit: 5 });

    expect(result).toEqual({ ranking: [] });
  });
});
