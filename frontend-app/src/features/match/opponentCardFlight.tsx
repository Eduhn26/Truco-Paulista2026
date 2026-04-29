// =============================================================================
//  opponentCardFlight.tsx — flight animation for the opponent's played card.
// =============================================================================
//
//  Same fix as playerCardFlight: the landing target is now a ref pointing at
//  the actual DOM node of the opponent's PlayedSlot, measured per flight.
//  The previous hardcoded "left: 42.8%, top: 50.2%" was the likely culprit
//  for the "card landing wrong on the opposite slot" visual issue.
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

type FlightCard = {
  rank: string;
  suit: string;
};

type FlightPoint = {
  left: number;
  top: number;
};

type OpponentCardFlightProps = {
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
   * Ref to the DOM node of the OpponentPlayedSlot. If provided, the flight
   * lands at its measured center. Legacy fallback preserved for safety.
   */
  landTargetRef?: RefObject<HTMLElement | null>;
};

const FLIGHT_DURATION_MS = 480;
const HANDOFF_NOTIFY_MS = FLIGHT_DURATION_MS - 80;
const HANDOFF_REMOVE_MS = FLIGHT_DURATION_MS + 110;
// NOTE: Keep the result ribbon behind the landing beat. The card should fly,
// settle, then receive the WIN/PERDEU/EMPATE stamp. If the round result arrives
// early in the same socket burst, this delay prevents the badge from appearing
// while the card is still mid-air.
const FLIGHT_OUTCOME_BADGE_DELAY_MS = FLIGHT_DURATION_MS + 70;

function parseSuitSymbol(suit: string): string {
  switch (suit) {
    case 'C':
      return '♣';
    case 'O':
      return '♦';
    case 'P':
      return '♥';
    case 'E':
      return '♠';
    default:
      return '♦';
  }
}

function isRedSuit(suit: string): boolean {
  return suit === 'P' || suit === 'O';
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

export function OpponentCardFlight({
  revealKey,
  card,
  onFlightDone,
  suppressed = false,
  outcomeBadge = null,
  outcomeBadgeLabel = null,
  sourceTargetRef,
  landTargetRef,
}: OpponentCardFlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFlight, setActiveFlight] = useState<{ key: number; card: FlightCard } | null>(null);
  const [landingTarget, setLandingTarget] = useState<FlightPoint | null>(null);
  const [sourceTarget, setSourceTarget] = useState<FlightPoint | null>(null);
  const lastTriggeredKeyRef = useRef<number>(-1);
  const flightNotifyTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const flightRemoveTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const notifiedFlightKeyRef = useRef<number | null>(null);
  const onFlightDoneRef = useRef(onFlightDone);

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
    flightNotifyTimeoutRef.current = null;
    flightRemoveTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    return () => clearFlightTimeouts();
  }, [clearFlightTimeouts]);

  useLayoutEffect(() => {
    if (!activeFlight) {
      return;
    }

    const containerEl = containerRef.current;
    const slotEl = landTargetRef?.current;

    if (!containerEl || !slotEl) {
      setLandingTarget(null);
      return;
    }

    const containerRect = containerEl.getBoundingClientRect();
    const slotRect = slotEl.getBoundingClientRect();
    const sourceEl = sourceTargetRef?.current ?? null;

    setLandingTarget({
      left: slotRect.left - containerRect.left + slotRect.width / 2,
      top: slotRect.top - containerRect.top + slotRect.height / 2,
    });

    if (!sourceEl) {
      setSourceTarget(null);
      return;
    }

    const sourceRect = sourceEl.getBoundingClientRect();

    setSourceTarget({
      left: sourceRect.left - containerRect.left + sourceRect.width / 2,
      top: sourceRect.top - containerRect.top + sourceRect.height / 2,
    });
  }, [activeFlight, landTargetRef, sourceTargetRef]);

  useEffect(() => {
    if (!suppressed && card && revealKey !== 0) {
      return;
    }

    if (activeFlight) {
      return;
    }

    setLandingTarget(null);
    setSourceTarget(null);
  }, [activeFlight, card, revealKey, suppressed]);

  useEffect(() => {
    if (suppressed || !card || revealKey === 0) {
      return;
    }

    if (lastTriggeredKeyRef.current === revealKey) {
      return;
    }

    lastTriggeredKeyRef.current = revealKey;
    notifiedFlightKeyRef.current = null;
    clearFlightTimeouts();
    setActiveFlight({ key: revealKey, card });

    // NOTE: The slot is released shortly before the clone is removed. The
    // controlled overlap prevents a blank frame during the handoff from the
    // flight layer to the settled table card.
    flightNotifyTimeoutRef.current = window.setTimeout(() => {
      notifyFlightDone(revealKey);
    }, HANDOFF_NOTIFY_MS);

    flightRemoveTimeoutRef.current = window.setTimeout(() => {
      notifyFlightDone(revealKey);
      finishFlight(revealKey);
    }, HANDOFF_REMOVE_MS);
  }, [card, clearFlightTimeouts, finishFlight, notifyFlightDone, revealKey, suppressed]);

  const flightCard = activeFlight?.card ?? null;
  const symbol = flightCard ? parseSuitSymbol(flightCard.suit) : '';
  const textColor = flightCard && isRedSuit(flightCard.suit) ? '#c0392b' : '#1a1a2e';

  const animateTarget = landingTarget
    ? {
        left: landingTarget.left,
        top: landingTarget.top,
        x: '-50%' as const,
        y: ['-50%', '-66%', '-47%', '-50%'] as [string, string, string, string],
        opacity: [1, 1, 1, 0.98] as [number, number, number, number],
        scale: [0.86, 1.055, 1.015, 0.99] as [number, number, number, number],
        rotateY: [180, 142, 54, 10, 0] as [number, number, number, number, number],
        rotate: [-8, -12, -4, -5] as [number, number, number, number],
      }
    : {
        left: '42.8%' as const,
        top: '50.2%' as const,
        x: '-50%' as const,
        y: ['-50%', '-66%', '-47%', '-50%'] as [string, string, string, string],
        opacity: [1, 1, 1, 0.98] as [number, number, number, number],
        scale: [0.86, 1.055, 1.015, 0.99] as [number, number, number, number],
        rotateY: [180, 142, 54, 10, 0] as [number, number, number, number, number],
        rotate: [-8, -12, -4, -5] as [number, number, number, number],
      };

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-[90]"
      aria-hidden
      style={{ perspective: '1400px' }}
    >
      <AnimatePresence>
        {activeFlight && flightCard ? (
          <motion.div
            key={activeFlight.key}
            className="absolute"
            initial={{
              left: sourceTarget ? sourceTarget.left : '50%',
              top: sourceTarget ? sourceTarget.top : '18%',
              x: '-50%',
              y: '-50%',
              opacity: 1,
              scale: 0.86,
              rotateY: 180,
              rotate: -8,
            }}
            animate={animateTarget}
            exit={{ opacity: 0, scale: 1.005, transition: { duration: 0.12 } }}
            transition={{
              duration: FLIGHT_DURATION_MS / 1000,
              ease: [0.2, 0.8, 0.2, 1],
              y: {
                duration: FLIGHT_DURATION_MS / 1000,
                times: [0, 0.5, 0.84, 1],
                ease: 'easeOut',
              },
              scale: {
                duration: FLIGHT_DURATION_MS / 1000,
                times: [0, 0.52, 0.86, 1],
                ease: 'easeOut',
              },
              rotate: {
                duration: FLIGHT_DURATION_MS / 1000,
                times: [0, 0.48, 0.84, 1],
                ease: 'easeOut',
              },
              rotateY: {
                duration: FLIGHT_DURATION_MS / 1000,
                times: [0, 0.22, 0.56, 0.82, 1],
                ease: 'easeInOut',
              },
            }}
            style={{
              transformStyle: 'preserve-3d',
              filter:
                'drop-shadow(0 20px 30px rgba(0,0,0,0.54)) drop-shadow(0 0 14px rgba(201,168,76,0.12))',
            }}
          >
            <div
              className="relative flex flex-col items-center justify-center"
              style={{
                width: 116,
                height: 162,
                borderRadius: 18,
                background:
                  'linear-gradient(145deg, #2b1f10 0%, #1a1409 48%, #0e0a05 100%)',
                border: '1px solid rgba(201,168,76,0.38)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,223,128,0.12), inset 0 -10px 24px rgba(0,0,0,0.42)',
                backfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                position: 'absolute',
                inset: 0,
              }}
            >
              <span
                className="text-[26px] font-black"
                style={{
                  color: 'rgba(232,199,106,0.82)',
                  fontFamily: 'Georgia, serif',
                  letterSpacing: '0.06em',
                  textShadow: '0 2px 4px rgba(0,0,0,0.48)',
                }}
              >
                TP
              </span>
            </div>

            <div
              className="relative flex flex-col justify-between"
              style={{
                width: 116,
                height: 162,
                borderRadius: 18,
                background:
                  'linear-gradient(145deg, #fffefb 0%, #faf6ee 52%, #f2ead6 100%)',
                border: '1px solid rgba(0,0,0,0.12)',
                boxShadow:
                  '0 12px 24px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.94)',
                backfaceVisibility: 'hidden',
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
                revealDelayMs={FLIGHT_OUTCOME_BADGE_DELAY_MS}
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

export const OPPONENT_CARD_FLIGHT_DURATION_MS = FLIGHT_DURATION_MS;






