import type { Match } from '../../domain/entities/match';
import { Round, type SeatId } from '../../domain/entities/round';
import type {
  HandBetState,
  HandMode,
  HandSnapshot,
  HandSpecialState,
  HandValue,
} from '../../domain/entities/hand';
import type { PlayerId } from '../../domain/value-objects/player-id';
import type { RoundResult } from '../../domain/value-objects/round-result';
import type { ViewMatchStateResponseDto } from '../dtos/responses/view-match-state.response.dto';

type CurrentHandView = NonNullable<ViewMatchStateResponseDto['currentHand']>;

const SEAT_IDS = ['T1A', 'T1B', 'T2A', 'T2B'] as const;

function maskHand(cards: string[]): string[] {
  return cards.map(() => 'HIDDEN');
}

function isSeatId(value: unknown): value is SeatId {
  return typeof value === 'string' && SEAT_IDS.includes(value as SeatId);
}

function getSeatTeam(seatId: SeatId): PlayerId {
  return seatId.startsWith('T1') ? 'P1' : 'P2';
}

function canRaiseToTarget(
  snapshot: HandSnapshot,
  viewerPlayerId: PlayerId | undefined,
  currentValueRequired: HandValue,
): boolean {
  if (!viewerPlayerId) {
    return false;
  }

  if (snapshot.finished || snapshot.specialDecisionPending) {
    return false;
  }

  if (snapshot.specialState !== 'normal') {
    return false;
  }

  if (snapshot.betState === 'awaiting_response') {
    if (snapshot.requestedBy === viewerPlayerId) {
      return false;
    }

    return snapshot.pendingValue === currentValueRequired;
  }

  if (snapshot.betState !== 'idle') {
    return false;
  }

  if (snapshot.currentValue !== currentValueRequired) {
    return false;
  }

  // Escalation ownership comes from the hand snapshot, so the projection does
  // not expose raise controls to both teams after an accepted bet.
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
  const expectedPlayCount = snapshot.mode === '2v2' ? 4 : 2;

  for (let index = snapshot.rounds.length - 1; index >= 0; index -= 1) {
    const round = snapshot.rounds[index];

    if (!round?.finished) {
      continue;
    }

    return Round.fromSnapshot(round, expectedPlayCount).getResult();
  }

  return null;
}

function maskSeatHands(
  seatHands: Partial<Record<SeatId, string[]>>,
  viewerSeatId?: SeatId,
): Partial<Record<SeatId, string[]>> {
  const visibleSeatHands: Partial<Record<SeatId, string[]>> = {};

  for (const seatId of SEAT_IDS) {
    const cards = seatHands[seatId];

    if (!cards) {
      continue;
    }

    visibleSeatHands[seatId] =
      viewerSeatId === undefined || viewerSeatId === seatId ? cards : maskHand(cards);
  }

  return visibleSeatHands;
}

function resolveVisibleTeamHand({
  viewerPlayerId,
  viewerSeatId,
  teamId,
  fallbackHand,
  seatHands,
}: {
  viewerPlayerId: PlayerId | undefined;
  viewerSeatId: SeatId | undefined;
  teamId: PlayerId;
  fallbackHand: string[];
  seatHands: Partial<Record<SeatId, string[]>>;
}): string[] {
  if (viewerPlayerId === undefined) {
    return fallbackHand;
  }

  if (viewerPlayerId !== teamId) {
    return maskHand(fallbackHand);
  }

  if (viewerSeatId && getSeatTeam(viewerSeatId) === teamId) {
    return seatHands[viewerSeatId] ?? fallbackHand;
  }

  return fallbackHand;
}

function mapRound(snapshot: HandSnapshot, round: HandSnapshot['rounds'][number]) {
  const expectedPlayCount = snapshot.mode === '2v2' ? 4 : 2;
  const restoredRound = Round.fromSnapshot(round, expectedPlayCount);
  const winningOwnerId = round.finished ? restoredRound.getWinningOwnerId() : null;
  const winningSeatId = isSeatId(winningOwnerId) ? winningOwnerId : null;

  return {
    playerOneCard: round.plays.P1 ?? null,
    playerTwoCard: round.plays.P2 ?? null,
    result: round.finished ? restoredRound.getResult() : null,
    finished: round.finished,
    ...(round.seatPlays ? { seatPlays: round.seatPlays } : {}),
    orderedPlays: (round.orderedPlays ?? []).map((play) => ({
      ownerId: play.ownerId,
      seatId: isSeatId(play.ownerId) ? play.ownerId : null,
      playerId: play.playerId,
      card: play.card,
    })),
    winningSeatId,
  };
}

export function mapMatchToViewMatchState(
  matchId: string,
  match: Match,
  viewerPlayerId?: PlayerId,
  viewerSeatId?: SeatId,
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
  const mode: HandMode = snapshot.mode ?? '1v1';
  const resolvedViewerSeatId = viewerSeatId && isSeatId(viewerSeatId) ? viewerSeatId : undefined;

  const playerOneHand = currentHand.getPlayerHand('P1').map((card) => card.toString());
  const playerTwoHand = currentHand.getPlayerHand('P2').map((card) => card.toString());
  const seatHands = snapshot.seatHands ?? {};

  const visiblePlayerOneHand = resolveVisibleTeamHand({
    viewerPlayerId,
    viewerSeatId: resolvedViewerSeatId,
    teamId: 'P1',
    fallbackHand: playerOneHand,
    seatHands,
  });

  const visiblePlayerTwoHand = resolveVisibleTeamHand({
    viewerPlayerId,
    viewerSeatId: resolvedViewerSeatId,
    teamId: 'P2',
    fallbackHand: playerTwoHand,
    seatHands,
  });

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
      viraCard: snapshot.viraCard ?? `${snapshot.viraRank}C`,
      mode,
      finished: snapshot.finished,
      viewerPlayerId: viewerPlayerId ?? null,
      viewerSeatId: resolvedViewerSeatId ?? null,
      currentRoundIndex: resolveCurrentRoundIndex(snapshot),
      lastRoundResult: resolveLastRoundResult(snapshot),
      playerOneHand: visiblePlayerOneHand,
      playerTwoHand: visiblePlayerTwoHand,
      ...(mode === '2v2' ? { seatHands: maskSeatHands(seatHands, resolvedViewerSeatId) } : {}),
      rounds: snapshot.rounds.map((round) => mapRound(snapshot, round)),
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


