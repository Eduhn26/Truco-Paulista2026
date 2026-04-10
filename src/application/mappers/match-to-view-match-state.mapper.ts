import type { HandSnapshot, HandValue } from '@game/domain/entities/hand';
import type { Match } from '@game/domain/entities/match';
import { Round } from '@game/domain/entities/round';
import type { PlayerId } from '@game/domain/value-objects/player-id';
import type { RoundResult } from '@game/domain/value-objects/round-result';
import type {
  NextDecisionType,
  ViewMatchStateResponseDto,
} from '@game/application/dtos/responses/view-match-state.response.dto';

function maskHand(cards: string[]): string[] {
  return cards.map(() => 'HIDDEN');
}

function canRaiseToTarget(
  snapshot: HandSnapshot,
  viewerPlayerId: PlayerId | undefined,
  targetValue: HandValue,
): boolean {
  if (!viewerPlayerId) {
    return false;
  }

  if (snapshot.finished || snapshot.specialDecisionPending || snapshot.betState !== 'idle') {
    return false;
  }

  if (snapshot.specialState !== 'normal') {
    return false;
  }

  return snapshot.currentValue === targetValue;
}

function buildAvailableActions(
  snapshot: HandSnapshot,
  viewerPlayerId: PlayerId | undefined,
): NonNullable<ViewMatchStateResponseDto['currentHand']>['availableActions'] {
  const canRespondToBet =
    Boolean(viewerPlayerId) &&
    !snapshot.finished &&
    snapshot.betState === 'awaiting_response' &&
    snapshot.requestedBy !== null &&
    snapshot.requestedBy !== viewerPlayerId;

  const canResolveMaoDeOnze =
    Boolean(viewerPlayerId) &&
    !snapshot.finished &&
    snapshot.specialState === 'mao_de_onze' &&
    snapshot.specialDecisionPending &&
    snapshot.specialDecisionBy === viewerPlayerId;

  return {
    canRequestTruco: canRaiseToTarget(snapshot, viewerPlayerId, 1),
    canRaiseToSix: canRaiseToTarget(snapshot, viewerPlayerId, 3),
    canRaiseToNine: canRaiseToTarget(snapshot, viewerPlayerId, 6),
    canRaiseToTwelve: canRaiseToTarget(snapshot, viewerPlayerId, 9),
    canAcceptBet: canRespondToBet,
    canDeclineBet: canRespondToBet,
    canAcceptMaoDeOnze: canResolveMaoDeOnze,
    canDeclineMaoDeOnze: canResolveMaoDeOnze,
    canAttemptPlayCard:
      Boolean(viewerPlayerId) &&
      !snapshot.finished &&
      snapshot.betState === 'idle' &&
      !snapshot.specialDecisionPending,
  };
}

function resolveLastRoundResult(snapshot: HandSnapshot): RoundResult | null {
  for (let index = snapshot.rounds.length - 1; index >= 0; index -= 1) {
    const round = snapshot.rounds[index];

    if (!round?.finished) {
      continue;
    }

    return Round.fromSnapshot(round).getResult();
  }

  return null;
}

function resolveNextDecisionType(
  matchState: ViewMatchStateResponseDto['state'],
  snapshot: HandSnapshot,
): NextDecisionType {
  if (matchState === 'finished') {
    return 'match-finished';
  }

  if (snapshot.finished) {
    return 'start-next-hand';
  }

  if (snapshot.specialState === 'mao_de_onze' && snapshot.specialDecisionPending) {
    return 'resolve-mao-de-onze';
  }

  if (snapshot.betState === 'awaiting_response') {
    return 'respond-bet';
  }

  if (!snapshot.finished) {
    return 'play-card';
  }

  return 'idle';
}

function resolveViewerCanActNow(
  availableActions: NonNullable<ViewMatchStateResponseDto['currentHand']>['availableActions'],
): boolean {
  return Object.values(availableActions).some(Boolean);
}

function resolvePendingBotAction(
  snapshot: HandSnapshot,
  viewerPlayerId: PlayerId | undefined,
  viewerCanActNow: boolean,
): boolean {
  if (!viewerPlayerId || snapshot.finished || viewerCanActNow) {
    return false;
  }

  if (
    snapshot.betState === 'awaiting_response' &&
    snapshot.requestedBy !== null &&
    snapshot.requestedBy === viewerPlayerId
  ) {
    return true;
  }

  if (
    snapshot.specialState === 'mao_de_onze' &&
    snapshot.specialDecisionPending &&
    snapshot.specialDecisionBy !== null &&
    snapshot.specialDecisionBy !== viewerPlayerId
  ) {
    return true;
  }

  return false;
}

export function mapMatchToViewMatchState(
  matchId: string,
  match: Match,
  viewerPlayerId?: PlayerId,
): ViewMatchStateResponseDto {
  const score = match.getScore();
  const currentHand = match.getCurrentHand();

  if (!currentHand) {
    return {
      matchId,
      state: match.getState(),
      score: {
        playerOne: score.playerOne,
        playerTwo: score.playerTwo,
      },
      currentHand: null,
    };
  }

  const snapshot = currentHand.toSnapshot();

  const playerOneHand = currentHand.getPlayerHand('P1').map((card) => card.toString());
  const playerTwoHand = currentHand.getPlayerHand('P2').map((card) => card.toString());

  const visiblePlayerOneHand =
    viewerPlayerId === undefined
      ? playerOneHand
      : viewerPlayerId === 'P1'
        ? playerOneHand
        : maskHand(playerOneHand);

  const visiblePlayerTwoHand =
    viewerPlayerId === undefined
      ? playerTwoHand
      : viewerPlayerId === 'P2'
        ? playerTwoHand
        : maskHand(playerTwoHand);

  const availableActions = buildAvailableActions(snapshot, viewerPlayerId);
  const viewerCanActNow = resolveViewerCanActNow(availableActions);

  return {
    matchId,
    state: match.getState(),
    score: {
      playerOne: score.playerOne,
      playerTwo: score.playerTwo,
    },
    currentHand: {
      viraRank: snapshot.viraRank,
      finished: snapshot.finished,
      viewerPlayerId: viewerPlayerId ?? null,
      currentValue: snapshot.currentValue,
      betState: snapshot.betState,
      pendingValue: snapshot.pendingValue,
      requestedBy: snapshot.requestedBy,
      specialState: snapshot.specialState,
      specialDecisionPending: snapshot.specialDecisionPending,
      specialDecisionBy: snapshot.specialDecisionBy,
      winner: snapshot.winner,
      awardedPoints: snapshot.awardedPoints,
      currentRoundIndex: Math.max(snapshot.rounds.length - 1, 0),
      lastRoundResult: resolveLastRoundResult(snapshot),
      nextDecisionType: resolveNextDecisionType(match.getState(), snapshot),
      viewerCanActNow,
      pendingBotAction: resolvePendingBotAction(snapshot, viewerPlayerId, viewerCanActNow),
      availableActions,
      playerOneHand: visiblePlayerOneHand,
      playerTwoHand: visiblePlayerTwoHand,
      rounds: snapshot.rounds.map((round) => ({
        playerOneCard: round.plays.P1 ?? null,
        playerTwoCard: round.plays.P2 ?? null,
        result: round.finished ? Round.fromSnapshot(round).getResult() : null,
        finished: round.finished,
      })),
    },
  };
}
