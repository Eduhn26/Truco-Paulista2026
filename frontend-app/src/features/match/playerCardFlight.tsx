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

type PlayerCardFlightProps = {
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
   * Ref to the DOM node of the PlayerPlayedSlot. If provided, the flight
   * lands at its measured center. If absent (fallback), we land at the
   * legacy hardcoded percentage so nothing breaks if a caller forgets.
   */
  landTargetRef?: RefObject<HTMLElement | null>;
};

const FLIGHT_DURATION_MS = 420;

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

export function PlayerCardFlight({
  revealKey,
  card,
  onFlightDone,
  suppressed = false,
  sourceTargetRef,
  landTargetRef,
}: PlayerCardFlightProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeFlight, setActiveFlight] = useState<{ key: number; card: FlightCard } | null>(null);
  const [landingTarget, setLandingTarget] = useState<FlightPoint | null>(null);
  const [sourceTarget, setSourceTarget] = useState<FlightPoint | null>(null);
  const lastTriggeredKeyRef = useRef<number>(-1);

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

  // Compute the animate target. If we have a measured landing target, use
  // pixel coordinates (most accurate). Otherwise fall back to the legacy
  // percentage (keeps compatibility if a caller doesn't pass landTargetRef).
  const animateTarget = landingTarget
    ? {
        left: landingTarget.left,
        top: landingTarget.top,
        x: '-50%' as const,
        y: ['-50%', '-54%', '-50%'] as [string, string, string],
        opacity: [0, 1, 1] as [number, number, number],
        scale: [0.78, 1.02, 1] as [number, number, number],
        rotateY: [0, 0, 0] as [number, number, number],
        rotate: [7, 2, 5] as [number, number, number],
      }
    : {
        left: '57.2%' as const,
        top: '50.2%' as const,
        x: '-50%' as const,
        y: ['-50%', '-54%', '-50%'] as [string, string, string],
        opacity: [0, 1, 1] as [number, number, number],
        scale: [0.78, 1.02, 1] as [number, number, number],
        rotateY: [0, 0, 0] as [number, number, number],
        rotate: [7, 2, 5] as [number, number, number],
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
              top: sourceTarget ? sourceTarget.top : '84%',
              x: '-50%',
              y: '-50%',
              opacity: 0,
              scale: 0.78,
              rotateY: 0,
              rotate: 7,
            }}
            animate={animateTarget}
            exit={{ opacity: 0, scale: 1.01, transition: { duration: 0.12 } }}
            transition={{
              duration: FLIGHT_DURATION_MS / 1000,
              ease: [0.2, 0.8, 0.2, 1],
              y: { duration: FLIGHT_DURATION_MS / 1000, times: [0, 0.55, 1], ease: 'easeOut' },
              scale: { duration: FLIGHT_DURATION_MS / 1000, times: [0, 0.8, 1], ease: 'easeOut' },
              rotate: { duration: FLIGHT_DURATION_MS / 1000, times: [0, 0.8, 1], ease: 'easeOut' },
            }}
            style={{
              transformStyle: 'preserve-3d',
              filter: 'drop-shadow(0 18px 30px rgba(0,0,0,0.54))',
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
                  '0 14px 26px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.94)',
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

export const PLAYER_CARD_FLIGHT_DURATION_MS = FLIGHT_DURATION_MS;


