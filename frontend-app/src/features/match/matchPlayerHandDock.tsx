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

// CHANGE (audit 2v2 D — hand must always fit at 100% zoom):
//
// Audit footage at 1920×1040 showed the bottom row of cards getting clipped
// by the viewport — the dock was right-sized for the panel but the outer
// page layout (gold-frame inside main inside body, all min-h-0/flex-1)
// could push the dock into the cropped area when the inner column got
// tall (top nameplate + partner stack + center area + dock + cue plate
// reservation).
//
// Fix here: tighten the dock's outer wrapper so it never adds avoidable
// height, and bump the upper safety margin so the new larger
// `PlayerHandTurnCue` plate (32px tall + label spacing) clears the cards
// without overlapping. Bottom padding remains intentionally light — the
// page's <main> already reserves breathing room with `pb-4 md:pb-6`.
//
// CHANGE (debt #8 — duplicate "Em turno" pill):
// The "Em turno" badge in the dock duplicated the larger
// "Sua vez / Jogue uma carta" cue rendered by the table shell. We keep
// only the *informational* "Decida sua mão" badge for bet-response moments
// (where the cue isn't present) and drop the redundant turn pill in normal
// turns. The shell's PlayerHandTurnCue is the single source of truth for
// "your turn now".
export function MatchPlayerHandDock({
  myCards,
  canPlayCard,
  tablePhase,
  launchingCardKey,
  currentPrivateHand,
  currentPublicHand,
  onPlayCard,
  isMyTurn,
  isOneVsOne,
  viraRank,
  isSubdued = false,
  isDecisionFocus = false,
  actionSurface = null,
  onCardElementChange,
}: Props) {
  const isInteractive = tablePhase === 'playing' && myCards.length > 0;
  const handCount = myCards.length;
  const isCompactTwoVersusTwo = !isOneVsOne;
  const shouldElevateDecision = isDecisionFocus && handCount > 0;

  return (
    <motion.div
      layout
      // CHANGE (audit 2v2 D — viewport sizing):
      //   • px-2 → px-2 (kept)
      //   • pb-3 → pb-2 (-4px). The page's <main> already reserves room.
      //   • pt-7 added so the new larger PlayerHandTurnCue plate (32px
      //     tall + label) sits above the cards without overlap. The plate
      //     is positioned with `top: 0` of the absolute cue layer, but
      //     the cue layer extends `top-0 bottom-1` of the dock — pt-7
      //     reserves vertical space inside the dock for the plate to
      //     breathe over the cards.
      // Net change: same total height envelope, +28px headroom for the
      // cue, less wasted space below — cards always inside the viewport
      // at 1080p / 100% zoom.
      className="relative mx-auto w-full max-w-[1080px] px-1 pb-0 pt-2 sm:px-2 sm:pb-2 sm:pt-7"
      initial={false}
      animate={{
        y: shouldElevateDecision ? (isCompactTwoVersusTwo ? -3 : -6) : isSubdued ? 4 : isInteractive ? (isCompactTwoVersusTwo ? -2 : -4) : -2,
        opacity: shouldElevateDecision ? 1 : isSubdued ? 0.46 : 1,
        scale: shouldElevateDecision ? 1.015 : isSubdued ? 0.97 : 1,
      }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
    >
      {handCount > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[4%] bottom-0 z-0"
          style={{
            height: isCompactTwoVersusTwo ? 92 : 132,
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

      <div
        className={`pointer-events-none absolute inset-x-[14%] ${isCompactTwoVersusTwo ? '-top-1 h-9' : '-top-2 h-12'} z-0 rounded-full transition-opacity duration-300`}
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

      {/* CHANGE (debt #8): keep the "Decida sua mão" pill only for bet-response
          decisions (where the table shell doesn't show the turn cue). The
          neutral "Em turno" pill was duplicating the bigger
          "Sua vez / Jogue uma carta" cue and has been dropped. */}
      {handCount > 0 && shouldElevateDecision ? (
        <div className="pointer-events-none absolute right-3 -top-6 z-20">
          <span
            className="rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.20em]"
            style={{
              background: 'rgba(255,223,128,0.14)',
              border: '1px solid rgba(255,223,128,0.42)',
              color: '#f6dfa0',
              fontFamily: 'Georgia, serif',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 4px 10px rgba(0,0,0,0.28)',
            }}
          >
            Decida sua mão
          </span>
        </div>
      ) : null}

      {actionSurface ? <div className="relative z-10 mb-1 w-full">{actionSurface}</div> : null}

      {/* NOTE: Mobile uses a shorter envelope so the hand stays fully
          clickable inside the fixed match arena. Desktop breakpoints keep
          the approved spacious hand treatment. */}
      <div
        className={
          isCompactTwoVersusTwo
            ? 'relative z-10 min-h-[96px] sm:min-h-[104px] md:min-h-[126px]'
            : 'relative z-10 min-h-[132px] sm:min-h-[156px] md:min-h-[220px]'
        }
      >
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
          isCompactTable={isCompactTwoVersusTwo}
          onCardElementChange={onCardElementChange}
        />
      </div>
    </motion.div>
  );
}


