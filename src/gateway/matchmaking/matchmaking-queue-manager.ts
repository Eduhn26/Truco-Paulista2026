export type MatchmakingMode = '1v1' | '2v2';

export type QueueEntryIdentity = {
  userId: string;
  playerToken: string;
};

export type QueueJoinRequest = QueueEntryIdentity & {
  socketId: string;
  mode: MatchmakingMode;
  rating: number;
};

export type QueueEntry = QueueJoinRequest & {
  joinedAt: number;
};

export type QueueSnapshot = {
  mode: MatchmakingMode;
  size: number;
  playersWaiting: Array<{
    userId: string;
    rating: number;
    joinedAt: number;
    socketId: string;
    playerToken: string;
  }>;
};

export type QueueJoinResult = {
  entry: QueueEntry;
  snapshot: QueueSnapshot;
};

export type QueueExpirationResult = {
  removed: QueueEntry[];
  snapshot: QueueSnapshot;
};

const SUPPORTED_MODES: MatchmakingMode[] = ['1v1', '2v2'];

export class MatchmakingQueueManager {
  private readonly queues = new Map<MatchmakingMode, QueueEntry[]>();

  constructor() {
    for (const mode of SUPPORTED_MODES) {
      this.queues.set(mode, []);
    }
  }

  join(request: QueueJoinRequest): QueueJoinResult {
    const normalizedRequest = this.normalizeJoinRequest(request);

    this.removeBySocketId(normalizedRequest.socketId);
    this.removeByPlayerToken(normalizedRequest.playerToken);

    const entry: QueueEntry = {
      ...normalizedRequest,
      joinedAt: Date.now(),
    };

    const queue = this.getQueueOrThrow(entry.mode);
    queue.push(entry);

    return {
      entry,
      snapshot: this.getQueueSnapshot(entry.mode),
    };
  }

  leaveBySocketId(socketId: string): QueueEntry | null {
    const normalizedSocketId = this.normalizeSocketId(socketId);

    for (const mode of SUPPORTED_MODES) {
      const queue = this.getQueueOrThrow(mode);
      const removed = this.removeFromQueue(queue, (entry) => entry.socketId === normalizedSocketId);

      if (removed) {
        return removed;
      }
    }

    return null;
  }

  leaveByPlayerToken(playerToken: string): QueueEntry | null {
    const normalizedPlayerToken = this.normalizePlayerToken(playerToken);

    for (const mode of SUPPORTED_MODES) {
      const queue = this.getQueueOrThrow(mode);
      const removed = this.removeFromQueue(
        queue,
        (entry) => entry.playerToken === normalizedPlayerToken,
      );

      if (removed) {
        return removed;
      }
    }

    return null;
  }

  expireEntriesOlderThan(
    mode: MatchmakingMode,
    maxWaitMs: number,
    now = Date.now(),
  ): QueueExpirationResult {
    if (!Number.isInteger(maxWaitMs) || maxWaitMs < 0) {
      throw new Error('maxWaitMs must be a non-negative integer');
    }

    const queue = this.getQueueOrThrow(mode);
    const removed: QueueEntry[] = [];

    for (let index = queue.length - 1; index >= 0; index -= 1) {
      const entry = queue[index];

      if (!entry) {
        continue;
      }

      const waitingTime = now - entry.joinedAt;

      if (waitingTime < maxWaitMs) {
        continue;
      }

      removed.unshift(entry);
      queue.splice(index, 1);
    }

    return {
      removed,
      snapshot: this.getQueueSnapshot(mode),
    };
  }

  isQueued(playerToken: string): boolean {
    const normalizedPlayerToken = this.normalizePlayerToken(playerToken);

    for (const mode of SUPPORTED_MODES) {
      const queue = this.getQueueOrThrow(mode);

      if (queue.some((entry) => entry.playerToken === normalizedPlayerToken)) {
        return true;
      }
    }

    return false;
  }

  getQueueSnapshot(mode: MatchmakingMode): QueueSnapshot {
    const queue = this.getQueueOrThrow(mode);

    return {
      mode,
      size: queue.length,
      playersWaiting: queue.map((entry) => ({
        userId: entry.userId,
        rating: entry.rating,
        joinedAt: entry.joinedAt,
        socketId: entry.socketId,
        playerToken: entry.playerToken,
      })),
    };
  }

  clear(): void {
    for (const mode of SUPPORTED_MODES) {
      this.getQueueOrThrow(mode).length = 0;
    }
  }

  private getQueueOrThrow(mode: MatchmakingMode): QueueEntry[] {
    const queue = this.queues.get(mode);

    if (!queue) {
      throw new Error(`Unsupported matchmaking mode: ${mode}`);
    }

    return queue;
  }

  private removeBySocketId(socketId: string): void {
    for (const mode of SUPPORTED_MODES) {
      const queue = this.getQueueOrThrow(mode);
      this.removeFromQueue(queue, (entry) => entry.socketId === socketId);
    }
  }

  private removeByPlayerToken(playerToken: string): void {
    for (const mode of SUPPORTED_MODES) {
      const queue = this.getQueueOrThrow(mode);
      this.removeFromQueue(queue, (entry) => entry.playerToken === playerToken);
    }
  }

  private removeFromQueue(
    queue: QueueEntry[],
    predicate: (entry: QueueEntry) => boolean,
  ): QueueEntry | null {
    const index = queue.findIndex(predicate);

    if (index === -1) {
      return null;
    }

    const [removed] = queue.splice(index, 1);
    return removed ?? null;
  }

  private normalizeJoinRequest(request: QueueJoinRequest): QueueJoinRequest {
    if (!request || typeof request !== 'object') {
      throw new Error('Queue join request is required');
    }

    return {
      socketId: this.normalizeSocketId(request.socketId),
      userId: this.normalizeUserId(request.userId),
      playerToken: this.normalizePlayerToken(request.playerToken),
      mode: this.normalizeMode(request.mode),
      rating: this.normalizeRating(request.rating),
    };
  }

  private normalizeSocketId(socketId: string): string {
    if (typeof socketId !== 'string') {
      throw new Error('socketId must be a string');
    }

    const normalizedSocketId = socketId.trim();

    if (!normalizedSocketId) {
      throw new Error('socketId must not be empty');
    }

    return normalizedSocketId;
  }

  private normalizeUserId(userId: string): string {
    if (typeof userId !== 'string') {
      throw new Error('userId must be a string');
    }

    const normalizedUserId = userId.trim();

    if (!normalizedUserId) {
      throw new Error('userId must not be empty');
    }

    return normalizedUserId;
  }

  private normalizePlayerToken(playerToken: string): string {
    if (typeof playerToken !== 'string') {
      throw new Error('playerToken must be a string');
    }

    const normalizedPlayerToken = playerToken.trim();

    if (!normalizedPlayerToken) {
      throw new Error('playerToken must not be empty');
    }

    return normalizedPlayerToken;
  }

  private normalizeMode(mode: MatchmakingMode): MatchmakingMode {
    if (mode !== '1v1' && mode !== '2v2') {
      throw new Error('mode must be either 1v1 or 2v2');
    }

    return mode;
  }

  private normalizeRating(rating: number): number {
    if (!Number.isInteger(rating) || rating < 0) {
      throw new Error('rating must be a non-negative integer');
    }

    return rating;
  }
}
