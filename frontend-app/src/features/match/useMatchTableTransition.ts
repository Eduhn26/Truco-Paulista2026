import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CARD_REVEAL_DELAY_MS,
  CARD_SETTLE_BEFORE_RESOLUTION_MS,
  NEXT_ROUND_CLEAN_FRAME_MS,
  PENDING_CARD_TIMEOUT_MS,
  RESOLUTION_HOLD_MS,
} from './timing';

// NOTE: Active card flights now survive the first round-resolution frame.
// Keep the resolved table pinned a little longer so WIN/PERDEU/EMPATE have a
// readable window after both flight clones hand control back to the real slots.
//
// The hold begins at commitRoundResolution. The opponent flight (if still
// landing) consumes ~460 ms inside this window. After the flight settles, the
// shell's PlayedSlot can show the WIN/PERDEU/EMPATE ribbon. With a 1800 ms
// hold, the ribbon has at least ~1340 ms of readable presence even in the
// worst case where the round-resolved arrives concurrently with the opponent
// card-played and the opponent flight only finishes at +880 ms.
const FELT_RESOLUTION_HOLD_MS = Math.max(RESOLUTION_HOLD_MS, 1800);

// PATCH A — Landing-window estimate.
//
// The hook does not own the flight components, but it must expose a reactive
// boolean that says "a card is currently visually landing on the felt", so the
// match page can suppress the playable UI (hand dock, action bar, "Em turno"
// badge) for the entire duration of the flight clone — not just for the
// authoritative round-resolution window.
//
// These constants intentionally MIRROR the duration constants from
// opponentCardFlight.tsx / playerCardFlight.tsx (FLIGHT_DURATION_MS = 480 and
// HANDOFF_REMOVE_MS = 590). If those values are tuned, update them here too,
// or lift them into timing.ts. Kept inline for this patch to avoid touching
// the high-risk flight files.
const FLIGHT_LANDING_WINDOW_MS = 590;
// Small additional tail to cover render scheduling jitter (raf batching, the
// React 19 transition queue) before we declare the landing "fully settled".
const FLIGHT_LANDING_TAIL_MS = 40;
const TOTAL_LANDING_WINDOW_MS = FLIGHT_LANDING_WINDOW_MS + FLIGHT_LANDING_TAIL_MS;

type PlayedCardOwner = 'mine' | 'opponent';

type PendingPlayedCard = {
  owner: PlayedCardOwner;
  card: string;
  id: number;
};

type ClosingTableCards = {
  mine: string | null;
  opponent: string | null;
};

type PendingPromotionState = {
  myCard: string | null;
  opponentCard: string | null;
};

type ResolvedTableSnapshot = {
  resolutionKey: string;
  myCard: string | null;
  opponentCard: string | null;
  roundResult: string | null;
};

type RoundResolutionInput = {
  resolutionKey: string;
  myCard: string | null;
  opponentCard: string | null;
  roundResult?: string | null;
};

type GuardedRoundResolutionInput = RoundResolutionInput & {
  tableGeneration: number;
};

type AcceptedCardStamp = {
  owner: PlayedCardOwner;
  card: string;
  acceptedAt: number;
};

type UseMatchTableTransitionParams = {
  tablePhase: 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
  myPlayedCard: string | null;
  opponentPlayedCard: string | null;
  playedRoundsCount: number;
  latestRoundFinished: boolean;
  currentTurnSeatId: string | null;
  nextDecisionType: string | null;
};

type UseMatchTableTransitionResult = {
  launchingCardKey: string | null;
  pendingPlayedCard: PendingPlayedCard | null;
  closingTableCards: ClosingTableCards;
  opponentRevealKey: number;
  roundIntroKey: number;
  roundResolvedKey: number;
  isResolvingRound: boolean;
  hasPendingRoundResolution: boolean;
  resolvedRoundFinished: boolean;
  isLiveTableFrame: boolean;
  displayedMyPlayedCard: string | null;
  displayedOpponentPlayedCard: string | null;
  resolvedRoundResult: string | null;
  // PATCH A — Landing-window flags exposed for the playable-UI suppression.
  // True while the corresponding flight clone is still visually on screen.
  // Consumers (matchPage, useMatchActionBridge) treat any of these as an
  // additional reason to keep the hand inert and the action bar hidden.
  isOpponentLandingInProgress: boolean;
  isOwnLandingInProgress: boolean;
  isAnyCardLandingInProgress: boolean;
  beginHandTransition: () => void;
  beginOwnCardLaunch: (params: { cardKey: string; serverCard: string }) => void;
  registerIncomingPlayedCard: (params: {
    owner: 'mine' | 'opponent' | null;
    card: string | null;
  }) => void;
  triggerRoundResolution: (params: {
    resolutionKey: string;
    myCard: string | null;
    opponentCard: string | null;
    roundResult?: string | null;
  }) => void;
  stopRoundResolution: () => void;
};

// NOTE: The four felt-cadence constants (CARD_REVEAL_DELAY_MS,
// CARD_SETTLE_BEFORE_RESOLUTION_MS, RESOLUTION_HOLD_MS,
// NEXT_ROUND_CLEAN_FRAME_MS) plus PENDING_CARD_TIMEOUT_MS are imported from
// `./timing`. Previously this file hard-coded its own copies which diverged
// from timing.ts; that divergence was the root cause of the "embolado"
// cadence report. Single source of truth now lives in timing.ts.

function debugTableTransition(event: string, details: Record<string, unknown> = {}): void {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info('[TABLE_TRANSITION]', event, details);
}

export function useMatchTableTransition(
  params: UseMatchTableTransitionParams,
): UseMatchTableTransitionResult {
  const {
    tablePhase,
    myPlayedCard,
    opponentPlayedCard,
    playedRoundsCount,
    latestRoundFinished,
    currentTurnSeatId,
    nextDecisionType,
  } = params;

  const previousOpponentPlayedCardRef = useRef<string | null>(null);
  const previousMyPlayedCardRef = useRef<string | null>(null);
  const isResolvingRoundRef = useRef(false);
  const previousResolvedRoundCountRef = useRef(0);
  const lastResolvedRoundKeyRef = useRef<string | null>(null);
  const tablePhaseRef = useRef(tablePhase);
  const nextDecisionTypeRef = useRef<string | null>(nextDecisionType);
  const currentTurnSeatIdRef = useRef<string | null>(currentTurnSeatId);
  const opponentRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resolutionSettleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardIdRef = useRef<number | null>(null);
  const pendingPlayedCardRef = useRef<PendingPlayedCard | null>(null);
  const launchingCardKeyRef = useRef<string | null>(null);
  const pendingRoundResolutionRef = useRef<GuardedRoundResolutionInput | null>(null);
  const lastAcceptedCardStampRef = useRef<AcceptedCardStamp | null>(null);
  const opponentCardAcceptedViaEventRef = useRef<string | null>(null);
  const myCardAcceptedViaEventRef = useRef<string | null>(null);
  const suppressResolvedRoundReplayRef = useRef(false);
  const awaitingNextRoundOpeningRef = useRef(false);
  const pendingPromotionRef = useRef<PendingPromotionState>({
    myCard: null,
    opponentCard: null,
  });
  // PATCH 7.6 — Cards explicitly wiped when opening a fresh round.
  //
  // Slower combat pacing means the authoritative view-model can still expose
  // the previous round's latest cards for a few frames after the transition
  // hook has already cleared the felt for the next round. Without this guard,
  // the prop-sync effects below can repaint the player's old card immediately
  // after resetForFreshRoundFrame(). Store the cards that were just wiped so
  // those stale prop echoes are ignored until a genuinely new card arrives.
  const clearedRoundCardsRef = useRef<ClosingTableCards>({ mine: null, opponent: null });
  const resolvedTableSnapshotRef = useRef<ResolvedTableSnapshot | null>(null);
  const tableGenerationRef = useRef(0);

  // PATCH A — Landing flag bookkeeping.
  // We use a per-owner "active landing key" approach: a monotonically
  // increasing number that flips back to 0 once the landing window elapses.
  // A timeout per owner clears its key. Re-triggering during a window cancels
  // the previous timeout and arms a new one — so consecutive plays do not
  // produce stale "true" states.
  const opponentLandingClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownLandingClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [launchingCardKey, setLaunchingCardKey] = useState<string | null>(null);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<PendingPlayedCard | null>(null);
  const [displayedMyPlayedCard, setDisplayedMyPlayedCard] = useState<string | null>(myPlayedCard);
  const [displayedOpponentPlayedCard, setDisplayedOpponentPlayedCard] = useState<string | null>(
    opponentPlayedCard,
  );
  const [resolvedRoundResult, setResolvedRoundResult] = useState<string | null>(null);
  const [opponentRevealKey, setOpponentRevealKey] = useState(0);
  const [roundIntroKey, setRoundIntroKey] = useState(0);
  const [roundResolvedKey, setRoundResolvedKey] = useState(0);
  const [isResolvingRound, setIsResolvingRound] = useState(false);
  const [hasPendingRoundResolution, setHasPendingRoundResolution] = useState(false);
  const [closingTableCards, setClosingTableCards] = useState<ClosingTableCards>({
    mine: null,
    opponent: null,
  });
  // PATCH A — Reactive landing flags. Read by matchPage to extend
  // shouldSuppressPlayableUi, and ultimately by useMatchActionBridge as the
  // last line of defense against a play-card emission during a flight.
  const [isOpponentLandingInProgress, setIsOpponentLandingInProgress] = useState(false);
  const [isOwnLandingInProgress, setIsOwnLandingInProgress] = useState(false);

  useEffect(() => {
    pendingPlayedCardRef.current = pendingPlayedCard;
  }, [pendingPlayedCard]);

  useEffect(() => {
    launchingCardKeyRef.current = launchingCardKey;
  }, [launchingCardKey]);

  useEffect(() => {
    isResolvingRoundRef.current = isResolvingRound;
  }, [isResolvingRound]);

  useEffect(() => {
    tablePhaseRef.current = tablePhase;
  }, [tablePhase]);

  useEffect(() => {
    nextDecisionTypeRef.current = nextDecisionType;
  }, [nextDecisionType]);

  useEffect(() => {
    currentTurnSeatIdRef.current = currentTurnSeatId;
  }, [currentTurnSeatId]);

  // PATCH A — Landing-flag helpers.
  const clearOpponentLandingTimeout = useCallback(() => {
    if (opponentLandingClearTimeoutRef.current) {
      clearTimeout(opponentLandingClearTimeoutRef.current);
      opponentLandingClearTimeoutRef.current = null;
    }
  }, []);

  const clearOwnLandingTimeout = useCallback(() => {
    if (ownLandingClearTimeoutRef.current) {
      clearTimeout(ownLandingClearTimeoutRef.current);
      ownLandingClearTimeoutRef.current = null;
    }
  }, []);

  const armOpponentLanding = useCallback(() => {
    clearOpponentLandingTimeout();
    setIsOpponentLandingInProgress(true);
    opponentLandingClearTimeoutRef.current = setTimeout(() => {
      setIsOpponentLandingInProgress(false);
      opponentLandingClearTimeoutRef.current = null;
    }, TOTAL_LANDING_WINDOW_MS);
  }, [clearOpponentLandingTimeout]);

  const armOwnLanding = useCallback(() => {
    clearOwnLandingTimeout();
    setIsOwnLandingInProgress(true);
    ownLandingClearTimeoutRef.current = setTimeout(() => {
      setIsOwnLandingInProgress(false);
      ownLandingClearTimeoutRef.current = null;
    }, TOTAL_LANDING_WINDOW_MS);
  }, [clearOwnLandingTimeout]);

  const cancelOpponentLanding = useCallback(() => {
    clearOpponentLandingTimeout();
    setIsOpponentLandingInProgress(false);
  }, [clearOpponentLandingTimeout]);

  const cancelOwnLanding = useCallback(() => {
    clearOwnLandingTimeout();
    setIsOwnLandingInProgress(false);
  }, [clearOwnLandingTimeout]);

  const advanceTableGeneration = useCallback((reason: string) => {
    tableGenerationRef.current += 1;

    debugTableTransition('tableGeneration:advanced', {
      reason,
      tableGeneration: tableGenerationRef.current,
      pendingRoundResolution: pendingRoundResolutionRef.current,
      pendingPromotion: pendingPromotionRef.current,
    });
  }, []);

  useEffect(() => {
    // CHANGE (cards persisting across hands): the original release condition
    //   (!latestRoundFinished || playedRoundsCount !== previousResolvedRoundCountRef.current)
    // would fire prematurely RIGHT AFTER beginHandTransition, because that
    // function resets previousResolvedRoundCountRef to 0 while the view-model's
    // playedRoundsCount is still the previous hand's count (e.g. 3). The
    // released suppression then let the fallback resolver re-paint stale
    // cards.
    //
    // Stricter condition: release the suppression only when the authoritative
    // state shows that no round is currently finished waiting to be resolved.
    // That is true:
    //   - on a fresh hand: playedRoundsCount drops to 0, OR
    //   - between rounds inside a hand: latestRoundFinished flips to false
    //     because a new (still-open) round started after a resolution.
    // We deliberately do NOT release just because the count differs from the
    // ref, because that ref is reset by beginHandTransition.
    const shouldReleaseReplaySuppression =
      !latestRoundFinished && !awaitingNextRoundOpeningRef.current;

    if (shouldReleaseReplaySuppression) {
      suppressResolvedRoundReplayRef.current = false;
    }
  }, [latestRoundFinished, playedRoundsCount]);

  const cancelOpponentReveal = useCallback(() => {
    if (opponentRevealTimeoutRef.current) {
      clearTimeout(opponentRevealTimeoutRef.current);
      opponentRevealTimeoutRef.current = null;
    }
  }, []);

  const clearRoundTransition = useCallback(() => {
    if (roundTransitionTimeoutRef.current) {
      clearTimeout(roundTransitionTimeoutRef.current);
      roundTransitionTimeoutRef.current = null;
    }
  }, []);

  const clearResolutionSettleTimeout = useCallback(() => {
    if (resolutionSettleTimeoutRef.current) {
      clearTimeout(resolutionSettleTimeoutRef.current);
      resolutionSettleTimeoutRef.current = null;
    }
  }, []);

  const clearTransientLaunchState = useCallback(() => {
    if (pendingCardTimeoutRef.current) {
      clearTimeout(pendingCardTimeoutRef.current);
      pendingCardTimeoutRef.current = null;
    }

    setPendingPlayedCard(null);
    pendingPlayedCardRef.current = null;
    setLaunchingCardKey(null);
    launchingCardKeyRef.current = null;
    pendingCardIdRef.current = null;
  }, []);

  const clearPendingPromotion = useCallback((reason: string) => {
    debugTableTransition('clearPendingPromotion', {
      reason,
      pendingPromotion: pendingPromotionRef.current,
    });

    pendingPromotionRef.current = { myCard: null, opponentCard: null };
  }, []);

  const clearDisplayedTable = useCallback(
    (options: { clearPendingPromotion?: boolean } = {}) => {
      debugTableTransition('clearDisplayedTable', {
        previousMyPlayedCard: previousMyPlayedCardRef.current,
        previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
        myCardAcceptedViaEvent: myCardAcceptedViaEventRef.current,
        opponentCardAcceptedViaEvent: opponentCardAcceptedViaEventRef.current,
        tablePhase: tablePhaseRef.current,
        nextDecisionType: nextDecisionTypeRef.current,
        isResolvingRound: isResolvingRoundRef.current,
        pendingCardId: pendingCardIdRef.current,
        opponentRevealPending: opponentRevealTimeoutRef.current !== null,
        closingTimeoutPending: closingTimeoutRef.current !== null,
        roundTransitionPending: roundTransitionTimeoutRef.current !== null,
        pendingPromotion: pendingPromotionRef.current,
        pendingRoundResolution: pendingRoundResolutionRef.current,
        lastAcceptedCardStamp: lastAcceptedCardStampRef.current,
        clearPendingPromotion: options.clearPendingPromotion ?? false,
      });

      setDisplayedMyPlayedCard(null);
      setDisplayedOpponentPlayedCard(null);
      setClosingTableCards({ mine: null, opponent: null });
      setResolvedRoundResult(null);
      resolvedTableSnapshotRef.current = null;
      lastAcceptedCardStampRef.current = null;
      previousMyPlayedCardRef.current = null;
      previousOpponentPlayedCardRef.current = null;
      opponentCardAcceptedViaEventRef.current = null;
      myCardAcceptedViaEventRef.current = null;

      if (options.clearPendingPromotion) {
        clearPendingPromotion('clear-displayed-table');
      }
    },
    [clearPendingPromotion],
  );

  const resetForFreshRoundFrame = useCallback(() => {
    debugTableTransition('resetForFreshRoundFrame', {
      tablePhase: tablePhaseRef.current,
      nextDecisionType: nextDecisionTypeRef.current,
      currentTurnSeatId: currentTurnSeatIdRef.current,
      isResolvingRound: isResolvingRoundRef.current,
      previousMyPlayedCard: previousMyPlayedCardRef.current,
      previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
      pendingPromotion: pendingPromotionRef.current,
      awaitingNextRoundOpening: awaitingNextRoundOpeningRef.current,
      suppressResolvedRoundReplay: suppressResolvedRoundReplayRef.current,
    });

    clearedRoundCardsRef.current = {
      mine: previousMyPlayedCardRef.current,
      opponent: previousOpponentPlayedCardRef.current,
    };

    advanceTableGeneration('reset-fresh-round-frame');
    cancelOpponentReveal();
    clearRoundTransition();

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    clearTransientLaunchState();
    clearResolutionSettleTimeout();
    pendingRoundResolutionRef.current = null;
    setHasPendingRoundResolution(false);
    clearDisplayedTable({ clearPendingPromotion: true });
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
    // PATCH A — clear landing flags whenever we wipe the felt for a new round
    // frame; flights that were arming during the old round must not bleed
    // into the next one.
    cancelOpponentLanding();
    cancelOwnLanding();
  }, [
    cancelOpponentReveal,
    cancelOpponentLanding,
    cancelOwnLanding,
    clearDisplayedTable,
    clearResolutionSettleTimeout,
    clearRoundTransition,
    clearTransientLaunchState,
    advanceTableGeneration,
  ]);

  const revealOpponentCard = useCallback(
    (card: string, immediate: boolean) => {
      cancelOpponentReveal();

      // PATCH A — Arm the opponent landing window on every reveal kick-off,
      // regardless of whether the slot will reveal now or after
      // CARD_REVEAL_DELAY_MS. The flight clone is what the user sees during
      // the window; the slot card is the destination. Both modes must keep
      // the playable UI suppressed for the same total duration.
      armOpponentLanding();

      const reveal = () => {
        setDisplayedOpponentPlayedCard(card);
        setOpponentRevealKey((current) => current + 1);
        previousOpponentPlayedCardRef.current = card;
      };

      if (immediate) {
        reveal();
        return;
      }

      opponentRevealTimeoutRef.current = setTimeout(reveal, CARD_REVEAL_DELAY_MS);
    },
    [armOpponentLanding, cancelOpponentReveal],
  );

  const queueNextRoundPromotion = useCallback((nextState: Partial<PendingPromotionState>) => {
    pendingPromotionRef.current = {
      myCard:
        nextState.myCard !== undefined ? nextState.myCard : pendingPromotionRef.current.myCard,
      opponentCard:
        nextState.opponentCard !== undefined
          ? nextState.opponentCard
          : pendingPromotionRef.current.opponentCard,
    };
  }, []);

  const flushPendingPromotion = useCallback(() => {
    debugTableTransition('flushPendingPromotion:start', {
      tablePhase: tablePhaseRef.current,
      nextDecisionType: nextDecisionTypeRef.current,
      isResolvingRound: isResolvingRoundRef.current,
      pendingPromotion: pendingPromotionRef.current,
      awaitingNextRoundOpening: awaitingNextRoundOpeningRef.current,
      suppressResolvedRoundReplay: suppressResolvedRoundReplayRef.current,
    });

    const nextPromotion = pendingPromotionRef.current;
    const hasPendingPromotion =
      nextPromotion.myCard !== null || nextPromotion.opponentCard !== null;

    const handEnded =
      tablePhaseRef.current === 'hand_finished' ||
      tablePhaseRef.current === 'match_finished' ||
      nextDecisionTypeRef.current === 'start-next-hand' ||
      nextDecisionTypeRef.current === 'match-finished';

    if (!hasPendingPromotion) {
      if (handEnded) {
        pendingPromotionRef.current = { myCard: null, opponentCard: null };
        awaitingNextRoundOpeningRef.current = false;
        suppressResolvedRoundReplayRef.current = false;
        setHasPendingRoundResolution(false);
        // NOTE: Do not clear the displayed cards here. The hand-climax overlay
        // needs the final resolved table preserved underneath until the next
        // hand transition deliberately wipes the felt.
        setIsResolvingRound(false);
        return;
      }

      awaitingNextRoundOpeningRef.current = false;
      suppressResolvedRoundReplayRef.current = true;

      roundTransitionTimeoutRef.current = setTimeout(() => {
        resetForFreshRoundFrame();
        roundTransitionTimeoutRef.current = null;
        awaitingNextRoundOpeningRef.current = true;
      }, NEXT_ROUND_CLEAN_FRAME_MS);

      pendingPromotionRef.current = { myCard: null, opponentCard: null };
      return;
    }

    if (handEnded) {
      pendingPromotionRef.current = { myCard: null, opponentCard: null };
      awaitingNextRoundOpeningRef.current = false;
      suppressResolvedRoundReplayRef.current = false;
      setHasPendingRoundResolution(false);
      // NOTE: Preserve final table cards for the hand result/climax. The felt is
      // cleared by beginHandTransition when the next hand actually starts.
      setIsResolvingRound(false);
      return;
    }

    suppressResolvedRoundReplayRef.current = false;
    awaitingNextRoundOpeningRef.current = false;

    roundTransitionTimeoutRef.current = setTimeout(() => {
      const promotionToApply = pendingPromotionRef.current;

      resetForFreshRoundFrame();

      if (promotionToApply.myCard) {
        setDisplayedMyPlayedCard(promotionToApply.myCard);
        previousMyPlayedCardRef.current = promotionToApply.myCard;
        myCardAcceptedViaEventRef.current = promotionToApply.myCard;
      }

      if (promotionToApply.opponentCard) {
        // NOTE: When the bot plays during the previous round's visual hold,
        // the card is queued as a next-round promotion. At this point the felt
        // was just cleared by resetForFreshRoundFrame(), so there is no stale
        // slot to overlap. Revealing immediately is safer than waiting for
        // CARD_REVEAL_DELAY_MS: it starts the opponent flight on the first
        // fresh-round paint and prevents the player from seeing an empty turn
        // where the bot's card has already been accepted by the socket layer.
        revealOpponentCard(promotionToApply.opponentCard, true);
        opponentCardAcceptedViaEventRef.current = promotionToApply.opponentCard;
      }

      clearPendingPromotion('promotion-applied');
      roundTransitionTimeoutRef.current = null;
    }, NEXT_ROUND_CLEAN_FRAME_MS);
  }, [clearPendingPromotion, resetForFreshRoundFrame, revealOpponentCard]);

  const markAcceptedCardForVisualSettle = useCallback((owner: PlayedCardOwner, card: string) => {
    lastAcceptedCardStampRef.current = {
      owner,
      card,
      acceptedAt: Date.now(),
    };
  }, []);

  const renderIncomingCard = useCallback(
    (owner: PlayedCardOwner, card: string, immediateOpponentReveal: boolean) => {
      suppressResolvedRoundReplayRef.current = false;
      awaitingNextRoundOpeningRef.current = false;

      markAcceptedCardForVisualSettle(owner, card);

      if (owner === 'mine') {
        if (clearedRoundCardsRef.current.mine === card) {
          clearedRoundCardsRef.current = { ...clearedRoundCardsRef.current, mine: null };
        }

        setDisplayedMyPlayedCard(card);
        previousMyPlayedCardRef.current = card;
        myCardAcceptedViaEventRef.current = card;
        return;
      }

      if (clearedRoundCardsRef.current.opponent === card) {
        clearedRoundCardsRef.current = { ...clearedRoundCardsRef.current, opponent: null };
      }

      opponentCardAcceptedViaEventRef.current = card;
      revealOpponentCard(card, immediateOpponentReveal);
    },
    [markAcceptedCardForVisualSettle, revealOpponentCard],
  );

  const beginHandTransition = useCallback(() => {
    debugTableTransition('beginHandTransition', {
      tablePhase: tablePhaseRef.current,
      nextDecisionType: nextDecisionTypeRef.current,
      currentTurnSeatId: currentTurnSeatIdRef.current,
      isResolvingRound: isResolvingRoundRef.current,
      previousMyPlayedCard: previousMyPlayedCardRef.current,
      previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
      pendingCardId: pendingCardIdRef.current,
      pendingPromotion: pendingPromotionRef.current,
      awaitingNextRoundOpening: awaitingNextRoundOpeningRef.current,
      suppressResolvedRoundReplay: suppressResolvedRoundReplayRef.current,
    });

    advanceTableGeneration('begin-hand-transition');
    cancelOpponentReveal();
    clearTransientLaunchState();
    clearRoundTransition();
    clearResolutionSettleTimeout();
    pendingRoundResolutionRef.current = null;
    resolvedTableSnapshotRef.current = null;
    setHasPendingRoundResolution(false);

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    clearDisplayedTable({ clearPendingPromotion: true });
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
    previousResolvedRoundCountRef.current = 0;
    lastResolvedRoundKeyRef.current = null;
    // CHANGE (cards persisting across hands): when we transition into a new
    // hand, the visual state has been wiped but the view-model's myPlayedCard
    // / opponentPlayedCard / latestRoundFinished may still point at the
    // PREVIOUS finished hand for one or two frames — until setVisualPublicMatchState
    // commits and the new hand's empty rounds[] arrive. During that window,
    // the fallback round-resolution effect below would re-fire and re-paint
    // the old hand's last round onto the freshly cleared felt. Holding
    // suppressResolvedRoundReplayRef true blocks that. The release effect at
    // the top of this hook clears it as soon as the authoritative new-hand
    // state arrives (latestRoundFinished flips to false).
    suppressResolvedRoundReplayRef.current = true;
    awaitingNextRoundOpeningRef.current = false;
    pendingPromotionRef.current = { myCard: null, opponentCard: null };
    clearedRoundCardsRef.current = { mine: null, opponent: null };
    lastAcceptedCardStampRef.current = null;
    // PATCH A — flights from a previous hand cannot leak into a new hand.
    cancelOpponentLanding();
    cancelOwnLanding();
  }, [
    cancelOpponentReveal,
    cancelOpponentLanding,
    cancelOwnLanding,
    clearDisplayedTable,
    clearResolutionSettleTimeout,
    clearRoundTransition,
    clearTransientLaunchState,
    advanceTableGeneration,
  ]);

  const beginOwnCardLaunch = useCallback(
    (launchParams: { cardKey: string; serverCard: string }) => {
      debugTableTransition('beginOwnCardLaunch', {
        launchParams,
        tablePhase: tablePhaseRef.current,
        nextDecisionType: nextDecisionTypeRef.current,
        currentTurnSeatId: currentTurnSeatIdRef.current,
        isResolvingRound: isResolvingRoundRef.current,
        closingTableCards: {
          mine: closingTableCards.mine,
          opponent: closingTableCards.opponent,
        },
        pendingCardId: pendingCardIdRef.current,
        pendingPromotion: pendingPromotionRef.current,
      });

      suppressResolvedRoundReplayRef.current = false;
      awaitingNextRoundOpeningRef.current = false;

      // PATCH A — Arm own landing window the moment we kick off the player's
      // flight. Mirrors the opponent path. Auto-clears in TOTAL_LANDING_WINDOW_MS.
      armOwnLanding();

      if (isResolvingRoundRef.current) {
        const shouldCompleteCurrentResolvedRound = closingTableCards.mine === null;

        if (shouldCompleteCurrentResolvedRound) {
          setDisplayedMyPlayedCard(launchParams.serverCard);
          setClosingTableCards((current) => ({
            ...current,
            mine: launchParams.serverCard,
          }));
          previousMyPlayedCardRef.current = launchParams.serverCard;
          myCardAcceptedViaEventRef.current = launchParams.serverCard;
          return;
        }

        queueNextRoundPromotion({ myCard: launchParams.serverCard });
        clearTransientLaunchState();

        const pendingId = Date.now();
        pendingCardIdRef.current = pendingId;

        const pendingCard = {
          id: pendingId,
          owner: 'mine' as const,
          card: launchParams.serverCard,
        };

        setPendingPlayedCard(pendingCard);
        pendingPlayedCardRef.current = pendingCard;

        pendingCardTimeoutRef.current = setTimeout(() => {
          if (pendingCardIdRef.current === pendingId) {
            clearTransientLaunchState();
          }
        }, PENDING_CARD_TIMEOUT_MS);

        return;
      }

      clearTransientLaunchState();
      setLaunchingCardKey(launchParams.cardKey);

      const pendingId = Date.now();
      pendingCardIdRef.current = pendingId;

      const pendingCard = {
        id: pendingId,
        owner: 'mine' as const,
        card: launchParams.serverCard,
      };

      setPendingPlayedCard(pendingCard);
      pendingPlayedCardRef.current = pendingCard;

      pendingCardTimeoutRef.current = setTimeout(() => {
        if (pendingCardIdRef.current === pendingId) {
          clearTransientLaunchState();
        }
      }, PENDING_CARD_TIMEOUT_MS);
    },
    [armOwnLanding, clearTransientLaunchState, closingTableCards.mine, queueNextRoundPromotion],
  );

  const registerIncomingPlayedCard = useCallback(
    ({ owner, card }: { owner: 'mine' | 'opponent' | null; card: string | null }) => {
      debugTableTransition('registerIncomingPlayedCard:start', {
        owner,
        card,
        tablePhase: tablePhaseRef.current,
        nextDecisionType: nextDecisionTypeRef.current,
        currentTurnSeatId: currentTurnSeatIdRef.current,
        isResolvingRound: isResolvingRoundRef.current,
        closingTableCards: {
          mine: closingTableCards.mine,
          opponent: closingTableCards.opponent,
        },
        pendingCardId: pendingCardIdRef.current,
        pendingPromotion: pendingPromotionRef.current,
      });

      clearTransientLaunchState();

      if (!owner || !card) {
        debugTableTransition('registerIncomingPlayedCard:ignored-empty', { owner, card });
        return;
      }

      const canAcceptIncomingCard =
        tablePhaseRef.current !== 'missing_context' && tablePhaseRef.current !== 'match_finished';

      if (!canAcceptIncomingCard) {
        debugTableTransition('registerIncomingPlayedCard:ignored-table-phase', {
          owner,
          card,
          tablePhase: tablePhaseRef.current,
        });
        return;
      }

      if (isResolvingRoundRef.current) {
        const handEnded =
          tablePhaseRef.current === 'hand_finished' ||
          tablePhaseRef.current === 'match_finished' ||
          nextDecisionTypeRef.current === 'start-next-hand' ||
          nextDecisionTypeRef.current === 'match-finished';
        const currentResolvedRoundAlreadyComplete =
          closingTableCards.mine !== null && closingTableCards.opponent !== null;
        const isDuplicateResolvedFrameCard =
          (owner === 'mine' && closingTableCards.mine === card) ||
          (owner === 'opponent' && closingTableCards.opponent === card);

        // PATCH 7.5 — Do not let the slow resolution hold swallow the next
        // round's opening card.
        //
        // After Patch 7.1, RESOLUTION_HOLD_MS became long enough that a bot can
        // legitimately open the next round while the previous round is still in
        // the visual hold. When the resolved frame already has BOTH cards,
        // any different incoming card cannot belong to that old round. Treat it
        // as the first card of the new round, interrupt the old hold, clear the
        // stale felt, and render/animate the card immediately. Otherwise the
        // card sits in pendingPromotion until a later timeout and can look like
        // it never flew to the table.
        if (currentResolvedRoundAlreadyComplete && !isDuplicateResolvedFrameCard && !handEnded) {
          debugTableTransition('registerIncomingPlayedCard:interrupt-resolution-for-next-round-card', {
            owner,
            card,
            closingTableCards,
            tablePhase: tablePhaseRef.current,
            nextDecisionType: nextDecisionTypeRef.current,
            currentTurnSeatId: currentTurnSeatIdRef.current,
          });

          resetForFreshRoundFrame();
          suppressResolvedRoundReplayRef.current = false;
          awaitingNextRoundOpeningRef.current = false;
          renderIncomingCard(owner, card, owner === 'opponent');

          if (owner === 'mine') {
            armOwnLanding();
          }

          return;
        }

        const shouldCompleteCurrentResolvedRound =
          (owner === 'mine' && closingTableCards.mine === null) ||
          (owner === 'opponent' && closingTableCards.opponent === null);

        if (shouldCompleteCurrentResolvedRound) {
          if (owner === 'mine') {
            markAcceptedCardForVisualSettle(owner, card);
            setDisplayedMyPlayedCard(card);
            setClosingTableCards((current) => ({
              ...current,
              mine: card,
            }));
            previousMyPlayedCardRef.current = card;
            myCardAcceptedViaEventRef.current = card;
            // PATCH A — own card arriving as a closing-frame card is also a
            // landing event; arm the window so the UI stays inert through
            // the visual settle.
            armOwnLanding();
            return;
          }

          markAcceptedCardForVisualSettle(owner, card);
          opponentCardAcceptedViaEventRef.current = card;
          setClosingTableCards((current) => ({
            ...current,
            opponent: card,
          }));
          // CHANGE (visual sombra na land do oponente): defer reveal so the
          // flight clone owns the entry animation.
          revealOpponentCard(card, false);
          return;
        }

        if (
          tablePhaseRef.current === 'hand_finished' ||
          tablePhaseRef.current === 'match_finished' ||
          nextDecisionTypeRef.current === 'start-next-hand' ||
          nextDecisionTypeRef.current === 'match-finished'
        ) {
          return;
        }

        queueNextRoundPromotion({
          ...(owner === 'mine' ? { myCard: card } : {}),
          ...(owner === 'opponent' ? { opponentCard: card } : {}),
        });
        return;
      }

      // CHANGE (visual sombra na land do oponente): pass immediate=false
      // for the opponent reveal here, so the slot waits CARD_REVEAL_DELAY_MS
      // before painting the authoritative card. With CARD_REVEAL_DELAY_MS
      // now ~420 ms (close to OpponentCardFlight's 460 ms), the flight clone
      // is the only visible card during the travel, and the slot lands at
      // the very end. Without this, the slot appeared at t=0 and overlapped
      // with the entire flight, reading as a "second shadow card".
      renderIncomingCard(owner, card, false);

      // PATCH A — when the owner is "mine" and we are NOT inside a resolving
      // round, the card was registered without a flight clone (e.g. server
      // echo of an own play after the local launch already animated). Make
      // sure the own-landing window is kept armed if it isn't already; if it
      // already was, this re-arm just bumps the deadline to the freshest
      // event, which is correct.
      if (owner === 'mine') {
        armOwnLanding();
      }
    },
    [
      armOwnLanding,
      clearTransientLaunchState,
      closingTableCards.mine,
      closingTableCards.opponent,
      markAcceptedCardForVisualSettle,
      queueNextRoundPromotion,
      renderIncomingCard,
      resetForFreshRoundFrame,
      revealOpponentCard,
    ],
  );

  const commitRoundResolution = useCallback(
    ({
      resolutionKey,
      myCard: resolvedMyCard,
      opponentCard: resolvedOpponentCard,
      roundResult,
      tableGeneration,
    }: GuardedRoundResolutionInput) => {
      debugTableTransition('commitRoundResolution:start', {
        resolutionKey,
        resolvedMyCard,
        resolvedOpponentCard,
        roundResult: roundResult ?? null,
        tableGeneration,
        currentTableGeneration: tableGenerationRef.current,
        suppressResolvedRoundReplay: suppressResolvedRoundReplayRef.current,
        tablePhase: tablePhaseRef.current,
        nextDecisionType: nextDecisionTypeRef.current,
        currentTurnSeatId: currentTurnSeatIdRef.current,
        isResolvingRound: isResolvingRoundRef.current,
        playedRoundsCount,
        previousResolvedRoundCount: previousResolvedRoundCountRef.current,
        lastResolvedRoundKey: lastResolvedRoundKeyRef.current,
        previousMyPlayedCard: previousMyPlayedCardRef.current,
        previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
        myCardAcceptedViaEvent: myCardAcceptedViaEventRef.current,
        opponentCardAcceptedViaEvent: opponentCardAcceptedViaEventRef.current,
        pendingPlayedCard: pendingPlayedCardRef.current,
        launchingCardKey: launchingCardKeyRef.current,
        pendingPromotion: pendingPromotionRef.current,
        lastAcceptedCardStamp: lastAcceptedCardStampRef.current,
      });

      if (!resolutionKey) {
        return;
      }

      if (tableGeneration !== tableGenerationRef.current) {
        debugTableTransition('commitRoundResolution:ignored-stale-generation', {
          resolutionKey,
          tableGeneration,
          currentTableGeneration: tableGenerationRef.current,
        });
        return;
      }

      if (suppressResolvedRoundReplayRef.current) {
        debugTableTransition('commitRoundResolution:ignored-replay-suppressed', {
          resolutionKey,
          tableGeneration,
          tablePhase: tablePhaseRef.current,
          nextDecisionType: nextDecisionTypeRef.current,
        });
        return;
      }

      if (lastResolvedRoundKeyRef.current === resolutionKey) {
        debugTableTransition('commitRoundResolution:ignored-duplicate', {
          resolutionKey,
          lastResolvedRoundKey: lastResolvedRoundKeyRef.current,
        });
        return;
      }

      pendingRoundResolutionRef.current = null;
      setHasPendingRoundResolution(false);
      clearResolutionSettleTimeout();
      lastResolvedRoundKeyRef.current = resolutionKey;
      previousResolvedRoundCountRef.current = playedRoundsCount;
      cancelOpponentReveal();
      clearRoundTransition();

      if (!resolvedMyCard && myCardAcceptedViaEventRef.current) {
        resolvedMyCard = myCardAcceptedViaEventRef.current;
      }

      if (!resolvedOpponentCard && opponentCardAcceptedViaEventRef.current) {
        resolvedOpponentCard = opponentCardAcceptedViaEventRef.current;
      }

      // NOTE: Freeze both cards at the exact resolution frame. From here until
      // the clean frame, the table must render from this symmetric snapshot,
      // not from transient slot/flight state. This prevents one side from
      // showing PERDEU while the winning side has already been hidden or reset.
      const resolvedSnapshot: ResolvedTableSnapshot = {
        resolutionKey,
        myCard: resolvedMyCard,
        opponentCard: resolvedOpponentCard,
        roundResult: roundResult ?? null,
      };
      resolvedTableSnapshotRef.current = resolvedSnapshot;

      setDisplayedMyPlayedCard(resolvedSnapshot.myCard);
      setDisplayedOpponentPlayedCard(resolvedSnapshot.opponentCard);
      previousMyPlayedCardRef.current = resolvedSnapshot.myCard;
      previousOpponentPlayedCardRef.current = resolvedSnapshot.opponentCard;
      myCardAcceptedViaEventRef.current = resolvedSnapshot.myCard;
      opponentCardAcceptedViaEventRef.current = resolvedSnapshot.opponentCard;

      setResolvedRoundResult(resolvedSnapshot.roundResult);
      setClosingTableCards({
        mine: resolvedSnapshot.myCard,
        opponent: resolvedSnapshot.opponentCard,
      });
      setIsResolvingRound(true);
      setRoundResolvedKey((current) => current + 1);
      pendingPromotionRef.current = { myCard: null, opponentCard: null };

      debugTableTransition('commitRoundResolution:committed', {
        resolutionKey,
        resolvedMyCard: resolvedSnapshot.myCard,
        resolvedOpponentCard: resolvedSnapshot.opponentCard,
        roundResult: resolvedSnapshot.roundResult,
        tableGeneration,
        closingCards: { mine: resolvedSnapshot.myCard, opponent: resolvedSnapshot.opponentCard },
      });

      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }

      closingTimeoutRef.current = setTimeout(() => {
        debugTableTransition('resolutionHoldTimeout:fired', {
          resolutionKey,
          isResolvingRound: isResolvingRoundRef.current,
          pendingPromotion: pendingPromotionRef.current,
          tablePhase: tablePhaseRef.current,
          nextDecisionType: nextDecisionTypeRef.current,
        });

        if (tableGeneration !== tableGenerationRef.current) {
          debugTableTransition('resolutionHoldTimeout:ignored-stale-generation', {
            resolutionKey,
            tableGeneration,
            currentTableGeneration: tableGenerationRef.current,
          });
          closingTimeoutRef.current = null;
          return;
        }

        if (isResolvingRoundRef.current) {
          flushPendingPromotion();
        }

        closingTimeoutRef.current = null;
      }, FELT_RESOLUTION_HOLD_MS);
    },
    [
      cancelOpponentReveal,
      clearResolutionSettleTimeout,
      clearRoundTransition,
      flushPendingPromotion,
      playedRoundsCount,
    ],
  );

  const getRoundResolutionSettleDelayMs = useCallback(() => {
    if (isResolvingRoundRef.current) {
      return 0;
    }

    const now = Date.now();
    const lastAcceptedCardStamp = lastAcceptedCardStampRef.current;
    const acceptedCardAge = lastAcceptedCardStamp
      ? now - lastAcceptedCardStamp.acceptedAt
      : Number.POSITIVE_INFINITY;
    const cardSettleRemaining = lastAcceptedCardStamp
      ? Math.max(0, CARD_SETTLE_BEFORE_RESOLUTION_MS - acceptedCardAge)
      : 0;

    // NOTE: A round resolution that arrives in the same socket burst as the
    // final card should not start its hold timer immediately. The visual table
    // first needs a small settle window so the card can be perceived as played.
    const hasUnsettledCardScene = Boolean(
      pendingPlayedCardRef.current ||
        launchingCardKeyRef.current ||
        opponentRevealTimeoutRef.current ||
        (lastAcceptedCardStamp && cardSettleRemaining > 0),
    );

    if (!hasUnsettledCardScene) {
      return 0;
    }

    return Math.max(cardSettleRemaining, CARD_REVEAL_DELAY_MS);
  }, []);

  const triggerRoundResolution = useCallback(
    (resolutionInput: RoundResolutionInput) => {
      const {
        resolutionKey,
        myCard: resolvedMyCard,
        opponentCard: resolvedOpponentCard,
        roundResult,
      } = resolutionInput;

      debugTableTransition('triggerRoundResolution:start', {
        resolutionKey,
        resolvedMyCard,
        resolvedOpponentCard,
        roundResult: roundResult ?? null,
        currentTableGeneration: tableGenerationRef.current,
        suppressResolvedRoundReplay: suppressResolvedRoundReplayRef.current,
        tablePhase: tablePhaseRef.current,
        nextDecisionType: nextDecisionTypeRef.current,
        currentTurnSeatId: currentTurnSeatIdRef.current,
        isResolvingRound: isResolvingRoundRef.current,
        playedRoundsCount,
        previousResolvedRoundCount: previousResolvedRoundCountRef.current,
        lastResolvedRoundKey: lastResolvedRoundKeyRef.current,
        previousMyPlayedCard: previousMyPlayedCardRef.current,
        previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
        myCardAcceptedViaEvent: myCardAcceptedViaEventRef.current,
        opponentCardAcceptedViaEvent: opponentCardAcceptedViaEventRef.current,
        pendingPlayedCard: pendingPlayedCardRef.current,
        launchingCardKey: launchingCardKeyRef.current,
        pendingRoundResolution: pendingRoundResolutionRef.current,
        pendingPromotion: pendingPromotionRef.current,
        lastAcceptedCardStamp: lastAcceptedCardStampRef.current,
      });

      if (!resolutionKey) {
        return;
      }

      if (suppressResolvedRoundReplayRef.current) {
        debugTableTransition('triggerRoundResolution:ignored-replay-suppressed', {
          resolutionKey,
          currentTableGeneration: tableGenerationRef.current,
          tablePhase: tablePhaseRef.current,
          nextDecisionType: nextDecisionTypeRef.current,
        });
        return;
      }

      if (lastResolvedRoundKeyRef.current === resolutionKey) {
        debugTableTransition('triggerRoundResolution:ignored-duplicate', {
          resolutionKey,
          lastResolvedRoundKey: lastResolvedRoundKeyRef.current,
        });
        return;
      }

      if (pendingRoundResolutionRef.current?.resolutionKey === resolutionKey) {
        debugTableTransition('triggerRoundResolution:ignored-queued-duplicate', {
          resolutionKey,
          pendingRoundResolution: pendingRoundResolutionRef.current,
        });
        return;
      }

      const guardedResolutionInput: GuardedRoundResolutionInput = {
        ...resolutionInput,
        tableGeneration: tableGenerationRef.current,
      };
      const settleDelayMs = getRoundResolutionSettleDelayMs();

      if (settleDelayMs > 0) {
        pendingRoundResolutionRef.current = guardedResolutionInput;
        setHasPendingRoundResolution(true);

        debugTableTransition('triggerRoundResolution:queued-for-card-settle', {
          resolutionKey,
          settleDelayMs,
          pendingPlayedCard: pendingPlayedCardRef.current,
          launchingCardKey: launchingCardKeyRef.current,
          opponentRevealPending: opponentRevealTimeoutRef.current !== null,
          lastAcceptedCardStamp: lastAcceptedCardStampRef.current,
        });

        clearResolutionSettleTimeout();
        resolutionSettleTimeoutRef.current = setTimeout(() => {
          const queuedResolution = pendingRoundResolutionRef.current;
          resolutionSettleTimeoutRef.current = null;

          if (!queuedResolution) {
            return;
          }

          if (queuedResolution.tableGeneration !== tableGenerationRef.current) {
            debugTableTransition('triggerRoundResolution:ignored-stale-queued-generation', {
              resolutionKey: queuedResolution.resolutionKey,
              tableGeneration: queuedResolution.tableGeneration,
              currentTableGeneration: tableGenerationRef.current,
            });
            pendingRoundResolutionRef.current = null;
            setHasPendingRoundResolution(false);
            return;
          }

          if (suppressResolvedRoundReplayRef.current) {
            debugTableTransition('triggerRoundResolution:ignored-suppressed-queued-resolution', {
              resolutionKey: queuedResolution.resolutionKey,
              tableGeneration: queuedResolution.tableGeneration,
              tablePhase: tablePhaseRef.current,
              nextDecisionType: nextDecisionTypeRef.current,
            });
            pendingRoundResolutionRef.current = null;
            setHasPendingRoundResolution(false);
            return;
          }

          debugTableTransition('triggerRoundResolution:flushing-settled-card-resolution', {
            resolutionKey: queuedResolution.resolutionKey,
            tablePhase: tablePhaseRef.current,
            nextDecisionType: nextDecisionTypeRef.current,
            pendingPlayedCard: pendingPlayedCardRef.current,
            launchingCardKey: launchingCardKeyRef.current,
            lastAcceptedCardStamp: lastAcceptedCardStampRef.current,
          });

          commitRoundResolution(queuedResolution);
        }, settleDelayMs);

        return;
      }

      commitRoundResolution(guardedResolutionInput);
    },
    [
      clearResolutionSettleTimeout,
      commitRoundResolution,
      getRoundResolutionSettleDelayMs,
      playedRoundsCount,
    ],
  );

  const stopRoundResolution = useCallback(() => {
    debugTableTransition('stopRoundResolution', {
      tablePhase: tablePhaseRef.current,
      nextDecisionType: nextDecisionTypeRef.current,
      isResolvingRound: isResolvingRoundRef.current,
      closingTimeoutPending: closingTimeoutRef.current !== null,
      pendingPromotion: pendingPromotionRef.current,
    });

    clearResolutionSettleTimeout();
    pendingRoundResolutionRef.current = null;
    setHasPendingRoundResolution(false);

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    if (isResolvingRoundRef.current) {
      flushPendingPromotion();
    }
  }, [clearResolutionSettleTimeout, flushPendingPromotion]);

  useEffect(() => {
    if (!latestRoundFinished || playedRoundsCount === 0) {
      return;
    }

    if (awaitingNextRoundOpeningRef.current) {
      return;
    }

    // CHANGE (cards persisting across hands): if a fresh-hand transition is
    // in flight, the view-model's latestRound is briefly stale (still points
    // at the previous hand). Skip the fallback resolution until the
    // authoritative new-hand state arrives and clears the suppression.
    if (suppressResolvedRoundReplayRef.current) {
      return;
    }

    const alreadyResolvedCurrentRound =
      previousResolvedRoundCountRef.current === playedRoundsCount ||
      Boolean(lastResolvedRoundKeyRef.current);

    if (alreadyResolvedCurrentRound) {
      return;
    }

    const fallbackResolutionKey = [
      'snapshot',
      playedRoundsCount,
      myPlayedCard ?? 'null',
      opponentPlayedCard ?? 'null',
    ].join('|');

    triggerRoundResolution({
      resolutionKey: fallbackResolutionKey,
      myCard: displayedMyPlayedCard ?? myPlayedCard,
      opponentCard:
        displayedOpponentPlayedCard ??
        opponentPlayedCard ??
        opponentCardAcceptedViaEventRef.current,
      roundResult: null,
    });
  }, [
    displayedMyPlayedCard,
    displayedOpponentPlayedCard,
    latestRoundFinished,
    myPlayedCard,
    opponentPlayedCard,
    playedRoundsCount,
    triggerRoundResolution,
  ]);

  useEffect(() => {
    if (!latestRoundFinished && playedRoundsCount !== previousResolvedRoundCountRef.current) {
      lastResolvedRoundKeyRef.current = null;
    }
  }, [latestRoundFinished, playedRoundsCount]);

  useEffect(() => {
    const shouldClearDisplayedMyCard =
      myPlayedCard === null &&
      displayedMyPlayedCard !== null &&
      !isResolvingRoundRef.current &&
      tablePhase === 'playing';

    if (!shouldClearDisplayedMyCard) {
      return;
    }

    const isClearedRoundMyCard = clearedRoundCardsRef.current.mine === displayedMyPlayedCard;

    if (
      !isClearedRoundMyCard &&
      myCardAcceptedViaEventRef.current !== null &&
      myCardAcceptedViaEventRef.current === displayedMyPlayedCard
    ) {
      return;
    }

    debugTableTransition('directClearDisplayedMyCard', {
      reason: 'myPlayedCard-null-while-playing',
      displayedMyPlayedCard,
      myPlayedCard,
      tablePhase,
      isResolvingRound: isResolvingRoundRef.current,
      myCardAcceptedViaEvent: myCardAcceptedViaEventRef.current,
    });

    setDisplayedMyPlayedCard(null);
    previousMyPlayedCardRef.current = null;
    myCardAcceptedViaEventRef.current = null;
  }, [displayedMyPlayedCard, myPlayedCard, tablePhase]);

  useEffect(() => {
    const shouldClearDisplayedOpponentCard =
      opponentPlayedCard === null &&
      displayedOpponentPlayedCard !== null &&
      !isResolvingRoundRef.current &&
      tablePhase === 'playing';

    if (!shouldClearDisplayedOpponentCard) {
      return;
    }

    const isClearedRoundOpponentCard =
      clearedRoundCardsRef.current.opponent === displayedOpponentPlayedCard;

    if (
      !isClearedRoundOpponentCard &&
      opponentCardAcceptedViaEventRef.current !== null &&
      opponentCardAcceptedViaEventRef.current === displayedOpponentPlayedCard
    ) {
      return;
    }

    debugTableTransition('directClearDisplayedOpponentCard', {
      reason: 'opponentPlayedCard-null-while-playing',
      displayedOpponentPlayedCard,
      opponentPlayedCard,
      tablePhase,
      isResolvingRound: isResolvingRoundRef.current,
      opponentCardAcceptedViaEvent: opponentCardAcceptedViaEventRef.current,
    });

    cancelOpponentReveal();
    setDisplayedOpponentPlayedCard(null);
    previousOpponentPlayedCardRef.current = null;
    opponentCardAcceptedViaEventRef.current = null;
  }, [cancelOpponentReveal, displayedOpponentPlayedCard, opponentPlayedCard, tablePhase]);

  useEffect(() => {
    const shouldClearBothDisplayedCards =
      myPlayedCard === null &&
      opponentPlayedCard === null &&
      (displayedMyPlayedCard !== null || displayedOpponentPlayedCard !== null) &&
      !isResolvingRoundRef.current &&
      tablePhase === 'playing';

    if (!shouldClearBothDisplayedCards) {
      return;
    }

    const myProtected =
      clearedRoundCardsRef.current.mine !== displayedMyPlayedCard &&
      myCardAcceptedViaEventRef.current !== null &&
      myCardAcceptedViaEventRef.current === displayedMyPlayedCard;
    const opponentProtected =
      clearedRoundCardsRef.current.opponent !== displayedOpponentPlayedCard &&
      opponentCardAcceptedViaEventRef.current !== null &&
      opponentCardAcceptedViaEventRef.current === displayedOpponentPlayedCard;

    if (myProtected || opponentProtected) {
      return;
    }

    debugTableTransition('directClearBothDisplayedCards', {
      reason: 'both-authoritative-cards-null-while-playing',
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      myPlayedCard,
      opponentPlayedCard,
      tablePhase,
      isResolvingRound: isResolvingRoundRef.current,
      myCardAcceptedViaEvent: myCardAcceptedViaEventRef.current,
      opponentCardAcceptedViaEvent: opponentCardAcceptedViaEventRef.current,
    });

    cancelOpponentReveal();
    setDisplayedMyPlayedCard(null);
    setDisplayedOpponentPlayedCard(null);
    previousMyPlayedCardRef.current = null;
    previousOpponentPlayedCardRef.current = null;
    myCardAcceptedViaEventRef.current = null;
    opponentCardAcceptedViaEventRef.current = null;
  }, [
    cancelOpponentReveal,
    displayedMyPlayedCard,
    displayedOpponentPlayedCard,
    myPlayedCard,
    opponentPlayedCard,
    tablePhase,
  ]);

  useEffect(() => {
    if (!myPlayedCard) {
      return;
    }

    if (
      awaitingNextRoundOpeningRef.current ||
      (suppressResolvedRoundReplayRef.current && latestRoundFinished)
    ) {
      return;
    }

    if (
      !isResolvingRoundRef.current &&
      tablePhaseRef.current === 'playing' &&
      clearedRoundCardsRef.current.mine === myPlayedCard
    ) {
      debugTableTransition('propSync:ignored-cleared-my-card', {
        myPlayedCard,
        clearedRoundCards: clearedRoundCardsRef.current,
        tablePhase: tablePhaseRef.current,
        latestRoundFinished,
      });
      return;
    }

    if (myCardAcceptedViaEventRef.current === myPlayedCard) {
      return;
    }

    const isNewMyCard = myPlayedCard !== previousMyPlayedCardRef.current;
    if (!isNewMyCard) {
      return;
    }

    if (isResolvingRoundRef.current) {
      const shouldCompleteCurrentResolvedRound = closingTableCards.mine === null;

      if (shouldCompleteCurrentResolvedRound) {
        markAcceptedCardForVisualSettle('mine', myPlayedCard);
        setDisplayedMyPlayedCard(myPlayedCard);
        setClosingTableCards((current) => ({
          ...current,
          mine: myPlayedCard,
        }));
        previousMyPlayedCardRef.current = myPlayedCard;
        myCardAcceptedViaEventRef.current = myPlayedCard;
        return;
      }

      if (
        tablePhaseRef.current === 'hand_finished' ||
        tablePhaseRef.current === 'match_finished' ||
        nextDecisionTypeRef.current === 'start-next-hand' ||
        nextDecisionTypeRef.current === 'match-finished'
      ) {
        return;
      }

      queueNextRoundPromotion({ myCard: myPlayedCard });
      return;
    }

    markAcceptedCardForVisualSettle('mine', myPlayedCard);
    setDisplayedMyPlayedCard(myPlayedCard);
    previousMyPlayedCardRef.current = myPlayedCard;
    myCardAcceptedViaEventRef.current = myPlayedCard;
  }, [
    closingTableCards.mine,
    latestRoundFinished,
    markAcceptedCardForVisualSettle,
    myPlayedCard,
    queueNextRoundPromotion,
  ]);

  useEffect(() => {
    if (!opponentPlayedCard) {
      return;
    }

    if (
      awaitingNextRoundOpeningRef.current ||
      (suppressResolvedRoundReplayRef.current && latestRoundFinished)
    ) {
      return;
    }

    if (
      !isResolvingRoundRef.current &&
      tablePhaseRef.current === 'playing' &&
      clearedRoundCardsRef.current.opponent === opponentPlayedCard
    ) {
      debugTableTransition('propSync:ignored-cleared-opponent-card', {
        opponentPlayedCard,
        clearedRoundCards: clearedRoundCardsRef.current,
        tablePhase: tablePhaseRef.current,
        latestRoundFinished,
      });
      return;
    }

    if (opponentCardAcceptedViaEventRef.current === opponentPlayedCard) {
      return;
    }

    const isNewOpponentCard = opponentPlayedCard !== previousOpponentPlayedCardRef.current;
    if (!isNewOpponentCard) {
      return;
    }

    if (isResolvingRoundRef.current) {
      const shouldCompleteCurrentResolvedRound = closingTableCards.opponent === null;

      if (shouldCompleteCurrentResolvedRound) {
        markAcceptedCardForVisualSettle('opponent', opponentPlayedCard);
        opponentCardAcceptedViaEventRef.current = opponentPlayedCard;
        setClosingTableCards((current) => ({
          ...current,
          opponent: opponentPlayedCard,
        }));
        // CHANGE (visual sombra na land do oponente): defer reveal by
        // CARD_REVEAL_DELAY_MS so the flight clone owns the entry animation.
        revealOpponentCard(opponentPlayedCard, false);
        return;
      }

      if (
        tablePhaseRef.current === 'hand_finished' ||
        tablePhaseRef.current === 'match_finished' ||
        nextDecisionTypeRef.current === 'start-next-hand' ||
        nextDecisionTypeRef.current === 'match-finished'
      ) {
        return;
      }

      queueNextRoundPromotion({ opponentCard: opponentPlayedCard });
      return;
    }

    markAcceptedCardForVisualSettle('opponent', opponentPlayedCard);
    // CHANGE (visual sombra na land do oponente): defer reveal so the flight
    // clone owns the entry animation. The slot lands ~40 ms before the flight
    // exits, producing a clean single-card landing.
    revealOpponentCard(opponentPlayedCard, false);
    opponentCardAcceptedViaEventRef.current = opponentPlayedCard;
  }, [
    closingTableCards.opponent,
    latestRoundFinished,
    opponentPlayedCard,
    markAcceptedCardForVisualSettle,
    queueNextRoundPromotion,
    revealOpponentCard,
  ]);

  useEffect(() => {
    if (tablePhase === 'missing_context') {
      debugTableTransition('tablePhaseEffect:missing_context', { tablePhase });
      beginHandTransition();
      return;
    }

    if (tablePhase === 'waiting') {
      const shouldResetWaitingTable =
        previousMyPlayedCardRef.current === null &&
        previousOpponentPlayedCardRef.current === null &&
        !isResolvingRoundRef.current;

      debugTableTransition('tablePhaseEffect:waiting', {
        tablePhase,
        shouldResetWaitingTable,
        previousMyPlayedCard: previousMyPlayedCardRef.current,
        previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
        isResolvingRound: isResolvingRoundRef.current,
      });

      if (shouldResetWaitingTable) {
        beginHandTransition();
      }

      return;
    }

    if (tablePhase === 'hand_finished' || tablePhase === 'match_finished') {
      debugTableTransition('tablePhaseEffect:terminal-phase-preserved', {
        tablePhase,
        previousMyPlayedCard: previousMyPlayedCardRef.current,
        previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
        isResolvingRound: isResolvingRoundRef.current,
        nextDecisionType: nextDecisionTypeRef.current,
      });

      // NOTE: Do not clear the table here.
      // The final resolved round must remain visible so the winner/climax
      // can be rendered before the next semantic transition resets the stage.
      return;
    }
  }, [beginHandTransition, tablePhase]);

  useEffect(() => {
    return () => {
      cancelOpponentReveal();
      clearRoundTransition();
      clearResolutionSettleTimeout();
      // PATCH A — clean up landing timers on unmount so timers cannot fire
      // setState after the hook is gone.
      clearOpponentLandingTimeout();
      clearOwnLandingTimeout();

      if (pendingCardTimeoutRef.current) {
        clearTimeout(pendingCardTimeoutRef.current);
      }

      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }
    };
  }, [
    cancelOpponentReveal,
    clearOpponentLandingTimeout,
    clearOwnLandingTimeout,
    clearResolutionSettleTimeout,
    clearRoundTransition,
  ]);

  const isLiveTableFrame = useMemo(
    () => tablePhase === 'playing' || tablePhase === 'hand_finished',
    [tablePhase],
  );

  const resolvedRoundFinished = useMemo(
    () =>
      Boolean(
        isResolvingRound ||
          hasPendingRoundResolution ||
          closingTableCards.mine !== null ||
          closingTableCards.opponent !== null,
      ),
    [
      closingTableCards.mine,
      closingTableCards.opponent,
      hasPendingRoundResolution,
      isResolvingRound,
    ],
  );

  // PATCH A — Aggregate landing flag. Consumed by matchPage to extend the
  // playable-UI suppression so the hand dock, "Em turno" badge, and action
  // bar stay inert for the entire flight window — not just for the
  // round-resolution hold.
  const isAnyCardLandingInProgress = useMemo(
    () => isOpponentLandingInProgress || isOwnLandingInProgress,
    [isOpponentLandingInProgress, isOwnLandingInProgress],
  );

  return useMemo(
    () => ({
      launchingCardKey,
      pendingPlayedCard,
      closingTableCards,
      opponentRevealKey,
      roundIntroKey,
      roundResolvedKey,
      isResolvingRound,
      hasPendingRoundResolution,
      resolvedRoundFinished,
      isLiveTableFrame,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      resolvedRoundResult,
      isOpponentLandingInProgress,
      isOwnLandingInProgress,
      isAnyCardLandingInProgress,
      beginHandTransition,
      beginOwnCardLaunch,
      registerIncomingPlayedCard,
      triggerRoundResolution,
      stopRoundResolution,
    }),
    [
      beginHandTransition,
      beginOwnCardLaunch,
      closingTableCards,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      hasPendingRoundResolution,
      isAnyCardLandingInProgress,
      isLiveTableFrame,
      isOpponentLandingInProgress,
      isOwnLandingInProgress,
      isResolvingRound,
      launchingCardKey,
      opponentRevealKey,
      pendingPlayedCard,
      registerIncomingPlayedCard,
      resolvedRoundFinished,
      resolvedRoundResult,
      roundIntroKey,
      roundResolvedKey,
      stopRoundResolution,
      triggerRoundResolution,
    ],
  );}
