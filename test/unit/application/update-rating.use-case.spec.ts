import { UpdateRatingUseCase } from '@game/application/use-cases/update-rating.use-case';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

class FakePlayerProfileRepository implements PlayerProfileRepository {
  private readonly store = new Map<string, PlayerProfileSnapshot>();

  seed(profile: PlayerProfileSnapshot): void {
    this.store.set(profile.playerToken, profile);
  }

  findByToken(playerToken: string): Promise<PlayerProfileSnapshot | null> {
    return Promise.resolve(this.store.get(playerToken) ?? null);
  }

  create(playerToken: string): Promise<PlayerProfileSnapshot> {
    const created: PlayerProfileSnapshot = {
      id: `profile-${playerToken}`,
      playerToken,
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    };

    this.store.set(playerToken, created);

    return Promise.resolve(created);
  }

  save(profile: PlayerProfileSnapshot): Promise<void> {
    this.store.set(profile.playerToken, profile);

    return Promise.resolve();
  }

  listTop(limit: number): Promise<PlayerProfileSnapshot[]> {
    return Promise.resolve(Array.from(this.store.values()).slice(0, limit));
  }

  getByToken(playerToken: string): PlayerProfileSnapshot | null {
    return this.store.get(playerToken) ?? null;
  }
}

describe('UpdateRatingUseCase', () => {
  it('updates winners and losers with the current simplified ELO rule', async () => {
    const repo = new FakePlayerProfileRepository();

    repo.seed({
      id: 'w1',
      playerToken: 'winner-1',
      rating: 1000,
      wins: 2,
      losses: 1,
      matchesPlayed: 3,
    });

    repo.seed({
      id: 'w2',
      playerToken: 'winner-2',
      rating: 1025,
      wins: 5,
      losses: 2,
      matchesPlayed: 7,
    });

    repo.seed({
      id: 'l1',
      playerToken: 'loser-1',
      rating: 1000,
      wins: 3,
      losses: 4,
      matchesPlayed: 7,
    });

    repo.seed({
      id: 'l2',
      playerToken: 'loser-2',
      rating: 1100,
      wins: 8,
      losses: 3,
      matchesPlayed: 11,
    });

    const useCase = new UpdateRatingUseCase(repo);
    const result = await useCase.execute({
      winnerTokens: ['winner-1', 'winner-2'],
      loserTokens: ['loser-1', 'loser-2'],
    });

    expect(result).toEqual({ ok: true });

    expect(repo.getByToken('winner-1')).toEqual({
      id: 'w1',
      playerToken: 'winner-1',
      rating: 1025,
      wins: 3,
      losses: 1,
      matchesPlayed: 4,
    });

    expect(repo.getByToken('winner-2')).toEqual({
      id: 'w2',
      playerToken: 'winner-2',
      rating: 1050,
      wins: 6,
      losses: 2,
      matchesPlayed: 8,
    });

    expect(repo.getByToken('loser-1')).toEqual({
      id: 'l1',
      playerToken: 'loser-1',
      rating: 975,
      wins: 3,
      losses: 5,
      matchesPlayed: 8,
    });

    expect(repo.getByToken('loser-2')).toEqual({
      id: 'l2',
      playerToken: 'loser-2',
      rating: 1075,
      wins: 8,
      losses: 4,
      matchesPlayed: 12,
    });
  });

  it('enforces the current rating floor of 100 for losers', async () => {
    const repo = new FakePlayerProfileRepository();

    repo.seed({
      id: 'winner',
      playerToken: 'winner',
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    });

    repo.seed({
      id: 'loser',
      playerToken: 'loser',
      rating: 100,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    });

    const useCase = new UpdateRatingUseCase(repo);

    await useCase.execute({
      winnerTokens: ['winner'],
      loserTokens: ['loser'],
    });

    expect(repo.getByToken('loser')).toEqual({
      id: 'loser',
      playerToken: 'loser',
      rating: 100,
      wins: 0,
      losses: 1,
      matchesPlayed: 1,
    });
  });

  it('throws when any winner profile is missing', async () => {
    const repo = new FakePlayerProfileRepository();

    repo.seed({
      id: 'loser',
      playerToken: 'loser',
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    });

    const useCase = new UpdateRatingUseCase(repo);

    await expect(
      useCase.execute({
        winnerTokens: ['missing-winner'],
        loserTokens: ['loser'],
      }),
    ).rejects.toThrow('Player profile not found');
  });

  it('throws when any loser profile is missing', async () => {
    const repo = new FakePlayerProfileRepository();

    repo.seed({
      id: 'winner',
      playerToken: 'winner',
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    });

    const useCase = new UpdateRatingUseCase(repo);

    await expect(
      useCase.execute({
        winnerTokens: ['winner'],
        loserTokens: ['missing-loser'],
      }),
    ).rejects.toThrow('Player profile not found');
  });
});
