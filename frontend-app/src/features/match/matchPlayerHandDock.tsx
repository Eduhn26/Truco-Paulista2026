import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { MatchPlayerHandPanel } from './matchPlayerHandPanel';
import type { CardPayload, MatchStatePayload, Rank } from '../../services/socket/socketTypes';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';

type Props = {
  myCards: CardPayload[];
  canPlayCard: boolean;
  tablePhase: TablePhase;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
  isMyTurn: boolean;
  isOneVsOne: boolean;
  viraRank: Rank;
  isSubdued?: boolean;
  isDecisionFocus?: boolean;
  actionSurface?: ReactNode;
  onCardElementChange?: ((cardKey: string, element: HTMLButtonElement | null) => void) | undefined;
};

// CHANGE (final surgical round — issue B: hand still feels "in the air",
// not integrated with the felt):
//
// Previously, the dock was *too* invisible — no panel, no border, no base.
// While that was better than the old glass-box (which looked like a
// disconnected widget), it tipped too far the other way: the fan had no
// "stage" under it and felt ungrounded.
//
// New approach: add a very subtle "felt pedestal" — a curved, soft arc
// behind the hand that reads as a wooden/felt rail receiving the cards.
// Low-contrast, premium. The cards still feel ON the felt, but now the
// felt itself has a hint of structure saying "this is the player's rail".
//
// We also bumped the outer wrapper height so the hover lift never gets
// clipped by a parent overflow-hidden — pairing with the shell's overflow
// fix below.
export function MatchPlayerHandDock({
  myCards,
  canPlayCard,
  tablePhase,
  launchingCardKey,
  currentPrivateHand,
  currentPublicHand,
  onPlayCard,
  isMyTurn,
  viraRank,
  isSubdued = false,
  isDecisionFocus = false,
  actionSurface = null,
  onCardElementChange,
}: Props) {
  const isInteractive = tablePhase === 'playing' && myCards.length > 0;
  const handCount = myCards.length;
  const shouldElevateDecision = isDecisionFocus && handCount > 0;

  return (
    <motion.div
      layout
      className="relative mx-auto w-full max-w-[1080px] px-2"
      initial={false}
      animate={{
        y: shouldElevateDecision ? -6 : isSubdued ? 4 : isInteractive ? -4 : -2,
        opacity: shouldElevateDecision ? 1 : isSubdued ? 0.46 : 1,
        scale: shouldElevateDecision ? 1.015 : isSubdued ? 0.97 : 1,
      }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
    >
      {/* CHANGE (issue B): "Player rail" — a soft arc beneath the hand
          that gives it structural context on the felt. No visible box,
          just a gradient that reads as "this bottom portion of the felt
          is where the player sits". Follows the same dark navy / gold
          vocabulary of the rest of the table. */}
      {handCount > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[4%] bottom-0 z-0"
          style={{
            height: 132,
            borderTopLeftRadius: '50% 60%',
            borderTopRightRadius: '50% 60%',
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(30,46,72,0.60) 0%, rgba(20,32,52,0.32) 38%, rgba(12,22,38,0.10) 62%, transparent 82%)',
            borderTop: shouldElevateDecision
              ? '1px solid rgba(255,223,128,0.22)'
              : isMyTurn
                ? '1px solid rgba(201,168,76,0.16)'
                : '1px solid rgba(160,180,210,0.08)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.04), inset 0 -28px 60px rgba(0,0,0,0.38)',
          }}
        />
      ) : null}

      {/* Ambient under-glow on the felt — sense of "the hand is illuminated"
          on the player's turn, without needing a panel. */}
      <div
        className="pointer-events-none absolute inset-x-[14%] -top-2 z-0 h-12 rounded-full transition-opacity duration-300"
        style={{
          opacity: shouldElevateDecision ? 1 : isMyTurn ? 0.9 : 0.3,
          background: shouldElevateDecision
            ? 'radial-gradient(ellipse, rgba(255,223,128,0.26) 0%, rgba(201,168,76,0.10) 40%, transparent 80%)'
            : isMyTurn
              ? 'radial-gradient(ellipse, rgba(201,168,76,0.18) 0%, rgba(201,168,76,0.06) 40%, transparent 78%)'
              : 'radial-gradient(ellipse, rgba(255,255,255,0.04) 0%, transparent 78%)',
          filter: 'blur(16px)',
        }}
      />

      {/* Turn badge — a single chip, top-right, only when it carries
          information. Absent from the "empty/waiting" state. */}
      {handCount > 0 && (shouldElevateDecision || isMyTurn) ? (
        <div className="pointer-events-none absolute right-3 -top-6 z-20">
          <span
            className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.20em]"
            style={{
              background: shouldElevateDecision
                ? 'rgba(255,223,128,0.14)'
                : 'rgba(201,168,76,0.14)',
              border: shouldElevateDecision
                ? '1px solid rgba(255,223,128,0.42)'
                : '1px solid rgba(201,168,76,0.34)',
              color: shouldElevateDecision ? '#f6dfa0' : '#e8c76a',
              fontFamily: 'Georgia, serif',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.28)',
            }}
          >
            {shouldElevateDecision ? 'Decida sua mão' : 'Em turno'}
          </span>
        </div>
      ) : null}

      {actionSurface ? <div className="relative z-10 mb-1 w-full">{actionSurface}</div> : null}

      {/* CHANGE (issue A — hand still being clipped): minHeight bumped from
          160 → 196 so the panel's inner 188px container (with its own hover
          headroom) fits completely without relying on parent overflow. */}
      <div className="relative z-10" style={{ minHeight: 196 }}>
        <MatchPlayerHandPanel
          myCards={myCards}
          canPlayCard={canPlayCard}
          tablePhase={tablePhase}
          launchingCardKey={launchingCardKey}
          currentPrivateHand={currentPrivateHand}
          currentPublicHand={currentPublicHand}
          onPlayCard={onPlayCard}
          isMyTurn={isMyTurn}
          viraRank={viraRank}
          isDecisionFocus={shouldElevateDecision}
          onCardElementChange={onCardElementChange}
        />
      </div>
    </motion.div>
  );
}

