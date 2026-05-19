import type { SoundType } from '../../hooks/useGameSound';

import type { MatchAction } from './matchActionTypes';

type SoundPlayer = (type: SoundType, volume?: number) => void;

type CardSoundOrigin = 'own' | 'opponent' | 'partner' | 'rival' | 'seat';
type SoundCooldownKey = string;

const lastSoundAtByKey = new Map<SoundCooldownKey, number>();

function resolveNow(): number {
  return Date.now();
}

function canPlaySound(key: SoundCooldownKey, cooldownMs: number): boolean {
  const now = resolveNow();
  const lastPlayedAt = lastSoundAtByKey.get(key) ?? 0;

  if (now - lastPlayedAt < cooldownMs) {
    return false;
  }

  lastSoundAtByKey.set(key, now);
  return true;
}

function playWithCooldown(
  play: SoundPlayer,
  type: SoundType,
  volume: number,
  cooldownKey: SoundCooldownKey,
  cooldownMs: number,
): void {
  if (!canPlaySound(cooldownKey, cooldownMs)) {
    return;
  }

  play(type, volume);
}

function scheduleSound(
  play: SoundPlayer,
  type: SoundType,
  volume: number,
  delayMs: number,
  cooldownKey: SoundCooldownKey,
  cooldownMs: number,
): void {
  if (typeof window === 'undefined') {
    playWithCooldown(play, type, volume, cooldownKey, cooldownMs);
    return;
  }

  window.setTimeout(() => {
    playWithCooldown(play, type, volume, cooldownKey, cooldownMs);
  }, delayMs);
}

function resolveBetCallSoundByValue(value: number | null | undefined): SoundType {
  if (value === null || value === undefined) {
    return 'truco-call';
  }

  if (value >= 12) {
    return 'doze-call';
  }

  if (value >= 9) {
    return 'nove-call';
  }

  if (value >= 6) {
    return 'seis-call';
  }

  return 'truco-call';
}

function resolveBetCallSoundByAction(action: MatchAction): SoundType | null {
  switch (action) {
    case 'request-truco':
      return 'truco-call';
    case 'raise-to-six':
      return 'seis-call';
    case 'raise-to-nine':
      return 'nove-call';
    case 'raise-to-twelve':
      return 'doze-call';
    default:
      return null;
  }
}

function resolveBetCallVolume(action: MatchAction): number {
  switch (action) {
    case 'raise-to-twelve':
      return 0.9;
    case 'raise-to-nine':
      return 0.84;
    case 'raise-to-six':
      return 0.78;
    case 'request-truco':
    default:
      return 0.7;
  }
}

function resolveCardLaunchVolume(origin: CardSoundOrigin): number {
  switch (origin) {
    case 'opponent':
    case 'rival':
      return 0.58;
    case 'partner':
    case 'seat':
      return 0.54;
    case 'own':
    default:
      return 0.56;
  }
}

function resolveCardLandingVolume(origin: CardSoundOrigin): number {
  switch (origin) {
    case 'opponent':
    case 'rival':
      return 0.62;
    case 'partner':
      return 0.54;
    case 'seat':
      return 0.52;
    case 'own':
    default:
      return 0.56;
  }
}

function resolveCardLandingChipVolume(origin: CardSoundOrigin): number {
  switch (origin) {
    case 'opponent':
    case 'rival':
      return 0.22;
    case 'partner':
      return 0.18;
    case 'seat':
      return 0.17;
    case 'own':
    default:
      return 0.2;
  }
}

export function isBetCallAction(action: MatchAction): boolean {
  return resolveBetCallSoundByAction(action) !== null;
}

export function playCardLaunchSound(play: SoundPlayer, origin: CardSoundOrigin = 'own'): void {
  playWithCooldown(
    play,
    'card-slide',
    resolveCardLaunchVolume(origin),
    `card-launch:${origin}`,
    72,
  );
}

export function playCardLandingSound(play: SoundPlayer, origin: CardSoundOrigin = 'own'): void {
  playWithCooldown(
    play,
    'card-impact',
    resolveCardLandingVolume(origin),
    `card-landing:${origin}`,
    86,
  );

  // NOTE: A short chip accent turns the soft card hit into a felt-table impact
  // while the cooldown keeps 2v2 multi-seat landings from stacking into noise.
  scheduleSound(
    play,
    'chip-drop',
    resolveCardLandingChipVolume(origin),
    32,
    `card-landing-chip:${origin}`,
    110,
  );
}

export type RoundVerdictSoundOutcome = 'win' | 'loss' | 'tie';

export function playRoundVerdictSound(
  play: SoundPlayer,
  outcome: RoundVerdictSoundOutcome,
): void {
  const cooldownKey = `round-verdict:${outcome}`;

  if (!canPlaySound(cooldownKey, 620)) {
    return;
  }

  if (outcome === 'win') {
    play('round-win', 0.78);

    scheduleSound(play, 'coin-flip', 0.2, 44, 'round-verdict-win-coin', 620);
    scheduleSound(play, 'chip-drop', 0.18, 96, 'round-verdict-win-chip', 620);

    return;
  }

  if (outcome === 'loss') {
    play('round-loss', 0.66);
    scheduleSound(play, 'card-impact', 0.16, 52, 'round-verdict-loss-hit', 620);
    return;
  }

  play('round-tie', 0.62);

  scheduleSound(play, 'coin-flip', 0.2, 48, 'round-verdict-tie-coin', 620);
  scheduleSound(play, 'card-impact', 0.12, 88, 'round-verdict-tie-hit', 620);
}

export function playMaoDeOnzeOpeningSound(play: SoundPlayer): void {
  play('truco-call', 0.35);
}

export function playBetRequestedFeedbackSound(
  play: SoundPlayer,
  pendingValue: number | null | undefined,
): void {
  play(resolveBetCallSoundByValue(pendingValue), 0.55);
}

export function playBetAcceptedFeedbackSound(play: SoundPlayer): void {
  play('accept', 0.5);
}

export function playBetDeclinedFeedbackSound(play: SoundPlayer): void {
  play('run', 0.55);
}

export function playMatchActionSound(play: SoundPlayer, action: MatchAction): void {
  const betCallSound = resolveBetCallSoundByAction(action);

  if (betCallSound) {
    play(betCallSound, resolveBetCallVolume(action));
    return;
  }

  switch (action) {
    case 'accept-bet':
    case 'accept-mao-de-onze':
      play('accept', 0.62);
      return;
    case 'decline-bet':
    case 'decline-mao-de-onze':
      play('run', 0.65);
      return;
    default:
      return;
  }
}
