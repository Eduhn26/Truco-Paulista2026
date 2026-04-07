import { useEffect, useMemo, useRef, useState } from 'react';

type PendingPlayedCard = {
  owner: 'mine' | 'opponent';
  card: string;
  id: number;
};

type ClosingTableCards = {
  mine: string | null;
  opponent: string | null;
};

type UseMatchTableTransitionParams = {
  tablePhase: 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
  myPlayedCard: string | null;
  opponentPlayedCard: string | null;
  playedRoundsCount: number;
  latestRoundFinished: boolean;
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

const ROUND_RESOLUTION_DURATION_MS = 1100;
const CARD_LAUNCH_DURATION_MS = 700;

export function useMatchTableTransition(
  params: UseMatchTableTransitionParams,
): UseMatchTableTransitionResult {
  const { tablePhase, myPlayedCard, opponentPlayedCard, playedRoundsCount, latestRoundFinished } =
    params;

  const previousOpponentPlayedCardRef = useRef<string | null>(null);
  const previousPlayedRoundsCountRef = useRef<number>(0);

  const [launchingCardKey, setLaunchingCardKey] = useState<string | null>(null);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<PendingPlayedCard | null>(null);
  const [closingTableCards, setClosingTableCards] = useState<ClosingTableCards>({
    mine: null,
    opponent: null,
  });
  const [opponentRevealKey, setOpponentRevealKey] = useState(0);
  const [roundIntroKey, setRoundIntroKey] = useState(0);
  const [roundResolvedKey, setRoundResolvedKey] = useState(0);
  const [isResolvingRound, setIsResolvingRound] = useState(false);

  const isLiveTableFrame = tablePhase === 'playing' || tablePhase === 'hand_finished';

  const displayedMyPlayedCard =
    (pendingPlayedCard?.owner === 'mine' ? pendingPlayedCard.card : null) ??
    closingTableCards.mine ??
    (isLiveTableFrame ? myPlayedCard : null);

  const displayedOpponentPlayedCard =
    closingTableCards.opponent ??
    (pendingPlayedCard?.owner === 'opponent' ? pendingPlayedCard.card : null) ??
    (isLiveTableFrame ? opponentPlayedCard : null);

  function beginHandTransition(): void {
    setClosingTableCards({ mine: null, opponent: null });
    setIsResolvingRound(false);
    setRoundIntroKey((current) => current + 1);
  }

  function beginOwnCardLaunch(params: { cardKey: string; serverCard: string }): void {
    const { cardKey, serverCard } = params;

    setLaunchingCardKey(cardKey);
    setPendingPlayedCard({
      owner: 'mine',
      card: serverCard,
      id: Date.now(),
    });

    window.setTimeout(() => {
      setLaunchingCardKey((current) => (current === cardKey ? null : current));
    }, CARD_LAUNCH_DURATION_MS);
  }

  function registerIncomingPlayedCard(params: {
    owner: 'mine' | 'opponent' | null;
    card: string | null;
  }): void {
    const { owner, card } = params;

    if (!owner || !card || isResolvingRound) {
      return;
    }

    setClosingTableCards((current) => ({
      ...current,
      [owner]: card,
    }));
  }

  function stopRoundResolution(): void {
    setClosingTableCards({ mine: null, opponent: null });
    setPendingPlayedCard(null);
    setIsResolvingRound(false);
  }

  useEffect(() => {
    if (pendingPlayedCard?.owner === 'mine' && myPlayedCard === pendingPlayedCard.card) {
      setLaunchingCardKey(null);
      setPendingPlayedCard(null);
    }
  }, [myPlayedCard, pendingPlayedCard]);

  useEffect(() => {
    setClosingTableCards((current) => ({
      mine: current.mine === myPlayedCard ? null : current.mine,
      opponent: current.opponent === opponentPlayedCard ? null : current.opponent,
    }));
  }, [myPlayedCard, opponentPlayedCard]);

  useEffect(() => {
    if (tablePhase === 'playing' || tablePhase === 'hand_finished') {
      return;
    }

    setPendingPlayedCard(null);
    setClosingTableCards({ mine: null, opponent: null });
    setIsResolvingRound(false);
  }, [tablePhase]);

  useEffect(() => {
    if (!isResolvingRound) {
      return;
    }

    const timeout = window.setTimeout(() => {
      stopRoundResolution();
    }, ROUND_RESOLUTION_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [isResolvingRound]);

  useEffect(() => {
    if (
      displayedOpponentPlayedCard &&
      displayedOpponentPlayedCard !== previousOpponentPlayedCardRef.current
    ) {
      setOpponentRevealKey((current) => current + 1);
    }

    previousOpponentPlayedCardRef.current = displayedOpponentPlayedCard;
  }, [displayedOpponentPlayedCard]);

  useEffect(() => {
    const previousPlayedRoundsCount = previousPlayedRoundsCountRef.current;

    if (
      playedRoundsCount > 0 &&
      playedRoundsCount !== previousPlayedRoundsCount &&
      latestRoundFinished
    ) {
      setRoundResolvedKey((current) => current + 1);
      setIsResolvingRound(true);
    }

    previousPlayedRoundsCountRef.current = playedRoundsCount;
  }, [latestRoundFinished, playedRoundsCount]);

  return useMemo(
    () => ({
      launchingCardKey,
      pendingPlayedCard,
      closingTableCards,
      opponentRevealKey,
      roundIntroKey,
      roundResolvedKey,
      isResolvingRound,
      isLiveTableFrame,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      beginHandTransition,
      beginOwnCardLaunch,
      registerIncomingPlayedCard,
      stopRoundResolution,
    }),
    [
      launchingCardKey,
      pendingPlayedCard,
      closingTableCards,
      opponentRevealKey,
      roundIntroKey,
      roundResolvedKey,
      isResolvingRound,
      isLiveTableFrame,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
    ],
  );
}