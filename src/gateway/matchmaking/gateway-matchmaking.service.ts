import { Injectable } from '@nestjs/common';

import {
  MatchmakingQueueManager,
  type MatchmakingMode,
  type MatchmakingObservabilitySnapshot,
  type PendingFallbackState,
  type QueueEntry,
  type QueueJoinRequest,
  type QueueSnapshot,
} from './matchmaking-queue-manager';
import { MatchmakingPairingPolicy, type MatchmakingPair } from './matchmaking-pairing-policy';

const QUEUE_MAX_WAIT_MS = 2 * 60 * 1000;

type QueueMaintenanceResult = {
  snapshot: QueueSnapshot;
  timedOutFallbacks: PendingFallbackState[];
};

type ContinueQueueResult = {
  fallback: PendingFallbackState;
  snapshot: QueueSnapshot;
};

type LeaveQueueResult = {
  removed: QueueEntry | null;
  snapshot: QueueSnapshot | null;
};

@Injectable()
export class GatewayMatchmakingService {
  constructor(
    private readonly matchmakingQueueManager: MatchmakingQueueManager,
    private readonly matchmakingPairingPolicy: MatchmakingPairingPolicy,
  ) {}

  getObservabilitySnapshot(): MatchmakingObservabilitySnapshot {
    return this.matchmakingQueueManager.getObservabilitySnapshot();
  }

  getFallbackState(socketId: string): PendingFallbackState | null {
    return this.matchmakingQueueManager.getPendingFallbackBySocketId(socketId);
  }

  joinQueue(request: QueueJoinRequest): QueueSnapshot {
    return this.matchmakingQueueManager.join(request).snapshot;
  }

  continueQueue(socketId: string): ContinueQueueResult | null {
    const fallback = this.matchmakingQueueManager.clearPendingFallbackBySocketId(socketId);

    if (!fallback) {
      return null;
    }

    const snapshot = this.matchmakingQueueManager.join({
      socketId: fallback.socketId,
      userId: fallback.userId,
      playerToken: fallback.playerToken,
      mode: fallback.mode,
      rating: fallback.rating,
    }).snapshot;

    return {
      fallback,
      snapshot,
    };
  }

  takeFallback(socketId: string): PendingFallbackState | null {
    return this.matchmakingQueueManager.clearPendingFallbackBySocketId(socketId);
  }

  leaveQueue(socketId: string): LeaveQueueResult {
    const removed = this.matchmakingQueueManager.leaveBySocketId(socketId);

    if (!removed) {
      return {
        removed: null,
        snapshot: null,
      };
    }

    return {
      removed,
      snapshot: this.expireQueue(removed.mode).snapshot,
    };
  }

  getQueueState(mode: MatchmakingMode): QueueMaintenanceResult {
    return this.expireQueue(mode);
  }

  tryResolvePair(mode: MatchmakingMode): {
    snapshot: QueueSnapshot;
    timedOutFallbacks: PendingFallbackState[];
    pair: MatchmakingPair | null;
  } {
    const maintenance = this.expireQueue(mode);
    const pair = this.matchmakingPairingPolicy.findPair(mode, maintenance.snapshot.playersWaiting);

    return {
      snapshot: maintenance.snapshot,
      timedOutFallbacks: maintenance.timedOutFallbacks,
      pair,
    };
  }

  completeMatchedPair(pair: MatchmakingPair): QueueSnapshot {
    for (const player of pair.players) {
      this.matchmakingQueueManager.leaveBySocketId(player.socketId);
      this.matchmakingQueueManager.clearPendingFallbackBySocketId(player.socketId);
    }

    return this.matchmakingQueueManager.getQueueSnapshot(pair.mode);
  }

  private expireQueue(mode: MatchmakingMode): QueueMaintenanceResult {
    const result = this.matchmakingQueueManager.expireEntriesOlderThan(mode, QUEUE_MAX_WAIT_MS);
    const timedOutFallbacks = result.removed.map((entry) =>
      this.matchmakingQueueManager.registerPendingFallback(entry),
    );

    return {
      snapshot: result.snapshot,
      timedOutFallbacks,
    };
  }
}
