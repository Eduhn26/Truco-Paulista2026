import { Injectable } from '@nestjs/common';

import type { MatchRepository } from '@game/application/ports/match.repository';

import { Match } from '@game/domain/entities/match';
import { Hand } from '@game/domain/entities/hand';
import { Round } from '@game/domain/entities/round';
import { Card } from '@game/domain/value-objects/card';
import { Score } from '@game/domain/value-objects/score';
import type { PlayerId } from '@game/domain/value-objects/player-id';
import type { MatchState } from '@game/domain/value-objects/match-state';
import type { Rank } from '@game/domain/value-objects/rank';

import { PrismaService } from './prisma.service';

type RoundSnapshot = {
  plays: Partial<Record<PlayerId, string>>;
  finished: boolean;
};

type HandSnapshot = {
  viraRank: Rank;
  finished: boolean;
  rounds: RoundSnapshot[];
};

type MatchSnapshot = {
  state: MatchState;
  pointsToWin: number;
  score: {
    playerOne: number;
    playerTwo: number;
  };
  currentHand: HandSnapshot | null;
};

// Tipo auxiliar para representar o retorno cru do Prisma (onde Json é unknown/any)
type PrismaMatchRow = {
  id: string;
  pointsToWin: number;
  state: string;
  data: unknown;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PrismaMatchRepository implements MatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(match: Match): Promise<string> {
    const snapshot = this.toSnapshot(match);

    // Casting para { id: string } pois o Prisma retorna tipos complexos gerados
    const created = (await this.prisma.match.create({
      data: {
        pointsToWin: snapshot.pointsToWin,
        state: snapshot.state,
        data: snapshot as unknown as object, // Prisma Json exige input object/array
      },
      select: { id: true },
    })) as { id: string };

    return created.id;
  }

  async getById(id: string): Promise<Match | null> {
    // Casting do retorno do findUnique
    const row = (await this.prisma.match.findUnique({
      where: { id },
    })) as PrismaMatchRow | null;

    if (!row) return null;

    // Converte o campo Json para o nosso tipo MatchSnapshot
    const snapshot = row.data as MatchSnapshot;
    return this.fromSnapshot(snapshot);
  }

  async save(id: string, match: Match): Promise<void> {
    const snapshot = this.toSnapshot(match);

    await this.prisma.match.update({
      where: { id },
      data: {
        pointsToWin: snapshot.pointsToWin,
        state: snapshot.state,
        data: snapshot as unknown as object,
      },
    });
  }

  // ---------------------------
  // Snapshot (Domain -> JSON)
  // ---------------------------

  private toSnapshot(match: Match): MatchSnapshot {
    const anyMatch = match as unknown as {
      state: MatchState;
      score: Score;
      currentHand: Hand | null;
      pointsToWin: number;
    };

    const score = anyMatch.score;

    return {
      state: anyMatch.state,
      pointsToWin: anyMatch.pointsToWin,
      score: {
        playerOne: score.playerOne,
        playerTwo: score.playerTwo,
      },
      currentHand: anyMatch.currentHand ? this.handToSnapshot(anyMatch.currentHand) : null,
    };
  }

  private handToSnapshot(hand: Hand): HandSnapshot {
    const anyHand = hand as unknown as {
      viraRank: Rank;
      finished: boolean;
      rounds: Round[];
    };

    return {
      viraRank: anyHand.viraRank,
      finished: anyHand.finished,
      rounds: anyHand.rounds.map((r) => this.roundToSnapshot(r)),
    };
  }

  private roundToSnapshot(round: Round): RoundSnapshot {
    const anyRound = round as unknown as {
      plays: Map<PlayerId, Card>;
      finished: boolean;
    };

    const plays: Partial<Record<PlayerId, string>> = {};
    for (const [player, card] of anyRound.plays.entries()) {
      plays[player] = card.toString();
    }

    return {
      plays,
      finished: anyRound.finished,
    };
  }

  // ---------------------------
  // Hydration (JSON -> Domain)
  // ---------------------------

  private fromSnapshot(snapshot: MatchSnapshot): Match {
    const match = new Match(snapshot.pointsToWin);

    // state
    (match as unknown as { state: MatchState }).state = snapshot.state;

    // score (reconstrói sem violar ctor privado)
    let score = Score.zero();
    for (let i = 0; i < snapshot.score.playerOne; i += 1) score = score.addPoint('P1');
    for (let i = 0; i < snapshot.score.playerTwo; i += 1) score = score.addPoint('P2');
    (match as unknown as { score: Score }).score = score;

    // currentHand
    if (snapshot.currentHand) {
      (match as unknown as { currentHand: Hand | null }).currentHand = this.handFromSnapshot(
        snapshot.currentHand,
      );
    } else {
      (match as unknown as { currentHand: Hand | null }).currentHand = null;
    }

    return match;
  }

  private handFromSnapshot(snapshot: HandSnapshot): Hand {
    const hand = new Hand(snapshot.viraRank);

    const rounds = snapshot.rounds.map((rs) => this.roundFromSnapshot(rs, snapshot.viraRank));

    // sobrescreve estado interno
    (hand as unknown as { rounds: Round[] }).rounds = rounds;
    (hand as unknown as { finished: boolean }).finished = snapshot.finished;

    return hand;
  }

  private roundFromSnapshot(snapshot: RoundSnapshot, viraRank: Rank): Round {
    const round = new Round(viraRank);

    // rehidrata plays
    const plays = new Map<PlayerId, Card>();
    if (snapshot.plays.P1) plays.set('P1', Card.from(snapshot.plays.P1));
    if (snapshot.plays.P2) plays.set('P2', Card.from(snapshot.plays.P2));

    (round as unknown as { plays: Map<PlayerId, Card> }).plays = plays;
    (round as unknown as { finished: boolean }).finished = snapshot.finished;

    return round;
  }
}
