import type { PlayerId } from './player-id';

export class Score {
  private constructor(
    public readonly playerOne: number,
    public readonly playerTwo: number,
  ) {}

  static zero(): Score {
    return new Score(0, 0);
  }

  static fromValues(playerOne: number, playerTwo: number): Score {
    return new Score(playerOne, playerTwo);
  }

  addPoint(player: PlayerId): Score {
    return this.addPoints(player, 1);
  }

  addPoints(player: PlayerId, amount: number): Score {
    if (amount <= 0) {
      return this;
    }

    if (player === 'P1') {
      return new Score(this.playerOne + amount, this.playerTwo);
    }

    return new Score(this.playerOne, this.playerTwo + amount);
  }

  hasWinner(pointsToWin: number): PlayerId | null {
    if (this.playerOne >= pointsToWin) return 'P1';
    if (this.playerTwo >= pointsToWin) return 'P2';
    return null;
  }
}
