/* global io */

const el = (id) => document.getElementById(id);

const ui = {
  backendUrl: el('backendUrl'),
  backendUrlLabel: el('backendUrlLabel'),
  playerToken: el('playerToken'),
  matchId: el('matchId'),
  btnConnect: el('btnConnect'),
  btnDisconnect: el('btnDisconnect'),
  btnCreateMatch: el('btnCreateMatch'),
  btnJoinMatch: el('btnJoinMatch'),
  btnReady: el('btnReady'),
  btnGetState: el('btnGetState'),
  viraRank: el('viraRank'),
  btnStartHand: el('btnStartHand'),
  cardRank: el('cardRank'),
  cardSuit: el('cardSuit'),
  btnPlayCard: el('btnPlayCard'),
  btnGetRanking: el('btnGetRanking'),
  connStatus: el('connStatus'),
  seatId: el('seatId'),
  teamId: el('teamId'),
  domainPlayerId: el('domainPlayerId'),
  profileId: el('profileId'),
  hudMatchId: el('hudMatchId'),
  hudMatchState: el('hudMatchState'),
  hudTurn: el('hudTurn'),
  scoreT1: el('scoreT1'),
  scoreT2: el('scoreT2'),
  canStartBadge: el('canStartBadge'),
  ready_T1A: el('ready_T1A'),
  ready_T2A: el('ready_T2A'),
  seat_T1A: el('seat_T1A'),
  seat_T2A: el('seat_T2A'),
  handCount_T1A: el('handCount_T1A'),
  handCount_T2A: el('handCount_T2A'),
  played_T1A: el('played_T1A'),
  played_T2A: el('played_T2A'),
  viraCard: el('viraCard'),
  viraHint: el('viraHint'),
  myHand: el('myHand'),
  handHint: el('handHint'),
  rankingLimitLabel: el('rankingLimitLabel'),
  rankingStatus: el('rankingStatus'),
  rankingBody: el('rankingBody'),
  eventLog: el('eventLog'),
  btnClearLog: el('btnClearLog'),
  toast: el('toast'),
  toastTitle: el('toastTitle'),
  toastMsg: el('toastMsg'),
};

const SEATS = ['T1A', 'T2A'];
const SUITS = ['C', 'O', 'P', 'E'];
const RANKS = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const state = {
  socket: null,
  connected: false,
  session: {
    playerToken: null,
    matchId: null,
    seatId: null,
    teamId: null,
    domainPlayerId: null,
    profileId: null,
  },
  lastRoomState: null,
  lastMatchState: null,
  ranking: {
    limit: 20,
    lastUpdatedAt: null,
    entries: null,
  },
  ui: {
    toastTimer: null,
  },
  sim: {
    handNoByMatch: new Map(),
    currentMatchId: null,
    localGame: null,
    selectedCardKey: null,
    lastTurnSeatId: null,
    clearingRound: false, // 🔥 NOVO: Controle de animação da rodada
  },
};

const LS = {
  keyCurrentHand(matchId) { return `tp:currentHand:${matchId}`; },
  keyHand(matchId, handNo) { return `tp:hand:${matchId}:${handNo}`; },
  keyPrefixHand(matchId) { return `tp:hand:${matchId}:`; },
};

function lsSet(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }
function lsGet(key) { try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : null; } catch { return null; } }
function lsSetCurrentHand(matchId, handNo) { lsSet(LS.keyCurrentHand(matchId), { handNo }); }
function lsGetCurrentHandNo(matchId) { const v = lsGet(LS.keyCurrentHand(matchId)); return Number.isFinite(v?.handNo) ? v.handNo : null; }
function lsSetHand(matchId, handNo, data) { lsSet(LS.keyHand(matchId, handNo), data); }
function lsGetHand(matchId, handNo) { return lsGet(LS.keyHand(matchId, handNo)); }

function nowTs() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// NOTE: O log sempre insere as linhas no TOPO (prepend). Não precisa de barra de rolagem!
function logEvent(name, payload) {
  const line = `[${nowTs()}] ${name}\n${payload ? JSON.stringify(payload, null, 2) : ''}\n`;
  if (ui.eventLog.textContent.trim() === '-') ui.eventLog.textContent = line;
  else ui.eventLog.textContent = line + '\n' + ui.eventLog.textContent;
}

function normalizeBackendUrl(raw) {
  const v = String(raw || '').trim().replace(/\/+$/, '');
  return v || 'http://localhost:3000';
}

function showToast(title, msg) {
  ui.toastTitle.textContent = title;
  ui.toastMsg.textContent = msg;
  ui.toast.classList.remove('hidden');
  if (state.ui.toastTimer) clearTimeout(state.ui.toastTimer);
  state.ui.toastTimer = setTimeout(() => {
    ui.toast.classList.add('hidden');
    state.ui.toastTimer = null;
  }, 3500);
}

function setConn(on) {
  state.connected = on;
  ui.connStatus.textContent = on ? 'ON' : 'OFF';
  ui.connStatus.classList.toggle('pill--on', on);
  ui.connStatus.classList.toggle('pill--off', !on);
  ui.btnConnect.disabled = on;
  ui.btnDisconnect.disabled = !on;
  ui.btnCreateMatch.disabled = !on;
  ui.btnJoinMatch.disabled = !on;
}

function setBadge(elm, text, kind) {
  if (!elm) return;
  elm.textContent = text;
  elm.classList.remove('badge--ok', 'badge--bad', 'badge--warn', 'badge--muted');
  if (kind === 'ok') elm.classList.add('badge--ok');
  else if (kind === 'bad') elm.classList.add('badge--bad');
  else if (kind === 'warn') elm.classList.add('badge--warn');
  else elm.classList.add('badge--muted');
}

function escapeHtml(s) {
  return String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function seatEl(seatId) { return ui[`seat_${seatId}`]; }
function readyEl(seatId) { return ui[`ready_${seatId}`]; }
function handCountEl(seatId) { return ui[`handCount_${seatId}`]; }
function playedEl(seatId) { return ui[`played_${seatId}`]; }

function resetSimUi() {
  for (const seatId of SEATS) {
    if(handCountEl(seatId)) handCountEl(seatId).textContent = '🂠 x0';
    if(playedEl(seatId)) playedEl(seatId).textContent = '—';
  }
  ui.viraCard.innerHTML = renderCardFaceHtml(null, { big: true });
  ui.myHand.textContent = '—';
  state.sim.selectedCardKey = null;
  state.sim.clearingRound = false;
}

function resetClientState() {
  state.session.matchId = null;
  state.session.seatId = null;
  state.session.teamId = null;
  state.session.domainPlayerId = null;
  state.session.profileId = null;
  state.lastRoomState = null;
  state.lastMatchState = null;
  state.ranking.entries = null;
  state.ranking.lastUpdatedAt = null;
  state.sim.currentMatchId = null;
  state.sim.localGame = null;
  state.sim.selectedCardKey = null;
  state.sim.lastTurnSeatId = null;
  state.sim.clearingRound = false;
  ui.matchId.value = '';
  resetSimUi();
  renderAll();
}

function deriveMyReady() {
  const room = state.lastRoomState;
  const me = state.session.seatId;
  const players = Array.isArray(room?.players) ? room.players : [];
  if (!me) return null;
  const p = players.find((x) => x?.seatId === me);
  return p ? !!p.ready : null;
}

function updateReadyButton() {
  const myReady = deriveMyReady();
  if (myReady === null) ui.btnReady.textContent = 'Ready: -';
  else ui.btnReady.textContent = `Ready: ${myReady ? 'ON' : 'OFF'}`;
}

function isInProgress() { return state.lastMatchState?.state === 'in_progress'; }

function renderIdentity() {
  ui.seatId.textContent = state.session.seatId ?? '-';
  ui.teamId.textContent = state.session.teamId ?? '-';
  ui.domainPlayerId.textContent = state.session.domainPlayerId ?? '-';
  ui.profileId.textContent = state.session.profileId ?? '-';
}

function renderHud() {
  ui.backendUrlLabel.textContent = normalizeBackendUrl(ui.backendUrl.value);
  ui.hudMatchId.textContent = state.session.matchId ?? '-';

  const matchState = state.lastMatchState?.state ?? '-';
  if (matchState === 'in_progress') setBadge(ui.hudMatchState, matchState, 'ok');
  else if (matchState === 'finished') setBadge(ui.hudMatchState, matchState, 'bad');
  else if (matchState === 'waiting') setBadge(ui.hudMatchState, matchState, 'muted');
  else setBadge(ui.hudMatchState, matchState, 'muted');

  ui.hudTurn.textContent = state.lastRoomState?.currentTurnSeatId ?? '-';

  ui.scoreT1.textContent = String(state.lastMatchState?.score?.playerOne ?? 0);
  ui.scoreT2.textContent = String(state.lastMatchState?.score?.playerTwo ?? 0);

  const canStart = !!state.lastRoomState?.canStart;
  setBadge(ui.canStartBadge, `canStart: ${canStart ? 'true' : 'false'}`, canStart ? 'ok' : 'muted');

  const shouldShowHandHint = canStart && matchState === 'waiting' && state.session.matchId;
  ui.handHint.classList.toggle('hidden', !shouldShowHandHint);
}

function renderSeats() {
  const room = state.lastRoomState;
  const me = state.session.seatId;
  const turn = room?.currentTurnSeatId ?? null;
  const players = Array.isArray(room?.players) ? room.players : [];
  const bySeat = new Map(players.map((p) => [p.seatId, p]));

  for (const seatId of SEATS) {
    const p = bySeat.get(seatId);
    const card = seatEl(seatId);
    if (!card) continue;

    card.classList.remove('seat--occupied', 'seat--ready', 'seat--turn', 'seat--me');
    if (p) {
      card.classList.add('seat--occupied');
      if (p.ready) card.classList.add('seat--ready');
      readyEl(seatId).textContent = `ready: ${p.ready ? 'true' : 'false'}`;
    } else {
      readyEl(seatId).textContent = 'ready: -';
    }
    if (turn && seatId === turn) card.classList.add('seat--turn');
    if (me && seatId === me) card.classList.add('seat--me');
  }
}

function renderRanking() {
  ui.rankingLimitLabel.textContent = String(state.ranking.limit);
  if (!state.ranking.entries) {
    setBadge(ui.rankingStatus, '-', 'muted');
    ui.rankingBody.innerHTML = `<tr><td colspan="6" class="muted">Sem dados (clique em “Atualizar ranking”).</td></tr>`;
    return;
  }
  const at = state.ranking.lastUpdatedAt;
  setBadge(ui.rankingStatus, at ? `atualizado ${at}` : 'ok', 'ok');

  const rows = state.ranking.entries.map((e, idx) => {
    const isMe = state.session.playerToken && e.playerToken === state.session.playerToken;
    const playerCell = isMe ? `${escapeHtml(e.playerToken)} <span class="muted">(você)</span>` : escapeHtml(e.playerToken);
    return `
      <tr>
        <td>${idx + 1}</td>
        <td>${playerCell}</td>
        <td class="num">${e.rating}</td>
        <td class="num">${e.wins}</td>
        <td class="num">${e.losses}</td>
        <td class="num">${e.matchesPlayed}</td>
      </tr>
    `;
  });
  ui.rankingBody.innerHTML = rows.join('');
}

function renderAll() {
  renderIdentity();
  renderHud();
  renderSeats();
  updateReadyButton();
  updateActionButtons();
  renderRanking();
  renderSim();
}

function updateActionButtons() {
  const matchState = state.lastMatchState?.state ?? null;
  const room = state.lastRoomState;
  const matchId = state.session.matchId ?? '';
  const canStart = !!room?.canStart;
  const mySeat = state.session.seatId;
  const isMyTurn = !!mySeat && room?.currentTurnSeatId === mySeat;
  const joined = matchId.length > 0;

  ui.btnGetState.disabled = !state.connected || !joined;
  ui.btnReady.disabled = !state.connected || !joined || !mySeat;

  const canStartHand = state.connected && joined && canStart && matchState === 'waiting';
  ui.btnStartHand.disabled = !canStartHand;

  const canPlay = state.connected && joined && matchState === 'in_progress' && isMyTurn;
  ui.btnPlayCard.disabled = !canPlay;
  ui.btnGetRanking.disabled = !state.connected;
}

function suitSymbol(suit) {
  if (suit === 'C') return '♥';
  if (suit === 'O') return '♦';
  if (suit === 'P') return '♣';
  return '♠';
}

function suitColorClass(suit) { return suit === 'C' || suit === 'O' ? 'card--red' : 'card--black'; }

function renderCardFaceHtml(card, opts) {
  const empty = !card;
  const rank = empty ? '—' : String(card.rank);
  const suit = empty ? '' : suitSymbol(card.suit);
  return `
    <div class="cardface">
      <div class="cardface__top"><span>${escapeHtml(rank)}</span><span>${escapeHtml(suit)}</span></div>
      <div class="cardface__mid">${escapeHtml(suit || '—')}</div>
      <div class="cardface__bot"><span>${escapeHtml(suit)}</span><span>${escapeHtml(rank)}</span></div>
    </div>
  `;
}

function cardKey(card) { return `${card.rank}|${card.suit}`; }

function hashStringToU32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push({ rank, suit });
  return deck;
}

function shuffleInPlace(deck, rand) {
  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
}

function ensureSimForMatch(matchId) {
  state.sim.currentMatchId = matchId;
  if (!state.sim.handNoByMatch.has(matchId)) state.sim.handNoByMatch.set(matchId, 0);
  if (state.sim.localGame && state.sim.localGame.matchId === matchId) return;

  state.sim.localGame = null;
  state.sim.selectedCardKey = null;
  state.sim.lastTurnSeatId = null;
  state.sim.clearingRound = false;

  tryLoadLocalHandFromStorage(matchId);
}

function tryLoadLocalHandFromStorage(matchId) {
  const handNo = lsGetCurrentHandNo(matchId);
  if (!handNo) return false;
  const saved = lsGetHand(matchId, handNo);
  if (!saved || !saved?.hands || !saved?.vira || !saved?.matchId) return false;

  state.sim.localGame = {
    matchId: saved.matchId,
    handNo: saved.handNo,
    vira: saved.vira,
    hands: saved.hands,
    played: saved.played ?? { T1A: null, T2A: null },
    viraRankChosen: saved.viraRankChosen ?? saved.vira?.rank ?? '4',
  };

  state.sim.handNoByMatch.set(matchId, Math.max(state.sim.handNoByMatch.get(matchId) ?? 0, handNo));
  return true;
}

function persistLocalHandToStorage(g) {
  const payload = {
    matchId: g.matchId,
    handNo: g.handNo,
    vira: g.vira,
    hands: g.hands,
    played: g.played,
    viraRankChosen: g.viraRankChosen,
  };
  lsSetCurrentHand(g.matchId, g.handNo);
  lsSetHand(g.matchId, g.handNo, payload);
}

function startLocalHand(matchId, viraRankChosen) {
  ensureSimForMatch(matchId);
  if (tryLoadLocalHandFromStorage(matchId)) { renderAll(); return; }

  const handNo = (lsGetCurrentHandNo(matchId) ?? 0) + 1;
  const seed = hashStringToU32(`${matchId}:${handNo}:${viraRankChosen}`);
  const rand = mulberry32(seed);

  const deck = buildDeck();
  shuffleInPlace(deck, rand);

  const hands = { T1A: [], T2A: [] };
  for (let i = 0; i < 3; i += 1) for (const seatId of SEATS) hands[seatId].push(deck.pop());

  const suit = SUITS[Math.floor(rand() * SUITS.length)];
  const vira = { rank: viraRankChosen, suit };

  state.sim.localGame = { matchId, handNo, vira, hands, played: { T1A: null, T2A: null }, viraRankChosen };
  state.sim.handNoByMatch.set(matchId, Math.max(state.sim.handNoByMatch.get(matchId) ?? 0, handNo));
  state.sim.selectedCardKey = null;

  persistLocalHandToStorage(state.sim.localGame);
  showToast('Mão', `Hand #${handNo} iniciada. Vira: ${viraRankChosen}`);
  renderAll();
}

function renderSim() {
  const matchId = state.session.matchId;
  if (!matchId) { resetSimUi(); return; }

  ensureSimForMatch(matchId);

  if (!state.sim.localGame || state.sim.localGame.matchId !== matchId) {
    tryLoadLocalHandFromStorage(matchId);
  }

  const g = state.sim.localGame;

  if (!g || g.matchId !== matchId) {
    for (const seatId of SEATS) { if(handCountEl(seatId)) handCountEl(seatId).textContent = '🂠 x0'; }
    ui.viraCard.innerHTML = renderCardFaceHtml(null, { big: true });
    ui.viraHint.textContent = 'Clique Start next hand...';
    ui.myHand.textContent = '—';
    return;
  }

  ui.viraHint.textContent = `Hand #${g.handNo} (sync via localStorage).`;
  ui.viraCard.innerHTML = renderCardFaceHtml(g.vira, { big: true });
  ui.viraCard.classList.remove('card--empty', 'card--red', 'card--black');
  ui.viraCard.classList.add(suitColorClass(g.vira.suit));

  for (const seatId of SEATS) {
    const count = g.hands?.[seatId]?.length ?? 0;
    if(handCountEl(seatId)) handCountEl(seatId).textContent = `🂠 x${count}`;

    const played = g.played?.[seatId] ?? null;
    if (!played) { 
        if(playedEl(seatId)) playedEl(seatId).textContent = '—';
    } else if (played.kind === 'card') {
        if(playedEl(seatId)) playedEl(seatId).textContent = `${played.card.rank}${suitSymbol(played.card.suit)}`;
    } else {
        if(playedEl(seatId)) playedEl(seatId).textContent = '🂠';
    }
  }

  // 🔥 LÓGICA DE VÍDEO: Apagar as cartas da mesa quando a rodada termina (ambos jogaram)
  const p1Card = g.played?.['T1A'];
  const p2Card = g.played?.['T2A'];

  if (p1Card?.kind === 'card' && p2Card?.kind === 'card') {
    if (!state.sim.clearingRound) {
      state.sim.clearingRound = true;
      logEvent('🏁 SIMULAÇÃO', { info: 'Rodada concluída. Backend está avaliando o vencedor e pontuação...' });
      
      // Espera 2.5s para o usuário ver as cartas e ler o log, depois limpa a mesa
      setTimeout(() => {
        const currentG = state.sim.localGame;
        // Garantimos que a mão ainda é a mesma antes de limpar
        if (currentG && currentG.handNo === g.handNo) {
          currentG.played['T1A'] = null;
          currentG.played['T2A'] = null;
          persistLocalHandToStorage(currentG);
          state.sim.clearingRound = false;
          renderAll(); // Atualiza a tela limpando as cartas
        }
      }, 2500);
    }
  }

  renderMyHand(g);
}

function renderMyHand(g) {
  const me = state.session.seatId;
  if (!me) { ui.myHand.textContent = 'Conecte e entre na partida.'; return; }

  const matchState = state.lastMatchState?.state ?? null;
  const canClick = matchState === 'in_progress';
  const cards = Array.isArray(g.hands?.[me]) ? g.hands[me] : [];

  if (cards.length === 0) {
    ui.myHand.textContent = canClick ? 'Sem cartas na mão (já jogou as 3).' : '—';
    return;
  }

  const selectedKey = state.sim.selectedCardKey;
  const items = cards.map((c) => {
    const key = cardKey(c);
    const cls = ['card', suitColorClass(c.suit), 'card--selectable', selectedKey === key ? 'card--selected' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}" data-card="${key}" title="Clique para jogar">${renderCardFaceHtml(c)}</div>`;
  }).join('');

  ui.myHand.innerHTML = items;

  ui.myHand.querySelectorAll('[data-card]').forEach((node) => {
    node.addEventListener('click', () => {
      if (!canClick) { showToast('Jogo', 'A mão não está em andamento (in_progress).'); return; }

      const key = String(node.getAttribute('data-card') || '');
      state.sim.selectedCardKey = key;

      const card = cards.find((x) => cardKey(x) === key);
      if (!card) return;

      emitPlayCardFromHand(card);
      renderAll();
    });
  });
}

function emitPlayCardFromHand(card) {
  if (!state.socket) return;

  const matchId = state.session.matchId ?? requireMatchId();
  const room = state.lastRoomState;
  const mySeat = state.session.seatId;
  const isMyTurn = !!mySeat && room?.currentTurnSeatId === mySeat;

  if (!isInProgress()) { showToast('Jogada', 'Você só pode jogar quando o estado estiver in_progress.'); return; }
  if (!isMyTurn) { showToast('Jogada', 'Não é sua vez.'); return; }

  const g = state.sim.localGame;
  if (!g || g.matchId !== matchId) { showToast('Jogada', 'Sem mão local. Clique Start next hand.'); return; }

  const hand = g.hands?.[mySeat] ?? [];
  const idx = hand.findIndex((x) => cardKey(x) === cardKey(card));
  if (idx < 0) return;

  hand.splice(idx, 1);
  g.played[mySeat] = { kind: 'card', card };
  persistLocalHandToStorage(g);

  ui.cardRank.value = card.rank;
  ui.cardSuit.value = card.suit;

  state.socket.emit('play-card', { matchId, card });
  logEvent('emit:play-card', { matchId, card });

  renderAll();
}

function handleStorageSync(e) {
  const matchId = state.session.matchId;
  if (!matchId) return;
  if (e.key === LS.keyCurrentHand(matchId) || (typeof e.key === 'string' && e.key.startsWith(LS.keyPrefixHand(matchId)))) {
    if (tryLoadLocalHandFromStorage(matchId)) renderAll();
  }
}
window.addEventListener('storage', handleStorageSync);

function ensureSocketIoLoadedOrThrow(baseUrl) {
  if (typeof window.io === 'function') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${baseUrl.replace(/\/+$/, '')}/socket.io/socket.io.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Falha ao carregar socket.io`));
    document.head.appendChild(s);
  });
}

function connect() {
  const baseUrl = normalizeBackendUrl(ui.backendUrl.value);
  const token = String(ui.playerToken.value || '').trim();
  if (!token) return alert('Player Token é obrigatório.');

  state.session.playerToken = token;
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  resetClientState();

  ensureSocketIoLoadedOrThrow(baseUrl).then(() => {
    state.socket = io(baseUrl, { transports: ['websocket'], auth: { token } });
    wireSocket(state.socket);
  }).catch((err) => { showToast('Socket.IO', err.message); logEvent('socketio:load_error', { message: err.message }); });
}

function disconnect() {
  if (state.socket) { state.socket.disconnect(); state.socket = null; }
  setConn(false);
  resetClientState();
}

function wireSocket(socket) {
  socket.on('connect', () => { setConn(true); logEvent('socket:connect', { id: socket.id, token: state.session.playerToken }); renderAll(); });
  socket.on('disconnect', (reason) => { logEvent('socket:disconnect', { reason }); setConn(false); renderAll(); });
  socket.on('error', (payload) => { logEvent('server:error', payload); showToast('Erro', payload?.message || 'Erro'); });

  socket.on('player-assigned', (payload) => {
    logEvent('player-assigned', payload);
    Object.assign(state.session, {
      matchId: payload?.matchId ?? state.session.matchId,
      seatId: payload?.seatId ?? null,
      teamId: payload?.teamId ?? null,
      domainPlayerId: payload?.playerId ?? null,
      profileId: payload?.profileId ?? null,
    });
    if (payload?.matchId) ui.matchId.value = payload.matchId;
    if (state.session.matchId) { ensureSimForMatch(state.session.matchId); tryLoadLocalHandFromStorage(state.session.matchId); }
    renderAll();
  });

  socket.on('room-state', (payload) => {
    state.lastRoomState = payload;
    logEvent('room-state', payload);
    const matchId = payload?.matchId ?? state.session.matchId ?? null;
    if (matchId) ensureSimForMatch(matchId);

    const currentTurn = payload?.currentTurnSeatId ?? null;
    const prevTurn = state.sim.lastTurnSeatId;
    if (isInProgress() && prevTurn && currentTurn && prevTurn !== currentTurn) {
      const g = state.sim.localGame;
      if (g && g.matchId === matchId && !g.played[prevTurn]) {
        g.played[prevTurn] = { kind: 'back' };
        persistLocalHandToStorage(g);
      }
    }
    state.sim.lastTurnSeatId = currentTurn;
    renderAll();
  });

  socket.on('match-state', (payload) => {
    state.lastMatchState = payload;
    logEvent('match-state', payload);
    const matchId = payload?.matchId ?? state.session.matchId ?? null;
    if (matchId) { ensureSimForMatch(matchId); tryLoadLocalHandFromStorage(matchId); }
    renderAll();
  });

  socket.on('ranking', (payload) => {
    const ranking = Array.isArray(payload?.ranking) ? payload.ranking : null;
    if (!ranking) { state.ranking.entries = []; state.ranking.lastUpdatedAt = nowTs(); renderAll(); return; }
    state.ranking.entries = ranking.map((x) => ({
      playerToken: String(x.playerToken ?? ''),
      rating: Number(x.rating ?? 0),
      wins: Number(x.wins ?? 0),
      losses: Number(x.losses ?? 0),
      matchesPlayed: Number(x.matchesPlayed ?? 0),
    }));
    state.ranking.lastUpdatedAt = nowTs();
    logEvent('ranking', payload);
    renderAll();
  });

  socket.on('rating-updated', (payload) => {
    logEvent('rating-updated', payload);
    emitGetRanking({ silent: true });
    showToast('Ranking', 'Rating atualizado. Recarregando ranking…');
  });

  socket.on('hand-started', (payload) => {
    logEvent('hand-started', payload);
    const matchId = payload?.matchId ?? state.session.matchId;
    const viraRankFromServer = payload?.viraRank;
    if (!matchId || !viraRankFromServer) return;
    ui.viraRank.value = viraRankFromServer;
    startLocalHand(matchId, viraRankFromServer);
  });

  socket.on('created', (payload) => logEvent('created', payload));
  socket.on('joined', (payload) => logEvent('joined', payload));
  socket.on('ready-updated', (payload) => logEvent('ready-updated', payload));
  socket.on('card-played', (payload) => logEvent('card-played', payload));
}

function requireMatchId() { const raw = String(ui.matchId.value || '').trim(); return raw || null; }
function emitCreateMatch() { state.socket?.emit('create-match', {}); logEvent('emit:create-match', {}); }
function emitJoinMatch() { const m = requireMatchId(); if(m) { state.socket?.emit('join-match', { matchId: m }); logEvent('emit:join-match', { matchId: m }); } }
function emitSetReady() { const next = deriveMyReady() === null ? true : !deriveMyReady(); state.socket?.emit('set-ready', { ready: next }); logEvent('emit:set-ready', { ready: next }); }
function emitGetState() { const m = state.session.matchId ?? requireMatchId(); if(m) { state.socket?.emit('get-state', { matchId: m }); logEvent('emit:get-state', { matchId: m }); } }
function emitStartHand() { const m = state.session.matchId ?? requireMatchId(); const v = String(ui.viraRank.value || '').trim().toUpperCase(); if(m && v) { state.socket?.emit('start-hand', { matchId: m, viraRank: v }); logEvent('emit:start-hand', { matchId: m, viraRank: v }); } }
function emitPlayCardFallbackFromSelects() { const m = state.session.matchId ?? requireMatchId(); const r = String(ui.cardRank.value || '').trim().toUpperCase(); const s = String(ui.cardSuit.value || '').trim().toUpperCase(); if(m) { state.socket?.emit('play-card', { matchId: m, card: { rank: r, suit: s } }); logEvent('emit:play-card', { matchId: m, card: { rank: r, suit: s } }); } }
function emitGetRanking(opts) { const l = state.ranking.limit; state.socket?.emit('get-ranking', { limit: l }); if (!opts?.silent) logEvent('emit:get-ranking', { limit: l }); }

ui.btnConnect.addEventListener('click', connect);
ui.btnDisconnect.addEventListener('click', disconnect);
ui.btnCreateMatch.addEventListener('click', emitCreateMatch);
ui.btnJoinMatch.addEventListener('click', emitJoinMatch);
ui.btnReady.addEventListener('click', emitSetReady);
ui.btnGetState.addEventListener('click', emitGetState);
ui.btnStartHand.addEventListener('click', emitStartHand);
ui.btnPlayCard.addEventListener('click', emitPlayCardFallbackFromSelects);
ui.btnGetRanking.addEventListener('click', () => emitGetRanking({ silent: false }));
ui.btnClearLog.addEventListener('click', () => { ui.eventLog.textContent = '-'; });

setConn(false);
resetSimUi();
renderAll();