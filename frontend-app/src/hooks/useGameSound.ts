// PREMIUM PATCH — useGameSound
//
// Keeps the original public API intact: play, setMuted, setVolume, toggleMute,
// muted, and volume. The sound director controls mix balance through per-call
// volumes while this hook keeps the shared engine and procedural fallbacks.

import { useCallback, useEffect, useRef, useState } from 'react';

export type SoundType =
  | 'card-deal'
  | 'card-slide'
  | 'card-hover'
  | 'card-impact'
  | 'vira-flip'
  | 'vira-reveal'
  | 'card-shuffle'
  | 'coin-flip'
  | 'chip-drop'
  | 'truco-call'
  | 'seis-call'
  | 'nove-call'
  | 'doze-call'
  | 'accept'
  | 'run'
  | 'round-win'
  | 'round-loss'
  | 'round-tie'
  | 'hand-win'
  | 'hand-loss'
  | 'game-win'
  | 'game-loss';

type LegacySoundType = 'play-card';
type PlayableSoundType = SoundType | LegacySoundType;

function normalizeSoundType(type: PlayableSoundType): SoundType {
  if (type === 'play-card') return 'card-slide';
  return type;
}

const soundUrls: Record<SoundType, string> = {
  'card-deal': '/sounds/card-deal.mp3',
  'card-slide': '/sounds/card-slide.mp3',
  'card-hover': '/sounds/card-hover.mp3',
  'card-impact': '/sounds/card-impact.mp3',
  'vira-flip': '/sounds/vira-flip.mp3',
  'vira-reveal': '/sounds/vira-reveal.mp3',
  'card-shuffle': '/sounds/card-shuffle.mp3',
  'coin-flip': '/sounds/coin-flip.mp3',
  'chip-drop': '/sounds/chip-drop.mp3',
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

type Synth = (ctx: AudioContext, dest: AudioNode, when?: number) => number;

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

function noiseBuffer(ctx: AudioContext, duration: number, highpass = 0): AudioNode {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  if (highpass > 0) {
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = highpass;
    src.connect(hp);
    return src;
  }
  return src;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING SYNTHS (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

const cardSlide: Synth = (ctx, dest, when = 0) => {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < data.length; i++)
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.35);

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(2600, ctx.currentTime + when);
  filter.frequency.exponentialRampToValueAtTime(760, ctx.currentTime + when + 0.2);
  filter.Q.value = 4.8;
  const env = envelope(ctx, dest, 0.004, 0.05, 0.15, 0.58, when);
  noise.connect(filter);
  filter.connect(env);
  noise.start(ctx.currentTime + when);
  noise.stop(ctx.currentTime + when + 0.22);
  return 0.22;
};

const cardImpact: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 76, 'sine', 0.001, 0.018, 0.13, 0.84, when);
  tone(ctx, dest, 152, 'triangle', 0.001, 0.012, 0.09, 0.48, when);
  tone(ctx, dest, 310, 'triangle', 0.001, 0.006, 0.04, 0.18, when + 0.004);

  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.038, ctx.sampleRate);
  const data = buf.getChannelData(0);

  for (let i = 0; i < data.length; i++)
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.7);

  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3200;
  const env = envelope(ctx, dest, 0.001, 0.006, 0.03, 0.24, when);
  noise.connect(hp);
  hp.connect(env);
  noise.start(ctx.currentTime + when);
  noise.stop(ctx.currentTime + when + 0.05);
  return 0.18;
};

const cardDeal: Synth = (ctx, dest, when = 0) => {
  cardSlide(ctx, dest, when);
  cardImpact(ctx, dest, when + 0.14);
  return 0.32;
};

const cardHover: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 1320, 'sine', 0.003, 0.005, 0.08, 0.18, when);
  tone(ctx, dest, 1980, 'sine', 0.003, 0.004, 0.05, 0.10, when);
  return 0.09;
};

const viraFlip: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 220, 'sawtooth', 0.005, 0.01, 0.18, 0.18, when);
  tone(ctx, dest, 660, 'sine', 0.01, 0.06, 0.32, 0.45, when + 0.08);
  tone(ctx, dest, 990, 'sine', 0.01, 0.04, 0.22, 0.30, when + 0.12);
  return 0.46;
};

function callTone(base: number, layers: number, peak: number): Synth {
  return (ctx, dest, when = 0) => {
    const dur = 0.35 + layers * 0.05;
    for (let i = 0; i < layers; i++) {
      const f = base * (1 + i * 0.5);
      tone(ctx, dest, f, i === 0 ? 'sawtooth' : 'square', 0.008, 0.06, dur - 0.06, peak * (1 - i * 0.18), when);
    }
    tone(ctx, dest, base * 0.5, 'sine', 0.01, 0.12, 0.5, peak * 0.5, when + 0.05);
    return dur + 0.5;
  };
}

const trucoCall = callTone(220, 2, 0.55);
const seisCall = callTone(165, 3, 0.62);
const noveCall = callTone(123, 3, 0.7);
const dozeCall = callTone(98, 4, 0.78);

const accept: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 523, 'sine', 0.01, 0.05, 0.18, 0.4, when);
  tone(ctx, dest, 784, 'sine', 0.01, 0.05, 0.22, 0.4, when + 0.09);
  tone(ctx, dest, 1046, 'triangle', 0.005, 0.04, 0.2, 0.25, when + 0.18);
  return 0.5;
};

const run: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 587, 'triangle', 0.01, 0.04, 0.16, 0.32, when);
  tone(ctx, dest, 392, 'triangle', 0.01, 0.05, 0.2, 0.28, when + 0.1);
  tone(ctx, dest, 261, 'sine', 0.015, 0.08, 0.3, 0.22, when + 0.22);
  return 0.6;
};

const roundWin: Synth = (ctx, dest, when = 0) => {
  cardImpact(ctx, dest, when);
  tone(ctx, dest, 659, 'sine', 0.006, 0.04, 0.14, 0.32, when + 0.03);
  tone(ctx, dest, 880, 'sine', 0.006, 0.04, 0.18, 0.36, when + 0.08);
  tone(ctx, dest, 1175, 'triangle', 0.006, 0.06, 0.24, 0.34, when + 0.15);
  tone(ctx, dest, 1568, 'sine', 0.004, 0.025, 0.18, 0.16, when + 0.2);
  return 0.48;
};

const roundLoss: Synth = (ctx, dest, when = 0) => {
  cardImpact(ctx, dest, when);
  tone(ctx, dest, 392, 'triangle', 0.01, 0.05, 0.18, 0.36, when + 0.02);
  tone(ctx, dest, 311, 'sine', 0.01, 0.08, 0.28, 0.3, when + 0.1);
  tone(ctx, dest, 196, 'sine', 0.012, 0.06, 0.22, 0.16, when + 0.16);
  return 0.48;
};

const roundTie: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 740, 'sine', 0.006, 0.04, 0.18, 0.28, when);
  tone(ctx, dest, 523, 'sine', 0.008, 0.05, 0.18, 0.24, when + 0.1);
  tone(ctx, dest, 740, 'sine', 0.006, 0.03, 0.16, 0.18, when + 0.22);
  return 0.42;
};

const handWin: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 523, 'triangle', 0.008, 0.05, 0.18, 0.4, when);
  tone(ctx, dest, 659, 'triangle', 0.008, 0.05, 0.2, 0.4, when + 0.1);
  tone(ctx, dest, 784, 'triangle', 0.008, 0.06, 0.22, 0.4, when + 0.2);
  tone(ctx, dest, 1046, 'sine', 0.008, 0.1, 0.4, 0.36, when + 0.32);
  return 0.86;
};

const handLoss: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 440, 'triangle', 0.01, 0.08, 0.2, 0.36, when);
  tone(ctx, dest, 349, 'triangle', 0.01, 0.08, 0.22, 0.32, when + 0.14);
  tone(ctx, dest, 277, 'sine', 0.015, 0.12, 0.42, 0.28, when + 0.3);
  return 0.86;
};

const gameWin: Synth = (ctx, dest, when = 0) => {
  handWin(ctx, dest, when);
  tone(ctx, dest, 1046, 'sine', 0.01, 0.1, 0.38, 0.32, when + 0.5);
  tone(ctx, dest, 1318, 'sine', 0.01, 0.1, 0.4, 0.32, when + 0.62);
  tone(ctx, dest, 1568, 'triangle', 0.01, 0.18, 0.55, 0.30, when + 0.78);
  return 1.5;
};

const gameLoss: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 196, 'sawtooth', 0.02, 0.2, 0.4, 0.42, when);
  tone(ctx, dest, 147, 'triangle', 0.02, 0.25, 0.5, 0.36, when + 0.2);
  tone(ctx, dest, 110, 'sine', 0.03, 0.4, 0.7, 0.32, when + 0.45);
  return 1.5;
};

// ─────────────────────────────────────────────────────────────────────────────
// NEW PREMIUM SYNTHS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Card shuffle fallback: five quick paper slaps with varied filters.
 * It keeps the new-hand reveal audible even when audio assets are unavailable.
 */
const cardShuffle: Synth = (ctx, dest, when = 0) => {
  const SLAPS = 5;
  const GAP = 0.065;
  for (let i = 0; i < SLAPS; i++) {
    const t = when + i * GAP;
    const dur = 0.055 + Math.random() * 0.02;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < data.length; j++)
      data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / data.length, 1.5);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200 + i * 180;
    bp.Q.value = 3 + i * 0.4;

    const env2 = envelope(ctx, dest, 0.003, dur * 0.3, dur * 0.7, 0.38 - i * 0.04, t);
    src.connect(bp);
    bp.connect(env2);
    src.start(ctx.currentTime + t);
    src.stop(ctx.currentTime + t + dur + 0.05);
  }
  // Trailing paper whisper
  tone(ctx, dest, 3200, 'sine', 0.006, 0.02, 0.12, 0.08, when + SLAPS * GAP);
  return SLAPS * GAP + 0.18;
};

/**
 * Vira reveal fallback: air whoosh, dry table hit, and a bright shimmer
 * so the manilha reveal stays more dramatic than a regular card flip.
 */
const viraReveal: Synth = (ctx, dest, when = 0) => {
  // Fast descending air whoosh.
  const whooshBuf = ctx.createBuffer(1, ctx.sampleRate * 0.22, ctx.sampleRate);
  const wData = whooshBuf.getChannelData(0);
  for (let i = 0; i < wData.length; i++)
    wData[i] = (Math.random() * 2 - 1) * (1 - i / wData.length);
  const whoosh = ctx.createBufferSource();
  whoosh.buffer = whooshBuf;
  const wFilter = ctx.createBiquadFilter();
  wFilter.type = 'bandpass';
  wFilter.frequency.setValueAtTime(3800, ctx.currentTime + when);
  wFilter.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + when + 0.22);
  wFilter.Q.value = 2;
  const wEnv = envelope(ctx, dest, 0.004, 0.06, 0.16, 0.5, when);
  whoosh.connect(wFilter);
  wFilter.connect(wEnv);
  whoosh.start(ctx.currentTime + when);
  whoosh.stop(ctx.currentTime + when + 0.28);

  // Dry table impact.
  tone(ctx, dest, 90, 'sine', 0.001, 0.018, 0.1, 0.65, when + 0.18);
  tone(ctx, dest, 200, 'triangle', 0.001, 0.008, 0.06, 0.35, when + 0.18);

  // Bright shimmer announcing the manilha.
  tone(ctx, dest, 1760, 'sine', 0.004, 0.08, 0.5, 0.36, when + 0.22);
  tone(ctx, dest, 2637, 'sine', 0.004, 0.06, 0.4, 0.26, when + 0.28);
  tone(ctx, dest, 3520, 'sine', 0.003, 0.04, 0.3, 0.16, when + 0.34);

  return 0.75;
};

/**
 * Short metallic accent for chips, ties, and confirmation beats.
 */
const coinFlip: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 2100, 'sine', 0.002, 0.015, 0.28, 0.32, when);
  tone(ctx, dest, 3150, 'sine', 0.002, 0.01, 0.22, 0.22, when + 0.025);
  tone(ctx, dest, 1400, 'sine', 0.003, 0.02, 0.18, 0.18, when + 0.04);
  return 0.32;
};

/**
 * Dry chip/table drop used as a low accent under card landings.
 */
const chipDrop: Synth = (ctx, dest, when = 0) => {
  tone(ctx, dest, 140, 'sine', 0.001, 0.012, 0.08, 0.72, when);
  tone(ctx, dest, 280, 'triangle', 0.001, 0.006, 0.04, 0.34, when);
  // Click
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 0.01), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 5000;
  const env2 = envelope(ctx, dest, 0.001, 0.002, 0.008, 0.24, when);
  src.connect(hp);
  hp.connect(env2);
  src.start(ctx.currentTime + when);
  src.stop(ctx.currentTime + when + 0.015);
  return 0.12;
};

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

const proceduralSounds: Record<SoundType, Synth> = {
  'card-deal': cardDeal,
  'card-slide': cardSlide,
  'card-hover': cardHover,
  'card-impact': cardImpact,
  'vira-flip': viraFlip,
  'vira-reveal': viraReveal,
  'card-shuffle': cardShuffle,
  'coin-flip': coinFlip,
  'chip-drop': chipDrop,
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

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE (shared singleton, unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

type GameSoundEngine = {
  ctx: AudioContext | null;
  master: GainNode | null;
  audioCache: Map<SoundType, HTMLAudioElement>;
  audioFailed: Set<SoundType>;
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
  if (engine.ctx && engine.master) return { ctx: engine.ctx, master: engine.master };
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
  const preloadedRef = useRef(false);

  useEffect(() => {
    if (preloadedRef.current) return;
    preloadedRef.current = true;
    (Object.keys(soundUrls) as SoundType[]).forEach((key) => {
      const url = soundUrls[key];
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.addEventListener('error', () => { engine.audioFailed.add(key); });
      engine.audioCache.set(key, audio);
    });
  }, []);

  useEffect(() => {
    const cb = ({ volume: v, muted: m }: { volume: number; muted: boolean }) => {
      setVolumeState(v);
      setMutedState(m);
    };
    engine.listeners.add(cb);
    return () => { engine.listeners.delete(cb); };
  }, []);

  const play = useCallback((type: PlayableSoundType, perCallVolume = 1) => {
    if (engine.muted) return;
    const normalizedType = normalizeSoundType(type);
    const audio = engine.audioCache.get(normalizedType);
    const fileLikelyExists = audio && !engine.audioFailed.has(normalizedType);

    if (fileLikelyExists && audio) {
      const cloned = audio.cloneNode() as HTMLAudioElement;
      cloned.volume = Math.min(1, engine.volume * perCallVolume);
      cloned.play().catch(() => {
        engine.audioFailed.add(normalizedType);
        playProcedural(normalizedType, perCallVolume);
      });
      return;
    }

    playProcedural(normalizedType, perCallVolume);
  }, []);

  const setMuted = useCallback((m: boolean) => {
    engine.muted = m;
    window.localStorage.setItem(STORAGE_MUTED_KEY, m ? '1' : '0');
    applyMasterGain();
    notify();
  }, []);

  const setVolume = useCallback((v: number) => {
    engine.volume = Math.max(0, Math.min(1, v));
    window.localStorage.setItem(STORAGE_VOLUME_KEY, String(engine.volume));
    applyMasterGain();
    notify();
  }, []);

  const toggleMute = useCallback(() => { setMuted(!engine.muted); }, [setMuted]);

  return { play, setMuted, setVolume, toggleMute, muted, volume };
}

function playProcedural(type: SoundType, perCallVolume: number) {
  const synth = proceduralSounds[type];
  if (!synth) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.ctx.state === 'suspended') {
    ctx.ctx.resume().catch(() => {});
  }
  const limiter = ctx.ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;
  limiter.connect(ctx.master);
  const scaler = ctx.ctx.createGain();
  scaler.gain.value = perCallVolume;
  scaler.connect(limiter);
  synth(ctx.ctx, scaler);
}
