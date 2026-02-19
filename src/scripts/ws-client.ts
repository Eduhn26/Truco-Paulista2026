import 'dotenv/config';
import * as readline from 'node:readline';
import { io, type Socket } from 'socket.io-client';

type PlayerAssignedPayload = {
  matchId: string;
  seatId: string;
  teamId: string;
  playerId: string;
};

type CreatedPayload = {
  matchId: string;
};

type JoinedPayload = {
  ok: true;
};

type ErrorPayload = {
  message: string;
};

const port = process.env['PORT'] ?? '3000';
const baseUrl = process.env['WS_URL'] ?? `http://localhost:${port}`;

const TIMEOUT_MS = 7000;

function once<T>(socket: Socket, event: string, timeoutMs = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando evento "${event}"`));
    }, timeoutMs);

    const handler = (data: T) => {
      cleanup();
      resolve(data);
    };

    const cleanup = () => {
      clearTimeout(t);
      socket.off(event, handler);
    };

    socket.on(event, handler);
  });
}

function logJson(label: string, data: unknown) {
  // NOTE: JSON cru facilita comparar estado/eventos entre terminais.
  // eslint-disable-next-line no-console
  console.log(label, JSON.stringify(data, null, 2));
}

type Args =
  | { mode: 'help' }
  | { mode: 'create' }
  | { mode: 'join'; matchId: string };

function parseArgs(argv: string[]): Args {
  const [mode, a1] = argv;

  if (!mode) return { mode: 'help' };
  if (mode === 'create') return { mode: 'create' };
  if (mode === 'join') return { mode: 'join', matchId: (a1 ?? '').trim() };

  return { mode: 'help' };
}

function normalizeSuit(raw: string): string {
  return raw.trim().toUpperCase();
}

function normalizeRank(raw: string): string {
  const v = raw.trim().toUpperCase();
  if (v === '10') return '10';
  return v;
}

function parsePlayArg(arg: string): { rank: string; suit: string } | null {
  const trimmed = arg.trim().toUpperCase();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[ ,\-]/g, '');
  if (cleaned.length < 2) return null;

  const rank = cleaned.slice(0, cleaned.length - 1);
  const suit = cleaned.slice(cleaned.length - 1);

  return { rank: normalizeRank(rank), suit: normalizeSuit(suit) };
}

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`
Uso:
  npm run ws:client -- create
  npm run ws:client -- join <matchId>

Comandos:
  ready            -> ready=true
  unready          -> ready=false
  start <viraRank> -> start-hand (ex: start 7)
  play <card>      -> play-card (ex: play AP | play A P)
  state            -> get-state
  help             -> comandos
  exit             -> sair
`);
}

async function connect(): Promise<Socket> {
  // eslint-disable-next-line no-console
  console.log(`[ws-client] Connecting to: ${baseUrl}`);

  const socket = io(baseUrl, {
    transports: ['websocket'],
  });

  await once<void>(socket, 'connect');

  // eslint-disable-next-line no-console
  console.log(`[ws-client] Connected: socketId=${socket.id}`);

  return socket;
}

async function createMatch(socket: Socket): Promise<string> {
  socket.emit('create-match', {});
  const created = await once<CreatedPayload>(socket, 'created');
  // eslint-disable-next-line no-console
  console.log(`[ws-client] created: matchId=${created.matchId}`);
  return created.matchId;
}

async function joinMatch(socket: Socket, matchId: string): Promise<void> {
  if (!matchId) throw new Error('join precisa de matchId: npm run ws:client -- join <matchId>');
  socket.emit('join-match', { matchId });
  await once<JoinedPayload>(socket, 'joined');
  // eslint-disable-next-line no-console
  console.log(`[ws-client] joined: matchId=${matchId}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'help') {
    printHelp();
    process.exit(0);
  }

  const socket = await connect();

  let matchId: string | null = null;

  socket.on('player-assigned', (p: PlayerAssignedPayload) => {
    matchId = p.matchId;
    logJson('[event] player-assigned:', p);
  });

  socket.on('room-state', (p: unknown) => logJson('[event] room-state:', p));
  socket.on('match-state', (p: unknown) => logJson('[event] match-state:', p));
  socket.on('ready-updated', (p: unknown) => logJson('[event] ready-updated:', p));
  socket.on('card-played', (p: unknown) => logJson('[event] card-played:', p));
  socket.on('error', (p: ErrorPayload) => logJson('[event] error:', p));

  if (args.mode === 'create') {
    matchId = await createMatch(socket);
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
      // NOTE: se isso ocorrer, o fluxo player-assigned não chegou ainda.
      // eslint-disable-next-line no-console
      console.log('[ws-client] matchId ainda não disponível. Aguarde player-assigned.');
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
        console.log('Uso: start <viraRank> (ex: start 7)');
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
        console.log('Uso: play <card> (ex: play AP | play A P)');
        rl.prompt();
        return;
      }

      socket.emit('play-card', { matchId, card: { rank: parsed.rank, suit: parsed.suit } });
      rl.prompt();
      return;
    }

    if (cmd === 'state') {
      socket.emit('get-state', { matchId });
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

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
