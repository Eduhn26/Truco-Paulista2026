import { InMemoryMatchRepository } from '../../../src/infrastructure/persistence/in-memory/in-memory-match.repository';
import { CreateMatchUseCase } from '../../../src/application/use-cases/create-match.use-case';
import { ViewMatchStateUseCase } from '../../../src/application/use-cases/view-match-state.use-case';

describe('ViewMatchStateUseCase (Application)', () => {
  it('returns match state and score', async () => {
    const repo = new InMemoryMatchRepository();
    const createMatch = new CreateMatchUseCase(repo);
    const viewState = new ViewMatchStateUseCase(repo);

    const created = await createMatch.execute({ pointsToWin: 3 });
    const state = await viewState.execute({ matchId: created.matchId });

    expect(state.matchId).toBe(created.matchId);
    expect(state.state).toBe('waiting');
    expect(state.score).toEqual({ playerOne: 0, playerTwo: 0 });
  });

  it('throws when match does not exist', async () => {
    const repo = new InMemoryMatchRepository();
    const viewState = new ViewMatchStateUseCase(repo);

    await expect(viewState.execute({ matchId: 'missing' })).rejects.toThrow('match not found');
  });

  it('validates matchId', async () => {
    const repo = new InMemoryMatchRepository();
    const viewState = new ViewMatchStateUseCase(repo);

    await expect(viewState.execute({ matchId: '   ' })).rejects.toThrow('matchId is required');
  });
});
