import type { PlayerId } from './player-id';

export class Score {
  private constructor(
    public readonly playerOne: number,
    public readonly playerTwo: number,
  ) {}

  static zero(): Score {
    return new Score(0, 0);
  }

  addPoint(player: PlayerId): Score {
    if (player === 'P1') return new Score(this.playerOne + 1, this.playerTwo);
    return new Score(this.playerOne, this.playerTwo + 1);
  }

  hasWinner(pointsToWin: number): PlayerId | null {
    if (this.playerOne >= pointsToWin) return 'P1';
    if (this.playerTwo >= pointsToWin) return 'P2';
    return null;
  }
}
