// =============================================================================
//  useGameSound.ts — som do jogo, com fallback procedural.
// =============================================================================
//
//  Estratégia em duas camadas:
//
//   1) Se existir um arquivo em `/public/sounds/<nome>.mp3`, ele é usado.
//   2) Caso contrário, um som procedural (Web Audio API) é sintetizado em
//      runtime — sempre que o efeito é disparado.
//
//  Isso significa que o jogo TEM SOM imediatamente, antes mesmo de o time
//  produzir/licenciar samples reais. Quando os arquivos forem colocados na
//  pasta `/public/sounds/`, o cache de <audio> assume e o procedural some.
//
//  Decisões importantes:
//   - Volume mestre persistido em localStorage (`tp:soundVolume`).
//   - Mute persistido em localStorage (`tp:soundMuted`).
//   - O AudioContext é instanciado preguiçosamente, no primeiro `play()`,
//     para respeitar a política de autoplay dos navegadores. Antes do
//     primeiro gesto do usuário nada toca — isso é correto.
//   - Sons proceduralmente gerados ficam abaixo de 1.5s pra não competir
//     com a próxima ação. Truco/Seis/Nove/Doze podem chegar a 1.8s.
//   - Cada som procedural é uma função pura que recebe o ctx e o destino
//     (gainNode mestre), permitindo que o mute/volume globais sempre se
//     apliquem sem retrabalho.
//
//  Para adicionar um som novo: estenda o type `SoundType`, dê um caminho em
//  `soundUrls` (ainda que o arquivo não exista), e implemente o procedural
//  em `proceduralSounds` — preferencialmente curto e em harmonia com os
//  outros (mesma escala: A natural minor / D dorian funcionam bem).
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export type SoundType =
  // cartas
  | 'card-deal'
  | 'card-slide'
  | 'card-hover'
  | 'card-impact'
  // vira
  | 'vira-flip'
  // pedidos
  | 'truco-call'
  | 'seis-call'
  | 'nove-call'
  | 'doze-call'
  // respostas
  | 'accept'
  | 'run'
  // resolução de rodada
  | 'round-win'
  | 'round-loss'
  | 'round-tie'
  // resolução de mão / partida
  | 'hand-win'
  | 'hand-loss'
  | 'game-win'
  | 'game-loss';

type LegacySoundType = 'play-card';
type PlayableSoundType = SoundType | LegacySoundType;

function normalizeSoundType(type: PlayableSoundType): SoundType {
  if (type === 'play-card') {
    return 'card-slide';
  }

  return type;
}

const soundUrls: Record<SoundType, string> = {
  'card-deal': '/sounds/card-deal.mp3',
  'card-slide': '/sounds/card-slide.mp3',
  'card-hover': '/sounds/card-hover.mp3',
  'card-impact': '/sounds/card-impact.mp3',
  'vira-flip': '/sounds/vira-flip.mp3',
  'truco-call': '/sounds/truco.mp3',
  'seis-call': '/sounds/seis.mp3',
  'nove-call': '/sounds/nove.mp3',
  'doze-call': '/sounds/doze.mp3',
  accept: '/sounds/accept.mp3',
  run: '/sounds/run.mp3',
  'round-win': '/sounds/round-win.mp3',
  'round-loss': '/sounds/round-loss.mp3',
  'round-tie': '/sounds/round-tie.mp3',
  'hand-win': '/sounds/hand-win.mp3',
  'hand-loss': '/sounds/hand-loss.mp3',
  'game-win': '/sounds/game-win.mp3',
  'game-loss': '/sounds/game-loss.mp3',
};

// ---------------------------------------------------------------------------
//  Persistência de preferências do usuário.
// ---------------------------------------------------------------------------
const STORAGE_VOLUME_KEY = 'tp:soundVolume';
const STORAGE_MUTED_KEY = 'tp:soundMuted';

function readStoredVolume(): number {
  if (typeof window === 'undefined') return 0.7;
  const raw = window.localStorage.getItem(STORAGE_VOLUME_KEY);
  if (raw === null) return 0.7;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0.7;
}

function readStoredMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(STORAGE_MUTED_KEY) === '1';
}

// ---------------------------------------------------------------------------
//  Síntese procedural — Web Audio API.
//  Cada função recebe (ctx, destination, when) e retorna a duração em
//  segundos. `when` é um offset opcional pra agendar no futuro.
// ---------------------------------------------------------------------------
type Synth = (ctx: AudioContext, dest: AudioNode, when?: number) => number;

// helpers ------------------------------------------------------------
function envelope(
  ctx: AudioContext,
  dest: AudioNode,
  attack: number,
  hold: number,
  release: number,
  peak = 1,
  when = 0,
): GainNode {
  const g = ctx.createGain();
  const t0 = ctx.currentTime + when;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.setValueAtTime(peak, t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  g.connect(dest);
  return g;
}

function tone(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  type: OscillatorType,
  attack: number,
  hold: number,
  release: number,
  peak = 0.6,
  when = 0,
): number {
  const env = envelope(ctx, dest, attack, hold, release, peak, when);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + when);
  osc.connect(env);
  const t0 = ctx.currentTime + when;
  osc.start(t0);
  osc.stop(t0 + attack + hold + release + 0.05);
  return attack + hold + release;
}

// efeitos curtos ------------------------------------------------------
const cardSlide: Synth = (ctx, dest, when = 0) => {
  // ruído filtrado descendo — fricção.
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.18, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2200, ctx.currentTime + when);
  filter.frequency.exponentialRampToValueAtTime(700, ctx.currentTime + when + 0.18);
  filter.Q.value = 4;
  const env = envelope(ctx, dest, 0.005, 0.04, 0.14, 0.45, when);
  noise.connect(filter);
  filter.connect(env);
  noise.start(ctx.currentTime + when);
  noise.stop(ctx.currentTime + when + 0.2);
  return 0.2;
};

const cardImpact: Synth = (ctx, dest, when = 0) => {
  // baque seco: thump grave + click agudo curto.
  tone(ctx, dest, 80, 'sine', 0.001, 0.02, 0.12, 0.7, when);
  tone(ctx, dest, 160, 'triangle', 0.001, 0.01, 0.08, 0.4, when);
  // click agudo
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4000;
  const env = envelope(ctx, dest, 0.002, 0.005, 0.025, 0.18, when);
  noise.connect(hp);
  hp.connect(env);
  noise.start(ctx.currentTime + when);
  noise.stop(ctx.currentTime + when + 0.04);
  return 0.16;
};

const cardDeal: Synth = (ctx, dest, when = 0) => {
  // deslize + leve impacto agudo no fim
  cardSlide(ctx, dest, when);
  cardImpact(ctx, dest, when + 0.14);
  return 0.32;
};

const cardHover: Synth = (ctx, dest, when = 0) => {
  // pluck cristalino, muito curto e baixo.
  tone(ctx, dest, 1320, 'sine', 0.003, 0.005, 0.08, 0.18, when);
  tone(ctx, dest, 1980, 'sine', 0.003, 0.004, 0.05, 0.10, when);
  return 0.09;
};

const viraFlip: Synth = (ctx, dest, when = 0) => {
  // sweep ascendente + chime
  tone(ctx, dest, 220, 'sawtooth', 0.005, 0.01, 0.18, 0.18, when);
  tone(ctx, dest, 660, 'sine', 0.01, 0.06, 0.32, 0.45, when + 0.08);
  tone(ctx, dest, 990, 'sine', 0.01, 0.04, 0.22, 0.30, when + 0.12);
  return 0.46;
};

// pedidos: gravidade aumenta com o valor ----------------------------
function callTone(base: number, layers: number, peak: number): Synth {
  return (ctx, dest, when = 0) => {
    // 3 ondas em fifths, decaimento dramático
    const dur = 0.35 + layers * 0.05;
    for (let i = 0; i < layers; i++) {
      const f = base * (1 + i * 0.5);
      tone(ctx, dest, f, i === 0 ? 'sawtooth' : 'square', 0.008, 0.06, dur - 0.06, peak * (1 - i * 0.18), when);
    }
    // tail boom
    tone(ctx, dest, base * 0.5, 'sine', 0.01, 0.12, 0.5, peak * 0.5, when + 0.05);
    return dur + 0.5;
  };
}

const trucoCall = callTone(220, 2, 0.55);
const seisCall = callTone(165, 3, 0.62);
const noveCall = callTone(123, 3, 0.7);
const dozeCall = callTone(98, 4, 0.78);

// respostas ----------------------------------------------------------
const accept: Synth = (ctx, dest, when = 0) => {
  // dois tons ascendentes + chime
  tone(ctx, dest, 523, 'sine', 0.01, 0.05, 0.18, 0.4, when);
  tone(ctx, dest, 784, 'sine', 0.01, 0.05, 0.22, 0.4, when + 0.09);
  tone(ctx, dest, 1046, 'triangle', 0.005, 0.04, 0.2, 0.25, when + 0.18);
  return 0.5;
};

const run: Synth = (ctx, dest, when = 0) => {
  // descendente desistente
  tone(ctx, dest, 587, 'triangle', 0.01, 0.04, 0.16, 0.32, when);
  tone(ctx, dest, 392, 'triangle', 0.01, 0.05, 0.2, 0.28, when + 0.1);
  tone(ctx, dest, 261, 'sine', 0.015, 0.08, 0.3, 0.22, when + 0.22);
  return 0.6;
};

// rodada -------------------------------------------------------------
const roundWin: Synth = (ctx, dest, when = 0) => {
  // arpeggio ascendente curto e brilhante
  tone(ctx, dest, 659, 'sine', 0.006, 0.04, 0.16, 0.32, when);
  tone(ctx, dest, 880, 'sine', 0.006, 0.04, 0.18, 0.34, when + 0.07);
  tone(ctx, dest, 1175, 'triangle', 0.006, 0.06, 0.24, 0.30, when + 0.14);
  return 0.44;
};

const roundLoss: Synth = (ctx, dest, when = 0) => {
  // par descendente menor, sem ser melodramático
  tone(ctx, dest, 392, 'triangle', 0.01, 0.06, 0.2, 0.32, when);
  tone(ctx, dest, 311, 'sine', 0.01, 0.08, 0.28, 0.26, when + 0.1);
  return 0.46;
};

const roundTie: Synth = (ctx, dest, when = 0) => {
  // tom neutro com leve tremor
  tone(ctx, dest, 523, 'sine', 0.01, 0.06, 0.18, 0.28, when);
  tone(ctx, dest, 523, 'sine', 0.01, 0.04, 0.18, 0.20, when + 0.16);
  return 0.4;
};

// mão e partida ------------------------------------------------------
const handWin: Synth = (ctx, dest, when = 0) => {
  // fanfarra curta
  tone(ctx, dest, 523, 'triangle', 0.008, 0.05, 0.18, 0.4, when);
  tone(ctx, dest, 659, 'triangle', 0.008, 0.05, 0.2, 0.4, when + 0.1);
  tone(ctx, dest, 784, 'triangle', 0.008, 0.06, 0.22, 0.4, when + 0.2);
  tone(ctx, dest, 1046, 'sine', 0.008, 0.1, 0.4, 0.36, when + 0.32);
  return 0.86;
};

const handLoss: Synth = (ctx, dest, when = 0) => {
  // queda em mi menor
  tone(ctx, dest, 440, 'triangle', 0.01, 0.08, 0.2, 0.36, when);
  tone(ctx, dest, 349, 'triangle', 0.01, 0.08, 0.22, 0.32, when + 0.14);
  tone(ctx, dest, 277, 'sine', 0.015, 0.12, 0.42, 0.28, when + 0.3);
  return 0.86;
};

const gameWin: Synth = (ctx, dest, when = 0) => {
  // fanfarra grande
  handWin(ctx, dest, when);
  tone(ctx, dest, 1046, 'sine', 0.01, 0.1, 0.38, 0.32, when + 0.5);
  tone(ctx, dest, 1318, 'sine', 0.01, 0.1, 0.4, 0.32, when + 0.62);
  tone(ctx, dest, 1568, 'triangle', 0.01, 0.18, 0.55, 0.30, when + 0.78);
  return 1.5;
};

const gameLoss: Synth = (ctx, dest, when = 0) => {
  // peso, baixo grave decaindo
  tone(ctx, dest, 196, 'sawtooth', 0.02, 0.2, 0.4, 0.42, when);
  tone(ctx, dest, 147, 'triangle', 0.02, 0.25, 0.5, 0.36, when + 0.2);
  tone(ctx, dest, 110, 'sine', 0.03, 0.4, 0.7, 0.32, when + 0.45);
  return 1.5;
};

const proceduralSounds: Record<SoundType, Synth> = {
  'card-deal': cardDeal,
  'card-slide': cardSlide,
  'card-hover': cardHover,
  'card-impact': cardImpact,
  'vira-flip': viraFlip,
  'truco-call': trucoCall,
  'seis-call': seisCall,
  'nove-call': noveCall,
  'doze-call': dozeCall,
  accept,
  run,
  'round-win': roundWin,
  'round-loss': roundLoss,
  'round-tie': roundTie,
  'hand-win': handWin,
  'hand-loss': handLoss,
  'game-win': gameWin,
  'game-loss': gameLoss,
};

// ---------------------------------------------------------------------------
//  Singleton: AudioContext + cache de <audio> elements + estado mestre.
//  Mantemos isso fora do hook pra que múltiplos consumidores compartilhem
//  o mesmo contexto e o estado de mute seja realmente global.
// ---------------------------------------------------------------------------
type GameSoundEngine = {
  ctx: AudioContext | null;
  master: GainNode | null;
  audioCache: Map<SoundType, HTMLAudioElement>;
  audioFailed: Set<SoundType>; // se o arquivo falhou ao carregar, vai aqui
  volume: number;
  muted: boolean;
  listeners: Set<(s: { volume: number; muted: boolean }) => void>;
};

const engine: GameSoundEngine = {
  ctx: null,
  master: null,
  audioCache: new Map(),
  audioFailed: new Set(),
  volume: readStoredVolume(),
  muted: readStoredMuted(),
  listeners: new Set(),
};

function ensureCtx(): { ctx: AudioContext; master: GainNode } | null {
  if (engine.ctx && engine.master) {
    return { ctx: engine.ctx, master: engine.master };
  }
  try {
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = engine.muted ? 0 : engine.volume;
    master.connect(ctx.destination);
    engine.ctx = ctx;
    engine.master = master;
    return { ctx, master };
  } catch {
    return null;
  }
}

function applyMasterGain() {
  if (!engine.master || !engine.ctx) return;
  const target = engine.muted ? 0.0001 : Math.max(0.0001, engine.volume);
  engine.master.gain.cancelScheduledValues(engine.ctx.currentTime);
  engine.master.gain.exponentialRampToValueAtTime(target, engine.ctx.currentTime + 0.05);
}

function notify() {
  const snapshot = { volume: engine.volume, muted: engine.muted };
  engine.listeners.forEach((cb) => cb(snapshot));
}

// ---------------------------------------------------------------------------
//  Hook público.
// ---------------------------------------------------------------------------
export type GameSoundApi = {
  play: (type: PlayableSoundType, volume?: number) => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  muted: boolean;
  volume: number;
};

export function useGameSound(): GameSoundApi {
  const [muted, setMutedState] = useState(engine.muted);
  const [volume, setVolumeState] = useState(engine.volume);

  // pré-carrega os <audio> existentes uma vez por mount; falhas mudam pra
  // procedural silenciosamente (o navegador não bloqueia o jogo).
  const preloadedRef = useRef(false);
  useEffect(() => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;

    (Object.keys(soundUrls) as SoundType[]).forEach((key) => {
      const url = soundUrls[key];
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.addEventListener('error', () => {
        engine.audioFailed.add(key);
      });
      // Em alguns navegadores, o evento `error` só dispara depois do
      // primeiro play(). Por isso também detectamos via NotSupportedError
      // no catch do play().
      engine.audioCache.set(key, audio);
    });
  }, []);

  // sincroniza state local com o engine (suporta múltiplos hooks).
  useEffect(() => {
    const cb = ({ volume: v, muted: m }: { volume: number; muted: boolean }) => {
      setVolumeState(v);
      setMutedState(m);
    };
    engine.listeners.add(cb);
    return () => {
      engine.listeners.delete(cb);
    };
  }, []);

  const play = useCallback((type: PlayableSoundType, perCallVolume = 1) => {
    if (engine.muted) return;

    const normalizedType = normalizeSoundType(type);
    const audio = engine.audioCache.get(normalizedType);
    const fileLikelyExists = audio && !engine.audioFailed.has(normalizedType);

    if (fileLikelyExists) {
      try {
        audio.volume = Math.max(0, Math.min(1, engine.volume * perCallVolume));
        audio.currentTime = 0;
        audio.play().catch(() => {
          engine.audioFailed.add(normalizedType);
          // fallback procedural quando o autoplay falha ou o arquivo erra
          playProcedural(normalizedType, perCallVolume);
        });
        return;
      } catch {
        engine.audioFailed.add(normalizedType);
      }
    }

    playProcedural(normalizedType, perCallVolume);
  }, []);

  const setMuted = useCallback((next: boolean) => {
    engine.muted = next;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_MUTED_KEY, next ? '1' : '0');
    }
    applyMasterGain();
    notify();
  }, []);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    engine.volume = clamped;
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_VOLUME_KEY, String(clamped));
    }
    applyMasterGain();
    notify();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted(!engine.muted);
  }, [setMuted]);

  return useMemo(
    () => ({ play, setMuted, setVolume, toggleMute, muted, volume }),
    [play, setMuted, setVolume, toggleMute, muted, volume],
  );
}

function playProcedural(type: SoundType, perCallVolume: number) {
  const synth = proceduralSounds[type];

  if (!synth) {
    return;
  }

  const ensured = ensureCtx();
  if (!ensured) return;
  const { ctx, master } = ensured;
  // resume() é necessário em iOS/Safari após o primeiro gesto.
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  // gain por chamada — multiplicado pelo master.
  const perCall = ctx.createGain();
  perCall.gain.value = Math.max(0, Math.min(1.5, perCallVolume));
  perCall.connect(master);
  synth(ctx, perCall);
}
