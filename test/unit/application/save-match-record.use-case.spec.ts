import { SaveMatchRecordUseCase } from '@game/application/use-cases/save-match-record.use-case';
import type {
  CreateMatchRecordInputDto,
  MatchHistoryListItemDto,
  MatchRecordDto,
  MatchReplayDto,
} from '@game/application/dtos/match-record.dto';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';

class FakeMatchRecordRepository implements MatchRecordRepository {
  public lastSavedInput: CreateMatchRecordInputDto | null = null;

  save(record: CreateMatchRecordInputDto): Promise<{ id: string }> {
    this.lastSavedInput = record;

    return Promise.resolve({ id: 'record-1' });
  }

  getByMatchId(_matchId: string): Promise<MatchRecordDto | null> {
    return Promise.resolve(null);
  }

  listByUserId(_userId: string, _limit: number): Promise<MatchHistoryListItemDto[]> {
    return Promise.resolve([]);
  }

  getReplayByMatchId(_matchId: string): Promise<MatchReplayDto | null> {
    return Promise.resolve(null);
  }
}

function createValidRequest(): CreateMatchRecordInputDto {
  return {
    matchId: 'match-1',
    mode: '1v1',
    status: 'completed',
    pointsToWin: 12,
    startedAt: '2026-04-01T01:00:00.000Z',
    finishedAt: '2026-04-01T01:10:00.000Z',
    participants: [
      {
        seatId: 'T1A',
        userId: 'user-1',
        displayName: 'Eduardo',
        isBot: false,
        botProfile: null,
      },
      {
        seatId: 'T2A',
        userId: null,
        displayName: 'Bot',
        isBot: true,
        botProfile: 'balanced',
      },
    ],
    finalState: {
      state: 'finished',
      viraRank: '4',
      score: {
        playerOne: 12,
        playerTwo: 8,
      },
      roundsPlayed: 3,
      winnerPlayerId: 'P1',
    },
    replayEvents: [
      {
        sequence: 0,
        occurredAt: '2026-04-01T01:00:00.000Z',
        payload: {
          type: 'match-created',
          pointsToWin: 12,
          mode: '1v1',
        },
      },
      {
        sequence: 1,
        occurredAt: '2026-04-01T01:01:00.000Z',
        payload: {
          type: 'match-finished',
          winnerPlayerId: 'P1',
          score: {
            playerOne: 12,
            playerTwo: 8,
          },
          finalState: 'finished',
        },
      },
    ],
  };
}

describe('SaveMatchRecordUseCase', () => {
  it('saves a normalized match record', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new SaveMatchRecordUseCase(repo);

    const result = await useCase.execute(createValidRequest());

    expect(result).toEqual({ id: 'record-1' });
    expect(repo.lastSavedInput).not.toBeNull();
    expect(repo.lastSavedInput?.matchId).toBe('match-1');
    expect(repo.lastSavedInput?.participants).toHaveLength(2);
    expect(repo.lastSavedInput?.replayEvents).toHaveLength(2);
  });

  it('throws when participants is empty', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new SaveMatchRecordUseCase(repo);
    const request = createValidRequest();

    request.participants = [];

    await expect(useCase.execute(request)).rejects.toThrow(
      'participants must contain at least one item',
    );
  });

  it('throws when replay event sequence is not contiguous', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new SaveMatchRecordUseCase(repo);
    const request = createValidRequest();

    request.replayEvents = [
      {
        sequence: 1,
        occurredAt: '2026-04-01T01:00:00.000Z',
        payload: {
          type: 'match-created',
          pointsToWin: 12,
          mode: '1v1',
        },
      },
    ];

    await expect(useCase.execute(request)).rejects.toThrow(
      'replayEvents sequence must start at 0 and increment by 1',
    );
  });

  it('throws when a human participant carries botProfile', async () => {
    const repo = new FakeMatchRecordRepository();
    const useCase = new SaveMatchRecordUseCase(repo);
    const request = createValidRequest();

    request.participants[0] = {
      seatId: 'T1A',
      userId: 'user-1',
      displayName: 'Eduardo',
      isBot: false,
      botProfile: 'aggressive',
    };

    await expect(useCase.execute(request)).rejects.toThrow(
      'participants[0].botProfile must be null for human participants',
    );
  });
});
