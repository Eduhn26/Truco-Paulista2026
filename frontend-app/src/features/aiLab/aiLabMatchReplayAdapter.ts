import type { ComponentProps } from 'react';

import { MatchTableShell } from '../match/matchTableShell';
import {
  cardStringToPayload,
  type MatchAvailableActionsPayload,
  type MatchStatePayload,
  type Rank,
} from '../../services/socket/socketTypes';
import { getLatestPresentationEvent } from './aiLabReplayDirector';
import type {
  AiLabSimulationEvent,
  AiLabSimulationHand,
  AiLabSimulationResult,
} from './aiLabSimulationApi';

type MatchTableProps = ComponentProps<typeof MatchTableShell>;

export type AiLabMatchReplayState = {
  currentEvent: AiLabSimulationEvent | null;
  presentationEvent: AiLabSimulationEvent | null;
  currentHand: AiLabSimulationHand | null;
  activeDecisionEvent: AiLabSimulationEvent | null;
  latestDecisionEvent: AiLabSimulationEvent | null;
  tableProps: MatchTableProps;
};

const EMPTY_AVAILABLE_ACTIONS: MatchAvailableActionsPayload = {
  canRequestTruco: false,
  canRaiseToSix: false,
  canRaiseToNine: false,
  canRaiseToTwelve: false,
  canAcceptBet: false,
  canDeclineBet: false,
  canAcceptMaoDeOnze: false,
  canDeclineMaoDeOnze: false,
  canAttemptPlayCard: false,
};

function removePlayedCards(cards: string[], playedCards: string[]): string[] {
  const remaining = [...cards];

  for (const card of playedCards) {
    const index = remaining.indexOf(card);

    if (index >= 0) {
      remaining.splice(index, 1);
    }
  }

  return remaining;
}

function toCardPayloads(cards: string[]) {
  return cards
    .map((card) => cardStringToPayload(card))
    .filter((card): card is NonNullable<ReturnType<typeof cardStringToPayload>> => card !== null);
}

function getLatestSnapshot(events: AiLabSimulationEvent[]) {
  return [...events].reverse().find((event) => Boolean(event.snapshot))?.snapshot ?? null;
}

function getLatestPlayerCardEvent(
  events: AiLabSimulationEvent[],
  roundIndex: number,
  playerId: 'P1' | 'P2',
): AiLabSimulationEvent | null {
  return (
    [...events]
      .reverse()
      .find(
        (event) =>
          event.type === 'card.played' &&
          event.playerId === playerId &&
          (event.roundIndex ?? 0) === roundIndex,
      ) ?? null
  );
}

function resolveCurrentTurnPlayer(event: AiLabSimulationEvent | null): 'P1' | 'P2' | null {
  if (!event?.playerId) {
    return null;
  }

  if (
    event.type === 'decision.requested' ||
    event.category === 'decision' ||
    event.category === 'ml'
  ) {
    return event.playerId;
  }

  return null;
}

function resolveNextDecisionType(event: AiLabSimulationEvent | null): string {
  const action = event?.decision?.final?.action ?? event?.decision?.baseline?.action ?? '';

  if (action === 'play-card') {
    return 'play-card';
  }

  if (
    action === 'accept-bet' ||
    action === 'decline-bet' ||
    action.startsWith('raise-to-')
  ) {
    return 'respond-bet';
  }

  return 'idle';
}

function buildRounds(
  handEvents: AiLabSimulationEvent[],
  currentRoundIndex: number,
): NonNullable<MatchStatePayload['currentHand']>['rounds'] {
  const highestKnownRound = Math.max(
    currentRoundIndex,
    ...handEvents.map((event) => event.roundIndex ?? 0),
  );

  return Array.from({ length: Math.max(1, highestKnownRound + 1) }, (_, roundIndex) => {
    const p1Event = getLatestPlayerCardEvent(handEvents, roundIndex, 'P1');
    const p2Event = getLatestPlayerCardEvent(handEvents, roundIndex, 'P2');
    const resolutionEvent =
      [...handEvents]
        .reverse()
        .find(
          (event) =>
            event.type === 'round.resolved' &&
            (event.roundIndex ?? 0) === roundIndex,
        ) ?? null;

    const orderedPlays = handEvents
      .filter(
        (event) =>
          event.type === 'card.played' &&
          Boolean(event.card) &&
          (event.roundIndex ?? 0) === roundIndex,
      )
      .map((event) => ({
        ownerId: event.playerId ?? '',
        seatId: event.playerId === 'P1' ? 'T1A' : event.playerId === 'P2' ? 'T2A' : null,
        playerId: event.playerId ?? '',
        card: event.card ?? '',
      }));

    return {
      playerOneCard: p1Event?.card ?? null,
      playerTwoCard: p2Event?.card ?? null,
      result: resolutionEvent ? resolutionEvent.playerId ?? 'TIE' : null,
      finished: Boolean(resolutionEvent),
      seatPlays: {
        T1A: p1Event?.card ?? null,
        T2A: p2Event?.card ?? null,
      },
      orderedPlays,
      winningSeatId:
        resolutionEvent?.playerId === 'P1'
          ? 'T1A'
          : resolutionEvent?.playerId === 'P2'
            ? 'T2A'
            : null,
    };
  });
}

export function buildAiLabMatchReplayState(
  result: AiLabSimulationResult,
  eventIndex: number,
): AiLabMatchReplayState {
  const visibleEvents = result.events.slice(0, eventIndex + 1);
  const currentEvent = result.events[eventIndex] ?? result.events[0] ?? null;
  const presentationEvent = getLatestPresentationEvent(result.events, eventIndex);
  const activeDecisionEvent =
    currentEvent?.decision &&
    (currentEvent.type === 'decision.requested' ||
      currentEvent.category === 'decision' ||
      currentEvent.category === 'ml')
      ? currentEvent
      : null;
  const latestDecisionEvent =
    [...visibleEvents].reverse().find((event) => Boolean(event.decision)) ?? null;

  const currentHand =
    presentationEvent?.handIndex === undefined
      ? null
      : result.hands.find((hand) => hand.handIndex === presentationEvent.handIndex) ?? null;

  const handEvents =
    currentHand === null
      ? []
      : visibleEvents.filter((event) => event.handIndex === currentHand.handIndex);
  const latestSnapshot = getLatestSnapshot(handEvents);
  const cardsDealt =
    currentHand !== null &&
    handEvents.some((event) => event.type === 'cards.dealt');

  const currentRoundIndex =
    presentationEvent?.roundIndex ??
    [...handEvents].reverse().find((event) => event.roundIndex !== undefined)?.roundIndex ??
    0;

  const rounds = buildRounds(handEvents, currentRoundIndex);
  const currentRound =
    rounds[currentRoundIndex] ?? rounds[rounds.length - 1] ?? null;
  const p1CardEvent = getLatestPlayerCardEvent(handEvents, currentRoundIndex, 'P1');
  const p2CardEvent = getLatestPlayerCardEvent(handEvents, currentRoundIndex, 'P2');
  const playedP1 = handEvents
    .filter((event) => event.type === 'card.played' && event.playerId === 'P1' && event.card)
    .map((event) => event.card as string);
  const playedP2 = handEvents
    .filter((event) => event.type === 'card.played' && event.playerId === 'P2' && event.card)
    .map((event) => event.card as string);

  const remainingP1 =
    currentHand && cardsDealt
      ? removePlayedCards(currentHand.initialHands.P1, playedP1)
      : [];
  const remainingP2 =
    currentHand && cardsDealt
      ? removePlayedCards(currentHand.initialHands.P2, playedP2)
      : [];

  const scoreP1 = latestSnapshot?.scores?.P1 ?? currentHand?.scoreBefore.P1 ?? 0;
  const scoreP2 = latestSnapshot?.scores?.P2 ?? currentHand?.scoreBefore.P2 ?? 0;
  const viraRank = (latestSnapshot?.viraRank ?? currentHand?.viraRank ?? '4') as Rank;
  const currentValue = latestSnapshot?.currentValue ?? 1;
  const pendingValue = latestSnapshot?.pendingValue ?? null;
  const betState = latestSnapshot?.betState ?? 'idle';
  const specialState = latestSnapshot?.specialState ?? currentHand?.specialState ?? 'normal';
  const currentTurnPlayer = resolveCurrentTurnPlayer(currentEvent);

  const isRoundResolution = presentationEvent?.type === 'round.resolved';
  const isHandFinished = presentationEvent?.type === 'hand.finished';
  const isMatchFinished = presentationEvent?.type === 'match.finished';

  const tablePhase: MatchTableProps['tablePhase'] = isMatchFinished
    ? 'match_finished'
    : isHandFinished
      ? 'hand_finished'
      : currentHand
        ? 'playing'
        : 'waiting';

  const requestedBy =
    betState === 'awaiting_response'
      ? [...handEvents]
          .reverse()
          .find((event) => event.type === 'bet.requested' || event.type === 'bet.raised')
          ?.playerId ?? null
      : null;

  const currentHandPayload: MatchStatePayload['currentHand'] = currentHand
    ? {
        viraRank,
        finished: tablePhase === 'hand_finished' || tablePhase === 'match_finished',
        viewerPlayerId: 'P1',
        viewerSeatId: 'T1A',
        mode: '1v1',
        currentValue,
        betState,
        pendingValue,
        requestedBy,
        specialState,
        specialDecisionPending: false,
        specialDecisionBy: null,
        winner:
          tablePhase === 'hand_finished' || tablePhase === 'match_finished'
            ? currentHand.winnerPlayer
            : null,
        awardedPoints:
          tablePhase === 'hand_finished' || tablePhase === 'match_finished'
            ? currentHand.pointsAwarded
            : null,
        currentRoundIndex,
        lastRoundResult: currentRound?.result ?? null,
        nextDecisionType: resolveNextDecisionType(activeDecisionEvent),
        viewerCanActNow: false,
        pendingBotAction: Boolean(activeDecisionEvent),
        teamBetDecision: null,
        partnerAdvice: null,
        availableActions: EMPTY_AVAILABLE_ACTIONS,
        playerOneHand: remainingP1,
        playerTwoHand: [],
        seatHands: {
          T1A: remainingP1,
          T2A: remainingP2,
        },
        rounds,
      }
    : null;

  const winner =
    tablePhase === 'match_finished'
      ? result.match.winner
      : tablePhase === 'hand_finished'
        ? currentHand?.winnerPlayer ?? null
        : null;
  const awardedPoints =
    tablePhase === 'hand_finished' || tablePhase === 'match_finished'
      ? currentHand?.pointsAwarded ?? null
      : null;

  const resolvedRoundResult =
    isRoundResolution && presentationEvent
      ? presentationEvent.playerId ?? 'TIE'
      : null;

  const tableProps: MatchTableProps = {
    handStatusLabel: currentEvent?.title ?? 'Simulação em andamento',
    handStatusTone: 'neutral',
    betState,
    currentValue,
    pendingValue,
    requestedBy,
    specialState,
    specialDecisionPending: false,
    specialDecisionBy: null,
    winner,
    awardedPoints,
    latestRound: currentRound,
    latestRoundMyPlayedCard: currentRound?.playerOneCard ?? null,
    latestRoundOpponentPlayedCard: currentRound?.playerTwoCard ?? null,
    displayedResolvedRoundFinished: isRoundResolution,
    displayedResolvedRoundResult: resolvedRoundResult,
    tablePhase,
    canStartHand: false,
    scoreLabel: `T1 ${scoreP1} × T2 ${scoreP2}`,
    opponentSeatView: {
      seatId: 'T2A',
      ready: true,
      isBot: true,
      isCurrentTurn: currentTurnPlayer === 'P2',
      isMine: false,
      displayName: 'Bot B',
      publicName: 'Bot B',
      publicSlug: null,
      botIdentity: null,
    },
    mySeatView: {
      seatId: 'T1A',
      ready: true,
      isBot: true,
      isCurrentTurn: currentTurnPlayer === 'P1',
      isMine: true,
      displayName: 'Bot A',
      publicName: 'Bot A',
      publicSlug: null,
      botIdentity: null,
    },
    isOneVsOne: true,
    roomMode: '1v1',
    currentTurnSeatId:
      currentTurnPlayer === 'P1' ? 'T1A' : currentTurnPlayer === 'P2' ? 'T2A' : null,
    displayedOpponentPlayedCard: p2CardEvent?.card ?? null,
    displayedMyPlayedCard: p1CardEvent?.card ?? null,
    opponentRevealKey: p2CardEvent ? p2CardEvent.sequence + 1 : 0,
    myRevealKey: p1CardEvent ? p1CardEvent.sequence + 1 : 0,
    myCardLaunching: false,
    roundIntroKey: currentHand ? currentHand.handIndex * 10 + currentRoundIndex : 0,
    roundResolvedKey:
      isRoundResolution && presentationEvent ? presentationEvent.sequence + 1 : 0,
    currentPrivateViraRank: viraRank,
    currentPublicViraRank: viraRank,
    currentPrivateViraCard: null,
    currentPublicViraCard: null,
    viraRank,
    isViraRevealActive: false,
    viraRevealKey: currentHand ? `ai-lab-vira-${currentHand.handIndex}` : 'ai-lab-vira',
    availableActions: EMPTY_AVAILABLE_ACTIONS,
    onAction: () => undefined,
    myCards: toCardPayloads(remainingP1),
    canPlayCard: false,
    launchingCardKey: null,
    pendingPlayedCard: null,
    currentPrivateHand: currentHandPayload,
    currentPublicHand: currentHandPayload,
    onPlayCard: () => undefined,
    playedRoundsCount: rounds.filter((round) => round.finished).length,
    isMyTurn: currentTurnPlayer === 'P1',
    isResolvingRound: isRoundResolution,
    closingTableCards: isRoundResolution
      ? {
          mine: currentRound?.playerOneCard ?? null,
          opponent: currentRound?.playerTwoCard ?? null,
        }
      : {
          mine: null,
          opponent: null,
        },
    suppressHandOutcomeModal: false,
    roundVerdictPlacement: 'inset',
  };

  return {
    currentEvent,
    presentationEvent,
    currentHand,
    activeDecisionEvent,
    latestDecisionEvent,
    tableProps,
  };
}
