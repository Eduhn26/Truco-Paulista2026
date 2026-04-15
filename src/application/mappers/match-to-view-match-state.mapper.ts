import type { Match } from '../../domain/entities/match';
import { Round } from '../../domain/entities/round';
import type {
  HandBetState,
  HandSnapshot,
  HandSpecialState,
  HandValue,
} from '../../domain/entities/hand';
import type { PlayerId } from '../../domain/value-objects/player-id';
import type { RoundResult } from '../../domain/value-objects/round-result';
import type { ViewMatchStateResponseDto } from '../dtos/responses/view-match-state.response.dto';

type CurrentHandView = NonNullable<ViewMatchStateResponseDto['currentHand']>;

function maskHand(cards: string[]): string[] {
  return cards.map(() => 'HIDDEN');
}

function canRaiseToTarget(
  snapshot: HandSnapshot,
  viewerPlayerId: PlayerId | undefined,
  currentValueRequired: HandValue,
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

  if (snapshot.currentValue !== currentValueRequired) {
    return false;
  }

  // NOTE: After a raise is accepted, only the accepting side owns the next
  // escalation window. The projection must follow the authoritative ownership
  // exported by the hand snapshot instead of exposing escalation controls to
  // both players.
  if (snapshot.currentValue > 1 && snapshot.raiseAuthority !== viewerPlayerId) {
    return false;
  }

  return true;
}

function canRespondToBet(snapshot: HandSnapshot, viewerPlayerId: PlayerId | undefined): boolean {
  if (!viewerPlayerId) {
    return false;
  }

  return snapshot.betState === 'awaiting_response' && snapshot.requestedBy !== viewerPlayerId;
}

function canResolveMaoDeOnze(
  snapshot: HandSnapshot,
  viewerPlayerId: PlayerId | undefined,
): boolean {
  if (!viewerPlayerId) {
    return false;
  }

  return (
    snapshot.specialState === 'mao_de_onze' &&
    snapshot.specialDecisionPending &&
    snapshot.specialDecisionBy === viewerPlayerId
  );
}

function buildAvailableActions(
  snapshot: HandSnapshot,
  viewerPlayerId: PlayerId | undefined,
): CurrentHandView['availableActions'] {
  const canRespondBet = canRespondToBet(snapshot, viewerPlayerId);
  const canResolveSpecial = canResolveMaoDeOnze(snapshot, viewerPlayerId);

  const canAttemptPlayCard =
    Boolean(viewerPlayerId) &&
    !snapshot.finished &&
    snapshot.betState === 'idle' &&
    !snapshot.specialDecisionPending;

  return {
    canRequestTruco: canRaiseToTarget(snapshot, viewerPlayerId, 1),
    canRaiseToSix: canRaiseToTarget(snapshot, viewerPlayerId, 3),
    canRaiseToNine: canRaiseToTarget(snapshot, viewerPlayerId, 6),
    canRaiseToTwelve: canRaiseToTarget(snapshot, viewerPlayerId, 9),
    canAcceptBet: canRespondBet,
    canDeclineBet: canRespondBet,
    canAcceptMaoDeOnze: canResolveSpecial,
    canDeclineMaoDeOnze: canResolveSpecial,
    canAttemptPlayCard,
  };
}

function resolveNextDecisionType(snapshot: HandSnapshot): CurrentHandView['nextDecisionType'] {
  if (snapshot.finished) {
    return 'start-next-hand';
  }

  if (snapshot.specialState === 'mao_de_onze' && snapshot.specialDecisionPending) {
    return 'resolve-mao-de-onze';
  }

  if (snapshot.betState === 'awaiting_response') {
    return 'respond-bet';
  }

  return 'play-card';
}

function resolveCurrentRoundIndex(snapshot: HandSnapshot): number {
  const firstUnfinishedRoundIndex = snapshot.rounds.findIndex((round) => !round.finished);

  if (firstUnfinishedRoundIndex >= 0) {
    return firstUnfinishedRoundIndex;
  }

  return Math.max(0, snapshot.rounds.length - 1);
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
      currentRoundIndex: resolveCurrentRoundIndex(snapshot),
      lastRoundResult: resolveLastRoundResult(snapshot),
      playerOneHand: visiblePlayerOneHand,
      playerTwoHand: visiblePlayerTwoHand,
      rounds: snapshot.rounds.map((round) => ({
        playerOneCard: round.plays.P1 ?? null,
        playerTwoCard: round.plays.P2 ?? null,
        result: round.finished ? Round.fromSnapshot(round).getResult() : null,
        finished: round.finished,
      })),
      currentValue: snapshot.currentValue,
      betState: snapshot.betState as HandBetState,
      pendingValue: snapshot.pendingValue,
      requestedBy: snapshot.requestedBy,
      specialState: snapshot.specialState as HandSpecialState,
      specialDecisionPending: snapshot.specialDecisionPending,
      specialDecisionBy: snapshot.specialDecisionBy,
      winner: snapshot.winner,
      awardedPoints: snapshot.awardedPoints,
      availableActions,
      nextDecisionType: resolveNextDecisionType(snapshot),
      viewerCanActNow:
        !snapshot.finished &&
        (canRespondToBet(snapshot, viewerPlayerId) ||
          canResolveMaoDeOnze(snapshot, viewerPlayerId) ||
          availableActions.canAttemptPlayCard),
      pendingBotAction: false,
    },
  };
}
