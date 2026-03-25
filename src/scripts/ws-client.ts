import 'dotenv/config';
import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

type CreatedPayload = { matchId: string };
type JoinedPayload = { matchId: string };
type ErrorPayload = { message: string };

const port = process.env['PORT'] ?? '3000';
const baseUrl = process.env['WS_URL'] ?? `http://localhost:${port}`;

const TIMEOUT_MS = 10000;

function once<T>(socket: Socket, event: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando evento "${event}"`));
    }, timeoutMs);

    const handler = (data: T) => {
      cleanup();
      resolve(data);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(event, handler);
    };

    socket.on(event, handler);
  });
}

function logJson(label: string, data: unknown) {
  // eslint-disable-next-line no-console
  console.log(label);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(data, null, 2));
}

type Args =
  | { mode: 'help' }
  | { mode: 'create'; token?: string; authToken?: string; pointsToWin?: number }
  | { mode: 'join'; matchId: string; token?: string; authToken?: string };

function parseIntArg(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

function isLikelyJwt(value: string): boolean {
  return value.split('.').length === 3;
}

function parseArgs(argv: string[]): Args {
  const [mode, a1, a2] = argv;

  if (!mode) return { mode: 'help' };

  if (mode === 'create') {
    const firstArg = typeof a1 === 'string' ? a1.trim() : '';
    const secondArg = typeof a2 === 'string' ? a2.trim() : '';

    if (!firstArg && !secondArg) return { mode: 'create' };

    if (firstArg && !secondArg) {
      if (isLikelyJwt(firstArg)) {
        return { mode: 'create', authToken: firstArg };
      }

      const parsedPoints = parseIntArg(firstArg);
      if (parsedPoints !== null) {
        return { mode: 'create', pointsToWin: parsedPoints };
      }

      return { mode: 'create', token: firstArg };
    }

    if (firstArg && secondArg) {
      const parsedPoints = parseIntArg(secondArg);

      if (isLikelyJwt(firstArg)) {
        return parsedPoints !== null
          ? { mode: 'create', authToken: firstArg, pointsToWin: parsedPoints }
          : { mode: 'create', authToken: firstArg };
      }

      return parsedPoints !== null
        ? { mode: 'create', token: firstArg, pointsToWin: parsedPoints }
        : { mode: 'create', token: firstArg };
    }

    return { mode: 'create' };
  }

  if (mode === 'join') {
    const matchId = typeof a1 === 'string' ? a1.trim() : '';
    const identityArg = typeof a2 === 'string' ? a2.trim() : '';

    if (!matchId) {
      return { mode: 'help' };
    }

    if (!identityArg) {
      return { mode: 'join', matchId };
    }

    if (isLikelyJwt(identityArg)) {
      return { mode: 'join', matchId, authToken: identityArg };
    }

    return { mode: 'join', matchId, token: identityArg };
  }

  return { mode: 'help' };
}

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`
Uso:
  npm run ws:client -- create [token|authToken] [pointsToWin]
  npm run ws:client -- join <matchId> [token|authToken]

Exemplos:
  npm run ws:client -- create token-t1a 1
  npm run ws:client -- create <JWT_AUTH_TOKEN> 1
  npm run ws:client -- join <matchId> token-t2a
  npm run ws:client -- join <matchId> <JWT_AUTH_TOKEN>

Variáveis opcionais:
  WS_TOKEN       -> fallback do token técnico antigo
  WS_AUTH_TOKEN  -> token autenticado da aplicação
  WS_URL         -> URL do gateway

Comandos:
  ready            -> ready=true
  unready          -> ready=false
  start <viraRank> -> start-hand
  play <card>      -> play-card
  state            -> get-state
  ranking [n]      -> get-ranking
  help             -> comandos
  exit             -> sair
`);
}

function normalizeSuit(raw: string): string {
  return raw.trim().toUpperCase();
}

function normalizeRank(raw: string): string {
  const value = raw.trim().toUpperCase();
  return value === '10' ? '10' : value;
}

function parsePlayArg(arg: string): { rank: string; suit: string } | null {
  const trimmed = arg.trim().toUpperCase();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[ ,-]/g, '');
  if (cleaned.length < 2) return null;

  const rank = cleaned.slice(0, cleaned.length - 1);
  const suit = cleaned.slice(cleaned.length - 1);

  return {
    rank: normalizeRank(rank),
    suit: normalizeSuit(suit),
  };
}

type ConnectIdentity =
  | { kind: 'auth'; authToken: string }
  | { kind: 'legacy'; token: string };

function resolveConnectIdentity(args: Args): ConnectIdentity {
  const authTokenFromArgs = args.mode === 'help' ? undefined : args.authToken;
  const tokenFromArgs = args.mode === 'help' ? undefined : args.token;

  const authToken = authTokenFromArgs ?? process.env['WS_AUTH_TOKEN']?.trim();
  if (authToken) {
    return {
      kind: 'auth',
      authToken,
    };
  }

  const token = tokenFromArgs ?? process.env['WS_TOKEN']?.trim() ?? randomUUID();

  return {
    kind: 'legacy',
    token,
  };
}

async function connect(identity: ConnectIdentity): Promise<Socket> {
  // eslint-disable-next-line no-console
  console.log(`[ws-client] Connecting to: ${baseUrl}`);

  if (identity.kind === 'auth') {
    // eslint-disable-next-line no-console
    console.log('[ws-client] authMode=authToken');
  } else {
    // eslint-disable-next-line no-console
    console.log(`[ws-client] authMode=legacyToken token=${identity.token}`);
  }

  const socket = io(baseUrl, {
    auth:
      identity.kind === 'auth'
        ? { authToken: identity.authToken }
        : { token: identity.token },
    transports: ['websocket', 'polling'],
    timeout: TIMEOUT_MS,
    reconnection: false,
  });

  socket.on('connect_error', (error: Error) => {
    // eslint-disable-next-line no-console
    console.error('[ws-client] connect_error:', error.message);
  });

  socket.on('error', (payload: ErrorPayload) => {
    logJson('[ws-client] server:error', payload);
  });

  await once<void>(socket, 'connect');

  // eslint-disable-next-line no-console
  console.log(`[ws-client] Connected: socketId=${socket.id}`);

  return socket;
}

async function createMatch(socket: Socket, pointsToWin?: number): Promise<string> {
  const payload = typeof pointsToWin === 'number' ? { pointsToWin } : {};
  logJson('[emit] create-match', payload);
  socket.emit('create-match', payload);

  const created = await once<CreatedPayload>(socket, 'created');
  // eslint-disable-next-line no-console
  console.log(`[ws-client] created: matchId=${created.matchId}`);
  return created.matchId;
}

async function joinMatch(socket: Socket, matchId: string): Promise<void> {
  if (!matchId) {
    throw new Error('join precisa de matchId: npm run ws:client -- join <matchId> [token|authToken]');
  }

  const payload = { matchId };
  logJson('[emit] join-match', payload);
  socket.emit('join-match', payload);

  const joined = await once<JoinedPayload>(socket, 'joined');
  // eslint-disable-next-line no-console
  console.log(`[ws-client] joined: matchId=${joined.matchId}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mode === 'help') {
    printHelp();
    process.exit(0);
  }

  const identity = resolveConnectIdentity(args);
  const socket = await connect(identity);

  let matchId: string | null = null;

  socket.on('player-assigned', (payload: unknown) => logJson('[event] player-assigned', payload));
  socket.on('room-state', (payload: unknown) => logJson('[event] room-state', payload));
  socket.on('match-state', (payload: unknown) => logJson('[event] match-state', payload));
  socket.on('ready-updated', (payload: unknown) => logJson('[event] ready-updated', payload));
  socket.on('hand-started', (payload: unknown) => logJson('[event] hand-started', payload));
  socket.on('card-played', (payload: unknown) => logJson('[event] card-played', payload));
  socket.on('rating-updated', (payload: unknown) => logJson('[event] rating-updated', payload));
  socket.on('ranking', (payload: unknown) => logJson('[event] ranking', payload));

  if (args.mode === 'create') {
    matchId = await createMatch(socket, args.pointsToWin);
  } else {
    await joinMatch(socket, args.matchId);
    matchId = args.matchId;
  }

  printHelp();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    const raw = line.trim();
    if (!raw) {
      rl.prompt();
      return;
    }

    const [cmd, ...rest] = raw.split(' ');
    const arg = rest.join(' ').trim();

    if (cmd === 'help') {
      printHelp();
      rl.prompt();
      return;
    }

    if (cmd === 'exit') {
      rl.close();
      return;
    }

    if (!matchId) {
      // eslint-disable-next-line no-console
      console.log('[ws-client] matchId ainda não disponível.');
      rl.prompt();
      return;
    }

    if (cmd === 'ready') {
      socket.emit('set-ready', { ready: true });
      rl.prompt();
      return;
    }

    if (cmd === 'unready') {
      socket.emit('set-ready', { ready: false });
      rl.prompt();
      return;
    }

    if (cmd === 'start') {
      const viraRank = arg.toUpperCase();
      if (!viraRank) {
        // eslint-disable-next-line no-console
        console.log('Uso: start <viraRank>');
        rl.prompt();
        return;
      }

      socket.emit('start-hand', { matchId, viraRank });
      rl.prompt();
      return;
    }

    if (cmd === 'play') {
      const parsed = parsePlayArg(arg);
      if (!parsed) {
        // eslint-disable-next-line no-console
        console.log('Uso: play <card> (ex: play AP)');
        rl.prompt();
        return;
      }

      socket.emit('play-card', {
        matchId,
        card: {
          rank: parsed.rank,
          suit: parsed.suit,
        },
      });
      rl.prompt();
      return;
    }

    if (cmd === 'state') {
      socket.emit('get-state', { matchId });
      rl.prompt();
      return;
    }

    if (cmd === 'ranking') {
      const parsed = arg ? parseIntArg(arg) : null;
      const limit = parsed && parsed > 0 ? parsed : 20;
      socket.emit('get-ranking', { limit });
      rl.prompt();
      return;
    }

    // eslint-disable-next-line no-console
    console.log(`Comando desconhecido: ${cmd}. Digite "help".`);
    rl.prompt();
  });

  rl.on('close', () => {
    socket.disconnect();
    // eslint-disable-next-line no-console
    console.log('[ws-client] bye');
    process.exit(0);
  });
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});