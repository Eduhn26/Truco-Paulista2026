import { StartHandUseCase } from '@game/application/use-cases/start-hand.use-case';
import type { MatchRepository } from '@game/application/ports/match.repository';
import { Match } from '@game/domain/entities/match';
import type { Match as MatchType } from '@game/domain/entities/match';

class FakeMatchRepository implements MatchRepository {
  private readonly store = new Map<string, MatchType>();

  seed(id: string, match: MatchType): void {
    this.store.set(id, match);
  }

  create(match: MatchType): Promise<string> {
    const id = `match_seeded_${this.store.size + 1}`;
    this.store.set(id, match);
    return Promise.resolve(id);
  }

  getById(id: string): Promise<MatchType | null> {
    return Promise.resolve(this.store.get(id) ?? null);
  }

  save(id: string, match: MatchType): Promise<void> {
    if (!this.store.has(id)) {
      throw new Error(`Match not found for save(): ${id}`);
    }
    this.store.set(id, match);
    return Promise.resolve();
  }
}

describe('StartHandUseCase', () => {
  it('starts a hand for an existing match and persists it', async () => {
    const repo = new FakeMatchRepository();
    repo.seed('match_1', new Match(12));

    const useCase = new StartHandUseCase(repo);

    await useCase.execute({ matchId: 'match_1', viraRank: '4' });

    const reloaded = await repo.getById('match_1');
    expect(reloaded?.getState()).toBe('in_progress');
  });

  it('throws when match does not exist', async () => {
    const repo = new FakeMatchRepository();
    const useCase = new StartHandUseCase(repo);

    await expect(useCase.execute({ matchId: 'missing', viraRank: '4' })).rejects.toThrow(
      'match not found',
    );
  });

  it('throws when matchId is empty', async () => {
    const repo = new FakeMatchRepository();
    const useCase = new StartHandUseCase(repo);

    await expect(useCase.execute({ matchId: '   ', viraRank: '4' })).rejects.toThrow(
      'matchId is required',
    );
  });
});
