import { Injectable } from '@nestjs/common';

import type {
  MatchHistoryListItemDto,
  MatchRecordDto,
  MatchReplayDto,
} from '@game/application/dtos/match-record.dto';
import type { MatchRecordRepository } from '@game/application/ports/match-record.repository';
import { PrismaService } from '@game/infrastructure/persistence/prisma/prisma.service';
import {
  toCreateMatchRecordPersistenceInput,
  toMatchHistoryListItemDto,
  toMatchRecordDto,
  toMatchReplayDto,
  type MatchRecordPersistenceRow,
} from '@game/infrastructure/persistence/match-record.persistence';

@Injectable()
export class PrismaMatchRecordRepository implements MatchRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(record: Parameters<MatchRecordRepository['save']>[0]): Promise<{ id: string }> {
    const input = toCreateMatchRecordPersistenceInput(record);

    const created = await this.prisma.matchRecord.create({
      data: {
        matchId: input.matchId,
        mode: input.mode,
        status: input.status,
        pointsToWin: input.pointsToWin,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        finalState: input.finalState,
        finalViraRank: input.finalViraRank,
        finalScorePlayerOne: input.finalScorePlayerOne,
        finalScorePlayerTwo: input.finalScorePlayerTwo,
        roundsPlayed: input.roundsPlayed,
        winnerPlayerId: input.winnerPlayerId,
        participants: {
          create: input.participants.map((participant) => ({
            seatId: participant.seatId,
            userId: participant.userId,
            displayName: participant.displayName,
            isBot: participant.isBot,
            botProfile: participant.botProfile,
          })),
        },
        replayEvents: {
          create: input.replayEvents.map((event) => ({
            sequence: event.sequence,
            eventType: event.eventType,
            occurredAt: event.occurredAt,
            payload: event.payload,
          })),
        },
      },
      select: {
        id: true,
      },
    });

    return created;
  }

  async getByMatchId(matchId: string): Promise<MatchRecordDto | null> {
    const normalizedMatchId = this.normalizeMatchId(matchId);

    const row = await this.prisma.matchRecord.findUnique({
      where: { matchId: normalizedMatchId },
      include: {
        participants: true,
        replayEvents: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!row) {
      return null;
    }

    return toMatchRecordDto(this.toPersistenceRow(row));
  }

  async listByUserId(userId: string, limit: number): Promise<MatchHistoryListItemDto[]> {
    const normalizedUserId = this.normalizeUserId(userId);
    const normalizedLimit = this.normalizeLimit(limit);

    const rows = await this.prisma.matchRecord.findMany({
      where: {
        participants: {
          some: {
            userId: normalizedUserId,
          },
        },
      },
      include: {
        participants: true,
        replayEvents: false,
      },
      orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }],
      take: normalizedLimit,
    });

    return rows.map((row) =>
      toMatchHistoryListItemDto({
        ...this.toPersistenceRow(row),
        replayEvents: [],
      }),
    );
  }

  async getReplayByMatchId(matchId: string): Promise<MatchReplayDto | null> {
    const normalizedMatchId = this.normalizeMatchId(matchId);

    const row = await this.prisma.matchRecord.findUnique({
      where: { matchId: normalizedMatchId },
      include: {
        participants: false,
        replayEvents: {
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!row) {
      return null;
    }

    return toMatchReplayDto({
      ...this.toPersistenceRow(row),
      participants: [],
    });
  }

  private normalizeMatchId(matchId: string): string {
    const normalizedMatchId = matchId.trim();

    if (!normalizedMatchId) {
      throw new Error('matchId is required');
    }

    return normalizedMatchId;
  }

  private normalizeUserId(userId: string): string {
    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      throw new Error('userId is required');
    }

    return normalizedUserId;
  }

  private normalizeLimit(limit: number): number {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error('limit must be a positive integer');
    }

    return limit;
  }

  private toPersistenceRow(row: {
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
    participants?: Array<{
      id: string;
      seatId: string;
      userId: string | null;
      displayName: string | null;
      isBot: boolean;
      botProfile: string | null;
      createdAt: Date;
    }>;
    replayEvents?: Array<{
      id: string;
      sequence: number;
      eventType: string;
      occurredAt: Date;
      payload: unknown;
      createdAt: Date;
    }>;
  }): MatchRecordPersistenceRow {
    return {
      id: row.id,
      matchId: row.matchId,
      mode: row.mode,
      status: row.status,
      pointsToWin: row.pointsToWin,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      finalState: row.finalState,
      finalViraRank: row.finalViraRank,
      finalScorePlayerOne: row.finalScorePlayerOne,
      finalScorePlayerTwo: row.finalScorePlayerTwo,
      roundsPlayed: row.roundsPlayed,
      winnerPlayerId: row.winnerPlayerId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      participants: row.participants ?? [],
      replayEvents: row.replayEvents ?? [],
    };
  }
}
