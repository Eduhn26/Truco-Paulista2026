import type {
  MatchAvailableActionsPayload,
  MatchStateHandPayload,
  MatchStatePayload,
  MatchStateRoundPayload,
  PlayerId,
  RoomStatePayload,
  SeatId,
} from '../../services/socket/socketTypes';

export type MatchStatusTone = 'neutral' | 'success' | 'warning';

export type TablePhase = 'waiting' | 'playing' | 'hand_finished' | 'match_finished';

export type MatchContractPresentation = {
  currentValue: number;
  betState: MatchStateHandPayload['betState'];
  pendingValue: MatchStateHandPayload['pendingValue'];
  requestedBy: PlayerId | null;
  specialState: MatchStateHandPayload['specialState'];
  specialDecisionPending: boolean;
  specialDecisionBy: PlayerId | null;
  winner: PlayerId | null;
  awardedPoints: MatchStateHandPayload['awardedPoints'];
  availableActions: MatchAvailableActionsPayload;
  handFinished: boolean;
  matchFinished: boolean;
  tablePhase: TablePhase;
  handStatusLabel: string;
  handStatusTone: MatchStatusTone;
  latestRound: MatchStateRoundPayload | null;
  rounds: MatchStateRoundPayload[];
  playedRoundsCount: number;
  canStartHand: boolean;
  canPlayCard: boolean;
  currentTurnSeatId: SeatId | null;
};

type BuildMatchContractPresentationInput = {
  publicMatchState: MatchStatePayload | null;
  roomState: RoomStatePayload | null;
  canStartHand: boolean;
  canPlayCard: boolean;
  isMyTurn: boolean;
  myCardsCount: number;
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

function resolveTablePhase(params: {
  publicMatchState: MatchStatePayload | null;
  handFinished: boolean;
  matchFinished: boolean;
}): TablePhase {
  const { publicMatchState, handFinished, matchFinished } = params;

  if (matchFinished || publicMatchState?.state === 'finished') {
    return 'match_finished';
  }

  if (publicMatchState?.state !== 'in_progress') {
    return 'waiting';
  }

  if (handFinished) {
    return 'hand_finished';
  }

  return 'playing';
}

function buildHandStatus(params: {
  publicMatchState: MatchStatePayload | null;
  currentPublicHand: MatchStateHandPayload | null;
  canStartHand: boolean;
  canPlayCard: boolean;
  isMyTurn: boolean;
  myCardsCount: number;
  playedRoundsCount: number;
  latestRound: MatchStateRoundPayload | null;
}): { handStatusLabel: string; handStatusTone: MatchStatusTone } {
  const {
    publicMatchState,
    currentPublicHand,
    canStartHand,
    canPlayCard,
    isMyTurn,
    myCardsCount,
    playedRoundsCount,
    latestRound,
  } = params;

  if (publicMatchState?.state === 'finished') {
    return {
      handStatusLabel: 'Partida encerrada.',
      handStatusTone: 'success',
    };
  }

  if (publicMatchState?.state !== 'in_progress' || !currentPublicHand) {
    return canStartHand
      ? {
          handStatusLabel: 'Todos estão prontos. Você já pode iniciar a próxima mão.',
          handStatusTone: 'success',
        }
      : {
          handStatusLabel: 'Aguardando início da próxima mão.',
          handStatusTone: 'neutral',
        };
  }

  if (currentPublicHand.finished) {
    return {
      handStatusLabel: 'Mão encerrada. Aguardando próxima mão.',
      handStatusTone: 'warning',
    };
  }

  if (latestRound?.finished) {
    return {
      handStatusLabel: 'Rodada encerrada. Preparando próxima jogada.',
      handStatusTone: 'warning',
    };
  }

  if (canPlayCard && isMyTurn) {
    return {
      handStatusLabel:
        myCardsCount > 0
          ? 'É o seu turno. Escolha uma carta da sua mão.'
          : 'É o seu turno, mas sua mão visível está vazia.',
      handStatusTone: 'success',
    };
  }

  if (playedRoundsCount === 0) {
    return {
      handStatusLabel: 'Nova mão iniciada. Aguarde a abertura da rodada.',
      handStatusTone: 'neutral',
    };
  }

  return {
    handStatusLabel: 'Aguardando a próxima ação do backend.',
    handStatusTone: 'neutral',
  };
}

export function buildMatchContractPresentation(
  input: BuildMatchContractPresentationInput,
): MatchContractPresentation {
  const { publicMatchState, roomState, canStartHand, canPlayCard, isMyTurn, myCardsCount } = input;

  const currentPublicHand = publicMatchState?.currentHand ?? null;
  const rounds = currentPublicHand?.rounds ?? [];
  const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] ?? null : null;
  const playedRounds = rounds.filter(
    (round) => round.playerOneCard !== null || round.playerTwoCard !== null,
  );

  const handFinished = Boolean(currentPublicHand?.finished);
  const matchFinished = publicMatchState?.state === 'finished';

  const tablePhase = resolveTablePhase({
    publicMatchState,
    handFinished,
    matchFinished,
  });

  const { handStatusLabel, handStatusTone } = buildHandStatus({
    publicMatchState,
    currentPublicHand,
    canStartHand,
    canPlayCard,
    isMyTurn,
    myCardsCount,
    playedRoundsCount: playedRounds.length,
    latestRound,
  });

  return {
    currentValue: currentPublicHand?.currentValue ?? 1,
    betState: currentPublicHand?.betState ?? 'idle',
    pendingValue: currentPublicHand?.pendingValue ?? null,
    requestedBy: currentPublicHand?.requestedBy ?? null,
    specialState: currentPublicHand?.specialState ?? 'normal',
    specialDecisionPending: currentPublicHand?.specialDecisionPending ?? false,
    specialDecisionBy: currentPublicHand?.specialDecisionBy ?? null,
    winner: currentPublicHand?.winner ?? null,
    awardedPoints: currentPublicHand?.awardedPoints ?? null,
    availableActions: currentPublicHand?.availableActions ?? EMPTY_AVAILABLE_ACTIONS,
    handFinished,
    matchFinished,
    tablePhase,
    handStatusLabel,
    handStatusTone,
    latestRound,
    rounds,
    playedRoundsCount: playedRounds.length,
    canStartHand,
    canPlayCard,
    currentTurnSeatId: roomState?.currentTurnSeatId ?? null,
  };
}