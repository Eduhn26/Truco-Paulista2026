import type { CreateMatchRecordInputDto } from '@game/application/dtos/match-record.dto';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';

export type SaveMatchRecordRequestDto = CreateMatchRecordInputDto;

export type SaveMatchRecordResponseDto = {
  id: string;
};

export class SaveMatchRecordUseCase {
  constructor(private readonly matchRecordRepository: MatchRecordRepository) {}

  async execute(request: SaveMatchRecordRequestDto): Promise<SaveMatchRecordResponseDto> {
    const input = this.normalizeRequest(request);

    return this.matchRecordRepository.save(input);
  }

  private normalizeRequest(request: SaveMatchRecordRequestDto): SaveMatchRecordRequestDto {
    const matchId = this.requireNonEmptyString(request.matchId, 'matchId');
    const pointsToWin = this.normalizePositiveInteger(request.pointsToWin, 'pointsToWin');
    const mode = this.normalizeMode(request.mode);
    const status = this.normalizeStatus(request.status);
    const startedAt = this.normalizeNullableIsoDate(request.startedAt, 'startedAt');
    const finishedAt = this.normalizeNullableIsoDate(request.finishedAt, 'finishedAt');

    if (startedAt && finishedAt && new Date(finishedAt).getTime() < new Date(startedAt).getTime()) {
      throw new Error('finishedAt must be greater than or equal to startedAt');
    }

    if (!Array.isArray(request.participants) || request.participants.length === 0) {
      throw new Error('participants must contain at least one item');
    }

    if (!Array.isArray(request.replayEvents)) {
      throw new Error('replayEvents must be an array');
    }

    const participants = request.participants.map((participant, index) =>
      this.normalizeParticipant(participant, index),
    );

    this.assertUniqueSeatIds(participants);

    const finalState = this.normalizeFinalState(request.finalState);
    const replayEvents = request.replayEvents.map((event, index) =>
      this.normalizeReplayEvent(event, index),
    );

    this.assertSequentialReplayEvents(replayEvents);

    return {
      matchId,
      mode,
      status,
      pointsToWin,
      startedAt,
      finishedAt,
      participants,
      finalState,
      replayEvents,
    };
  }

  private normalizeParticipant(
    participant: SaveMatchRecordRequestDto['participants'][number],
    index: number,
  ): SaveMatchRecordRequestDto['participants'][number] {
    const seatId = this.normalizeSeatId(participant.seatId, `participants[${index}].seatId`);
    const displayName = this.normalizeNullableString(
      participant.displayName,
      `participants[${index}].displayName`,
    );
    const userId = this.normalizeNullableString(
      participant.userId,
      `participants[${index}].userId`,
    );
    const botProfile = this.normalizeBotProfile(
      participant.botProfile,
      `participants[${index}].botProfile`,
    );

    if (typeof participant.isBot !== 'boolean') {
      throw new Error(`participants[${index}].isBot must be a boolean`);
    }

    if (participant.isBot && !botProfile) {
      throw new Error(`participants[${index}].botProfile is required for bot participants`);
    }

    if (!participant.isBot && botProfile) {
      throw new Error(`participants[${index}].botProfile must be null for human participants`);
    }

    return {
      seatId,
      userId,
      displayName,
      isBot: participant.isBot,
      botProfile,
    };
  }

  private normalizeFinalState(
    finalState: SaveMatchRecordRequestDto['finalState'],
  ): SaveMatchRecordRequestDto['finalState'] {
    const state = this.requireNonEmptyString(finalState.state, 'finalState.state');
    const viraRank = this.normalizeNullableString(finalState.viraRank, 'finalState.viraRank');
    const roundsPlayed = this.normalizeNonNegativeInteger(
      finalState.roundsPlayed,
      'finalState.roundsPlayed',
    );
    const winnerPlayerId = this.normalizeWinnerPlayerId(
      finalState.winnerPlayerId,
      'finalState.winnerPlayerId',
    );

    return {
      state,
      viraRank,
      score: {
        playerOne: this.normalizeNonNegativeInteger(
          finalState.score.playerOne,
          'finalState.score.playerOne',
        ),
        playerTwo: this.normalizeNonNegativeInteger(
          finalState.score.playerTwo,
          'finalState.score.playerTwo',
        ),
      },
      roundsPlayed,
      winnerPlayerId,
    };
  }

  private normalizeReplayEvent(
    event: SaveMatchRecordRequestDto['replayEvents'][number],
    index: number,
  ): SaveMatchRecordRequestDto['replayEvents'][number] {
    const sequence = this.normalizeNonNegativeInteger(
      event.sequence,
      `replayEvents[${index}].sequence`,
    );
    const occurredAt = this.normalizeIsoDate(event.occurredAt, `replayEvents[${index}].occurredAt`);

    if (!event.payload || typeof event.payload !== 'object' || Array.isArray(event.payload)) {
      throw new Error(`replayEvents[${index}].payload must be an object`);
    }

    if (typeof event.payload.type !== 'string') {
      throw new Error(`replayEvents[${index}].payload.type is required`);
    }

    return {
      sequence,
      occurredAt,
      payload: event.payload,
    };
  }

  private assertUniqueSeatIds(participants: SaveMatchRecordRequestDto['participants']): void {
    const seatIds = new Set<string>();

    for (const participant of participants) {
      if (seatIds.has(participant.seatId)) {
        throw new Error(`duplicate participant seatId: ${participant.seatId}`);
      }

      seatIds.add(participant.seatId);
    }
  }

  private assertSequentialReplayEvents(
    replayEvents: SaveMatchRecordRequestDto['replayEvents'],
  ): void {
    const sortedReplayEvents = [...replayEvents].sort(
      (left, right) => left.sequence - right.sequence,
    );

    sortedReplayEvents.forEach((event, index) => {
      if (event.sequence !== index) {
        throw new Error('replayEvents sequence must start at 0 and increment by 1');
      }
    });
  }

  private normalizeMode(
    value: SaveMatchRecordRequestDto['mode'],
  ): SaveMatchRecordRequestDto['mode'] {
    if (value !== '1v1' && value !== '2v2') {
      throw new Error('mode must be either "1v1" or "2v2"');
    }

    return value;
  }

  private normalizeStatus(
    value: SaveMatchRecordRequestDto['status'],
  ): SaveMatchRecordRequestDto['status'] {
    if (value !== 'completed' && value !== 'cancelled' && value !== 'aborted') {
      throw new Error('status must be "completed", "cancelled", or "aborted"');
    }

    return value;
  }

  private normalizeSeatId(
    value: SaveMatchRecordRequestDto['participants'][number]['seatId'],
    fieldName: string,
  ): SaveMatchRecordRequestDto['participants'][number]['seatId'] {
    if (value !== 'T1A' && value !== 'T2A' && value !== 'T1B' && value !== 'T2B') {
      throw new Error(`${fieldName} must be one of T1A, T2A, T1B, T2B`);
    }

    return value;
  }

  private normalizeWinnerPlayerId(
    value: SaveMatchRecordRequestDto['finalState']['winnerPlayerId'],
    fieldName: string,
  ): SaveMatchRecordRequestDto['finalState']['winnerPlayerId'] {
    if (value === null || value === 'P1' || value === 'P2') {
      return value;
    }

    throw new Error(`${fieldName} must be "P1", "P2", or null`);
  }

  private normalizeBotProfile(
    value: SaveMatchRecordRequestDto['participants'][number]['botProfile'],
    fieldName: string,
  ): SaveMatchRecordRequestDto['participants'][number]['botProfile'] {
    if (value === null || value === 'balanced' || value === 'aggressive' || value === 'cautious') {
      return value;
    }

    throw new Error(`${fieldName} must be "balanced", "aggressive", "cautious", or null`);
  }

  private requireNonEmptyString(value: string, fieldName: string): string {
    if (typeof value !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    const normalizedValue = value.trim();

    if (!normalizedValue) {
      throw new Error(`${fieldName} is required`);
    }

    return normalizedValue;
  }

  private normalizeNullableString(value: string | null, fieldName: string): string | null {
    if (value === null) {
      return null;
    }

    return this.requireNonEmptyString(value, fieldName);
  }

  private normalizePositiveInteger(value: number, fieldName: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${fieldName} must be a positive integer`);
    }

    return value;
  }

  private normalizeNonNegativeInteger(value: number, fieldName: string): number {
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`${fieldName} must be a non-negative integer`);
    }

    return value;
  }

  private normalizeNullableIsoDate(value: string | null, fieldName: string): string | null {
    if (value === null) {
      return null;
    }

    return this.normalizeIsoDate(value, fieldName);
  }

  private normalizeIsoDate(value: string, fieldName: string): string {
    const normalizedValue = this.requireNonEmptyString(value, fieldName);
    const parsedDate = new Date(normalizedValue);

    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error(`${fieldName} must be a valid ISO date string`);
    }

    return parsedDate.toISOString();
  }
}
