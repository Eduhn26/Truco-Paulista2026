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

const CARD_REVEAL_DELAY_MS = 450;

export function useMatchTableTransition(
  params: UseMatchTableTransitionParams,
): UseMatchTableTransitionResult {
  const { tablePhase, myPlayedCard, opponentPlayedCard, playedRoundsCount, latestRoundFinished } = params;

  const previousOpponentPlayedCardRef = useRef<string | null>(null);

  const [launchingCardKey, setLaunchingCardKey] = useState<string | null>(null);
  const [pendingPlayedCard, setPendingPlayedCard] = useState<PendingPlayedCard | null>(null);
  const [displayedMyPlayedCard, setDisplayedMyPlayedCard] = useState<string | null>(myPlayedCard);
  const [displayedOpponentPlayedCard, setDisplayedOpponentPlayedCard] = useState<string | null>(opponentPlayedCard);
  const [opponentRevealKey, setOpponentRevealKey] = useState(0);
  const [roundIntroKey, setRoundIntroKey] = useState(0);
  const [roundResolvedKey, setRoundResolvedKey] = useState(0);
  const [isResolvingRound, setIsResolvingRound] = useState(false);
  const [closingTableCards, setClosingTableCards] = useState<ClosingTableCards>({ mine: null, opponent: null });

  const beginHandTransition = useCallback(() => {
    // Limpa tudo para começar uma nova mão/rodada
    setDisplayedMyPlayedCard(null);
    setDisplayedOpponentPlayedCard(null);
    setPendingPlayedCard(null);
    setLaunchingCardKey(null);
    setClosingTableCards({ mine: null, opponent: null });
    setIsResolvingRound(false);
    setRoundIntroKey((k) => k + 1);
    previousOpponentPlayedCardRef.current = null;
  }, []);

  const beginOwnCardLaunch = useCallback((launchParams: { cardKey: string; serverCard: string }) => {
    setLaunchingCardKey(launchParams.cardKey);
    setPendingPlayedCard({
      id: Date.now(),
      owner: 'mine',
      card: launchParams.serverCard,
    });
  }, []);

  const registerIncomingPlayedCard = useCallback(({ owner, card }: { owner: 'mine' | 'opponent' | null; card: string | null }) => {
    if (owner === 'opponent' && card) {
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

  const stopRoundResolution = useCallback(() => {
    setIsResolvingRound(false);
  }, []);

  // Sincroniza cartas exibidas quando as props mudam (back-end)
  useEffect(() => {
    if (myPlayedCard && myPlayedCard !== displayedMyPlayedCard && !isResolvingRound) {
      setDisplayedMyPlayedCard(myPlayedCard);
    }
  }, [myPlayedCard, displayedMyPlayedCard, isResolvingRound]);

  useEffect(() => {
    if (
      opponentPlayedCard &&
      opponentPlayedCard !== previousOpponentPlayedCardRef.current &&
      !isResolvingRound
    ) {
      setDisplayedOpponentPlayedCard(opponentPlayedCard);
      setOpponentRevealKey((k) => k + 1);
      previousOpponentPlayedCardRef.current = opponentPlayedCard;
    }
  }, [opponentPlayedCard, isResolvingRound]);

  // Quando a rodada termina, não limpamos as cartas imediatamente.
  // Apenas marcamos que está resolvendo e incrementamos o contador de resolução.
  useEffect(() => {
    if (latestRoundFinished) {
      setIsResolvingRound(true);
      setRoundResolvedKey((k) => k + 1);
      // Não limpar cartas aqui! A limpeza ocorrerá apenas quando a próxima mão começar (beginHandTransition)
    }
  }, [latestRoundFinished]);

  // Reseta o estado quando a fase da mesa muda para waiting ou missing_context
  useEffect(() => {
    if (tablePhase === 'waiting' || tablePhase === 'missing_context') {
      setDisplayedMyPlayedCard(null);
      setDisplayedOpponentPlayedCard(null);
      setPendingPlayedCard(null);
      setLaunchingCardKey(null);
      setClosingTableCards({ mine: null, opponent: null });
      setIsResolvingRound(false);
      previousOpponentPlayedCardRef.current = null;
    }
  }, [tablePhase]);

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
      launchingCardKey,
      pendingPlayedCard,
      closingTableCards,
      opponentRevealKey,
      roundIntroKey,
      roundResolvedKey,
      isResolvingRound,
      tablePhase,
      displayedMyPlayedCard,
      displayedOpponentPlayedCard,
      beginHandTransition,
      beginOwnCardLaunch,
      registerIncomingPlayedCard,
      stopRoundResolution,
    ],
  );
}
