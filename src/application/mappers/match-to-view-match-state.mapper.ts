import type { Match } from '../../domain/entities/match';
import { Round } from '../../domain/entities/round';
import type { PlayerId } from '../../domain/value-objects/player-id';
import type { ViewMatchStateResponseDto } from '../dtos/responses/view-match-state.response.dto';

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