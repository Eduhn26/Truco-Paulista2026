import { useEffect, useRef, useState } from 'react';

import {
  CARD_SETTLE_BEFORE_RESOLUTION_MS,
  RESOLUTION_HOLD_MS,
} from './timing';

export type RoundResolutionPhase =
  | 'idle'
  | 'landing'
  | 'settle'
  | 'reveal'
  | 'hold'
  | 'exit';

type Params = {
  isResolvingRound: boolean;
  roundResolvedKey: number;
};

// Splits the existing resolution hold into visual beats without extending the
// backend-authoritative transition window.
const SETTLE_BEFORE_REVEAL_MS = Math.max(160, Math.round(CARD_SETTLE_BEFORE_RESOLUTION_MS / 2));
const REVEAL_DURATION_MS = 520;
const EXIT_DURATION_MS = 320;

const REVEAL_START_MS = SETTLE_BEFORE_REVEAL_MS;
const HOLD_START_MS = REVEAL_START_MS + REVEAL_DURATION_MS;
const EXIT_START_MS = Math.max(HOLD_START_MS + 240, RESOLUTION_HOLD_MS - EXIT_DURATION_MS);
const IDLE_START_MS = Math.max(EXIT_START_MS + EXIT_DURATION_MS, RESOLUTION_HOLD_MS);

export function useRoundResolutionPhase({
  isResolvingRound,
  roundResolvedKey,
}: Params): RoundResolutionPhase {
  const [phase, setPhase] = useState<RoundResolutionPhase>('idle');
  const lastResolvedKeyRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isResolvingRound) {
      setPhase('idle');
      lastResolvedKeyRef.current = null;
      return undefined;
    }

    // A repeated key means the current visual cadence is already running.
    if (lastResolvedKeyRef.current === roundResolvedKey) {
      return undefined;
    }

    lastResolvedKeyRef.current = roundResolvedKey;
    setPhase('settle');

    const timeouts: number[] = [];

    timeouts.push(window.setTimeout(() => setPhase('reveal'), REVEAL_START_MS));
    timeouts.push(window.setTimeout(() => setPhase('hold'), HOLD_START_MS));
    timeouts.push(window.setTimeout(() => setPhase('exit'), EXIT_START_MS));
    timeouts.push(window.setTimeout(() => setPhase('idle'), IDLE_START_MS));

    return () => {
      for (const id of timeouts) {
        window.clearTimeout(id);
      }
    };
  }, [isResolvingRound, roundResolvedKey]);

  return phase;
}

export function isRevealPhase(phase: RoundResolutionPhase): boolean {
  return phase === 'reveal';
}

export function isHoldPhase(phase: RoundResolutionPhase): boolean {
  return phase === 'hold';
}

// Outcome badges stay visible once the resolved cards have settled.
export function isPostSettlePhase(phase: RoundResolutionPhase): boolean {
  return phase === 'reveal' || phase === 'hold' || phase === 'exit';
}

export function isResolutionVisuallyActive(phase: RoundResolutionPhase): boolean {
  return phase !== 'idle';
}
