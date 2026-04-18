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
  resolvedRoundFinished: boolean;
  isLiveTableFrame: boolean;
  displayedMyPlayedCard: string | null;
  displayedOpponentPlayedCard: string | null;
  resolvedRoundResult: string | null;
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

const CARD_REVEAL_DELAY_MS = 220;
const PENDING_CARD_TIMEOUT_MS = 2000;
const RESOLUTION_HOLD_MS = 1300;
const NEXT_ROUND_CLEAN_FRAME_MS = 260;

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
  const [resolvedRoundResult, setResolvedRoundResult] = useState<string | null>(null);
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

  const clearDisplayedTable = useCallback(() => {
    setDisplayedMyPlayedCard(null);
    setDisplayedOpponentPlayedCard(null);
    setClosingTableCards({ mine: null, opponent: null });
    setResolvedRoundResult(null);
    previousMyPlayedCardRef.current = null;
    previousOpponentPlayedCardRef.current = null;
    opponentCardAcceptedViaEventRef.current = null;
    myCardAcceptedViaEventRef.current = null;
  }, []);

  const resetForFreshRoundFrame = useCallback(() => {
    cancelOpponentReveal();
    clearRoundTransition();

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    clearTransientLaunchState();
    clearDisplayedTable();
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
  }, [cancelOpponentReveal, clearDisplayedTable, clearRoundTransition, clearTransientLaunchState]);

  const revealOpponentCard = useCallback(
    (card: string, immediate: boolean) => {
      cancelOpponentReveal();

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
    [cancelOpponentReveal],
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
      setIsResolvingRound(false);
      return;
    }

    suppressResolvedRoundReplayRef.current = false;
    awaitingNextRoundOpeningRef.current = false;

    roundTransitionTimeoutRef.current = setTimeout(() => {
      resetForFreshRoundFrame();

      const promotionToApply = pendingPromotionRef.current;

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
    }, NEXT_ROUND_CLEAN_FRAME_MS);
  }, [resetForFreshRoundFrame, revealOpponentCard]);

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

    clearDisplayedTable();
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
    previousResolvedRoundCountRef.current = 0;
    lastResolvedRoundKeyRef.current = null;
    suppressResolvedRoundReplayRef.current = false;
    awaitingNextRoundOpeningRef.current = false;
    pendingPromotionRef.current = { myCard: null, opponentCard: null };
  }, [cancelOpponentReveal, clearDisplayedTable, clearRoundTransition, clearTransientLaunchState]);

  const beginOwnCardLaunch = useCallback(
    (launchParams: { cardKey: string; serverCard: string }) => {
      suppressResolvedRoundReplayRef.current = false;
      awaitingNextRoundOpeningRef.current = false;

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
    [clearTransientLaunchState, closingTableCards.mine, queueNextRoundPromotion],
  );

  const registerIncomingPlayedCard = useCallback(
    ({ owner, card }: { owner: 'mine' | 'opponent' | null; card: string | null }) => {
      clearTransientLaunchState();

      if (!owner || !card) {
        return;
      }

      const canAcceptIncomingCard =
        tablePhaseRef.current !== 'missing_context' && tablePhaseRef.current !== 'match_finished';

      if (!canAcceptIncomingCard) {
        return;
      }

      if (isResolvingRoundRef.current) {
        const shouldCompleteCurrentResolvedRound =
          (owner === 'mine' && closingTableCards.mine === null) ||
          (owner === 'opponent' && closingTableCards.opponent === null);

        if (shouldCompleteCurrentResolvedRound) {
          if (owner === 'mine') {
            setDisplayedMyPlayedCard(card);
            setClosingTableCards((current) => ({
              ...current,
              mine: card,
            }));
            previousMyPlayedCardRef.current = card;
            myCardAcceptedViaEventRef.current = card;
            return;
          }

          opponentCardAcceptedViaEventRef.current = card;
          setClosingTableCards((current) => ({
            ...current,
            opponent: card,
          }));
          revealOpponentCard(card, true);
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

      renderIncomingCard(owner, card, true);
    },
    [
      clearTransientLaunchState,
      closingTableCards.mine,
      closingTableCards.opponent,
      queueNextRoundPromotion,
      renderIncomingCard,
      revealOpponentCard,
    ],
  );

  const triggerRoundResolution = useCallback(
    ({
      resolutionKey,
      myCard: resolvedMyCard,
      opponentCard: resolvedOpponentCard,
      roundResult,
    }: {
      resolutionKey: string;
      myCard: string | null;
      opponentCard: string | null;
      roundResult?: string | null;
    }) => {
      if (!resolutionKey) {
        return;
      }

      if (lastResolvedRoundKeyRef.current === resolutionKey) {
        return;
      }

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

      if (resolvedMyCard) {
        setDisplayedMyPlayedCard(resolvedMyCard);
        previousMyPlayedCardRef.current = resolvedMyCard;
        myCardAcceptedViaEventRef.current = resolvedMyCard;
      }

      if (resolvedOpponentCard) {
        setDisplayedOpponentPlayedCard(resolvedOpponentCard);
        previousOpponentPlayedCardRef.current = resolvedOpponentCard;
        opponentCardAcceptedViaEventRef.current = resolvedOpponentCard;
      }

      setResolvedRoundResult(roundResult ?? null);
      setClosingTableCards({
        mine: resolvedMyCard,
        opponent: resolvedOpponentCard,
      });
      setIsResolvingRound(true);
      setRoundResolvedKey((current) => current + 1);
      pendingPromotionRef.current = { myCard: null, opponentCard: null };

      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }

      closingTimeoutRef.current = setTimeout(() => {
        if (isResolvingRoundRef.current) {
          flushPendingPromotion();
        }

        closingTimeoutRef.current = null;
      }, RESOLUTION_HOLD_MS);
    },
    [cancelOpponentReveal, clearRoundTransition, flushPendingPromotion, playedRoundsCount],
  );

  const stopRoundResolution = useCallback(() => {
    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    if (isResolvingRoundRef.current) {
      flushPendingPromotion();
    }
  }, [flushPendingPromotion]);

  useEffect(() => {
    if (!latestRoundFinished || playedRoundsCount === 0) {
      return;
    }

    if (awaitingNextRoundOpeningRef.current) {
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

    if (
      myCardAcceptedViaEventRef.current !== null &&
      myCardAcceptedViaEventRef.current === displayedMyPlayedCard
    ) {
      return;
    }

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

    if (
      opponentCardAcceptedViaEventRef.current !== null &&
      opponentCardAcceptedViaEventRef.current === displayedOpponentPlayedCard
    ) {
      return;
    }

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
      myCardAcceptedViaEventRef.current !== null &&
      myCardAcceptedViaEventRef.current === displayedMyPlayedCard;
    const opponentProtected =
      opponentCardAcceptedViaEventRef.current !== null &&
      opponentCardAcceptedViaEventRef.current === displayedOpponentPlayedCard;

    if (myProtected || opponentProtected) {
      return;
    }

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

    setDisplayedMyPlayedCard(myPlayedCard);
    previousMyPlayedCardRef.current = myPlayedCard;
    myCardAcceptedViaEventRef.current = myPlayedCard;
  }, [closingTableCards.mine, latestRoundFinished, myPlayedCard, queueNextRoundPromotion]);

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
        opponentCardAcceptedViaEventRef.current = opponentPlayedCard;
        setClosingTableCards((current) => ({
          ...current,
          opponent: opponentPlayedCard,
        }));
        revealOpponentCard(opponentPlayedCard, true);
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

    revealOpponentCard(opponentPlayedCard, true);
    opponentCardAcceptedViaEventRef.current = opponentPlayedCard;
  }, [
    closingTableCards.opponent,
    latestRoundFinished,
    opponentPlayedCard,
    queueNextRoundPromotion,
    revealOpponentCard,
  ]);

  useEffect(() => {
    if (tablePhase === 'missing_context') {
      beginHandTransition();
      return;
    }

    if (tablePhase === 'waiting') {
      const shouldResetWaitingTable =
        previousMyPlayedCardRef.current === null &&
        previousOpponentPlayedCardRef.current === null &&
        !isResolvingRoundRef.current;

      if (shouldResetWaitingTable) {
        beginHandTransition();
      }

      return;
    }

    if (tablePhase === 'hand_finished' || tablePhase === 'match_finished') {
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

      if (pendingCardTimeoutRef.current) {
        clearTimeout(pendingCardTimeoutRef.current);
      }

      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }
    };
  }, [cancelOpponentReveal, clearRoundTransition]);

  const isLiveTableFrame = useMemo(
    () => tablePhase === 'playing' || tablePhase === 'hand_finished',
    [tablePhase],
  );

  const resolvedRoundFinished = useMemo(
    () => Boolean(isResolvingRound || latestRoundFinished),
    [isResolvingRound, latestRoundFinished],
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
      resolvedRoundFinished,
      isLiveTableFrame,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      resolvedRoundResult,
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
      isLiveTableFrame,
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
  );
}
