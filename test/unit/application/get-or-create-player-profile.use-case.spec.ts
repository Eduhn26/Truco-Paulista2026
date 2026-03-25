import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

class FakePlayerProfileRepository implements PlayerProfileRepository {
  private readonly store = new Map<string, PlayerProfileSnapshot>();
  private sequence = 0;

  seed(profile: PlayerProfileSnapshot): void {
    this.store.set(profile.userId, profile);
  }

  findByUserId(userId: string): Promise<PlayerProfileSnapshot | null> {
    return Promise.resolve(this.store.get(userId) ?? null);
  }

  createForUser(userId: string): Promise<PlayerProfileSnapshot> {
    this.sequence += 1;

    const created: PlayerProfileSnapshot = {
      id: `profile-${this.sequence}`,
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
    return Promise.resolve(Array.from(this.store.values()).slice(0, limit));
  }
}

describe('GetOrCreatePlayerProfileUseCase', () => {
  it('returns an existing profile when the userId already exists', async () => {
    const repo = new FakePlayerProfileRepository();
    const existing: PlayerProfileSnapshot = {
      id: 'profile-1',
      userId: 'user-a',
      rating: 1125,
      wins: 3,
      losses: 1,
      matchesPlayed: 4,
    };

    repo.seed(existing);

    const useCase = new GetOrCreatePlayerProfileUseCase(repo);
    const result = await useCase.execute({ userId: 'user-a' });

    expect(result).toEqual({
      profile: existing,
    });
  });

  it('creates a new profile when the userId does not exist', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetOrCreatePlayerProfileUseCase(repo);

    const result = await useCase.execute({ userId: 'user-new' });

    expect(result).toEqual({
      profile: {
        id: 'profile-1',
        userId: 'user-new',
        rating: 1000,
        wins: 0,
        losses: 0,
        matchesPlayed: 0,
      },
    });
  });

  it('trims the incoming userId before lookup and creation', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetOrCreatePlayerProfileUseCase(repo);

    const result = await useCase.execute({ userId: '   user-trimmed   ' });

    expect(result.profile.userId).toBe('user-trimmed');
  });

  it('throws when userId is empty after trim', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetOrCreatePlayerProfileUseCase(repo);

    await expect(useCase.execute({ userId: '   ' })).rejects.toThrow('userId is required');
  });
});