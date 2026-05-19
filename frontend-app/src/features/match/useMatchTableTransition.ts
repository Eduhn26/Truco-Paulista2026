import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  CARD_REVEAL_DELAY_MS,
  CARD_SETTLE_BEFORE_RESOLUTION_MS,
  NEXT_ROUND_CLEAN_FRAME_MS,
  PENDING_CARD_TIMEOUT_MS,
  RESOLUTION_HOLD_MS,
} from './timing';

// Keep the resolved table pinned long enough for card flights to hand off to
// real slots before outcome badges become readable.
const FELT_RESOLUTION_HOLD_MS = Math.max(RESOLUTION_HOLD_MS, 1800);

// Mirrors the flight handoff window from the player and opponent flight components.
const FLIGHT_LANDING_WINDOW_MS = 590;
// Covers RAF and React scheduling jitter before the landing guard is released.
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
  // True while the corresponding flight clone is still visually settling.
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
  // Authoritative props can echo previous-round cards for a frame after the
  // felt has already been cleared for the next round.
  const clearedRoundCardsRef = useRef<ClosingTableCards>({ mine: null, opponent: null });
  const resolvedTableSnapshotRef = useRef<ResolvedTableSnapshot | null>(null);
  const tableGenerationRef = useRef(0);

  // Owner-specific timers keep controls inert until each flight clone settles.
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
    // Release replay suppression only after the authoritative state leaves the
    // finished-round frame. Count changes alone can still belong to a stale hand.
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
    // Fresh-round resets cancel landing guards from the previous trick.
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

      // The landing guard starts with the flight, even when the slot reveal is delayed.
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
        // Final table cards stay visible until the next-hand transition clears them.
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
      // Final table cards stay visible until the next-hand transition clears them.
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
        // A card queued during the previous hold belongs to the next round;
        // reveal it immediately after the fresh frame reset.
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
    // New-hand snapshots can arrive one frame after the visual reset, so replay
    // stays suppressed until the authoritative empty-round state arrives.
    suppressResolvedRoundReplayRef.current = true;
    awaitingNextRoundOpeningRef.current = false;
    pendingPromotionRef.current = { myCard: null, opponentCard: null };
    clearedRoundCardsRef.current = { mine: null, opponent: null };
    lastAcceptedCardStampRef.current = null;
    // Flights from a previous hand cannot leak into a new hand.
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

      // The local flight starts before the server echo, so the guard starts here.
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

      if (!owner || !card) {
        clearTransientLaunchState();
        debugTableTransition('registerIncomingPlayedCard:ignored-empty', { owner, card });
        return;
      }

      const canAcceptIncomingCard =
        tablePhaseRef.current !== 'missing_context' && tablePhaseRef.current !== 'match_finished';

      if (!canAcceptIncomingCard) {
        clearTransientLaunchState();
        debugTableTransition('registerIncomingPlayedCard:ignored-table-phase', {
          owner,
          card,
          tablePhase: tablePhaseRef.current,
        });
        return;
      }

      const isDuplicateOpponentCard = Boolean(
        owner === 'opponent' &&
          (opponentCardAcceptedViaEventRef.current === card ||
            previousOpponentPlayedCardRef.current === card ||
            closingTableCards.opponent === card ||
            displayedOpponentPlayedCard === card),
      );

      if (isDuplicateOpponentCard) {
        debugTableTransition('registerIncomingPlayedCard:ignored-duplicate-opponent-card', {
          owner,
          card,
          displayedOpponentPlayedCard,
          previousOpponentPlayedCard: previousOpponentPlayedCardRef.current,
          opponentCardAcceptedViaEvent: opponentCardAcceptedViaEventRef.current,
          closingOpponentCard: closingTableCards.opponent,
          tablePhase: tablePhaseRef.current,
          nextDecisionType: nextDecisionTypeRef.current,
        });
        return;
      }

      clearTransientLaunchState();

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

        // Once both resolved cards are frozen, a different incoming card belongs to
        // the next round and must interrupt the old hold.
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
            // Closing-frame own cards still keep controls inert through the settle.
            armOwnLanding();
            return;
          }

          markAcceptedCardForVisualSettle(owner, card);
          opponentCardAcceptedViaEventRef.current = card;
          setClosingTableCards((current) => ({
            ...current,
            opponent: card,
          }));
          // Delayed slot reveal lets the flight clone own the landing animation.
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

      // Delaying opponent slot paint prevents a duplicate shadow card during flight.
      renderIncomingCard(owner, card, false);

      // Server echoes can arrive without a fresh local flight; keep the guard armed.
      if (owner === 'mine') {
        armOwnLanding();
      }
    },
    [
      armOwnLanding,
      clearTransientLaunchState,
      closingTableCards.mine,
      closingTableCards.opponent,
      displayedOpponentPlayedCard,
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

      // Freeze the resolution frame so both outcome badges render from one snapshot.
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

    // Same-burst resolutions wait for the final card to settle before the hold.
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

    // During a new-hand reset, latestRound can still point at the previous hand.
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
        // Delayed slot reveal lets the flight clone own the landing animation.
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
    // Delayed slot reveal keeps the flight clone as the only moving opponent card.
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

      // Preserve the final table until the hand or match climax consumes it.
      return;
    }
  }, [beginHandTransition, tablePhase]);

  useEffect(() => {
    return () => {
      cancelOpponentReveal();
      clearRoundTransition();
      clearResolutionSettleTimeout();
      // Prevent landing timers from updating state after unmount.
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

  // Used by matchPage to keep controls inert during any card flight.
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