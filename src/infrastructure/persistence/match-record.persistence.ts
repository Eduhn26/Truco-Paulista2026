import type {
  CreateMatchRecordInputDto,
  MatchHistoryListItemDto,
  MatchRecordDto,
  MatchReplayDto,
  MatchReplayEventDto,
  MatchReplayEventPayloadDto,
} from '@game/application/dtos/match-record.dto';

export type MatchRecordPersistenceRow = {
  id: string;
  matchId: string;
  mode: string;
  status: string;
  pointsToWin: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  finalState: string;
  finalViraRank: string | null;
  finalScorePlayerOne: number;
  finalScorePlayerTwo: number;
  roundsPlayed: number;
  winnerPlayerId: string | null;
  createdAt: Date;
  updatedAt: Date;
  participants: MatchRecordParticipantPersistenceRow[];
  replayEvents: MatchReplayEventPersistenceRow[];
};

export type MatchRecordParticipantPersistenceRow = {
  id: string;
  seatId: string;
  userId: string | null;
  displayName: string | null;
  isBot: boolean;
  botProfile: string | null;
  createdAt: Date;
};

export type MatchReplayEventPersistenceRow = {
  id: string;
  sequence: number;
  eventType: string;
  occurredAt: Date;
  payload: unknown;
  createdAt: Date;
};

export type CreateMatchRecordPersistenceInput = {
  matchId: string;
  mode: string;
  status: string;
  pointsToWin: number;
  startedAt: Date | null;
  finishedAt: Date | null;
  finalState: string;
  finalViraRank: string | null;
  finalScorePlayerOne: number;
  finalScorePlayerTwo: number;
  roundsPlayed: number;
  winnerPlayerId: string | null;
  participants: Array<{
    seatId: string;
    userId: string | null;
    displayName: string | null;
    isBot: boolean;
    botProfile: string | null;
  }>;
  replayEvents: Array<{
    sequence: number;
    eventType: string;
    occurredAt: Date;
    payload: MatchReplayEventPayloadDto;
  }>;
};

export function toCreateMatchRecordPersistenceInput(
  input: CreateMatchRecordInputDto,
): CreateMatchRecordPersistenceInput {
  return {
    matchId: input.matchId,
    mode: input.mode,
    status: input.status,
    pointsToWin: input.pointsToWin,
    startedAt: toNullableDate(input.startedAt),
    finishedAt: toNullableDate(input.finishedAt),
    finalState: input.finalState.state,
    finalViraRank: input.finalState.viraRank,
    finalScorePlayerOne: input.finalState.score.playerOne,
    finalScorePlayerTwo: input.finalState.score.playerTwo,
    roundsPlayed: input.finalState.roundsPlayed,
    winnerPlayerId: input.finalState.winnerPlayerId,
    participants: input.participants.map((participant) => ({
      seatId: participant.seatId,
      userId: participant.userId,
      displayName: participant.displayName,
      isBot: participant.isBot,
      botProfile: participant.botProfile,
    })),
    replayEvents: input.replayEvents.map((event) => ({
      sequence: event.sequence,
      eventType: event.payload.type,
      occurredAt: new Date(event.occurredAt),
      payload: event.payload,
    })),
  };
}

export function toMatchRecordDto(row: MatchRecordPersistenceRow): MatchRecordDto {
  return {
    id: row.id,
    matchId: row.matchId,
    mode: assertHistoricalMode(row.mode),
    status: assertHistoricalStatus(row.status),
    pointsToWin: row.pointsToWin,
    startedAt: toNullableIsoString(row.startedAt),
    finishedAt: toNullableIsoString(row.finishedAt),
    participants: row.participants.map((participant) => ({
      seatId: assertSeatId(participant.seatId),
      userId: participant.userId,
      displayName: participant.displayName,
      isBot: participant.isBot,
      botProfile: assertBotProfile(participant.botProfile),
    })),
    finalState: {
      state: row.finalState,
      viraRank: row.finalViraRank,
      score: {
        playerOne: row.finalScorePlayerOne,
        playerTwo: row.finalScorePlayerTwo,
      },
      roundsPlayed: row.roundsPlayed,
      winnerPlayerId: assertWinnerPlayerId(row.winnerPlayerId),
    },
    replayEvents: row.replayEvents
      .slice()
      .sort((left, right) => left.sequence - right.sequence)
      .map(toMatchReplayEventDto),
  };
}

export function toMatchHistoryListItemDto(row: MatchRecordPersistenceRow): MatchHistoryListItemDto {
  return {
    id: row.id,
    matchId: row.matchId,
    mode: assertHistoricalMode(row.mode),
    status: assertHistoricalStatus(row.status),
    startedAt: toNullableIsoString(row.startedAt),
    finishedAt: toNullableIsoString(row.finishedAt),
    participants: row.participants.map((participant) => ({
      seatId: assertSeatId(participant.seatId),
      userId: participant.userId,
      displayName: participant.displayName,
      isBot: participant.isBot,
      botProfile: assertBotProfile(participant.botProfile),
    })),
    finalScore: {
      playerOne: row.finalScorePlayerOne,
      playerTwo: row.finalScorePlayerTwo,
    },
    winnerPlayerId: assertWinnerPlayerId(row.winnerPlayerId),
  };
}

export function toMatchReplayDto(row: MatchRecordPersistenceRow): MatchReplayDto {
  return {
    matchId: row.matchId,
    events: row.replayEvents
      .slice()
      .sort((left, right) => left.sequence - right.sequence)
      .map(toMatchReplayEventDto),
  };
}

function toMatchReplayEventDto(row: MatchReplayEventPersistenceRow): MatchReplayEventDto {
  return {
    sequence: row.sequence,
    occurredAt: row.occurredAt.toISOString(),
    payload: assertReplayPayload(row.payload, row.eventType),
  };
}

function toNullableDate(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function toNullableIsoString(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function assertHistoricalMode(value: string): '1v1' | '2v2' {
  if (value === '1v1' || value === '2v2') {
    return value;
  }

  throw new Error(`unsupported historical mode: ${value}`);
}

function assertHistoricalStatus(value: string): 'completed' | 'cancelled' | 'aborted' {
  if (value === 'completed' || value === 'cancelled' || value === 'aborted') {
    return value;
  }

  throw new Error(`unsupported historical status: ${value}`);
}

function assertSeatId(value: string): 'T1A' | 'T2A' | 'T1B' | 'T2B' {
  if (value === 'T1A' || value === 'T2A' || value === 'T1B' || value === 'T2B') {
    return value;
  }

  throw new Error(`unsupported seatId: ${value}`);
}

function assertWinnerPlayerId(value: string | null): 'P1' | 'P2' | null {
  if (value === null || value === 'P1' || value === 'P2') {
    return value;
  }

  throw new Error(`unsupported winnerPlayerId: ${value}`);
}

function assertBotProfile(value: string | null): 'balanced' | 'aggressive' | 'cautious' | null {
  if (value === null || value === 'balanced' || value === 'aggressive' || value === 'cautious') {
    return value;
  }

  throw new Error(`unsupported botProfile: ${value}`);
}

function assertReplayPayload(value: unknown, eventType: string): MatchReplayEventPayloadDto {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`invalid replay payload for eventType: ${eventType}`);
  }

  const payload = value as { type?: unknown };

  if (payload.type !== eventType) {
    throw new Error(`replay payload type mismatch for eventType: ${eventType}`);
  }

  return value as MatchReplayEventPayloadDto;
}
