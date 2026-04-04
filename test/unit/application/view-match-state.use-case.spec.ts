import { CreateMatchUseCase } from '../../../src/application/use-cases/create-match.use-case';
import { ViewMatchStateUseCase } from '../../../src/application/use-cases/view-match-state.use-case';
import { Match } from '../../../src/domain/entities/match';
import { InMemoryMatchRepository } from '../../../src/infrastructure/persistence/in-memory/in-memory-match.repository';

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
    expect(state.currentHand).toBeNull();
  });

  it('returns enriched current hand state for a pending truco response', async () => {
    const repo = new InMemoryMatchRepository();
    const match = new Match(12);

    match.start('4');
    match.requestTruco('P1');

    const matchId = await repo.create(match);
    await repo.save(matchId, match);

    const viewState = new ViewMatchStateUseCase(repo);
    const state = await viewState.execute({
      matchId,
      viewerPlayerId: 'P1',
    });

    expect(state.currentHand).not.toBeNull();
    expect(state.currentHand).toMatchObject({
      viraRank: '4',
      finished: false,
      viewerPlayerId: 'P1',
      currentValue: 1,
      betState: 'awaiting_response',
      pendingValue: 3,
      requestedBy: 'P1',
      specialState: 'normal',
      specialDecisionPending: false,
      specialDecisionBy: null,
      winner: null,
      awardedPoints: null,
      availableActions: {
        canRequestTruco: false,
        canRaiseToSix: false,
        canRaiseToNine: false,
        canRaiseToTwelve: false,
        canAcceptBet: false,
        canDeclineBet: false,
        canAcceptMaoDeOnze: false,
        canDeclineMaoDeOnze: false,
        canAttemptPlayCard: false,
      },
    });
  });

  it('masks the opponent hand for a viewer player', async () => {
    const repo = new InMemoryMatchRepository();
    const match = new Match(12);

    match.start('4');

    const matchId = await repo.create(match);
    await repo.save(matchId, match);

    const viewState = new ViewMatchStateUseCase(repo);
    const state = await viewState.execute({
      matchId,
      viewerPlayerId: 'P1',
    });

    expect(state.currentHand).not.toBeNull();
    expect(state.currentHand!.playerOneHand).not.toEqual(['HIDDEN', 'HIDDEN', 'HIDDEN']);
    expect(state.currentHand!.playerTwoHand).toEqual(['HIDDEN', 'HIDDEN', 'HIDDEN']);
    expect(state.currentHand!.availableActions.canRequestTruco).toBe(true);
    expect(state.currentHand!.availableActions.canAttemptPlayCard).toBe(true);
  });

  it('returns mao de onze fields when a special decision is pending', async () => {
    const repo = new InMemoryMatchRepository();
    const match = Match.fromSnapshot({
      pointsToWin: 12,
      state: 'waiting',
      score: {
        playerOne: 11,
        playerTwo: 8,
      },
      currentHand: null,
    });

    match.start('4');

    const matchId = await repo.create(match);
    await repo.save(matchId, match);

    const viewState = new ViewMatchStateUseCase(repo);
    const state = await viewState.execute({
      matchId,
      viewerPlayerId: 'P1',
    });

    expect(state.currentHand).not.toBeNull();
    expect(state.currentHand).toMatchObject({
      specialState: 'mao_de_onze',
      specialDecisionPending: true,
      specialDecisionBy: 'P1',
      currentValue: 1,
      betState: 'idle',
      availableActions: {
        canRequestTruco: false,
        canRaiseToSix: false,
        canRaiseToNine: false,
        canRaiseToTwelve: false,
        canAcceptBet: false,
        canDeclineBet: false,
        canAcceptMaoDeOnze: true,
        canDeclineMaoDeOnze: true,
        canAttemptPlayCard: false,
      },
    });
  });

  it('returns mao de ferro fields for the special 11x11 hand', async () => {
    const repo = new InMemoryMatchRepository();
    const match = Match.fromSnapshot({
      pointsToWin: 12,
      state: 'waiting',
      score: {
        playerOne: 11,
        playerTwo: 11,
      },
      currentHand: null,
    });

    match.start('4');

    const matchId = await repo.create(match);
    await repo.save(matchId, match);

    const viewState = new ViewMatchStateUseCase(repo);
    const state = await viewState.execute({
      matchId,
      viewerPlayerId: 'P2',
    });

    expect(state.currentHand).not.toBeNull();
    expect(state.currentHand).toMatchObject({
      specialState: 'mao_de_ferro',
      specialDecisionPending: false,
      specialDecisionBy: null,
      currentValue: 1,
      betState: 'idle',
      availableActions: {
        canRequestTruco: false,
        canRaiseToSix: false,
        canRaiseToNine: false,
        canRaiseToTwelve: false,
        canAcceptBet: false,
        canDeclineBet: false,
        canAcceptMaoDeOnze: false,
        canDeclineMaoDeOnze: false,
        canAttemptPlayCard: true,
      },
    });
  });

  it('returns available bet response actions for the defending player', async () => {
    const repo = new InMemoryMatchRepository();
    const match = new Match(12);

    match.start('4');
    match.requestTruco('P1');

    const matchId = await repo.create(match);
    await repo.save(matchId, match);

    const viewState = new ViewMatchStateUseCase(repo);
    const state = await viewState.execute({
      matchId,
      viewerPlayerId: 'P2',
    });

    expect(state.currentHand).not.toBeNull();
    expect(state.currentHand!.availableActions).toMatchObject({
      canAcceptBet: true,
      canDeclineBet: true,
      canAttemptPlayCard: false,
    });
  });

  it('returns raise-to-six as available after accepted truco', async () => {
    const repo = new InMemoryMatchRepository();
    const match = new Match(12);

    match.start('4');
    match.requestTruco('P1');
    match.acceptBet('P2');

    const matchId = await repo.create(match);
    await repo.save(matchId, match);

    const viewState = new ViewMatchStateUseCase(repo);
    const state = await viewState.execute({
      matchId,
      viewerPlayerId: 'P1',
    });

    expect(state.currentHand).not.toBeNull();
    expect(state.currentHand!.currentValue).toBe(3);
    expect(state.currentHand!.availableActions).toMatchObject({
      canRequestTruco: false,
      canRaiseToSix: true,
      canRaiseToNine: false,
      canRaiseToTwelve: false,
      canAttemptPlayCard: true,
    });
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
