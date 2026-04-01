import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';

type RateLimitErrorPayload = {
  code: 'socket_rate_limit_exceeded';
  message: string;
  retryAfterMs: number;
  windowMs: number;
  maxEvents: number;
};

type RateLimitState = {
  hits: number[];
  blockedUntil: number;
};

type RateLimitedSocket = {
  id: string;
  emit: (event: string, payload: unknown) => void;
  handshake?: {
    auth?: Record<string, unknown>;
    address?: string;
  };
};

@Injectable()
export class SocketRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(SocketRateLimitGuard.name);
  private readonly entries = new Map<string, RateLimitState>();

  private readonly windowMs = this.readPositiveNumber('SOCKET_RATE_LIMIT_WINDOW_MS', 10_000);
  private readonly maxEvents = this.readPositiveNumber('SOCKET_RATE_LIMIT_MAX_EVENTS', 40);
  private readonly blockMs = this.readPositiveNumber('SOCKET_RATE_LIMIT_BLOCK_MS', 15_000);
  private readonly cleanupThreshold = 2_000;

  canActivate(context: ExecutionContext): boolean {
    if (context.getType<string>() !== 'ws') {
      return true;
    }

    const socket = context.switchToWs().getClient<RateLimitedSocket>();
    const eventName = this.resolveEventName(context);
    const now = Date.now();

    const trackerKey = this.resolveTrackerKey(socket);
    const trackerLabel = this.resolveTrackerLabel(socket);
    const state = this.getOrCreateState(trackerKey);

    this.pruneState(state, now);

    if (state.blockedUntil > now) {
      const retryAfterMs = state.blockedUntil - now;
      const payload = this.buildPayload(retryAfterMs);

      socket.emit('error', payload);

      this.logger.warn(
        JSON.stringify({
          layer: 'gateway',
          event: 'socket_rate_limit_blocked',
          socketId: socket.id,
          tracker: trackerLabel,
          handler: eventName,
          retryAfterMs,
          windowMs: this.windowMs,
          maxEvents: this.maxEvents,
        }),
      );

      this.compactEntries(now);

      return false;
    }

    state.hits.push(now);

    if (state.hits.length > this.maxEvents) {
      state.blockedUntil = now + this.blockMs;

      const payload = this.buildPayload(this.blockMs);

      socket.emit('error', payload);

      this.logger.warn(
        JSON.stringify({
          layer: 'gateway',
          event: 'socket_rate_limit_triggered',
          socketId: socket.id,
          tracker: trackerLabel,
          handler: eventName,
          blockMs: this.blockMs,
          windowMs: this.windowMs,
          maxEvents: this.maxEvents,
        }),
      );

      this.compactEntries(now);

      return false;
    }

    this.compactEntries(now);

    return true;
  }

  private getOrCreateState(trackerKey: string): RateLimitState {
    const existing = this.entries.get(trackerKey);

    if (existing) {
      return existing;
    }

    const created: RateLimitState = {
      hits: [],
      blockedUntil: 0,
    };

    this.entries.set(trackerKey, created);

    return created;
  }

  private pruneState(state: RateLimitState, now: number): void {
    state.hits = state.hits.filter((timestamp) => now - timestamp < this.windowMs);

    if (state.blockedUntil <= now) {
      state.blockedUntil = 0;
    }
  }

  private compactEntries(now: number): void {
    if (this.entries.size < this.cleanupThreshold) {
      return;
    }

    for (const [trackerKey, state] of this.entries.entries()) {
      this.pruneState(state, now);

      if (state.hits.length === 0 && state.blockedUntil === 0) {
        this.entries.delete(trackerKey);
      }
    }
  }

  private resolveTrackerKey(socket: RateLimitedSocket): string {
    const auth = socket.handshake?.auth;
    const authToken = this.pickString(auth?.['authToken']);
    const legacyToken = this.pickString(auth?.['token']);
    const address = this.pickString(socket.handshake?.address);

    if (authToken) {
      return `auth:${authToken}`;
    }

    if (legacyToken) {
      return `legacy:${legacyToken}`;
    }

    if (address) {
      return `address:${address}`;
    }

    return `socket:${socket.id}`;
  }

  private resolveTrackerLabel(socket: RateLimitedSocket): string {
    const auth = socket.handshake?.auth;
    const authToken = this.pickString(auth?.['authToken']);
    const legacyToken = this.pickString(auth?.['token']);
    const address = this.pickString(socket.handshake?.address);

    if (authToken) {
      return 'auth-token';
    }

    if (legacyToken) {
      return 'legacy-token';
    }

    if (address) {
      return `address:${address}`;
    }

    return `socket:${socket.id}`;
  }

  private resolveEventName(context: ExecutionContext): string {
    const handler = context.getHandler();

    if (typeof handler?.name === 'string' && handler.name.length > 0) {
      return handler.name;
    }

    return 'unknown_ws_handler';
  }

  private buildPayload(retryAfterMs: number): RateLimitErrorPayload {
    return {
      code: 'socket_rate_limit_exceeded',
      message: 'Too many socket events. Please slow down and try again shortly.',
      retryAfterMs,
      windowMs: this.windowMs,
      maxEvents: this.maxEvents,
    };
  }

  private readPositiveNumber(envName: string, fallback: number): number {
    const rawValue = process.env[envName];

    if (!rawValue) {
      return fallback;
    }

    const parsed = Number(rawValue);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private pickString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      return null;
    }

    return normalized;
  }
}
