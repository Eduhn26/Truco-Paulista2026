import type { Match } from '@game/domain/entities/match';
import { Round } from '@game/domain/entities/round';
import type { PlayerId } from '@game/domain/value-objects/player-id';
import type { ViewMatchStateResponseDto } from '@game/application/dtos/responses/view-match-state.response.dto';

function maskHand(cards: string[]): string[] {
  return cards.map(() => 'HIDDEN');
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
