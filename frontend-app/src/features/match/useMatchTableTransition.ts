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

type RoundResolutionInput = {
  resolutionKey: string;
  myCard: string | null;
  opponentCard: string | null;
  roundResult?: string | null;
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
const CARD_SETTLE_BEFORE_RESOLUTION_MS = 560;
const RESOLUTION_HOLD_MS = 1300;
const NEXT_ROUND_CLEAN_FRAME_MS = 260;

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
  const pendingRoundResolutionRef = useRef<RoundResolutionInput | null>(null);
  const lastAcceptedCardStampRef = useRef<AcceptedCardStamp | null>(null);
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

  const clearDisplayedTable = useCallback(() => {
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
    });

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

    cancelOpponentReveal();
    clearRoundTransition();

    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    clearTransientLaunchState();
    clearResolutionSettleTimeout();
    pendingRoundResolutionRef.current = null;
    clearDisplayedTable();
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
  }, [
    cancelOpponentReveal,
    clearDisplayedTable,
    clearResolutionSettleTimeout,
    clearRoundTransition,
    clearTransientLaunchState,
  ]);

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
        setDisplayedMyPlayedCard(card);
        previousMyPlayedCardRef.current = card;
        myCardAcceptedViaEventRef.current = card;
        return;
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

    cancelOpponentReveal();
    clearTransientLaunchState();
    clearRoundTransition();
    clearResolutionSettleTimeout();
    pendingRoundResolutionRef.current = null;

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
    lastAcceptedCardStampRef.current = null;
  }, [
    cancelOpponentReveal,
    clearDisplayedTable,
    clearResolutionSettleTimeout,
    clearRoundTransition,
    clearTransientLaunchState,
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
    [clearTransientLaunchState, closingTableCards.mine, queueNextRoundPromotion],
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
            return;
          }

          markAcceptedCardForVisualSettle(owner, card);
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
      markAcceptedCardForVisualSettle,
      queueNextRoundPromotion,
      renderIncomingCard,
      revealOpponentCard,
    ],
  );

  const commitRoundResolution = useCallback(
    ({
      resolutionKey,
      myCard: resolvedMyCard,
      opponentCard: resolvedOpponentCard,
      roundResult,
    }: RoundResolutionInput) => {
      debugTableTransition('commitRoundResolution:start', {
        resolutionKey,
        resolvedMyCard,
        resolvedOpponentCard,
        roundResult: roundResult ?? null,
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

      if (lastResolvedRoundKeyRef.current === resolutionKey) {
        debugTableTransition('commitRoundResolution:ignored-duplicate', {
          resolutionKey,
          lastResolvedRoundKey: lastResolvedRoundKeyRef.current,
        });
        return;
      }

      pendingRoundResolutionRef.current = null;
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

      debugTableTransition('commitRoundResolution:committed', {
        resolutionKey,
        resolvedMyCard,
        resolvedOpponentCard,
        roundResult: roundResult ?? null,
        closingCards: { mine: resolvedMyCard, opponent: resolvedOpponentCard },
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

        if (isResolvingRoundRef.current) {
          flushPendingPromotion();
        }

        closingTimeoutRef.current = null;
      }, RESOLUTION_HOLD_MS);
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

      const settleDelayMs = getRoundResolutionSettleDelayMs();

      if (settleDelayMs > 0) {
        pendingRoundResolutionRef.current = resolutionInput;

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

      commitRoundResolution(resolutionInput);
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

    if (
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
      myCardAcceptedViaEventRef.current !== null &&
      myCardAcceptedViaEventRef.current === displayedMyPlayedCard;
    const opponentProtected =
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

    markAcceptedCardForVisualSettle('opponent', opponentPlayedCard);
    revealOpponentCard(opponentPlayedCard, true);
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

      if (pendingCardTimeoutRef.current) {
        clearTimeout(pendingCardTimeoutRef.current);
      }

      if (closingTimeoutRef.current) {
        clearTimeout(closingTimeoutRef.current);
      }
    };
  }, [cancelOpponentReveal, clearResolutionSettleTimeout, clearRoundTransition]);

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
