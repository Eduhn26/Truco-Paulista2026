import 'dotenv/config';
import { io, type Socket } from 'socket.io-client';

type MatchStatePayload = {
  matchId: string;
  state: unknown;
};

type ErrorPayload = {
  message: string;
};

const port = process.env['PORT'] ?? '3000';
const baseUrl = process.env['WS_URL'] ?? `http://localhost:${port}`;

const TIMEOUT_MS = 5000;

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

async function emitAndWaitMatchState(socket: Socket, event: string, payload: unknown) {
  socket.emit(event, payload);

  const result = await Promise.race([
    once<MatchStatePayload>(socket, 'match-state'),
    once<ErrorPayload>(socket, 'error'),
  ]);

  if ((result as ErrorPayload).message) {
    throw new Error(`[${event}] ${(result as ErrorPayload).message}`);
  }

  return result as MatchStatePayload;
}

async function main() {
  console.log(`[ws-client] Connecting to: ${baseUrl}`);

  const socket = io(baseUrl, {
    transports: ['websocket'], // evita cair em polling e simplifica debug
  });

  socket.on('connect', () => console.log(`[ws-client] Connected: ${socket.id}`));
  socket.on('disconnect', () => console.log('[ws-client] Disconnected'));

  // logs “live” (úteis durante o dev)
  socket.on('player-assigned', (p) => console.log('[event] player-assigned =>', p));
  socket.on('match-state', (p) => console.log('[event] match-state =>', p));
  socket.on('error', (p) => console.log('[event] error =>', p));

  // aguarda conectar
  await once<void>(socket, 'connect');

  // 1) create-match
  const created = await emitAndWaitMatchState(socket, 'create-match', {
    pointsToWin: 12,
  });

  const matchId = created.matchId;
  console.log(`\n✅ Match criado: ${matchId}\n`);

  // 2) join-match (o próprio client entra)
  await emitAndWaitMatchState(socket, 'join-match', { matchId });
  console.log('✅ Joined match\n');

  // 3) start-hand (viraRank)
  const viraCandidates = ['A', 'K', 'Q', 'J', '7', '6', '5', '4', '3', '2'];

  let started = false;
  for (const viraRank of viraCandidates) {
    try {
      await emitAndWaitMatchState(socket, 'start-hand', { matchId, viraRank });
      console.log(`✅ Hand iniciada com viraRank="${viraRank}"\n`);
      started = true;
      break;
    } catch (e) {
      console.log(`⚠️ start-hand falhou com viraRank="${viraRank}" -> ${(e as Error).message}`);
    }
  }

  if (!started) {
    throw new Error(
      'Não consegui iniciar a mão. Confira os valores válidos em src/domain/value-objects/rank.ts',
    );
  }

  // 4) play-card (card.rank + card.suit)
  const rankCandidates = ['A', 'K', 'Q', 'J', '7', '6', '5', '4', '3', '2'];
  const suitCandidates = ['O', 'E', 'C', 'P', 'HEARTS', 'SPADES', 'DIAMONDS', 'CLUBS', 'H', 'S', 'D', 'C'];

  let played = false;
  for (const r of rankCandidates) {
    for (const s of suitCandidates) {
      try {
        await emitAndWaitMatchState(socket, 'play-card', {
          matchId,
          card: { rank: r, suit: s },
        });
        console.log(`✅ Carta jogada: rank="${r}", suit="${s}"\n`);
        played = true;
        break;
      } catch (e) {
        // deixa silencioso pra não poluir demais
      }
    }
    if (played) break;
  }

  if (!played) {
    throw new Error(
      'Não consegui jogar carta. Confira valores válidos em src/domain/value-objects/rank.ts e suit.ts',
    );
  }

  // 5) get-state
  const finalState = await emitAndWaitMatchState(socket, 'get-state', { matchId });
  console.log('\n📌 Estado final:\n', JSON.stringify(finalState, null, 2));

  socket.disconnect();
}

main().catch((err) => {
  console.error('\n❌ WS Client failed:', err);
  process.exit(1);
});
