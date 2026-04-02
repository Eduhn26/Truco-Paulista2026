import { Injectable } from '@nestjs/common';

import type { MatchmakingMode } from './matchmaking-queue-manager';

export type MatchmakingQueueCandidate = {
  socketId: string;
  userId: string;
  playerToken: string;
  rating: number;
  joinedAt: number;
};

export type MatchmakingPair = {
  mode: MatchmakingMode;
  players: MatchmakingQueueCandidate[];
  averageRating: number;
};

@Injectable()
export class MatchmakingPairingPolicy {
  findPair(mode: MatchmakingMode, queue: MatchmakingQueueCandidate[]): MatchmakingPair | null {
    const requiredPlayers = this.getRequiredPlayers(mode);

    if (queue.length < requiredPlayers) {
      return null;
    }

    const sortedQueue = [...queue].sort((left, right) => {
      if (left.joinedAt !== right.joinedAt) {
        return left.joinedAt - right.joinedAt;
      }

      return left.rating - right.rating;
    });

    let bestPair: MatchmakingQueueCandidate[] | null = null;
    let smallestSpread = Number.POSITIVE_INFINITY;

    for (let startIndex = 0; startIndex <= sortedQueue.length - requiredPlayers; startIndex += 1) {
      const candidate = sortedQueue.slice(startIndex, startIndex + requiredPlayers);
      const spread = this.calculateSpread(candidate);

      if (spread < smallestSpread) {
        bestPair = candidate;
        smallestSpread = spread;
      }
    }

    if (!bestPair) {
      return null;
    }

    return {
      mode,
      players: bestPair,
      averageRating: Math.round(
        bestPair.reduce((sum, player) => sum + player.rating, 0) / bestPair.length,
      ),
    };
  }

  private getRequiredPlayers(mode: MatchmakingMode): number {
    return mode === '1v1' ? 2 : 4;
  }

  private calculateSpread(players: MatchmakingQueueCandidate[]): number {
    const ratings = players.map((player) => player.rating);
    const highestRating = Math.max(...ratings);
    const lowestRating = Math.min(...ratings);

    return highestRating - lowestRating;
  }
}
