import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  isLiveTableFrame: boolean;
  displayedMyPlayedCard: string | null;
  displayedOpponentPlayedCard: string | null;
  beginHandTransition: () => void;
  beginOwnCardLaunch: (params: { cardKey: string; serverCard: string }) => void;
  registerIncomingPlayedCard: (params: {
    owner: 'mine' | 'opponent' | null;
    card: string | null;
  }) => void;
  stopRoundResolution: () => void;
};

const CARD_REVEAL_DELAY_MS = 220;
const PENDING_CARD_TIMEOUT_MS = 2000;
const RESOLUTION_CLEANUP_DELAY_MS = 2000;
const ROUND_TRANSITION_DELAY_MS = 320;
const OPPONENT_OPENING_ROUND_DELAY_MS = 640;

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
  const tablePhaseRef = useRef(tablePhase);
  const nextDecisionTypeRef = useRef<string | null>(nextDecisionType);
  const currentTurnSeatIdRef = useRef<string | null>(currentTurnSeatId);
  const opponentRevealTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roundTransitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCardIdRef = useRef<number | null>(null);
  const opponentCardAcceptedViaEventRef = useRef<string | null>(null);
  const myCardAcceptedViaEventRef = useRef<string | null>(null);
  const suppressResolvedRoundReplayRef = useRef(false);
  const awaitingNextRoundOpeningRef = useRef(false);
  const pendingPromotionRef = useRef<PendingPromotionState>({
    myCard: null,
    opponentCard: null,
  });

  const [launchingCardKey, setLaunchingCardKey] = useState<string | null>(null);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<PendingPlayedCard | null>(null);
  const [displayedMyPlayedCard, setDisplayedMyPlayedCard] = useState<string | null>(myPlayedCard);
  const [displayedOpponentPlayedCard, setDisplayedOpponentPlayedCard] = useState<string | null>(
    opponentPlayedCard,
  );
  const [opponentRevealKey, setOpponentRevealKey] = useState(0);
  const [roundIntroKey, setRoundIntroKey] = useState(0);
  const [roundResolvedKey, setRoundResolvedKey] = useState(0);
  const [isResolvingRound, setIsResolvingRound] = useState(false);
  const [closingTableCards, setClosingTableCards] = useState<ClosingTableCards>({
    mine: null,
    opponent: null,
  });

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

  useEffect(() => {
    const shouldReleaseReplaySuppression =
      (!latestRoundFinished || playedRoundsCount !== previousResolvedRoundCountRef.current) &&
      !awaitingNextRoundOpeningRef.current;

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

  const clearTransientLaunchState = useCallback(() => {
    if (pendingCardTimeoutRef.current) {
      clearTimeout(pendingCardTimeoutRef.current);
      pendingCardTimeoutRef.current = null;
    }

    setPendingPlayedCard(null);
    setLaunchingCardKey(null);
    pendingCardIdRef.current = null;
  }, []);

  const resetForFreshRoundFrame = useCallback(() => {
    console.log('[transition][resetForFreshRoundFrame]', {
      previousMy: previousMyPlayedCardRef.current,
      previousOpponent: previousOpponentPlayedCardRef.current,
      isResolvingRound: isResolvingRoundRef.current,
    });

    cancelOpponentReveal();
    clearRoundTransition();

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    setDisplayedMyPlayedCard(null);
    setDisplayedOpponentPlayedCard(null);
    setClosingTableCards({ mine: null, opponent: null });
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
    previousMyPlayedCardRef.current = null;
    previousOpponentPlayedCardRef.current = null;
    opponentCardAcceptedViaEventRef.current = null;
    myCardAcceptedViaEventRef.current = null;
  }, [cancelOpponentReveal, clearRoundTransition]);

  const revealOpponentCard = useCallback(
    (card: string, immediate: boolean) => {
      cancelOpponentReveal();

      const reveal = () => {
        console.log('[transition][revealOpponentCard]', {
          card,
          immediate,
        });

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
    [cancelOpponentReveal],
  );

  const flushPendingPromotion = useCallback(() => {
    const nextPromotion = pendingPromotionRef.current;
    const hasPendingPromotion =
      nextPromotion.myCard !== null || nextPromotion.opponentCard !== null;

    console.log('[transition][flushPendingPromotion]', {
      nextPromotion,
      hasPendingPromotion,
      tablePhase: tablePhaseRef.current,
      nextDecisionType: nextDecisionTypeRef.current,
      currentTurnSeatId: currentTurnSeatIdRef.current,
    });

    if (!hasPendingPromotion) {
      const shouldAwaitNextRoundOpening =
        tablePhaseRef.current === 'playing' &&
        nextDecisionTypeRef.current === 'play-card' &&
        currentTurnSeatIdRef.current !== null;

      if (shouldAwaitNextRoundOpening) {
        suppressResolvedRoundReplayRef.current = true;
        awaitingNextRoundOpeningRef.current = true;
        resetForFreshRoundFrame();
      } else {
        if (closingTimeoutRef.current) {
          clearTimeout(closingTimeoutRef.current);
          closingTimeoutRef.current = null;
        }

        awaitingNextRoundOpeningRef.current = false;
        setIsResolvingRound(false);
      }

      pendingPromotionRef.current = { myCard: null, opponentCard: null };
      return;
    }

    const shouldSlowOpponentOpening =
      nextPromotion.myCard === null && nextPromotion.opponentCard !== null;
    const transitionDelay = shouldSlowOpponentOpening
      ? OPPONENT_OPENING_ROUND_DELAY_MS
      : ROUND_TRANSITION_DELAY_MS;

    suppressResolvedRoundReplayRef.current = false;
    awaitingNextRoundOpeningRef.current = false;
    resetForFreshRoundFrame();

    roundTransitionTimeoutRef.current = setTimeout(() => {
      const promotionToApply = pendingPromotionRef.current;

      console.log('[transition][applyPendingPromotion]', {
        promotionToApply,
        transitionDelay,
        shouldSlowOpponentOpening,
      });

      if (promotionToApply.myCard) {
        setDisplayedMyPlayedCard(promotionToApply.myCard);
        previousMyPlayedCardRef.current = promotionToApply.myCard;
        myCardAcceptedViaEventRef.current = promotionToApply.myCard;
      }

      if (promotionToApply.opponentCard) {
        revealOpponentCard(promotionToApply.opponentCard, false);
        opponentCardAcceptedViaEventRef.current = promotionToApply.opponentCard;
      }

      pendingPromotionRef.current = { myCard: null, opponentCard: null };
      roundTransitionTimeoutRef.current = null;
    }, transitionDelay);
  }, [resetForFreshRoundFrame, revealOpponentCard]);

  const queueNextRoundPromotion = useCallback((nextState: Partial<PendingPromotionState>) => {
    pendingPromotionRef.current = {
      myCard:
        nextState.myCard !== undefined ? nextState.myCard : pendingPromotionRef.current.myCard,
      opponentCard:
        nextState.opponentCard !== undefined
          ? nextState.opponentCard
          : pendingPromotionRef.current.opponentCard,
    };

    console.log('[transition][queueNextRoundPromotion]', {
      nextPromotion: pendingPromotionRef.current,
      isResolvingRound: isResolvingRoundRef.current,
    });
  }, []);

  const renderIncomingCard = useCallback(
    (owner: PlayedCardOwner, card: string, immediateOpponentReveal: boolean) => {
      suppressResolvedRoundReplayRef.current = false;
      awaitingNextRoundOpeningRef.current = false;

      if (owner === 'mine') {
        setDisplayedMyPlayedCard(card);
        previousMyPlayedCardRef.current = card;
        myCardAcceptedViaEventRef.current = card;
        return;
      }

      opponentCardAcceptedViaEventRef.current = card;
      revealOpponentCard(card, immediateOpponentReveal);
    },
    [revealOpponentCard],
  );

  const beginHandTransition = useCallback(() => {
    cancelOpponentReveal();
    clearTransientLaunchState();
    clearRoundTransition();

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    setDisplayedMyPlayedCard(null);
    setDisplayedOpponentPlayedCard(null);
    setClosingTableCards({ mine: null, opponent: null });
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
    previousMyPlayedCardRef.current = null;
    previousOpponentPlayedCardRef.current = null;
    previousResolvedRoundCountRef.current = 0;
    opponentCardAcceptedViaEventRef.current = null;
    myCardAcceptedViaEventRef.current = null;
    suppressResolvedRoundReplayRef.current = false;
    awaitingNextRoundOpeningRef.current = false;
    pendingPromotionRef.current = { myCard: null, opponentCard: null };
  }, [cancelOpponentReveal, clearRoundTransition, clearTransientLaunchState]);

  const beginOwnCardLaunch = useCallback(
    (launchParams: { cardKey: string; serverCard: string }) => {
      suppressResolvedRoundReplayRef.current = false;
      awaitingNextRoundOpeningRef.current = false;

      if (isResolvingRoundRef.current) {
        queueNextRoundPromotion({ myCard: launchParams.serverCard });
        clearTransientLaunchState();

        const pendingId = Date.now();
        pendingCardIdRef.current = pendingId;

        setPendingPlayedCard({
          id: pendingId,
          owner: 'mine',
          card: launchParams.serverCard,
        });

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

      setPendingPlayedCard({
        id: pendingId,
        owner: 'mine',
        card: launchParams.serverCard,
      });

      pendingCardTimeoutRef.current = setTimeout(() => {
        if (pendingCardIdRef.current === pendingId) {
          clearTransientLaunchState();
        }
      }, PENDING_CARD_TIMEOUT_MS);
    },
    [clearTransientLaunchState, queueNextRoundPromotion],
  );

  const registerIncomingPlayedCard = useCallback(
    ({ owner, card }: { owner: 'mine' | 'opponent' | null; card: string | null }) => {
      clearTransientLaunchState();

      if (!owner || !card) {
        return;
      }

      console.log('[transition][registerIncomingPlayedCard]', {
        owner,
        card,
        tablePhase: tablePhaseRef.current,
        isResolvingRound: isResolvingRoundRef.current,
        previousMy: previousMyPlayedCardRef.current,
        previousOpponent: previousOpponentPlayedCardRef.current,
      });

      const canAcceptIncomingCard =
        tablePhaseRef.current !== 'missing_context' && tablePhaseRef.current !== 'match_finished';

      if (!canAcceptIncomingCard) {
        return;
      }

      if (isResolvingRoundRef.current) {
        queueNextRoundPromotion({
          ...(owner === 'mine' ? { myCard: card } : {}),
          ...(owner === 'opponent' ? { opponentCard: card } : {}),
        });
        return;
      }

      renderIncomingCard(owner, card, false);
    },
    [clearTransientLaunchState, queueNextRoundPromotion, renderIncomingCard],
  );

  const stopRoundResolution = useCallback(() => {
    flushPendingPromotion();
  }, [flushPendingPromotion]);

  useEffect(() => {
    if (!latestRoundFinished || playedRoundsCount === 0) {
      return;
    }

    if (previousResolvedRoundCountRef.current === playedRoundsCount) {
      return;
    }

    previousResolvedRoundCountRef.current = playedRoundsCount;
    cancelOpponentReveal();
    clearRoundTransition();

    const resolvedMyPlayedCard = displayedMyPlayedCard ?? myPlayedCard;
    const resolvedOpponentPlayedCard = displayedOpponentPlayedCard ?? opponentPlayedCard;

    console.log('[transition][roundResolved]', {
      playedRoundsCount,
      latestRoundFinished,
      resolvedMyPlayedCard,
      resolvedOpponentPlayedCard,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      myPlayedCard,
      opponentPlayedCard,
      tablePhase,
      nextDecisionType,
      currentTurnSeatId,
    });

    if (resolvedMyPlayedCard) {
      setDisplayedMyPlayedCard(resolvedMyPlayedCard);
      previousMyPlayedCardRef.current = resolvedMyPlayedCard;
      myCardAcceptedViaEventRef.current = resolvedMyPlayedCard;
    }

    if (resolvedOpponentPlayedCard) {
      setDisplayedOpponentPlayedCard(resolvedOpponentPlayedCard);
      previousOpponentPlayedCardRef.current = resolvedOpponentPlayedCard;
      opponentCardAcceptedViaEventRef.current = resolvedOpponentPlayedCard;
    }

    setClosingTableCards({
      mine: resolvedMyPlayedCard,
      opponent: resolvedOpponentPlayedCard,
    });
    setIsResolvingRound(true);
    setRoundResolvedKey((current) => current + 1);
    pendingPromotionRef.current = { myCard: null, opponentCard: null };

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
    }

    closingTimeoutRef.current = setTimeout(() => {
      if (isResolvingRoundRef.current) {
        stopRoundResolution();
      }
    }, RESOLUTION_CLEANUP_DELAY_MS);
  }, [
    cancelOpponentReveal,
    clearRoundTransition,
    currentTurnSeatId,
    displayedMyPlayedCard,
    displayedOpponentPlayedCard,
    latestRoundFinished,
    myPlayedCard,
    nextDecisionType,
    opponentPlayedCard,
    playedRoundsCount,
    stopRoundResolution,
    tablePhase,
  ]);

  useEffect(() => {
    const shouldClearDisplayedMyCard =
      myPlayedCard === null &&
      displayedMyPlayedCard !== null &&
      !isResolvingRoundRef.current &&
      tablePhase === 'playing';

    if (!shouldClearDisplayedMyCard) {
      return;
    }

    console.log('[transition][clearDisplayedMyPlayedCard]', {
      displayedMyPlayedCard,
      myPlayedCard,
      opponentPlayedCard,
      playedRoundsCount,
      latestRoundFinished,
    });

    setDisplayedMyPlayedCard(null);
    previousMyPlayedCardRef.current = null;
    myCardAcceptedViaEventRef.current = null;
  }, [
    displayedMyPlayedCard,
    latestRoundFinished,
    myPlayedCard,
    opponentPlayedCard,
    playedRoundsCount,
    tablePhase,
  ]);

  useEffect(() => {
    const shouldClearDisplayedOpponentCard =
      opponentPlayedCard === null &&
      displayedOpponentPlayedCard !== null &&
      !isResolvingRoundRef.current &&
      tablePhase === 'playing';

    if (!shouldClearDisplayedOpponentCard) {
      return;
    }

    console.log('[transition][clearDisplayedOpponentPlayedCard]', {
      displayedOpponentPlayedCard,
      opponentPlayedCard,
      myPlayedCard,
      playedRoundsCount,
      latestRoundFinished,
    });

    cancelOpponentReveal();
    setDisplayedOpponentPlayedCard(null);
    previousOpponentPlayedCardRef.current = null;
    opponentCardAcceptedViaEventRef.current = null;
  }, [
    cancelOpponentReveal,
    displayedOpponentPlayedCard,
    latestRoundFinished,
    myPlayedCard,
    opponentPlayedCard,
    playedRoundsCount,
    tablePhase,
  ]);

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

    console.log('[transition][clearDisplayedRoundFrame]', {
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      myPlayedCard,
      opponentPlayedCard,
      playedRoundsCount,
      latestRoundFinished,
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
    latestRoundFinished,
    myPlayedCard,
    opponentPlayedCard,
    playedRoundsCount,
    tablePhase,
  ]);

  useEffect(() => {
    if (!myPlayedCard) {
      return;
    }

    if (suppressResolvedRoundReplayRef.current && latestRoundFinished) {
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
      queueNextRoundPromotion({ myCard: myPlayedCard });
      return;
    }

    setDisplayedMyPlayedCard(myPlayedCard);
    previousMyPlayedCardRef.current = myPlayedCard;
    myCardAcceptedViaEventRef.current = myPlayedCard;
  }, [latestRoundFinished, myPlayedCard, queueNextRoundPromotion]);

  useEffect(() => {
    if (!opponentPlayedCard) {
      return;
    }

    if (suppressResolvedRoundReplayRef.current && latestRoundFinished) {
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
      queueNextRoundPromotion({ opponentCard: opponentPlayedCard });
      return;
    }

    revealOpponentCard(opponentPlayedCard, false);
    opponentCardAcceptedViaEventRef.current = opponentPlayedCard;
  }, [latestRoundFinished, opponentPlayedCard, queueNextRoundPromotion, revealOpponentCard]);

  useEffect(() => {
    if (tablePhase === 'waiting' || tablePhase === 'missing_context') {
      const tableIsEmpty =
        previousMyPlayedCardRef.current === null &&
        previousOpponentPlayedCardRef.current === null &&
        !isResolvingRoundRef.current;

      if (tableIsEmpty) {
        beginHandTransition();
      }
    }
  }, [beginHandTransition, tablePhase]);

  useEffect(() => {
    return () => {
      cancelOpponentReveal();
      clearRoundTransition();

      if (pendingCardTimeoutRef.current) {
        clearTimeout(pendingCardTimeoutRef.current);
      }

      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }
    };
  }, [cancelOpponentReveal, clearRoundTransition]);

  return useMemo(
    () => ({
      launchingCardKey,
      pendingPlayedCard,
      closingTableCards,
      opponentRevealKey,
      roundIntroKey,
      roundResolvedKey,
      isResolvingRound,
      isLiveTableFrame: tablePhase === 'playing' || tablePhase === 'hand_finished',
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      beginHandTransition,
      beginOwnCardLaunch,
      registerIncomingPlayedCard,
      stopRoundResolution,
    }),
    [
      beginHandTransition,
      beginOwnCardLaunch,
      closingTableCards,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      isResolvingRound,
      launchingCardKey,
      opponentRevealKey,
      pendingPlayedCard,
      registerIncomingPlayedCard,
      roundIntroKey,
      roundResolvedKey,
      stopRoundResolution,
      tablePhase,
    ],
  );
}