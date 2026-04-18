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

// CHANGE: new ValeTier type drives the escalation colour/motion system used by
// the header and the event stage. Single source of truth for "how risky is this hand".
export type ValeTier = 'muted' | 'gold' | 'orange' | 'red' | 'red-pulse';

export type MatchContractPresentation = {
  currentValue: number;
  // CHANGE: expose the tier alongside the raw value so any consumer (header,
  // table shell, overlays) can render with consistent escalation treatment.
  valeTier: ValeTier;
  betState: MatchStateHandPayload['betState'];
  pendingValue: MatchStateHandPayload['pendingValue'];
  // CHANGE: also expose tier for the pending (requested) value, used by the
  // pressure overlay so the ask reads at the right escalation level.
  pendingValeTier: ValeTier;
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

// CHANGE: canonical escalation table. 1 = no pressure; 3 = first ask; 6/9 =
// serious raises; 12 = maximum, pulses in the UI. Keep this centralised so the
// header pill, the pressure overlay and the climax stage all agree.
export function resolveValeTier(value: number | null | undefined): ValeTier {
  const resolved = value ?? 1;

  if (resolved >= 12) {
    return 'red-pulse';
  }

  if (resolved >= 9) {
    return 'red';
  }

  if (resolved >= 6) {
    return 'orange';
  }

  if (resolved >= 3) {
    return 'gold';
  }

  return 'muted';
}

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

function formatRequestedBy(requestedBy: PlayerId | null): string {
  if (requestedBy === 'P1') {
    return 'T1';
  }

  if (requestedBy === 'P2') {
    return 'T2';
  }

  return 'alguém';
}

function buildBetDecisionStatus(params: {
  currentPublicHand: MatchStateHandPayload;
  availableActions: MatchAvailableActionsPayload;
}): { handStatusLabel: string; handStatusTone: MatchStatusTone } {
  const { currentPublicHand, availableActions } = params;

  const requestedBy = formatRequestedBy(currentPublicHand.requestedBy ?? null);
  const pendingValue = currentPublicHand.pendingValue ?? currentPublicHand.currentValue;

  if (availableActions.canAcceptBet || availableActions.canDeclineBet) {
    const canRaise =
      availableActions.canRaiseToSix ||
      availableActions.canRaiseToNine ||
      availableActions.canRaiseToTwelve;

    return {
      handStatusLabel: canRaise
        ? `${requestedBy} pediu ${pendingValue}. Responda agora: aceitar, correr ou subir a aposta.`
        : `${requestedBy} pediu ${pendingValue}. Responda agora: aceitar ou correr.`,
      handStatusTone: 'warning',
    };
  }

  return {
    handStatusLabel: `${requestedBy} pediu ${pendingValue}. Aguarde a resposta da aposta.`,
    handStatusTone: 'warning',
  };
}

function buildHandResultStatus(params: {
  currentPublicHand: MatchStateHandPayload;
  canStartHand: boolean;
}): { handStatusLabel: string; handStatusTone: MatchStatusTone } {
  const { currentPublicHand, canStartHand } = params;

  if (currentPublicHand.winner && currentPublicHand.awardedPoints !== null) {
    const winnerLabel = currentPublicHand.winner === 'P1' ? 'T1' : 'T2';
    const pointsLabel =
      currentPublicHand.awardedPoints === 1
        ? '1 ponto'
        : `${currentPublicHand.awardedPoints} pontos`;

    return {
      handStatusLabel: `Mão encerrada. ${winnerLabel} venceu e marcou ${pointsLabel}.${canStartHand ? ' Você já pode iniciar a próxima mão.' : ''}`,
      handStatusTone: 'success',
    };
  }

  return {
    handStatusLabel: canStartHand
      ? 'Mão encerrada. Você já pode iniciar a próxima mão.'
      : 'Mão encerrada. Aguardando a próxima mão.',
    handStatusTone: 'warning',
  };
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
      handStatusLabel: 'Partida encerrada. Revise o resultado final e escolha a próxima ação.',
      handStatusTone: 'success',
    };
  }

  if (!currentPublicHand) {
    if (publicMatchState?.state === 'waiting' && canStartHand) {
      return {
        handStatusLabel: 'Todos estão prontos. Você já pode iniciar a próxima mão.',
        handStatusTone: 'neutral',
      };
    }

    return {
      handStatusLabel: 'Aguardando início da mão.',
      handStatusTone: 'neutral',
    };
  }

  if (currentPublicHand.specialState === 'mao_de_onze' && currentPublicHand.specialDecisionPending) {
    const requestedBy = formatRequestedBy(currentPublicHand.specialDecisionBy ?? null);

    const viewerMustDecide =
      currentPublicHand.availableActions?.canAcceptMaoDeOnze ||
      currentPublicHand.availableActions?.canDeclineMaoDeOnze;

    return {
      handStatusLabel: viewerMustDecide
        ? `Mão de 11. Analise suas cartas e decida se vai jogar ou correr contra ${requestedBy}.`
        : `Mão de 11 em decisão para ${requestedBy}. Aguardando a confirmação especial.`,
      handStatusTone: 'warning',
    };
  }

  if (currentPublicHand.betState === 'awaiting_response') {
    return buildBetDecisionStatus({
      currentPublicHand,
      availableActions: currentPublicHand.availableActions ?? EMPTY_AVAILABLE_ACTIONS,
    });
  }

  if (currentPublicHand.finished) {
    return buildHandResultStatus({
      currentPublicHand,
      canStartHand,
    });
  }

  if (latestRound?.finished) {
    return {
      handStatusLabel: 'Rodada encerrada. Preparando a próxima jogada.',
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
  const betDecisionPending = currentPublicHand?.betState === 'awaiting_response';

  const tablePhase = resolveTablePhase({
    publicMatchState,
    handFinished,
    matchFinished,
  });

  const { handStatusLabel, handStatusTone } = buildHandStatus({
    publicMatchState,
    currentPublicHand,
    canStartHand,
    canPlayCard: betDecisionPending ? false : canPlayCard,
    isMyTurn,
    myCardsCount,
    playedRoundsCount: playedRounds.length,
    latestRound,
  });

  const currentValue = currentPublicHand?.currentValue ?? 1;
  const pendingValue = currentPublicHand?.pendingValue ?? null;

  return {
    currentValue,
    // CHANGE: surface the resolved tiers so every consumer reads the same
    // escalation state from one canonical place.
    valeTier: resolveValeTier(currentValue),
    betState: currentPublicHand?.betState ?? 'idle',
    pendingValue,
    pendingValeTier: resolveValeTier(pendingValue ?? currentValue),
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
    canPlayCard: betDecisionPending ? false : canPlayCard,
    currentTurnSeatId: roomState?.currentTurnSeatId ?? null,
  };
}
