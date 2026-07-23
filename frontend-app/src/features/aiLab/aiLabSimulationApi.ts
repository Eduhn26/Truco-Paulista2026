import { getDefaultBackendUrl } from '../../config/appConfig';
import type {
  AiLabBotProfile,
  AiLabIntelligenceMode,
} from './aiLabData';

export type AiLabSimulationBotConfig = {
  profile: AiLabBotProfile;
  intelligenceMode: AiLabIntelligenceMode;
};

export type AiLabSimulationRequest = {
  botA: AiLabSimulationBotConfig;
  botB: AiLabSimulationBotConfig;
  seed: number;
  observability: {
    showInternalDecisions: boolean;
    showMlPredictions: boolean;
    showArchitectureTrace: boolean;
  };
};

export type AiLabArchitectureNode = {
  id: string;
  label: string;
  detail: string;
};

export type AiLabSimulationDecision = {
  decisionIndex: number;
  playerId: 'P1' | 'P2';
  profile: AiLabBotProfile;
  mode: AiLabIntelligenceMode;
  baseline?: {
    action: string;
    card?: string | null;
    strategy?: string | null;
  } | null;
  final?: {
    action: string;
    card?: string | null;
    strategy?: string | null;
  } | null;
  mlEligible: boolean;
  overrideEligible: boolean;
  scoreSensitive: boolean;
  shadowObserved?: boolean;
  overrideApplied: boolean;
  prediction?: {
    winProbability: number;
    predictedHandWin: number;
    threshold: number;
    artifactVersion: string;
    modelType: string;
  } | null;
  modelAvailable: boolean;
  modelErrorType?: string | null;
  predictionErrorType?: string | null;
  shadowDeduplicated?: boolean;
};

export type AiLabSimulationEvent = {
  eventId: string;
  sequence: number;
  type: string;
  category: 'system' | 'hand' | 'decision' | 'ml' | 'action' | 'result';
  title: string;
  description: string;
  handIndex?: number;
  roundIndex?: number;
  playerId?: 'P1' | 'P2';
  action?: string;
  card?: string | null;
  architecture?: AiLabArchitectureNode[];
  snapshot?: {
    scores?: {
      P1: number;
      P2: number;
    };
    viraRank?: string;
    currentValue?: number;
    pendingValue?: number | null;
    betState?: string;
    specialState?: string;
    actorHand?: string[];
    initialHands?: {
      P1: string[];
      P2: string[];
    };
  };
  decision?: AiLabSimulationDecision;
};

export type AiLabSimulationHand = {
  handIndex: number;
  starterPlayer: 'P1' | 'P2';
  viraRank: string;
  specialState: string;
  winnerPlayer: 'P1' | 'P2';
  pointsAwarded: number;
  finalHandValue: number;
  roundsPlayed: number;
  scoreBefore: {
    P1: number;
    P2: number;
  };
  scoreAfter: {
    P1: number;
    P2: number;
  };
  initialHands: {
    P1: string[];
    P2: string[];
  };
};

export type AiLabSimulationResult = {
  simulationRunId: string;
  seed: number;
  model: {
    requested: boolean;
    available: boolean;
    errorType?: string | null;
    fallbackPreserved: boolean;
  };
  architecture: AiLabArchitectureNode[];
  match: {
    matchId: string;
    winner: 'P1' | 'P2';
    playerOneScore: number;
    playerTwoScore: number;
    handsPlayed: number;
    decisionCount: number;
  };
  hands: AiLabSimulationHand[];
  events: AiLabSimulationEvent[];
};

export async function runAiLabSimulation(
  payload: AiLabSimulationRequest,
): Promise<AiLabSimulationResult> {
  const response = await fetch(`${getDefaultBackendUrl()}/ai-lab/simulate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Falha ao executar a simulação (${response.status}).`;

    try {
      const errorPayload = (await response.json()) as {
        message?: string;
      };

      if (typeof errorPayload.message === 'string') {
        message = errorPayload.message;
      }
    } catch {
      // Keep the HTTP status fallback message.
    }

    throw new Error(message);
  }

  return (await response.json()) as AiLabSimulationResult;
}
