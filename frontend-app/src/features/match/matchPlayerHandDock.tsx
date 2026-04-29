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

// CHANGE (debt #2 — cards clipped at the bottom of the viewport):
// The dock itself was sized correctly, but the page-level wrappers
// (h-screen + overflow-hidden + tight pb on <main>) clipped the bottom
// edge of the player's cards on 1366×768 / 100% zoom. Patch is two-pronged:
//   • bump the dock's reserved height so the hover lift always has
//     headroom inside the panel (220 vs. previous 196 — covers the longest
//     hover lift +28px tail);
//   • add 28px paddingBottom on the outer wrapper so the cards never
//     touch the next outer overflow-hidden boundary even when a parent
//     decides to be aggressive.
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
      // CHANGE (debt #2): pb-7 reserves outer headroom so the bottom of the
      // fan never gets clipped by the page's overflow boundary, regardless
      // of viewport height.
      className="relative mx-auto w-full max-w-[1080px] px-2 pb-7"
      initial={false}
      animate={{
        y: shouldElevateDecision ? -6 : isSubdued ? 4 : isInteractive ? -4 : -2,
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

      {/* CHANGE (debt #2): minHeight 220 (was 196) — accommodates the panel's
          inner 188px container plus the hover lift (~26px) without ever
          relying on parent overflow. */}
      <div className="relative z-10" style={{ minHeight: 220 }}>
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
