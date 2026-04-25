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
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

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
  onFlightDone?: () => void;
  suppressed?: boolean;
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

const FLIGHT_DURATION_MS = 460;

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

export function OpponentCardFlight({
  revealKey,
  card,
  onFlightDone,
  suppressed = false,
  sourceTargetRef,
  landTargetRef,
}: OpponentCardFlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFlight, setActiveFlight] = useState<{ key: number; card: FlightCard } | null>(null);
  const [landingTarget, setLandingTarget] = useState<FlightPoint | null>(null);
  const [sourceTarget, setSourceTarget] = useState<FlightPoint | null>(null);
  const lastTriggeredKeyRef = useRef<number>(-1);

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
    if (suppressed || !card || revealKey === 0) {
      return;
    }

    if (lastTriggeredKeyRef.current === revealKey) {
      return;
    }

    lastTriggeredKeyRef.current = revealKey;
    setActiveFlight({ key: revealKey, card });

    const timeout = window.setTimeout(() => {
      setActiveFlight((current) => (current?.key === revealKey ? null : current));
      onFlightDone?.();
    }, FLIGHT_DURATION_MS + 40);

    return () => window.clearTimeout(timeout);
  }, [revealKey, card, suppressed, onFlightDone]);

  const flightCard = activeFlight?.card ?? null;
  const symbol = flightCard ? parseSuitSymbol(flightCard.suit) : '';
  const textColor = flightCard && isRedSuit(flightCard.suit) ? '#c0392b' : '#1a1a2e';

  const animateTarget = landingTarget
    ? {
        left: landingTarget.left,
        top: landingTarget.top,
        x: '-50%' as const,
        y: '-50%' as const,
        opacity: 1,
        scale: 1,
        rotateY: [180, 180, 90, 0, 0] as [number, number, number, number, number],
        rotate: -6,
      }
    : {
        left: '42.8%' as const,
        top: '50.2%' as const,
        x: '-50%' as const,
        y: '-50%' as const,
        opacity: 1,
        scale: 1,
        rotateY: [180, 180, 90, 0, 0] as [number, number, number, number, number],
        rotate: -6,
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
              opacity: 0,
              scale: 0.7,
              rotateY: 180,
              rotate: -6,
            }}
            animate={animateTarget}
            exit={{ opacity: 0, scale: 1.02, transition: { duration: 0.14 } }}
            transition={{
              duration: FLIGHT_DURATION_MS / 1000,
              ease: [0.2, 0.8, 0.2, 1],
              rotateY: {
                duration: FLIGHT_DURATION_MS / 1000,
                times: [0, 0.3, 0.55, 0.8, 1],
                ease: 'easeInOut',
              },
            }}
            style={{
              transformStyle: 'preserve-3d',
              filter: 'drop-shadow(0 16px 28px rgba(0,0,0,0.52))',
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


