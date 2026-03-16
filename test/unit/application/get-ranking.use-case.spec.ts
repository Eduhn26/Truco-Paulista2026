import { GetRankingUseCase } from '@game/application/use-cases/get-ranking.use-case';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

class FakePlayerProfileRepository implements PlayerProfileRepository {
  private readonly store = new Map<string, PlayerProfileSnapshot>();
  public lastListTopLimit: number | null = null;

  seed(profile: PlayerProfileSnapshot): void {
    this.store.set(profile.playerToken, profile);
  }

  async findByToken(playerToken: string): Promise<PlayerProfileSnapshot | null> {
    return this.store.get(playerToken) ?? null;
  }

  async create(playerToken: string): Promise<PlayerProfileSnapshot> {
    const created: PlayerProfileSnapshot = {
      id: `profile-${playerToken}`,
      playerToken,
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    };

    this.store.set(playerToken, created);
    return created;
  }

  async save(profile: PlayerProfileSnapshot): Promise<void> {
    this.store.set(profile.playerToken, profile);
  }

  async listTop(limit: number): Promise<PlayerProfileSnapshot[]> {
    this.lastListTopLimit = limit;

    return Array.from(this.store.values())
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
  }
}

describe('GetRankingUseCase', () => {
  it('uses 20 as the default limit', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetRankingUseCase(repo);

    const result = await useCase.execute();

    expect(repo.lastListTopLimit).toBe(20);
    expect(result).toEqual([]);
  });

  it('passes a custom limit to the repository', async () => {
    const repo = new FakePlayerProfileRepository();

    repo.seed({
      id: 'p1',
      playerToken: 'player-1',
      rating: 1200,
      wins: 10,
      losses: 2,
      matchesPlayed: 12,
    });

    repo.seed({
      id: 'p2',
      playerToken: 'player-2',
      rating: 1100,
      wins: 7,
      losses: 4,
      matchesPlayed: 11,
    });

    repo.seed({
      id: 'p3',
      playerToken: 'player-3',
      rating: 1300,
      wins: 14,
      losses: 1,
      matchesPlayed: 15,
    });

    const useCase = new GetRankingUseCase(repo);
    const result = await useCase.execute({ limit: 2 });

    expect(repo.lastListTopLimit).toBe(2);
    expect(result).toEqual([
      {
        playerToken: 'player-3',
        rating: 1300,
        wins: 14,
        losses: 1,
        matchesPlayed: 15,
      },
      {
        playerToken: 'player-1',
        rating: 1200,
        wins: 10,
        losses: 2,
        matchesPlayed: 12,
      },
    ]);
  });

  it('returns an empty list when there are no profiles', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetRankingUseCase(repo);

    const result = await useCase.execute({ limit: 5 });

    expect(result).toEqual([]);
  });
});