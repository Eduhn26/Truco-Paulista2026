import { GetOrCreatePlayerProfileUseCase } from '@game/application/use-cases/get-or-create-player-profile.use-case';
import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

class FakePlayerProfileRepository implements PlayerProfileRepository {
  private readonly store = new Map<string, PlayerProfileSnapshot>();
  private sequence = 0;

  seed(profile: PlayerProfileSnapshot): void {
    this.store.set(profile.playerToken, profile);
  }

  async findByToken(playerToken: string): Promise<PlayerProfileSnapshot | null> {
    return this.store.get(playerToken) ?? null;
  }

  async create(playerToken: string): Promise<PlayerProfileSnapshot> {
    this.sequence += 1;

    const created: PlayerProfileSnapshot = {
      id: `profile-${this.sequence}`,
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
    return Array.from(this.store.values()).slice(0, limit);
  }
}

describe('GetOrCreatePlayerProfileUseCase', () => {
  it('returns an existing profile when the token already exists', async () => {
    const repo = new FakePlayerProfileRepository();
    const existing: PlayerProfileSnapshot = {
      id: 'profile-1',
      playerToken: 'player-a',
      rating: 1125,
      wins: 3,
      losses: 1,
      matchesPlayed: 4,
    };

    repo.seed(existing);

    const useCase = new GetOrCreatePlayerProfileUseCase(repo);
    const result = await useCase.execute({ playerToken: 'player-a' });

    expect(result).toEqual(existing);
  });

  it('creates a new profile when the token does not exist', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetOrCreatePlayerProfileUseCase(repo);

    const result = await useCase.execute({ playerToken: 'player-new' });

    expect(result).toEqual({
      id: 'profile-1',
      playerToken: 'player-new',
      rating: 1000,
      wins: 0,
      losses: 0,
      matchesPlayed: 0,
    });
  });

  it('trims the incoming token before lookup and creation', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetOrCreatePlayerProfileUseCase(repo);

    const result = await useCase.execute({ playerToken: '   player-trimmed   ' });

    expect(result.playerToken).toBe('player-trimmed');
  });

  it('throws when playerToken is empty after trim', async () => {
    const repo = new FakePlayerProfileRepository();
    const useCase = new GetOrCreatePlayerProfileUseCase(repo);

    await expect(useCase.execute({ playerToken: '   ' })).rejects.toThrow(
      'playerToken is required',
    );
  });
});