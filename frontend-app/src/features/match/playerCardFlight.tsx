// =============================================================================
//  playerCardFlight.tsx — flight animation for the player's own played card.
// =============================================================================
//
//  The previous implementation landed at hardcoded percentages (left: 57.2%,
//  top: 50.2%). Those percentages were chosen for a specific viewport layout
//  and drift on other viewports, causing the flight to visually land on top
//  of the OPPONENT slot (which is immediately to its left inside the same
//  flex row). That visually reads as "two copies of the player's card on the
//  table" — the exact symptom the user reported.
//
//  Fix: the caller now passes `landTargetRef` — a ref pointing at the actual
//  DOM node of the player's PlayedSlot. We measure its position relative to
//  our own offset parent on every flight, so the flight always lands where
//  the slot actually is, regardless of viewport or zoom.
// =============================================================================
//
//  Current adjustment: the player's card now keeps its local flight as the
//  single visible source until `onFlightDone` and gets a stronger rotateY arc,
//  closer to the opponent card's emotional flip without exposing a card back.
// =============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import { CardLandingImpact } from './cardLandingImpact';
import { useCardFlightPhysics, CARD_FLIGHT_BASE_DURATION_MS } from './useCardFlightPhysics';
import { useCardImpactFx } from './useCardImpactFx';

type FlightCard = {
  rank: string;
  suit: string;
};

type FlightPoint = {
  left: number;
  top: number;
};

type PlayerCardFlightProps = {
  revealKey: number;
  card: FlightCard | null;
  onFlightDone?: (revealKey: number) => void;
  suppressed?: boolean;
  outcomeBadge?: FlightOutcomeBadge;
  outcomeBadgeLabel?: string | null;
  /**
   * Ref to the visual origin of the flight. For the opponent this is the TP
   * back cluster; for the player this is the hand dock area. If absent, the
   * legacy percentage origin is used.
   */
  sourceTargetRef?: RefObject<HTMLElement | null>;
  /**
   * Exact DOM element of the clicked card. This wins over sourceTargetRef so
   * the flight feels like it leaves the actual card, not the generic dock.
   */
  sourceTargetElement?: HTMLElement | null | undefined;
  /**
   * Ref to the DOM node of the PlayerPlayedSlot. If provided, the flight
   * lands at its measured center. If absent (fallback), we land at the
   * legacy hardcoded percentage so nothing breaks if a caller forgets.
   */
  landTargetRef?: RefObject<HTMLElement | null>;
};

// NOTE: The measured flight now adapts its timing to the real distance between
// the origin and the landing slot. The exported duration remains as a conservative
// fallback for callers that only need an approximate lock window.
const FLIGHT_DURATION_MS = CARD_FLIGHT_BASE_DURATION_MS;

function parseSuitSymbol(suit: string): string {
  switch (suit) {
    case 'P':
      return '♣';
    case 'C':
      return '♥';
    case 'E':
      return '♠';
    case 'O':
      return '♦';
    default:
      return '♦';
  }
}

function isRedSuit(suit: string): boolean {
  return suit === 'C' || suit === 'O';
}

type FlightOutcomeBadge = 'win' | 'loss' | 'tie' | null;

type OutcomeBadgeVisuals = {
  wrapper: string;
  border: string;
  shadow: string;
  text: string;
  slash: string;
};

function resolveOutcomeBadgeLabel(
  outcomeBadge: FlightOutcomeBadge,
  outcomeBadgeLabel: string | null | undefined,
): string {
  if (outcomeBadgeLabel) {
    return outcomeBadgeLabel;
  }

  if (outcomeBadge === 'win') {
    return 'WIN';
  }

  if (outcomeBadge === 'loss') {
    return 'PERDEU';
  }

  return 'EMPATE';
}

function resolveOutcomeBadgeVisuals(outcomeBadge: FlightOutcomeBadge): OutcomeBadgeVisuals | null {
  switch (outcomeBadge) {
    case 'win':
      return {
        wrapper:
          'linear-gradient(135deg, #fff1b8 0%, #f2d488 38%, #c9a84c 74%, #6f4f14 100%)',
        border: '1px solid rgba(255,241,184,0.96)',
        shadow:
          '0 9px 18px rgba(0,0,0,0.44), 0 0 22px rgba(242,212,136,0.68), inset 0 1px 0 rgba(255,255,255,0.52)',
        text: '#160f03',
        slash: 'rgba(255,255,255,0.46)',
      };
    case 'loss':
      return {
        wrapper:
          'linear-gradient(135deg, #fecaca 0%, #ef4444 38%, #991b1b 76%, #450a0a 100%)',
        border: '1px solid rgba(254,202,202,0.80)',
        shadow:
          '0 8px 16px rgba(0,0,0,0.34), 0 0 16px rgba(220,38,38,0.32), inset 0 1px 0 rgba(255,255,255,0.30)',
        text: '#fff7f7',
        slash: 'rgba(255,255,255,0.30)',
      };
    case 'tie':
      return {
        wrapper:
          'linear-gradient(135deg, #f8fafc 0%, #cbd5e1 42%, #64748b 78%, #334155 100%)',
        border: '1px solid rgba(226,232,240,0.84)',
        shadow:
          '0 8px 16px rgba(0,0,0,0.36), 0 0 16px rgba(148,163,184,0.36), inset 0 1px 0 rgba(255,255,255,0.52)',
        text: '#0f172a',
        slash: 'rgba(255,255,255,0.48)',
      };
    default:
      return null;
  }
}

function FlightOutcomeBadge({
  outcomeBadge,
  outcomeBadgeLabel,
  revealDelayMs,
}: {
  outcomeBadge: FlightOutcomeBadge;
  outcomeBadgeLabel?: string | null;
  revealDelayMs: number;
}) {
  const visuals = resolveOutcomeBadgeVisuals(outcomeBadge);

  if (!outcomeBadge || !visuals) {
    return null;
  }

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute -right-4 -top-4 z-30 rounded-full px-3.5 py-1.5"
      initial={{
        opacity: 0,
        scale: 0.74,
        y: 8,
        rotate: outcomeBadge === 'loss' ? -8 : 8,
      }}
      animate={{
        opacity: 1,
        scale: [0.86, 1.12, 1],
        y: 0,
        rotate: outcomeBadge === 'loss' ? -5 : 5,
      }}
      transition={{
        duration: 0.34,
        delay: revealDelayMs / 1000,
        times: [0, 0.58, 1],
        ease: [0.2, 0.9, 0.24, 1],
      }}
      style={{
        background: visuals.wrapper,
        border: visuals.border,
        boxShadow: visuals.shadow,
      }}
    >
      <span
        className="relative z-10 text-[10px] font-black uppercase leading-none tracking-[0.20em]"
        style={{
          color: visuals.text,
          fontFamily: 'Georgia, serif',
          textShadow:
            outcomeBadge === 'loss'
              ? '0 1px 0 rgba(0,0,0,0.24)'
              : '0 1px 0 rgba(255,255,255,0.30)',
        }}
      >
        {resolveOutcomeBadgeLabel(outcomeBadge, outcomeBadgeLabel)}
      </span>
      <span
        className="pointer-events-none absolute left-1/2 top-0 h-full w-[1px] -rotate-[24deg]"
        style={{ background: visuals.slash }}
      />
    </motion.div>
  );
}

export function PlayerCardFlight({
  revealKey,
  card,
  onFlightDone,
  suppressed = false,
  outcomeBadge = null,
  outcomeBadgeLabel = null,
  sourceTargetRef,
  sourceTargetElement = null,
  landTargetRef,
}: PlayerCardFlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFlight, setActiveFlight] = useState<{ key: number; card: FlightCard } | null>(null);
  const [landingTarget, setLandingTarget] = useState<FlightPoint | null>(null);
  const [sourceTarget, setSourceTarget] = useState<FlightPoint | null>(null);
  const lastTriggeredKeyRef = useRef<number>(-1);
  const flightNotifyTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const flightRemoveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const notifiedFlightKeyRef = useRef<number | null>(null);
  const scheduledFlightKeyRef = useRef<number | null>(null);
  const landingTargetForImpactRef = useRef<FlightPoint | null>(null);
  const onFlightDoneRef = useRef(onFlightDone);
  const { activeImpact, triggerCardImpact } = useCardImpactFx();

  useEffect(() => {
    onFlightDoneRef.current = onFlightDone;
  }, [onFlightDone]);

  const clearFlightTimeouts = useCallback(() => {
    if (flightNotifyTimeoutRef.current) {
      window.clearTimeout(flightNotifyTimeoutRef.current);
      flightNotifyTimeoutRef.current = null;
    }

    if (flightRemoveTimeoutRef.current) {
      window.clearTimeout(flightRemoveTimeoutRef.current);
      flightRemoveTimeoutRef.current = null;
    }
  }, []);

  const notifyFlightDone = useCallback((flightKey: number) => {
    if (notifiedFlightKeyRef.current === flightKey) {
      return;
    }

    notifiedFlightKeyRef.current = flightKey;
    onFlightDoneRef.current?.(flightKey);
  }, []);

  const finishFlight = useCallback((flightKey: number) => {
    setActiveFlight((current) => (current?.key === flightKey ? null : current));
    setLandingTarget(null);
    setSourceTarget(null);
    landingTargetForImpactRef.current = null;
    scheduledFlightKeyRef.current = null;
    flightNotifyTimeoutRef.current = null;
    flightRemoveTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearFlightTimeouts();
  }, [clearFlightTimeouts]);

  // Measure the landing target whenever a new flight starts, AFTER DOM layout.
  // useLayoutEffect is correct here because we need the measurement before
  // Framer Motion reads the animate target on the first frame.
  useLayoutEffect(() => {
    if (!activeFlight) {
      return;
    }

    const containerEl = containerRef.current;
    const slotEl = landTargetRef?.current;

    if (!containerEl || !slotEl) {
      landingTargetForImpactRef.current = null;
      setLandingTarget(null);
      return;
    }

    const containerRect = containerEl.getBoundingClientRect();
    const slotRect = slotEl.getBoundingClientRect();
    const sourceEl = sourceTargetElement ?? sourceTargetRef?.current ?? null;

    const nextLandingTarget = {
      left: slotRect.left - containerRect.left + slotRect.width / 2,
      top: slotRect.top - containerRect.top + slotRect.height / 2,
    };

    landingTargetForImpactRef.current = nextLandingTarget;
    setLandingTarget(nextLandingTarget);

    if (!sourceEl) {
      setSourceTarget(null);
      return;
    }

    const sourceRect = sourceEl.getBoundingClientRect();

    setSourceTarget({
      left: sourceRect.left - containerRect.left + sourceRect.width / 2,
      top: sourceRect.top - containerRect.top + sourceRect.height / 2,
    });
  }, [activeFlight, landTargetRef, sourceTargetElement, sourceTargetRef]);

  useEffect(() => {
    if (revealKey === 0) {
      if (activeFlight) {
        return;
      }

      setLandingTarget(null);
      setSourceTarget(null);
      return;
    }

    if (activeFlight) {
      return;
    }

    if (card) {
      return;
    }

    setLandingTarget(null);
    setSourceTarget(null);
  }, [activeFlight, card, revealKey]);

  useEffect(() => {
    if (suppressed || !card || revealKey === 0) {
      return;
    }

    if (lastTriggeredKeyRef.current === revealKey) {
      return;
    }

    // NOTE: The card prop can become null/suppressed as soon as the server
    // acknowledges the play or commits the round result. That must not cancel
    // the local landing timeout; otherwise the flight clone can persist over
    // the resolved/next-round felt. The clone owns a fixed lifetime once it
    // starts, and only revealKey=0/new flight/unmount can cancel it.
    lastTriggeredKeyRef.current = revealKey;
    notifiedFlightKeyRef.current = null;
    scheduledFlightKeyRef.current = null;
    clearFlightTimeouts();
    setActiveFlight({ key: revealKey, card });
  }, [card, clearFlightTimeouts, revealKey, suppressed]);

  const flightCard = activeFlight?.card ?? null;
  const symbol = flightCard ? parseSuitSymbol(flightCard.suit) : '';
  const textColor = flightCard && isRedSuit(flightCard.suit) ? '#c0392b' : '#1a1a2e';
  const flightPhysics = useCardFlightPhysics({
    sourceTarget,
    landingTarget,
    profile: 'own',
  });
  const flightDurationSeconds = flightPhysics.durationMs / 1000;

  useEffect(() => {
    if (!activeFlight) {
      return;
    }

    if (scheduledFlightKeyRef.current === activeFlight.key) {
      return;
    }

    if (landTargetRef?.current && !landingTarget) {
      return;
    }

    scheduledFlightKeyRef.current = activeFlight.key;
    const flightKey = activeFlight.key;

    // NOTE: The real slot needs to become visible before the clone is removed.
    // This overlap prevents the one-frame blank/flicker seen when the resolver
    // lands while the card is still handing off from the flight layer.
    flightNotifyTimeoutRef.current = window.setTimeout(() => {
      triggerCardImpact({
        key: flightKey,
        point: landingTargetForImpactRef.current ?? landingTarget,
        variant: 'own',
      });
      notifyFlightDone(flightKey);
    }, flightPhysics.handoffNotifyMs);

    flightRemoveTimeoutRef.current = window.setTimeout(() => {
      notifyFlightDone(flightKey);
      finishFlight(flightKey);
    }, flightPhysics.handoffRemoveMs);
  }, [
    activeFlight,
    finishFlight,
    flightPhysics.handoffNotifyMs,
    flightPhysics.handoffRemoveMs,
    landingTarget,
    landTargetRef,
    notifyFlightDone,
    triggerCardImpact,
  ]);

  // Compute the animate target. If we have a measured landing target, use
  // pixel coordinates (most accurate). Otherwise fall back to the legacy
  // percentage (keeps compatibility if a caller doesn't pass landTargetRef).
  const animateTarget = landingTarget
    ? {
        left: landingTarget.left,
        top: landingTarget.top,
        x: '-50%' as const,
        y: flightPhysics.motion.y,
        opacity: flightPhysics.motion.opacity,
        scale: flightPhysics.motion.scale,
        rotateY: flightPhysics.motion.rotateY,
        rotate: flightPhysics.motion.rotate,
      }
    : {
        left: '57.2%' as const,
        top: '50.2%' as const,
        x: '-50%' as const,
        y: flightPhysics.motion.y,
        opacity: flightPhysics.motion.opacity,
        scale: flightPhysics.motion.scale,
        rotateY: flightPhysics.motion.rotateY,
        rotate: flightPhysics.motion.rotate,
      };

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-[90]"
      aria-hidden
      style={{ perspective: '1400px' }}
    >
      <CardLandingImpact impact={activeImpact} />
      <AnimatePresence>
        {activeFlight && flightCard ? (
          <motion.div
            key={activeFlight.key}
            className="absolute"
            initial={{
              left: sourceTarget ? sourceTarget.left : '50%',
              top: sourceTarget ? sourceTarget.top : '84%',
              x: '-50%',
              y: '-50%',
              opacity: 1,
              scale: 0.96,
              rotateY: -42,
              rotate: 2,
            }}
            animate={animateTarget}
            exit={{ opacity: 0, scale: 1.005, transition: { duration: 0.12 } }}
            transition={{
              duration: flightDurationSeconds,
              ease: [0.2, 0.8, 0.2, 1],
              y: {
                duration: flightDurationSeconds,
                times: flightPhysics.times.y,
                ease: 'easeOut',
              },
              scale: {
                duration: flightDurationSeconds,
                times: flightPhysics.times.scale,
                ease: 'easeOut',
              },
              rotate: {
                duration: flightDurationSeconds,
                times: flightPhysics.times.rotate,
                ease: 'easeOut',
              },
              rotateY: {
                duration: flightDurationSeconds,
                times: flightPhysics.times.rotateY,
                ease: 'easeInOut',
              },
            }}
            style={{
              transformStyle: 'preserve-3d',
              filter:
                'drop-shadow(0 20px 30px rgba(0,0,0,0.54)) drop-shadow(0 0 14px rgba(201,168,76,0.14))',
            }}
          >
            <div
              className="relative flex flex-col justify-between"
              style={{
                width: 116,
                height: 162,
                borderRadius: 18,
                background: 'linear-gradient(145deg, #fffefb 0%, #faf6ee 52%, #f2ead6 100%)',
                border: '1px solid rgba(0,0,0,0.12)',
                boxShadow:
                  '0 18px 34px rgba(0,0,0,0.46), 0 0 22px rgba(201,168,76,0.14), inset 0 1px 0 rgba(255,255,255,0.94)',
                padding: '8px 10px',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(150deg, rgba(255,255,255,0.90) 0%, rgba(255,255,255,0.3) 20%, rgba(255,255,255,0) 38%)',
                  borderRadius: 'inherit',
                  pointerEvents: 'none',
                }}
              />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    lineHeight: 1,
                    color: textColor,
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {flightCard.rank}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                    color: textColor,
                    marginTop: 2,
                  }}
                >
                  {symbol}
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 1,
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    fontSize: '3.8rem',
                    color: textColor,
                    opacity: 0.92,
                  }}
                >
                  {symbol}
                </span>
              </div>
              <FlightOutcomeBadge
                outcomeBadge={outcomeBadge}
                outcomeBadgeLabel={outcomeBadgeLabel}
                revealDelayMs={flightPhysics.outcomeBadgeDelayMs}
              />

              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  alignSelf: 'flex-end',
                  transform: 'rotate(180deg)',
                }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 900,
                    lineHeight: 1,
                    color: textColor,
                    fontFamily: 'Georgia, serif',
                  }}
                >
                  {flightCard.rank}
                </div>
                <div
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                    color: textColor,
                    marginTop: 2,
                  }}
                >
                  {symbol}
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const PLAYER_CARD_FLIGHT_DURATION_MS = FLIGHT_DURATION_MS;

