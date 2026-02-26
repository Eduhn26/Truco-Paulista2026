import type {
  PlayerProfileRepository,
  PlayerProfileSnapshot,
} from '@game/application/ports/player-profile.repository';

// NOTE: Idempotente por design: o mesmo token sempre resolve no mesmo profile.
export class GetOrCreatePlayerProfileUseCase {
  constructor(private readonly repo: PlayerProfileRepository) {}

  async execute(input: { playerToken: string }): Promise<PlayerProfileSnapshot> {
    const token = input.playerToken.trim();

    if (!token) {
      throw new Error('playerToken is required');
    }

    const existing = await this.repo.findByToken(token);
    if (existing) return existing;

    return this.repo.create(token);
  }
}
