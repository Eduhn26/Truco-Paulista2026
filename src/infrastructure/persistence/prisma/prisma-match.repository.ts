import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';

import type { MatchRepository } from '@game/application/ports/match.repository';

import { Match } from '@game/domain/entities/match';
import { Hand } from '@game/domain/entities/hand';
import { Round } from '@game/domain/entities/round';
import { Card } from '@game/domain/value-objects/card';
import { Score } from '@game/domain/value-objects/score';
import type { PlayerId } from '@game/domain/value-objects/player-id';

type PersistedRound = {
  plays: Partial<Record<PlayerId, string>>;
};

type PersistedHand = {
  viraRank: string;
  currentRoundIndex: number;
  rounds: PersistedRound[];
};

type PersistedData = {
  currentHand?: PersistedHand | null;
};

type PersistedScore = {
  playerOne: number;
  playerTwo: number;
};

@Injectable()
export class PrismaMatchRepository implements MatchRepository {
  // HACK: Instanciação direta do PrismaClient contorna a injeção do NestJS.
  // Garante isolamento total e impede o erro "Cannot read properties of undefined" no ambiente atual.
  private readonly prisma = new PrismaClient();

  constructor() {}

  async create(match: Match): Promise<string> {
    const matchId = `match_${randomUUID().replace(/-/g, '')}`;

    // NOTE: Infra é responsável por “materializar” o Domain em persistência.
    const snapshot = this.toSnapshot(match);

    await this.prisma.matchSnapshot.create({
      data: {
        matchId,
        pointsToWin: snapshot.pointsToWin,
        state: snapshot.state,
        score: snapshot.score,
        data: snapshot.data,
      },
    });

    return matchId;
  }

  async save(id: string, match: Match): Promise<void> {
    const snapshot = this.toSnapshot(match);

    await this.prisma.matchSnapshot.update({
      where: { matchId: id },
      data: {
        pointsToWin: snapshot.pointsToWin,
        state: snapshot.state,
        score: snapshot.score,
        data: snapshot.data,
      },
    });
  }

  async getById(id: string): Promise<Match | null> {
    const row = await this.prisma.matchSnapshot.findUnique({
      where: { matchId: id },
    });

    if (!row) return null;

    const score = row.score as unknown as PersistedScore | null;
    const data = row.data as unknown as PersistedData | null;

    const match = new Match(row.pointsToWin) as unknown as {
      state: string;
      score: Score;
      currentHand: Hand | null;
    };

    // NOTE: COMPAT — Domain não expõe rehydrate().
    // A Infra reidrata preenchendo internals (isolado aqui).
    match.state = row.state;

    if (score) {
      // HACK: Bypass no construtor privado do Score apenas para reidratação da Infra.
      match.score = new (Score as any)(score.playerOne ?? 0, score.playerTwo ?? 0);
    }

    const currentHand = data?.currentHand ? this.hydrateHand(data.currentHand) : null;
    match.currentHand = currentHand;

    return match as unknown as Match;
  }

  private toSnapshot(match: Match): {
    pointsToWin: number;
    state: string;
    score: PersistedScore;
    data: PersistedData;
  } {
    const m = match as unknown as {
      pointsToWin: number;
      state: string;
      score: Score;
      currentHand: Hand | null;
    };

    const s = m.score as unknown as { playerOne: number; playerTwo: number };

    return {
      pointsToWin: m.pointsToWin,
      state: m.state,
      score: { playerOne: s.playerOne, playerTwo: s.playerTwo },
      data: {
        currentHand: m.currentHand ? this.handToPersisted(m.currentHand) : null,
      },
    };
  }

  private handToPersisted(hand: Hand): PersistedHand {
    const h = hand as unknown as {
      viraRank: unknown;
      rounds: Round[];
      currentRoundIndex: number;
    };

    return {
      viraRank: String(h.viraRank),
      currentRoundIndex: h.currentRoundIndex,
      rounds: h.rounds.map((r) => this.roundToPersisted(r)),
    };
  }

  private roundToPersisted(round: Round): PersistedRound {
    const r = round as unknown as { plays: Map<PlayerId, Card> };

    const plays: Partial<Record<PlayerId, string>> = {};
    for (const [playerId, card] of r.plays.entries()) {
      plays[playerId] = card.toString();
    }

    return { plays };
  }

  private hydrateHand(snapshot: PersistedHand): Hand {
    const hand = new Hand(snapshot.viraRank as never) as unknown as {
      viraRank: unknown;
      rounds: Round[];
      currentRoundIndex: number;
    };

    hand.viraRank = snapshot.viraRank;
    hand.currentRoundIndex = snapshot.currentRoundIndex ?? 0;
    hand.rounds = (snapshot.rounds ?? []).map((r) => this.hydrateRound(snapshot.viraRank, r));

    return hand as unknown as Hand;
  }

  private hydrateRound(viraRank: string, snapshot: PersistedRound): Round {
    const round = new Round(viraRank as never) as unknown as { plays: Map<PlayerId, Card> };

    const plays = snapshot.plays ?? {};
    const map = new Map<PlayerId, Card>();

    const p1 = plays.P1;
    if (typeof p1 === 'string' && p1.length > 0) map.set('P1', Card.from(p1));

    const p2 = plays.P2;
    if (typeof p2 === 'string' && p2.length > 0) map.set('P2', Card.from(p2));

    round.plays = map;

    return round as unknown as Round;
  }
}