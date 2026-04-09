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
  registerIncomingPlayedCard: (params: { owner: 'mine' | 'opponent' | null; card: string | null }) => void;
  stopRoundResolution: () => void;
};

// ⚡ AJUSTE: 3500ms para garantir que o overlay de resultado seja lido
const ROUND_RESOLUTION_DURATION_MS = 3500;
const CARD_LAUNCH_DURATION_MS = 600;
const CARD_REVEAL_DELAY_MS = 450;
// ⚡ AJUSTE: 3200ms antes de limpar a mesa
const ROUND_CLEAR_DELAY_MS = 3200;

export function useMatchTableTransition(
  params: UseMatchTableTransitionParams,
): UseMatchTableTransitionResult {
  const { tablePhase, myPlayedCard, opponentPlayedCard, playedRoundsCount, latestRoundFinished } = params;
  const previousOpponentPlayedCardRef = useRef<string | null>(null);
  const previousPlayedRoundsCountRef = useRef<number>(0);

  const [launchingCardKey, setLaunchingCardKey] = useState<string | null>(null);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<PendingPlayedCard | null>(null);
  const [displayedMyPlayedCard, setDisplayedMyPlayedCard] = useState<string | null>(myPlayedCard);
  const [displayedOpponentPlayedCard, setDisplayedOpponentPlayedCard] = useState<string | null>(opponentPlayedCard);
  const [opponentRevealKey, setOpponentRevealKey] = useState(0);
  const [roundIntroKey, setRoundIntroKey] = useState(0);
  const [roundResolvedKey, setRoundResolvedKey] = useState(0);
  const [isResolvingRound, setIsResolvingRound] = useState(false);
  const [closingTableCards, setClosingTableCards] = useState<ClosingTableCards>({ mine: null, opponent: null });

  const beginHandTransition = useMemo(() => () => {
    setRoundIntroKey((k) => k + 1);
    setDisplayedMyPlayedCard(null);
    setDisplayedOpponentPlayedCard(null);
    setPendingPlayedCard(null);
    setLaunchingCardKey(null);
    setClosingTableCards({ mine: null, opponent: null });
    setIsResolvingRound(false);
  }, []);

  const beginOwnCardLaunch = useMemo(() => (params: { cardKey: string; serverCard: string }) => {
    setLaunchingCardKey(params.cardKey);
    setPendingPlayedCard({
      id: Date.now(),
      owner: 'mine',
      card: params.serverCard,
    });
  }, []);

  const registerIncomingPlayedCard = useMemo(() => ({ owner, card }: { owner: 'mine' | 'opponent' | null; card: string | null }) => {
    if (owner === 'opponent' && card) {
      // ⚡ AJUSTE: Delay para simular "pensamento" do bot antes de revelar a carta
      setTimeout(() => {
        setDisplayedOpponentPlayedCard(card);
        setOpponentRevealKey((k) => k + 1);
        previousOpponentPlayedCardRef.current = card;
      }, CARD_REVEAL_DELAY_MS);
    }
    if (owner === 'mine' && card) {
      setDisplayedMyPlayedCard(card);
    }
    setPendingPlayedCard(null);
    setLaunchingCardKey(null);
  }, []);

  const stopRoundResolution = useMemo(() => () => {
    setIsResolvingRound(false);
  }, []);

  // ⚡ AJUSTE: Efeito para manter as cartas na mesa por mais tempo após o resultado
  useEffect(() => {
    if (latestRoundFinished) {
      setIsResolvingRound(true);
      const timeout = setTimeout(() => {
        if (playedRoundsCount < 3) {
          setDisplayedMyPlayedCard(null);
          setDisplayedOpponentPlayedCard(null);
          setRoundResolvedKey((k) => k + 1);
          setClosingTableCards({ mine: null, opponent: null });
        }
        setIsResolvingRound(false);
      }, ROUND_CLEAR_DELAY_MS);
      return () => clearTimeout(timeout);
    }
  }, [latestRoundFinished, playedRoundsCount]);

  // Reset ao mudar fase
  useEffect(() => {
    if (tablePhase === 'waiting' || tablePhase === 'missing_context') {
      setDisplayedMyPlayedCard(null);
      setDisplayedOpponentPlayedCard(null);
      setPendingPlayedCard(null);
      setLaunchingCardKey(null);
      setClosingTableCards({ mine: null, opponent: null });
      setIsResolvingRound(false);
    }
  }, [tablePhase]);

  return useMemo(() => ({
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
  }), [
    launchingCardKey, pendingPlayedCard, closingTableCards, opponentRevealKey, roundIntroKey, roundResolvedKey,
    isResolvingRound, tablePhase, displayedMyPlayedCard, displayedOpponentPlayedCard,
    beginHandTransition, beginOwnCardLaunch, registerIncomingPlayedCard, stopRoundResolution,
  ]);
}
