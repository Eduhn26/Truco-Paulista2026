export type HistoricalMatchMode = '1v1' | '2v2';

export type HistoricalMatchStatus = 'completed' | 'cancelled' | 'aborted';

export type HistoricalSeatId = 'T1A' | 'T2A' | 'T1B' | 'T2B';

export type HistoricalPlayerId = 'P1' | 'P2';

export type HistoricalRoundResult = 'P1' | 'P2' | 'TIE';

export type MatchRecordParticipantDto = {
  seatId: HistoricalSeatId;
  userId: string | null;
  displayName: string | null;
  isBot: boolean;
  botProfile: 'balanced' | 'aggressive' | 'cautious' | null;
};

export type MatchRecordScoreDto = {
  playerOne: number;
  playerTwo: number;
};

export type MatchRecordFinalStateDto = {
  state: string;
  viraRank: string | null;
  score: MatchRecordScoreDto;
  roundsPlayed: number;
  winnerPlayerId: HistoricalPlayerId | null;
};

export type MatchReplayEventType =
  | 'match-created'
  | 'hand-started'
  | 'card-played'
  | 'round-finished'
  | 'hand-finished'
  | 'match-finished';

export type MatchReplayEventPayloadDto =
  | {
      type: 'match-created';
      pointsToWin: number;
      mode: HistoricalMatchMode;
    }
  | {
      type: 'hand-started';
      handNumber: number;
      viraRank: string;
    }
  | {
      type: 'card-played';
      handNumber: number;
      roundNumber: number;
      playerId: HistoricalPlayerId;
      card: string;
    }
  | {
      type: 'round-finished';
      handNumber: number;
      roundNumber: number;
      result: HistoricalRoundResult;
    }
  | {
      type: 'hand-finished';
      handNumber: number;
      winnerPlayerId: HistoricalPlayerId | null;
      score: MatchRecordScoreDto;
    }
  | {
      type: 'match-finished';
      winnerPlayerId: HistoricalPlayerId | null;
      score: MatchRecordScoreDto;
      finalState: string;
    };

export type MatchReplayEventDto = {
  sequence: number;
  occurredAt: string;
  payload: MatchReplayEventPayloadDto;
};

export type MatchRecordDto = {
  id: string;
  matchId: string;
  mode: HistoricalMatchMode;
  status: HistoricalMatchStatus;
  pointsToWin: number;
  startedAt: string | null;
  finishedAt: string | null;
  participants: MatchRecordParticipantDto[];
  finalState: MatchRecordFinalStateDto;
  replayEvents: MatchReplayEventDto[];
};

export type CreateMatchRecordInputDto = {
  matchId: string;
  mode: HistoricalMatchMode;
  status: HistoricalMatchStatus;
  pointsToWin: number;
  startedAt: string | null;
  finishedAt: string | null;
  participants: MatchRecordParticipantDto[];
  finalState: MatchRecordFinalStateDto;
  replayEvents: MatchReplayEventDto[];
};

export type MatchHistoryListItemDto = {
  id: string;
  matchId: string;
  mode: HistoricalMatchMode;
  status: HistoricalMatchStatus;
  startedAt: string | null;
  finishedAt: string | null;
  participants: MatchRecordParticipantDto[];
  finalScore: MatchRecordScoreDto;
  winnerPlayerId: HistoricalPlayerId | null;
};

export type MatchReplayDto = {
  matchId: string;
  events: MatchReplayEventDto[];
};
