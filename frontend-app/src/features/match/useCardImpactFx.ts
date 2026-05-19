import { useCallback, useEffect, useRef, useState } from 'react';

import type { CardFlightPoint } from './useCardFlightPhysics';

export type CardImpactVariant = 'own' | 'opponent' | 'seat';

export type CardImpactState = {
  key: string;
  point: CardFlightPoint;
  variant: CardImpactVariant;
};

type TriggerCardImpactParams = {
  key: number | string;
  point: CardFlightPoint | null;
  variant: CardImpactVariant;
};

const CARD_IMPACT_VISUAL_LIFETIME_MS = 420;

export function useCardImpactFx() {
  const [activeImpact, setActiveImpact] = useState<CardImpactState | null>(null);
  const clearTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearCardImpactTimeout = useCallback(() => {
    if (clearTimeoutRef.current === null) {
      return;
    }

    window.clearTimeout(clearTimeoutRef.current);
    clearTimeoutRef.current = null;
  }, []);

  const triggerCardImpact = useCallback(
    ({ key, point, variant }: TriggerCardImpactParams) => {
      if (!point) {
        return;
      }

      clearCardImpactTimeout();

      const impactKey = `${variant}:${String(key)}`;
      setActiveImpact({ key: impactKey, point, variant });

      clearTimeoutRef.current = window.setTimeout(() => {
        clearTimeoutRef.current = null;
        setActiveImpact((current) => (current?.key === impactKey ? null : current));
      }, CARD_IMPACT_VISUAL_LIFETIME_MS);
    },
    [clearCardImpactTimeout],
  );

  useEffect(() => clearCardImpactTimeout, [clearCardImpactTimeout]);

  return { activeImpact, triggerCardImpact };
}
