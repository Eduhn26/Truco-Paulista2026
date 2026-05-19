import { useMemo } from 'react';

export type CardFlightPoint = {
  left: number;
  top: number;
};

export type CardFlightProfile = 'own' | 'opponent';

type MotionStringTuple = [string, string, string, string, string];
type MotionNumberTuple = [number, number, number, number, number];

export type CardFlightPhysics = {
  durationMs: number;
  handoffNotifyMs: number;
  handoffRemoveMs: number;
  outcomeBadgeDelayMs: number;
  motion: {
    y: MotionStringTuple;
    opacity: MotionNumberTuple;
    scale: MotionNumberTuple;
    rotateY: MotionNumberTuple;
    rotate: MotionNumberTuple;
  };
  times: {
    y: MotionNumberTuple;
    scale: MotionNumberTuple;
    rotate: MotionNumberTuple;
    rotateY: MotionNumberTuple;
  };
};

type UseCardFlightPhysicsParams = {
  sourceTarget: CardFlightPoint | null;
  landingTarget: CardFlightPoint | null;
  profile: CardFlightProfile;
};

export const CARD_FLIGHT_BASE_DURATION_MS = 510;

const MIN_FLIGHT_DURATION_MS = 500;
const MAX_FLIGHT_DURATION_MS = 640;
const MIN_DISTANCE_FOR_EXTRA_WEIGHT = 180;
const MAX_DISTANCE_FOR_EXTRA_WEIGHT = 860;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getDistance(
  sourceTarget: CardFlightPoint | null,
  landingTarget: CardFlightPoint | null,
): number {
  if (!sourceTarget || !landingTarget) {
    return MIN_DISTANCE_FOR_EXTRA_WEIGHT;
  }

  const dx = landingTarget.left - sourceTarget.left;
  const dy = landingTarget.top - sourceTarget.top;
  return Math.hypot(dx, dy);
}

function getHorizontalDirection(
  sourceTarget: CardFlightPoint | null,
  landingTarget: CardFlightPoint | null,
): -1 | 1 {
  if (!sourceTarget || !landingTarget) {
    return 1;
  }

  return landingTarget.left >= sourceTarget.left ? 1 : -1;
}

export function useCardFlightPhysics({
  sourceTarget,
  landingTarget,
  profile,
}: UseCardFlightPhysicsParams): CardFlightPhysics {
  return useMemo(() => {
    const distance = getDistance(sourceTarget, landingTarget);
    const distanceWeight = clamp(
      (distance - MIN_DISTANCE_FOR_EXTRA_WEIGHT) /
        (MAX_DISTANCE_FOR_EXTRA_WEIGHT - MIN_DISTANCE_FOR_EXTRA_WEIGHT),
      0,
      1,
    );
    const direction = getHorizontalDirection(sourceTarget, landingTarget);
    const durationMs = Math.round(
      clamp(
        CARD_FLIGHT_BASE_DURATION_MS + distanceWeight * 100 + (profile === 'opponent' ? 18 : 0),
        MIN_FLIGHT_DURATION_MS,
        MAX_FLIGHT_DURATION_MS,
      ),
    );

    const liftPercent = Math.round((profile === 'opponent' ? 66 : 68) + distanceWeight * 10);
    const landingSnapScale = profile === 'opponent' ? 0.982 : 0.986;

    return {
      durationMs,
      handoffNotifyMs: Math.max(360, durationMs - 96),
      handoffRemoveMs: durationMs + 130,
      outcomeBadgeDelayMs: durationMs + 92,
      motion: {
        y: ['-50%', `-${liftPercent}%`, '-49%', '-45%', '-50%'],
        opacity: [1, 1, 1, 1, 0.98],
        scale:
          profile === 'opponent'
            ? [0.86, 1.065, 1.025, 0.965, landingSnapScale]
            : [0.94, 1.095, 1.03, 0.968, landingSnapScale],
        rotateY:
          profile === 'opponent'
            ? [180, 144, 58, 12, 0]
            : [-36, 34, 8, -4, 0],
        rotate:
          profile === 'opponent'
            ? [-8, -12 * direction, -6 * direction, -8 * direction, -5 * direction]
            : [2, 9 * direction, -5 * direction, 4 * direction, 2 * direction],
      },
      times: {
        y: [0, 0.42, 0.76, 0.9, 1],
        scale: [0, 0.44, 0.76, 0.9, 1],
        rotate: [0, 0.42, 0.74, 0.9, 1],
        rotateY:
          profile === 'opponent'
            ? [0, 0.22, 0.56, 0.82, 1]
            : [0, 0.36, 0.68, 0.88, 1],
      },
    };
  }, [landingTarget, profile, sourceTarget]);
}
