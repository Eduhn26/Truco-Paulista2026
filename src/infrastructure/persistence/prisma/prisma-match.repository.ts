import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import type { MatchRepository } from '@game/application/ports/match.repository';

import { Match, type MatchSnapshot } from '@game/domain/entities/match';
import type { HandSnapshot } from '@game/domain/entities/hand';

import { PrismaService } from './prisma.service';

type PersistedData = {
  currentHand: HandSnapshot | null;
};

type PersistedScore = {
  playerOne: number;
  playerTwo: number;
};

@Injectable()
export class PrismaMatchRepository implements MatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(match: Match): Promise<string> {
    const matchId = `match_${randomUUID().replace(/-/g, '')}`;
    const snapshot = match.toSnapshot();

    this.logSnapshot('create', matchId, snapshot);

    await this.prisma.matchSnapshot.create({
      data: {
        matchId,
        pointsToWin: snapshot.pointsToWin,
        state: snapshot.state,
        score: snapshot.score,
        data: {
          currentHand: snapshot.currentHand,
        },
      },
    });

    return matchId;
  }

  async save(id: string, match: Match): Promise<void> {
    const snapshot = match.toSnapshot();

    this.logSnapshot('save', id, snapshot);

    await this.prisma.matchSnapshot.update({
      where: { matchId: id },
      data: {
        pointsToWin: snapshot.pointsToWin,
        state: snapshot.state,
        score: snapshot.score,
        data: {
          currentHand: snapshot.currentHand,
        },
      },
    });
  }

  async getById(id: string): Promise<Match | null> {
    const row = await this.prisma.matchSnapshot.findUnique({
      where: { matchId: id },
    });

    if (!row) return null;

    const score = this.readScore(row.score);
    const data = this.readData(row.data);

    const snapshot: MatchSnapshot = {
      pointsToWin: row.pointsToWin,
      state: row.state as MatchSnapshot['state'],
      score,
      currentHand: data.currentHand,
    };

    this.logSnapshot('load', id, snapshot);

    return Match.fromSnapshot(snapshot);
  }

  private readScore(value: unknown): PersistedScore {
    if (!this.isRecord(value)) {
      return { playerOne: 0, playerTwo: 0 };
    }

    const rawPlayerOne = value['playerOne'];
    const rawPlayerTwo = value['playerTwo'];

    const playerOne = typeof rawPlayerOne === 'number' ? rawPlayerOne : 0;
    const playerTwo = typeof rawPlayerTwo === 'number' ? rawPlayerTwo : 0;

    return { playerOne, playerTwo };
  }

  private readData(value: unknown): PersistedData {
    if (!this.isRecord(value)) {
      return { currentHand: null };
    }

    const rawCurrentHand = value['currentHand'];

    // NOTE: Persistence may contain legacy rows without currentHand.
    // Normalizing to null keeps the hydration contract explicit and stable.
    return {
      currentHand: rawCurrentHand == null ? null : (rawCurrentHand as HandSnapshot),
    };
  }

  private logSnapshot(
    stage: 'create' | 'save' | 'load',
    matchId: string,
    snapshot: MatchSnapshot,
  ): void {
    const currentHand = snapshot.currentHand;

    console.log(`[match-repo][${stage}]`, {
      matchId,
      state: snapshot.state,
      score: snapshot.score,
      currentHand: currentHand
        ? {
            currentValue: currentHand.currentValue,
            betState: currentHand.betState,
            pendingValue: currentHand.pendingValue,
            requestedBy: currentHand.requestedBy,
            raiseAuthority: currentHand.raiseAuthority,
            finished: currentHand.finished,
            winner: currentHand.winner,
            awardedPoints: currentHand.awardedPoints,
          }
        : null,
    });
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
