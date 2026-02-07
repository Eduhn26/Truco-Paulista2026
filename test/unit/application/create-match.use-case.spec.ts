import { CreateMatchUseCase } from '@game/application/use-cases/create-match.use-case';
import type { MatchRepository } from '@game/application/ports/match.repository';
import type { Match } from '@game/domain/entities/match';

class FakeMatchRepository implements MatchRepository {
  public created: Array<{ id: string; match: Match }> = [];
  private seq = 0;

  create(match: Match): Promise<string> {
    this.seq += 1;
    const id = `match_${this.seq}`;
    this.created.push({ id, match });
    return Promise.resolve(id);
  }

  getById(): Promise<Match | null> {
    return Promise.resolve(null);
  }

  save(): Promise<void> {
    return Promise.resolve();
  }
}

describe('CreateMatchUseCase', () => {
  it('creates a match with default pointsToWin and returns matchId', async () => {
    const repo = new FakeMatchRepository();
    const useCase = new CreateMatchUseCase(repo);

    const result = await useCase.execute({});

    expect(result.matchId).toBe('match_1');
    expect(repo.created).toHaveLength(1);
  });

  it('uses pointsToWin when provided', async () => {
    const repo = new FakeMatchRepository();
    const useCase = new CreateMatchUseCase(repo);

    const result = await useCase.execute({ pointsToWin: 15 });

    expect(result.matchId).toBe('match_1');
    expect(repo.created).toHaveLength(1);
  });

  it('throws on non-integer pointsToWin', async () => {
    const repo = new FakeMatchRepository();
    const useCase = new CreateMatchUseCase(repo);

    await expect(useCase.execute({ pointsToWin: 12.5 })).rejects.toThrow(
      'pointsToWin must be an integer',
    );
  });

  it('throws on invalid pointsToWin', async () => {
    const repo = new FakeMatchRepository();
    const useCase = new CreateMatchUseCase(repo);

    await expect(useCase.execute({ pointsToWin: 0 })).rejects.toThrow(
      'pointsToWin must be greater than 0',
    );
  });
});
