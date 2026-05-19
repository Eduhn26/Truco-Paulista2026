import type { PlayerId } from '../value-objects/player-id';
import type { RoundResult } from '../value-objects/round-result';
import type { Rank } from '../value-objects/rank';

import { InvalidMoveError } from '../exceptions/invalid-move-error';
import { compareCards } from '../services/truco-rules';
import { Card } from '../value-objects/card';

export type SeatId = 'T1A' | 'T1B' | 'T2A' | 'T2B';
export type RoundPlayOwnerId = PlayerId | SeatId;

export type RoundPlaySnapshot = {
  ownerId: RoundPlayOwnerId;
  playerId: PlayerId;
  card: string;
};

export type RoundSnapshot = {
  viraRank: Rank;
  plays: Partial<Record<PlayerId, string>>;
  seatPlays?: Partial<Record<SeatId, string>>;
  orderedPlays?: RoundPlaySnapshot[];
  winningOwnerId?: RoundPlayOwnerId | null;
  finished: boolean;
};

type RoundPlay = {
  ownerId: RoundPlayOwnerId;
  playerId: PlayerId;
  card: Card;
};

type PlayOptions = {
  ownerId?: RoundPlayOwnerId;
  expectedPlayCount?: number;
};

const SEAT_IDS = ['T1A', 'T1B', 'T2A', 'T2B'] as const;

function isSeatId(value: unknown): value is SeatId {
  return typeof value === 'string' && SEAT_IDS.includes(value as SeatId);
}

function playerIdFromOwner(ownerId: RoundPlayOwnerId): PlayerId {
  if (ownerId === 'P1' || ownerId === 'P2') {
    return ownerId;
  }

  return ownerId.startsWith('T1') ? 'P1' : 'P2';
}

function normalizeExpectedPlayCount(value?: number): number {
  return value === 4 ? 4 : 2;
}

export class Round {
  private readonly plays = new Map<PlayerId, Card>();
  private readonly orderedPlays: RoundPlay[] = [];
  private finished = false;
  private expectedPlayCount: number;

  constructor(
    private readonly viraRank: Rank,
    expectedPlayCount = 2,
  ) {
    this.expectedPlayCount = normalizeExpectedPlayCount(expectedPlayCount);
  }

  static fromSnapshot(snapshot: RoundSnapshot, expectedPlayCount?: number): Round {
    const inferredExpectedPlayCount =
      expectedPlayCount ??
      (snapshot.orderedPlays && snapshot.orderedPlays.length > 2 ? 4 : snapshot.seatPlays ? 4 : 2);
    const round = new Round(snapshot.viraRank, inferredExpectedPlayCount);

    if (Array.isArray(snapshot.orderedPlays) && snapshot.orderedPlays.length > 0) {
      for (const play of snapshot.orderedPlays) {
        round.restorePlay(play.ownerId, play.playerId, Card.from(play.card));
      }
    } else if (snapshot.seatPlays) {
      for (const seatId of SEAT_IDS) {
        const card = snapshot.seatPlays[seatId];

        if (typeof card === 'string' && card.length > 0) {
          round.restorePlay(seatId, playerIdFromOwner(seatId), Card.from(card));
        }
      }
    } else {
      const p1 = snapshot.plays.P1;
      if (typeof p1 === 'string' && p1.length > 0) {
        round.restorePlay('P1', 'P1', Card.from(p1));
      }

      const p2 = snapshot.plays.P2;
      if (typeof p2 === 'string' && p2.length > 0) {
        round.restorePlay('P2', 'P2', Card.from(p2));
      }
    }

    round.finished = snapshot.finished;
    round.rebuildLegacyPlays();

    return round;
  }

  play(player: PlayerId, card: Card, options: PlayOptions = {}): void {
    if (this.finished) throw new InvalidMoveError('Round is already finished.');

    const ownerId = options.ownerId ?? player;
    this.expectedPlayCount = normalizeExpectedPlayCount(
      options.expectedPlayCount ?? this.expectedPlayCount,
    );

    if (this.orderedPlays.some((play) => play.ownerId === ownerId)) {
      throw new InvalidMoveError(`Player ${ownerId} already played this round.`);
    }

    this.orderedPlays.push({ ownerId, playerId: player, card });
    this.rebuildLegacyPlays();

    if (this.orderedPlays.length >= this.expectedPlayCount) {
      this.finished = true;
    }
  }

  isFinished(): boolean {
    return this.finished;
  }

  getResult(): RoundResult {
    if (!this.finished) throw new InvalidMoveError('Round is not finished yet.');
    if (this.orderedPlays.length < 2) throw new InvalidMoveError('Round missing plays.');

    const bestPlays = this.getBestPlays();
    const bestTeams = new Set(bestPlays.map((play) => play.playerId));

    if (bestTeams.size !== 1) {
      return 'TIE';
    }

    return bestPlays[0]?.playerId ?? 'TIE';
  }

  getWinningOwnerId(): RoundPlayOwnerId | null {
    if (!this.finished || this.getResult() === 'TIE') {
      return null;
    }

    return this.getBestPlays()[0]?.ownerId ?? null;
  }

  toSnapshot(): RoundSnapshot {
    const plays: Partial<Record<PlayerId, string>> = {};

    const p1 = this.plays.get('P1');
    if (p1) {
      plays.P1 = p1.toString();
    }

    const p2 = this.plays.get('P2');
    if (p2) {
      plays.P2 = p2.toString();
    }

    const seatPlays: Partial<Record<SeatId, string>> = {};

    for (const play of this.orderedPlays) {
      if (isSeatId(play.ownerId)) {
        seatPlays[play.ownerId] = play.card.toString();
      }
    }

    return {
      viraRank: this.viraRank,
      plays,
      ...(Object.keys(seatPlays).length > 0 ? { seatPlays } : {}),
      orderedPlays: this.orderedPlays.map((play) => ({
        ownerId: play.ownerId,
        playerId: play.playerId,
        card: play.card.toString(),
      })),
      winningOwnerId: this.finished ? this.getWinningOwnerId() : null,
      finished: this.finished,
    };
  }

  private restorePlay(ownerId: RoundPlayOwnerId, playerId: PlayerId, card: Card): void {
    this.orderedPlays.push({ ownerId, playerId, card });
  }

  private rebuildLegacyPlays(): void {
    this.plays.clear();

    for (const playerId of ['P1', 'P2'] as const) {
      const bestPlay = this.getBestPlayForPlayer(playerId);

      if (bestPlay) {
        this.plays.set(playerId, bestPlay.card);
      }
    }
  }

  private getBestPlayForPlayer(playerId: PlayerId): RoundPlay | null {
    const teamPlays = this.orderedPlays.filter((play) => play.playerId === playerId);

    if (teamPlays.length === 0) {
      return null;
    }

    return teamPlays.reduce((best, candidate) => {
      const result = compareCards(candidate.card, best.card, this.viraRank);

      return result === 'A' ? candidate : best;
    });
  }

  private getBestPlays(): RoundPlay[] {
    const [firstPlay, ...remainingPlays] = this.orderedPlays;

    if (!firstPlay) {
      return [];
    }

    let bestPlays: RoundPlay[] = [firstPlay];

    for (const candidate of remainingPlays) {
      const currentBest = bestPlays[0]!;
      const result = compareCards(candidate.card, currentBest.card, this.viraRank);

      if (result === 'A') {
        bestPlays = [candidate];
        continue;
      }

      if (result === 'TIE') {
        bestPlays.push(candidate);
      }
    }

    return bestPlays;
  }
}
