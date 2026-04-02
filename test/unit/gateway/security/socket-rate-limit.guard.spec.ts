import type { ExecutionContext } from '@nestjs/common';

import { SocketRateLimitGuard } from '../../../../src/gateway/security/socket-rate-limit.guard';

type TestSocket = {
  id: string;
  emit: jest.Mock<void, [string, unknown]>;
  handshake?: {
    auth?: Record<string, unknown>;
    address?: string;
  };
};

function createSocket(overrides?: {
  id?: string;
  authToken?: string;
  token?: string;
  address?: string;
}): TestSocket {
  const auth: Record<string, unknown> = {};

  if (overrides?.authToken) {
    auth['authToken'] = overrides.authToken;
  }

  if (overrides?.token) {
    auth['token'] = overrides.token;
  }

  return {
    id: overrides?.id ?? 'socket-1',
    emit: jest.fn(),
    handshake: {
      auth,
      address: overrides?.address ?? '127.0.0.1',
    },
  };
}

function createWsExecutionContext(
  socket: TestSocket,
  handlerName = 'handlePlayCard',
): ExecutionContext {
  const handler = {
    [handlerName](): void {
      return;
    },
  }[handlerName] as () => void;

  return {
    getType: () => 'ws',
    switchToWs: () => ({
      getClient: () => socket,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
    getHandler: () => handler,
    getClass: () => class TestGateway {},
  } as unknown as ExecutionContext;
}

function createHttpExecutionContext(): ExecutionContext {
  return {
    getType: () => 'http',
    switchToWs: () => ({
      getClient: () => undefined,
      getData: () => undefined,
      getPattern: () => undefined,
    }),
    getHandler: () =>
      function handleHttp(): void {
        return;
      },
    getClass: () => class TestController {},
  } as unknown as ExecutionContext;
}

describe('SocketRateLimitGuard', () => {
  const originalWindowMs = process.env['SOCKET_RATE_LIMIT_WINDOW_MS'];
  const originalMaxEvents = process.env['SOCKET_RATE_LIMIT_MAX_EVENTS'];
  const originalBlockMs = process.env['SOCKET_RATE_LIMIT_BLOCK_MS'];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    process.env['SOCKET_RATE_LIMIT_WINDOW_MS'] = '1000';
    process.env['SOCKET_RATE_LIMIT_MAX_EVENTS'] = '2';
    process.env['SOCKET_RATE_LIMIT_BLOCK_MS'] = '3000';
  });

  afterEach(() => {
    jest.useRealTimers();

    if (originalWindowMs === undefined) {
      delete process.env['SOCKET_RATE_LIMIT_WINDOW_MS'];
    } else {
      process.env['SOCKET_RATE_LIMIT_WINDOW_MS'] = originalWindowMs;
    }

    if (originalMaxEvents === undefined) {
      delete process.env['SOCKET_RATE_LIMIT_MAX_EVENTS'];
    } else {
      process.env['SOCKET_RATE_LIMIT_MAX_EVENTS'] = originalMaxEvents;
    }

    if (originalBlockMs === undefined) {
      delete process.env['SOCKET_RATE_LIMIT_BLOCK_MS'];
    } else {
      process.env['SOCKET_RATE_LIMIT_BLOCK_MS'] = originalBlockMs;
    }
  });

  it('allows websocket events while under the limit', () => {
    const guard = new SocketRateLimitGuard();
    const socket = createSocket({
      authToken: 'auth-token-1',
    });
    const context = createWsExecutionContext(socket);

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(socket.emit).not.toHaveBeenCalled();
  });

  it('blocks websocket events after the limit is exceeded', () => {
    const guard = new SocketRateLimitGuard();
    const socket = createSocket({
      authToken: 'auth-token-1',
    });
    const context = createWsExecutionContext(socket);

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(false);

    expect(socket.emit).toHaveBeenCalledWith(
      'error',
      expect.objectContaining({
        code: 'socket_rate_limit_exceeded',
        retryAfterMs: 3000,
        windowMs: 1000,
        maxEvents: 2,
      }),
    );
  });

  it('unblocks the tracker after the cooldown expires', () => {
    const guard = new SocketRateLimitGuard();
    const socket = createSocket({
      authToken: 'auth-token-1',
    });
    const context = createWsExecutionContext(socket);

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(false);

    jest.advanceTimersByTime(3001);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('does not interfere with non-websocket contexts', () => {
    const guard = new SocketRateLimitGuard();
    const context = createHttpExecutionContext();

    expect(guard.canActivate(context)).toBe(true);
  });

  it('tracks independent sockets separately when no auth token is present', () => {
    const guard = new SocketRateLimitGuard();
    const socketOne = createSocket({
      id: 'socket-1',
      address: '10.0.0.1',
    });
    const socketTwo = createSocket({
      id: 'socket-2',
      address: '10.0.0.2',
    });

    const contextOne = createWsExecutionContext(socketOne, 'handleGetState');
    const contextTwo = createWsExecutionContext(socketTwo, 'handleGetState');

    expect(guard.canActivate(contextOne)).toBe(true);
    expect(guard.canActivate(contextOne)).toBe(true);
    expect(guard.canActivate(contextOne)).toBe(false);

    expect(guard.canActivate(contextTwo)).toBe(true);
  });
});
