import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  AI_LAB_ASSISTED_THRESHOLDS,
  AI_LAB_INTELLIGENCE_LABELS,
  AI_LAB_PROFILE_LABELS,
  type AiLabBotProfile,
  type AiLabIntelligenceMode,
} from './aiLabData';
import { buildAiLabMatchReplayState } from './aiLabMatchReplayAdapter';
import {
  countReplayBeats,
  getNextDecisionIndex,
  getNextHandIndex,
  getNextMlMomentIndex,
  getNextOverrideIndex,
  getNextReplayEventIndex,
  getPreviousReplayEventIndex,
  playerIdToBotLabel,
  toSpectatorText,
} from './aiLabReplayDirector';
import type {
  AiLabSimulationEvent,
  AiLabSimulationResult,
} from './aiLabSimulationApi';
import { MatchTableShell } from '../match/matchTableShell';

export type ReplaySpeed = 0.5 | 1 | 2 | 4;

type StudioBotConfig = {
  profile: AiLabBotProfile;
  intelligence: AiLabIntelligenceMode;
};

type EventFilter = 'all' | 'game' | 'decision' | 'ml' | 'bet' | 'result';

type Props = {
  result: AiLabSimulationResult;
  eventIndex: number;
  playing: boolean;
  speed: ReplaySpeed;
  botA: StudioBotConfig;
  botB: StudioBotConfig;
  showArchitectureTrace: boolean;
  onEventIndexChange: (index: number) => void;
  onPlayingChange: (playing: boolean) => void;
  onSpeedChange: (speed: ReplaySpeed) => void;
  onRunAgain: () => void;
  onExit: () => void;
};

type RuntimeTraceTone = 'heuristic' | 'ml' | 'override' | 'shadow' | 'fallback';

type RuntimeTraceItem = {
  key: number;
  label: string;
  tone: RuntimeTraceTone;
  title: string;
};

type RuntimeStats = {
  decisions: number;
  eligible: number;
  inferences: number;
  overrides: number;
  fallbacks: number;
  shadowObservations: number;
  baselinePreserved: number;
  maxProbability: number | null;
  timeline: RuntimeTraceItem[];
};

const EVENT_FILTERS: Array<{ id: EventFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'game', label: 'Jogo' },
  { id: 'decision', label: 'Decisões' },
  { id: 'ml', label: 'ML' },
  { id: 'bet', label: 'Apostas' },
  { id: 'result', label: 'Resultados' },
];

const SUIT_SYMBOLS: Record<string, string> = {
  P: '♣',
  C: '♥',
  E: '♠',
  O: '♦',
};

function formatCardLabel(card: string): string {
  return `${card.slice(0, -1)}${SUIT_SYMBOLS[card.slice(-1)] ?? card.slice(-1)}`;
}

function formatDecisionAction(action?: string | null): string {
  const labels: Record<string, string> = {
    'play-card': 'JOGAR CARTA',
    'request-truco': 'PEDIR TRUCO',
    'accept-bet': 'ACEITAR APOSTA',
    'decline-bet': 'RECUSAR APOSTA',
    'raise-to-six': 'AUMENTAR PARA 6',
    'raise-to-nine': 'AUMENTAR PARA 9',
    'raise-to-twelve': 'AUMENTAR PARA 12',
    'accept-mao-de-onze': 'ACEITAR MÃO DE 11',
    'decline-mao-de-onze': 'RECUSAR MÃO DE 11',
  };

  if (!action) {
    return '—';
  }

  return labels[action] ?? action.replace(/-/g, ' ').toUpperCase();
}

function formatDecisionChoice(
  decisionStep?: {
    action: string;
    card?: string | null;
  } | null,
): string {
  if (!decisionStep) {
    return '—';
  }

  if (decisionStep.action === 'play-card' && decisionStep.card) {
    return `JOGAR ${formatCardLabel(decisionStep.card)}`;
  }

  return formatDecisionAction(decisionStep.action);
}


function formatPtBrNumber(value: number, digits = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercentFromRatio(value: number, digits = 2): string {
  return `${formatPtBrNumber(value * 100, digits)}%`;
}

function formatPercentValue(value: number, digits = 2): string {
  return `${formatPtBrNumber(value, digits)}%`;
}

function formatPercentagePoints(value: number, digits = 2): string {
  const sign = value >= 0 ? '+' : '−';
  return `${sign}${formatPtBrNumber(Math.abs(value), digits)} pp`;
}

type IdleNarrative = {
  eyebrow: string;
  title: string;
  description: string;
  pulse: string;
};

function resolveIdleNarrative(event: AiLabSimulationEvent | null): IdleNarrative {
  switch (event?.type) {
    case 'simulation.started':
    case 'match.started':
      return {
        eyebrow: 'RUNTIME OBSERVÁVEL',
        title: 'Aguardando próxima decisão',
        description:
          'A partida foi iniciada. O primeiro estado enviado ao Strategy Engine será destacado aqui.',
        pulse: 'AGUARDANDO PRIMEIRA DECISÃO',
      };
    case 'hand.started':
    case 'cards.dealt':
      return {
        eyebrow: 'NOVA MÃO',
        title: 'Preparando nova mão',
        description:
          'As cartas foram distribuídas e o runtime aguarda a próxima passagem pelo Strategy Engine.',
        pulse: 'PRÓXIMA DECISÃO SERÁ DESTACADA',
      };
    case 'card.played':
      return {
        eyebrow: 'GAMEPLAY EM CURSO',
        title: 'Aguardando próxima decisão',
        description:
          'Uma carta entrou na mesa. O próximo ciclo de decisão será exibido assim que o bot voltar ao Strategy Engine.',
        pulse: 'AGUARDANDO PRÓXIMA DECISÃO',
      };
    case 'round.resolved':
      return {
        eyebrow: 'VAZA RESOLVIDA',
        title: 'Vaza concluída',
        description:
          'A mesa concluiu a vaza e o runtime aguarda o próximo estado de decisão da mão.',
        pulse: 'PRÓXIMA DECISÃO SERÁ DESTACADA',
      };
    case 'bet.requested':
    case 'bet.raised':
      return {
        eyebrow: 'APOSTA EM ABERTO',
        title: 'Aguardando próxima decisão',
        description:
          'O valor da mesa mudou. A próxima resposta do Strategy Engine será destacada neste painel.',
        pulse: 'PRÓXIMA DECISÃO: RESPONDER APOSTA',
      };
    case 'bet.accepted':
      return {
        eyebrow: 'APOSTA ACEITA',
        title: 'Aguardando próxima decisão',
        description:
          'A decisão de aposta foi concluída. A partida segue até o próximo estado relevante para a estratégia.',
        pulse: 'AGUARDANDO PRÓXIMA AÇÃO',
      };
    case 'bet.declined':
    case 'special.accepted':
    case 'special.declined':
      return {
        eyebrow: 'DECISÃO CONCLUÍDA',
        title: 'Aguardando próxima decisão',
        description:
          'O runtime registrou a resposta e prepara a próxima etapa observável da partida.',
        pulse: 'AGUARDANDO PRÓXIMA DECISÃO',
      };
    case 'hand.finished':
      return {
        eyebrow: 'MÃO CONCLUÍDA',
        title: 'Preparando nova mão',
        description:
          'O resultado já foi aplicado ao placar. O laboratório aguarda o próximo ciclo da simulação.',
        pulse: 'AGUARDANDO NOVA MÃO',
      };
    default:
      return {
        eyebrow: 'RUNTIME OBSERVÁVEL',
        title: 'Aguardando próxima decisão',
        description:
          'A mesa continua jogando. Quando um bot entrar no Strategy Engine, o raciocínio ocupará este painel automaticamente.',
        pulse: 'PRÓXIMA DECISÃO SERÁ DESTACADA',
      };
  }
}

function matchesFilter(event: AiLabSimulationEvent, filter: EventFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'decision') return event.category === 'decision';
  if (filter === 'ml') return event.category === 'ml';
  if (filter === 'result') return event.category === 'result';

  if (filter === 'bet') {
    return event.type.startsWith('bet.') || event.type.startsWith('special.');
  }

  return ['system', 'hand', 'action'].includes(event.category);
}

function resolvePolicyThreshold(event: AiLabSimulationEvent | null) {
  const decision = event?.decision;

  if (!decision?.prediction || decision.mode !== 'ml-assisted') {
    return null;
  }

  const thresholds = AI_LAB_ASSISTED_THRESHOLDS[decision.profile];
  const action = decision.final?.action ?? decision.baseline?.action ?? '';
  const betState = event?.snapshot?.betState;

  if (betState === 'idle') {
    return {
      label: 'Pedir truco',
      operator: '≥' as const,
      value: thresholds.initiative,
    };
  }

  if (action.startsWith('raise-to-')) {
    return {
      label: 'Aumentar',
      operator: '≥' as const,
      value: thresholds.raiseValue,
    };
  }

  if (action === 'accept-bet') {
    return {
      label: 'Aceitar',
      operator: '≥' as const,
      value: thresholds.accept,
    };
  }

  if (action === 'decline-bet') {
    return {
      label: 'Recusar',
      operator: '≤' as const,
      value: thresholds.decline,
    };
  }

  return null;
}

function hasRuntimeFailureDecision(
  decision: NonNullable<AiLabSimulationEvent['decision']>,
): boolean {
  return Boolean(
    !decision.modelAvailable ||
      decision.modelErrorType ||
      decision.predictionErrorType,
  );
}

function resolveGuardrailReason(
  decision: NonNullable<AiLabSimulationEvent['decision']>,
): { label: string; detail: string } {
  if (decision.baseline?.card) {
    return {
      label: 'ESCOLHA DE CARTA',
      detail: 'O modelo não participa da estratégia de cartas.',
    };
  }

  if (decision.scoreSensitive) {
    return {
      label: 'PLACAR SENSÍVEL',
      detail: 'O guardrail de placar preservou a decisão heurística.',
    };
  }

  if (!decision.overrideEligible) {
    return {
      label: 'FORA DA POLÍTICA DE OVERRIDE',
      detail: 'A política atual não autoriza intervenção do modelo neste estado.',
    };
  }

  return {
    label: 'ESTADO NÃO ELEGÍVEL',
    detail: 'O estado atual ficou fora do contrato experimental do modelo.',
  };
}

function resolveMlDisplay(event: AiLabSimulationEvent | null) {
  const decision = event?.decision;

  if (!decision) {
    return {
      label: 'Aguardando',
      detail: 'O modelo aparece aqui quando uma decisão elegível entra no runtime.',
      tone: 'neutral' as const,
    };
  }

  if (decision.mode === 'heuristic') {
    return {
      label: 'Não participa',
      detail: 'Esta execução usa exclusivamente o motor heurístico.',
      tone: 'neutral' as const,
    };
  }

  if (!decision.mlEligible) {
    return {
      label: 'Fora do escopo',
      detail: 'O ML não controla este tipo de decisão. A heurística permanece responsável.',
      tone: 'neutral' as const,
    };
  }

  if (
    !decision.modelAvailable ||
    decision.modelErrorType ||
    decision.predictionErrorType
  ) {
    return {
      label: 'Fallback heurístico',
      detail: 'O modelo ficou indisponível e a decisão segura foi preservada.',
      tone: 'warning' as const,
    };
  }

  if (decision.prediction) {
    return {
      label: formatPercentFromRatio(decision.prediction.winProbability),
      detail:
        decision.mode === 'shadow'
          ? 'Probabilidade observada em paralelo, sem autoridade sobre a partida.'
          : 'Probabilidade usada pela política ML-assisted.',
      tone: 'green' as const,
    };
  }

  if (decision.mode === 'shadow' && !decision.shadowObserved) {
    return {
      label: 'Deduplicado',
      detail: 'O Shadow Runtime já havia observado um estado equivalente.',
      tone: 'neutral' as const,
    };
  }

  return {
    label: 'Sem inferência',
    detail: 'A decisão permaneceu sob responsabilidade da heurística.',
    tone: 'neutral' as const,
  };
}

function getDecisionStageCount(event: AiLabSimulationEvent): number {
  const decision = event.decision;

  if (!decision) return 1;
  if (decision.mode === 'heuristic') return 2;
  if (decision.mode === 'shadow') return 3;
  if (!decision.mlEligible) return 1;
  if (
    !decision.modelAvailable ||
    decision.modelErrorType ||
    decision.predictionErrorType
  ) {
    return 2;
  }

  return resolvePolicyThreshold(event) ? 4 : 3;
}

function collectRuntimeStats(
  events: AiLabSimulationEvent[],
  eventIndex: number,
): RuntimeStats {
  const visibleEvents = events.slice(0, eventIndex + 1);
  const decisionsByIndex = new Map<number, AiLabSimulationEvent>();

  for (const event of visibleEvents) {
    if (event.decision) {
      decisionsByIndex.set(event.decision.decisionIndex, event);
    }
  }

  const decisionEvents = [...decisionsByIndex.values()].sort(
    (left, right) =>
      (left.decision?.decisionIndex ?? 0) -
      (right.decision?.decisionIndex ?? 0),
  );

  let eligible = 0;
  let inferences = 0;
  let overrides = 0;
  let fallbacks = 0;
  let shadowObservations = 0;
  let baselinePreserved = 0;

  const timeline: RuntimeTraceItem[] = decisionEvents.slice(-10).map((event) => {
    const decision = event.decision!;
    const isFallback =
      decision.mode === 'ml-assisted' &&
      decision.mlEligible &&
      (
        !decision.modelAvailable ||
        Boolean(decision.modelErrorType) ||
        Boolean(decision.predictionErrorType)
      );

    if (decision.mlEligible) eligible += 1;
    if (decision.prediction) inferences += 1;
    if (decision.overrideApplied) overrides += 1;
    if (isFallback) fallbacks += 1;
    if (decision.shadowObserved) shadowObservations += 1;

    const baselineAction = decision.baseline?.action ?? null;
    const finalAction = decision.final?.action ?? baselineAction;
    const baselineCard = decision.baseline?.card ?? null;
    const finalCard = decision.final?.card ?? baselineCard;

    if (
      !decision.overrideApplied &&
      baselineAction &&
      finalAction === baselineAction &&
      finalCard === baselineCard
    ) {
      baselinePreserved += 1;
    }

    const tone: RuntimeTraceTone = decision.overrideApplied
      ? 'override'
      : isFallback
        ? 'fallback'
        : decision.mode === 'shadow'
          ? 'shadow'
          : decision.prediction
            ? 'ml'
            : 'heuristic';

    const label = tone === 'override'
      ? 'OV'
      : tone === 'fallback'
        ? 'FB'
        : tone === 'shadow'
          ? 'SH'
          : tone === 'ml'
            ? 'ML'
            : 'HE';

    return {
      key: decision.decisionIndex,
      label,
      tone,
      title: `#${String(decision.decisionIndex).padStart(3, '0')} · ${
        playerIdToBotLabel(decision.playerId)
      } · ${formatDecisionChoice(decision.final ?? decision.baseline)}`,
    };
  });

  // The counters above were calculated only for the last timeline window.
  // Recalculate the aggregate counters across every unique visible decision.
  eligible = decisionEvents.filter((event) => event.decision?.mlEligible).length;
  inferences = decisionEvents.filter((event) => Boolean(event.decision?.prediction)).length;
  overrides = decisionEvents.filter((event) => event.decision?.overrideApplied).length;
  fallbacks = decisionEvents.filter((event) => {
    const decision = event.decision;

    return Boolean(
      decision &&
      decision.mode === 'ml-assisted' &&
      decision.mlEligible &&
      (
        !decision.modelAvailable ||
        decision.modelErrorType ||
        decision.predictionErrorType
      ),
    );
  }).length;
  shadowObservations = decisionEvents.filter(
    (event) => event.decision?.shadowObserved,
  ).length;
  baselinePreserved = decisionEvents.filter((event) => {
    const decision = event.decision;

    if (!decision || decision.overrideApplied) {
      return false;
    }

    const baselineAction = decision.baseline?.action ?? null;
    const finalAction = decision.final?.action ?? baselineAction;
    const baselineCard = decision.baseline?.card ?? null;
    const finalCard = decision.final?.card ?? baselineCard;

    return Boolean(
      baselineAction &&
      finalAction === baselineAction &&
      finalCard === baselineCard,
    );
  }).length;

  const probabilities = decisionEvents
    .map((event) => event.decision?.prediction?.winProbability ?? null)
    .filter((value): value is number => value !== null);

  const maxProbability =
    probabilities.length > 0 ? Math.max(...probabilities) : null;

  return {
    decisions: decisionEvents.length,
    eligible,
    inferences,
    overrides,
    fallbacks,
    shadowObservations,
    baselinePreserved,
    maxProbability,
    timeline,
  };
}

function ThresholdSignal({
  probability,
  threshold,
  operator,
  label,
}: {
  probability: number;
  threshold: number;
  operator: '≥' | '≤';
  label: string;
}) {
  const probabilityPercent = Math.max(0, Math.min(100, probability * 100));
  const thresholdPercent = Math.max(0, Math.min(100, threshold * 100));
  const passed =
    operator === '≥'
      ? probability >= threshold
      : probability <= threshold;
  const observedOperator = probability === threshold
    ? '='
    : probability > threshold
      ? '>'
      : '<';
  const policyMarginPoints =
    operator === '≥'
      ? (probability - threshold) * 100
      : (threshold - probability) * 100;
  const marginLabel = formatPercentagePoints(policyMarginPoints);

  return (
    <div
      className={
        passed
          ? 'ai-lab-intelligence-threshold is-passed'
          : 'ai-lab-intelligence-threshold'
      }
    >
      <div className="ai-lab-intelligence-threshold__heading">
        <div>
          <span>REGRA DA POLÍTICA</span>
          <strong>
            {label} se modelo {operator} {formatPercentValue(thresholdPercent, 0)}
          </strong>
        </div>

        <span className="ai-lab-intelligence-threshold__status">
          {passed ? 'LIMIAR ATINGIDO' : 'LIMIAR NÃO ATINGIDO'}
        </span>
      </div>

      <div className="ai-lab-intelligence-threshold__equation">
        <div>
          <span>RESULTADO DO MODELO</span>
          <strong>{formatPercentValue(probabilityPercent)}</strong>
        </div>

        <b>{observedOperator}</b>

        <div>
          <span>LIMIAR DA REGRA</span>
          <strong>{formatPercentValue(thresholdPercent, 0)}</strong>
        </div>
      </div>

      <div className="ai-lab-intelligence-threshold__margin">
        <span>MARGEM DA REGRA</span>
        <strong className={passed ? 'is-positive' : 'is-negative'}>
          {marginLabel}
        </strong>
      </div>

      <div className="ai-lab-intelligence-threshold__meter">
        <div
          className="ai-lab-intelligence-threshold__fill"
          style={{ width: `${probabilityPercent}%` }}
        />

        <span
          className="ai-lab-intelligence-threshold__marker is-threshold"
          style={{ left: `${thresholdPercent}%` }}
        >
          <i />
          <small>{formatPercentValue(thresholdPercent, 0)}</small>
        </span>

        <span
          className="ai-lab-intelligence-threshold__marker is-probability"
          style={{ left: `${probabilityPercent}%` }}
        >
          <i />
          <small>{formatPercentValue(probabilityPercent)}</small>
        </span>
      </div>
    </div>
  );
}

function IntelligenceDecisionFlow({
  event,
  stage,
}: {
  event: AiLabSimulationEvent;
  stage: number;
}) {
  const decision = event.decision;

  if (!decision) {
    return null;
  }

  const mlDisplay = resolveMlDisplay(event);
  const policy = resolvePolicyThreshold(event);
  const probability = decision.prediction?.winProbability ?? null;
  const finalChoice = formatDecisionChoice(decision.final ?? decision.baseline);
  const baselineChoice = formatDecisionChoice(decision.baseline);

  if (decision.mode === 'heuristic') {
    return (
      <div className="ai-lab-intelligence-common-decision">
        <div>
          <span>DECISÃO HEURÍSTICA</span>
          <strong>{finalChoice}</strong>
        </div>

        <small>
          Strategy Engine ·{' '}
          {decision.final?.strategy ??
            decision.baseline?.strategy ??
            'estratégia determinística'}
        </small>
      </div>
    );
  }

  if (decision.mode === 'shadow') {
    return (
      <div className="ai-lab-intelligence-shadow">
        <div className="ai-lab-intelligence-shadow__origin">
          <span>SHADOW MODE</span>
          <strong>UMA DECISÃO · DOIS CAMINHOS</strong>
          <small>O modelo observa sem alterar a partida.</small>
        </div>

        <div className="ai-lab-intelligence-shadow__branches">
          <div className="is-heuristic">
            <span>HEURÍSTICA</span>
            <strong>{baselineChoice}</strong>
            <small>EXECUTADO</small>
          </div>

          <div className={stage >= 1 ? 'is-ml is-visible' : 'is-ml'}>
            <span>RANDOM FOREST</span>

            {decision.prediction ? (
              <strong className="ai-lab-intelligence-shadow__probability">
                {formatPercentFromRatio(decision.prediction.winProbability)}
              </strong>
            ) : (
              <strong>{mlDisplay.label}</strong>
            )}

            <small>OBSERVADO</small>
          </div>
        </div>

        <div
          className={
            stage >= 2
              ? 'ai-lab-intelligence-shadow__result is-visible'
              : 'ai-lab-intelligence-shadow__result'
          }
        >
          <span>PARTIDA NÃO ALTERADA</span>
          <strong>{finalChoice}</strong>
          <small>
            {decision.shadowObserved
              ? 'A inferência foi registrada como telemetria.'
              : 'O estado foi deduplicado pelo Shadow Runtime.'}
          </small>
        </div>
      </div>
    );
  }

  const hasRuntimeFailure = Boolean(
    !decision.modelAvailable ||
    decision.modelErrorType ||
    decision.predictionErrorType,
  );

  if (!decision.mlEligible) {
    const guardrailReason = resolveGuardrailReason(decision);

    return (
      <div className="ai-lab-intelligence-guardrail">
        <div className="ai-lab-intelligence-guardrail__badge">
          <span>GUARDRAIL ATIVO</span>
          <strong>ML NÃO ELEGÍVEL</strong>
        </div>

        <div className="ai-lab-intelligence-guardrail__action">
          <span>HEURÍSTICA EXECUTADA</span>
          <strong>{finalChoice}</strong>
        </div>

        <div className="ai-lab-intelligence-guardrail__reason">
          <span>{guardrailReason.label}</span>
          <small>{guardrailReason.detail}</small>
        </div>
      </div>
    );
  }

  if (hasRuntimeFailure) {
    return (
      <div className="ai-lab-intelligence-fallback-card">
        <span>FALLBACK HEURÍSTICO</span>
        <strong>{finalChoice}</strong>
        <p>{mlDisplay.detail}</p>
        <small>A partida continua sem depender do modelo.</small>
      </div>
    );
  }

  const finalStage = policy ? 3 : 2;
  const policyPassed = Boolean(
    policy &&
    probability !== null &&
    (policy.operator === '≥'
      ? probability >= policy.value
      : probability <= policy.value),
  );
  const policyObservedOperator =
    policy && probability !== null
      ? probability === policy.value
        ? '='
        : probability > policy.value
          ? '>'
          : '<'
      : '=';
  const policyMarginPoints =
    policy && probability !== null
      ? policy.operator === '≥'
        ? (probability - policy.value) * 100
        : (policy.value - probability) * 100
      : 0;
  const policyMarginLabel = formatPercentagePoints(policyMarginPoints);

  return (
    <div className="ai-lab-intelligence-cascade">
      <motion.div
        layout
        className={`ai-lab-intelligence-cascade__node is-heuristic ${
          stage === 0 ? 'is-active' : 'is-complete'
        }`}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="ai-lab-intelligence-cascade__index">01</span>

        <div className="ai-lab-intelligence-cascade__content">
          <small>HEURÍSTICA</small>
          <strong>{baselineChoice}</strong>
          {stage === 0 ? (
            <p>{decision.baseline?.strategy ?? 'Baseline determinística'}</p>
          ) : null}
        </div>

        <b>{stage === 0 ? 'PROCESSANDO' : '✓'}</b>
      </motion.div>

      {stage >= 1 ? (
        <motion.div
          className="ai-lab-intelligence-cascade__connector is-ml"
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.28 }}
        >
          <i />
          <span>↓</span>
        </motion.div>
      ) : null}

      {stage >= 1 ? (
        <motion.div
          layout
          className={`ai-lab-intelligence-cascade__node is-ml ${
            stage === 1 ? 'is-active' : 'is-complete'
          }`}
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
        >
          <span className="ai-lab-intelligence-cascade__index">02</span>

          <div className="ai-lab-intelligence-cascade__content">
            <small>RANDOM FOREST</small>

            {decision.prediction ? (
              stage === 1 ? (
                <>
                  <strong className="ai-lab-intelligence-cascade__probability">
                    {formatPtBrNumber(decision.prediction.winProbability * 100)}
                    <em>%</em>
                  </strong>
                  <p>Chance estimada de vencer a mão</p>
                </>
              ) : (
                <strong>
                  {formatPercentFromRatio(decision.prediction.winProbability)}
                </strong>
              )
            ) : (
              <strong>{mlDisplay.label}</strong>
            )}
          </div>

          <b>{stage === 1 ? 'INFERÊNCIA' : '✓'}</b>
        </motion.div>
      ) : null}

      {policy && probability !== null && stage >= 2 ? (
        <>
          <motion.div
            className="ai-lab-intelligence-cascade__connector is-policy"
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.28 }}
          >
            <i />
            <span>↓</span>
          </motion.div>

          <motion.div
            layout
            className={`ai-lab-intelligence-cascade__node is-policy ${
              stage === 2 ? 'is-active' : 'is-complete'
            }`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
          >
            <span className="ai-lab-intelligence-cascade__index">03</span>

            <div className="ai-lab-intelligence-cascade__content">
              {stage === 2 ? (
                <ThresholdSignal
                  probability={probability}
                  threshold={policy.value}
                  operator={policy.operator}
                  label={policy.label}
                />
              ) : (
                <>
                  <small>
                    POLÍTICA · {policyPassed ? 'LIMIAR ATINGIDO' : 'LIMIAR NÃO ATINGIDO'}
                  </small>
                  <strong>
                    {formatPercentFromRatio(probability)} {policyObservedOperator}{' '}
                    {formatPercentFromRatio(policy.value, 0)}
                  </strong>
                  <p className="ai-lab-intelligence-cascade__policy-margin">
                    margem {policyMarginLabel}
                  </p>
                </>
              )}
            </div>

            <b>{stage === 2 ? 'AVALIANDO' : '✓'}</b>
          </motion.div>
        </>
      ) : null}

      {stage >= finalStage ? (
        <>
          <motion.div
            className={`ai-lab-intelligence-cascade__connector ${
              decision.overrideApplied ? 'is-override' : 'is-final'
            }`}
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: 0.3 }}
          >
            <i />
            <span>↓</span>
          </motion.div>

          <motion.div
            layout
            className={`ai-lab-intelligence-final ai-lab-intelligence-final--cascade is-visible ${
              decision.overrideApplied ? 'is-override' : 'is-preserved'
            }`}
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
          >
            <span>
              {decision.overrideApplied ? '✦ ML OVERRIDE' : 'BASELINE PRESERVADA'}
            </span>

            {decision.overrideApplied ? (
              <div className="ai-lab-intelligence-final__override-path">
                <small>{baselineChoice}</small>
                <i>↓</i>
                <strong>{finalChoice}</strong>
              </div>
            ) : (
              <strong>{finalChoice}</strong>
            )}

            <small>
              {decision.overrideApplied
                ? 'O sinal probabilístico alterou a decisão elegível.'
                : 'A política manteve a decisão heurística original.'}
            </small>
          </motion.div>
        </>
      ) : null}
    </div>
  );
}

function IdleBotCard({
  label,
  config,
  accent,
}: {
  label: 'BOT A' | 'BOT B';
  config: StudioBotConfig;
  accent: 'gold' | 'green';
}) {
  return (
    <div className={`ai-lab-intelligence-idle-bot is-${accent}`}>
      <div>
        <span>{label}</span>
        <strong>{AI_LAB_PROFILE_LABELS[config.profile]}</strong>
      </div>

      <span className="ai-lab-intelligence-idle-bot__mode">
        <i />
        {AI_LAB_INTELLIGENCE_LABELS[config.intelligence]}
      </span>
    </div>
  );
}

function LiveTelemetryBar({
  stats,
  seed,
}: {
  stats: RuntimeStats;
  seed: number;
}) {
  const eligibility =
    stats.decisions > 0 ? (stats.eligible / stats.decisions) * 100 : 0;

  return (
    <section
      className="ai-lab-live-telemetry ai-lab-live-telemetry--header"
      aria-label="Telemetria ao vivo da simulação"
    >
      <div className="ai-lab-live-telemetry__flow">
        <span>LIVE EXPERIMENT · SEED {seed}</span>
        <strong>
          <b>{stats.decisions}</b> decisões <i>→</i>{' '}
          <b>{stats.eligible}</b> elegíveis <i>→</i>{' '}
          <b>{stats.inferences}</b> inferências <i>→</i>{' '}
          <motion.b
            key={`override-count-${stats.overrides}`}
            className="is-override"
            initial={stats.overrides > 0 ? { scale: 0.72, opacity: 0.5 } : false}
            animate={
              stats.overrides > 0
                ? { scale: [1, 1.32, 1], opacity: 1 }
                : { scale: 1, opacity: 1 }
            }
            transition={{ duration: 0.55, ease: 'easeOut' }}
          >
            {stats.overrides}
          </motion.b>{' '}
          {stats.overrides === 1 ? 'override' : 'overrides'}
        </strong>
        <small>
          ELEGIBILIDADE ML {formatPercentValue(eligibility, 1)} · FB {stats.fallbacks} · SH{' '}
          {stats.shadowObservations}
        </small>
      </div>

      <div className="ai-lab-live-telemetry__timeline">
        <span>DECISION TRACE</span>
        <div>
          {stats.timeline.length > 0 ? (
            stats.timeline.map((item, index) => (
              <i
                key={item.key}
                className={`is-${item.tone} ${
                  index === stats.timeline.length - 1 ? 'is-current' : ''
                }`}
                title={item.title}
                aria-label={item.title}
              >
                {item.label}
              </i>
            ))
          ) : (
            <small>aguardando decisões</small>
          )}
        </div>
      </div>

      <div className="ai-lab-live-telemetry__model">
        <span>RANDOM FOREST · ARTIFACT v1.0</span>
        <div className="ai-lab-live-telemetry__model-metrics">
          <div>
            <b>74,29%</b>
            <small>BAL. ACC</small>
          </div>
          <div>
            <b>0,8305</b>
            <small>ROC AUC</small>
          </div>
          <div>
            <b>85,42%</b>
            <small>HIGH-CONF ACC.</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function ExperimentSummary({
  result,
  stats,
}: {
  result: AiLabSimulationResult;
  stats: RuntimeStats;
}) {
  const coverage =
    stats.decisions > 0 ? (stats.eligible / stats.decisions) * 100 : 0;
  const winnerLabel = result.match.winner === 'P1' ? 'BOT A' : 'BOT B';

  return (
    <motion.div
      className="ai-lab-experiment-summary"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <span>EXPERIMENTO CONCLUÍDO</span>
      <strong>{winnerLabel} venceu a simulação</strong>
      <small>
        BOT A {result.match.playerOneScore} × {result.match.playerTwoScore} BOT B
      </small>

      <div className="ai-lab-experiment-summary__metrics">
        <div>
          <span>DECISÕES</span>
          <strong>{stats.decisions}</strong>
        </div>
        <div>
          <span>ML ELEGÍVEL</span>
          <strong>{stats.eligible}</strong>
        </div>
        <div>
          <span>INFERÊNCIAS</span>
          <strong>{stats.inferences}</strong>
        </div>
        <div className="is-override">
          <span>OVERRIDES</span>
          <strong>{stats.overrides}</strong>
        </div>
      </div>

      <div className="ai-lab-experiment-summary__insights">
        <div>
          <span>ELEGIBILIDADE ML</span>
          <strong>{formatPercentValue(coverage, 1)}</strong>
        </div>

        <div>
          <span>MAIOR PROBABILIDADE</span>
          <strong>
            {stats.maxProbability === null
              ? '—'
              : formatPercentFromRatio(stats.maxProbability)}
          </strong>
        </div>

        <div>
          <span>FALLBACKS</span>
          <strong>{stats.fallbacks}</strong>
        </div>
      </div>

      <p>
        Random Forest v1.0 · 74,29% Balanced Accuracy · ROC AUC 0,8305
      </p>
    </motion.div>
  );
}

export function AiLabSpectatorReplay({
  result,
  eventIndex,
  playing,
  speed,
  botA,
  botB,
  showArchitectureTrace,
  onEventIndexChange,
  onPlayingChange,
  onSpeedChange,
  onRunAgain,
  onExit,
}: Props) {
  const [decisionStage, setDecisionStage] = useState(0);
  const [drawer, setDrawer] = useState<'trace' | 'architecture' | null>(null);
  const [eventFilter, setEventFilter] = useState<EventFilter>('all');
  const eventRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const theaterRef = useRef<HTMLDivElement | null>(null);
  const theaterViewportRef = useRef<HTMLDivElement | null>(null);

  const replayState = useMemo(
    () => buildAiLabMatchReplayState(result, eventIndex),
    [eventIndex, result],
  );

  const {
    activeDecisionEvent,
    currentEvent,
    latestDecisionEvent,
    presentationEvent,
    tableProps,
  } = replayState;

  const filteredEvents = useMemo(
    () => result.events.filter((event) => matchesFilter(event, eventFilter)),
    [eventFilter, result.events],
  );

  const runtimeStats = useMemo(
    () => collectRuntimeStats(result.events, eventIndex),
    [eventIndex, result.events],
  );

  useEffect(() => {
    if (!activeDecisionEvent?.decision) {
      setDecisionStage(0);
      return;
    }

    const maxStage = getDecisionStageCount(activeDecisionEvent) - 1;

    if (!playing) {
      setDecisionStage(maxStage);
      return;
    }

    setDecisionStage(0);

    const delays =
      activeDecisionEvent.decision.mode === 'heuristic'
        ? [520]
        : activeDecisionEvent.decision.mode === 'shadow'
          ? [700, 1850]
          : resolvePolicyThreshold(activeDecisionEvent)
            ? [650, 1750, 3000]
            : [720, 2050];

    const timeoutIds = delays.map((delay, index) =>
      window.setTimeout(
        () => setDecisionStage(Math.min(index + 1, maxStage)),
        Math.max(120, delay / speed),
      ),
    );

    return () => {
      timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [activeDecisionEvent?.eventId, playing, speed]);

  useEffect(() => {
    if (drawer !== 'trace' || !currentEvent) {
      return;
    }

    eventRefs.current[currentEvent.eventId]?.scrollIntoView({
      behavior: playing ? 'smooth' : 'auto',
      block: 'center',
    });
  }, [currentEvent, drawer, playing]);

  useEffect(() => {
    const theater = theaterRef.current;
    const viewport = theaterViewportRef.current;

    if (!theater || !viewport) {
      return;
    }

    let frameId = 0;
    let settleFrameId = 0;

    const clearFit = () => {
      theater.style.removeProperty('--ai-lab-theater-fit-scale');
      theater.style.removeProperty('--ai-lab-theater-fit-width');
      theater.style.removeProperty('--ai-lab-theater-fit-height');
    };

    const fitTheater = () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(settleFrameId);

      frameId = window.requestAnimationFrame(() => {
        const shouldFit = window.innerWidth >= 1400 && window.innerHeight >= 720;

        if (!shouldFit) {
          clearFit();
          return;
        }

        const theaterRect = theater.getBoundingClientRect();
        const availableWidth = theater.clientWidth;
        const availableHeight = Math.max(
          520,
          window.innerHeight - theaterRect.top - 8,
        );

        let scale = 0.9;

        for (let iteration = 0; iteration < 3; iteration += 1) {
          theater.style.setProperty('--ai-lab-theater-fit-scale', String(scale));
          theater.style.setProperty(
            '--ai-lab-theater-fit-width',
            `${availableWidth / scale}px`,
          );

          const naturalHeight = viewport.scrollHeight;
          const nextScale = Math.min(0.9, availableHeight / naturalHeight);

          if (Math.abs(nextScale - scale) < 0.002) {
            scale = nextScale;
            break;
          }

          scale = nextScale;
        }

        theater.style.setProperty('--ai-lab-theater-fit-scale', String(scale));
        theater.style.setProperty(
          '--ai-lab-theater-fit-width',
          `${availableWidth / scale}px`,
        );

        settleFrameId = window.requestAnimationFrame(() => {
          const naturalHeight = viewport.scrollHeight;
          const finalScale = Math.min(0.9, availableHeight / naturalHeight);

          theater.style.setProperty('--ai-lab-theater-fit-scale', String(finalScale));
          theater.style.setProperty(
            '--ai-lab-theater-fit-width',
            `${availableWidth / finalScale}px`,
          );
          theater.style.setProperty(
            '--ai-lab-theater-fit-height',
            `${Math.ceil(naturalHeight * finalScale) + 2}px`,
          );
        });
      });
    };

    fitTheater();
    window.addEventListener('resize', fitTheater);

    return () => {
      window.removeEventListener('resize', fitTheater);
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(settleFrameId);
      clearFit();
    };
  }, []);

  const moveToPreviousBeat = () => {
    const previous = getPreviousReplayEventIndex(result.events, eventIndex);

    if (previous !== null) {
      onPlayingChange(false);
      onEventIndexChange(previous);
    }
  };

  const moveToNextBeat = () => {
    const next = getNextReplayEventIndex(result.events, eventIndex);

    if (next !== null) {
      onPlayingChange(false);
      onEventIndexChange(next);
    }
  };

  const jumpToNextDecision = () => {
    const next = getNextDecisionIndex(result.events, eventIndex);

    if (next !== null) {
      onPlayingChange(false);
      onEventIndexChange(next);
    }
  };

  const jumpToNextMlMoment = () => {
    const next = getNextMlMomentIndex(result.events, eventIndex);

    if (next !== null) {
      onPlayingChange(false);
      onEventIndexChange(next);
    }
  };

  const jumpToNextOverride = () => {
    const next = getNextOverrideIndex(result.events, eventIndex);

    if (next !== null) {
      onPlayingChange(false);
      onEventIndexChange(next);
    }
  };

  const jumpToNextHand = () => {
    const next = getNextHandIndex(result.events, eventIndex);

    if (next !== null) {
      onPlayingChange(false);
      onEventIndexChange(next);
    }
  };

  const activeDecision = activeDecisionEvent?.decision ?? null;
  const activeBotConfig =
    activeDecision?.playerId === 'P1'
      ? botA
      : activeDecision?.playerId === 'P2'
        ? botB
        : null;
  const activeModeClass = activeDecision
    ? `is-${activeDecision.mode}`
    : 'is-idle';
  const activeOverrideClass = activeDecision?.overrideApplied
    ? ' is-override'
    : '';
  const isCascadeDecision = Boolean(
    activeDecision &&
      activeDecision.mode === 'ml-assisted' &&
      activeDecision.mlEligible &&
      activeDecision.modelAvailable &&
      !activeDecision.modelErrorType &&
      !activeDecision.predictionErrorType,
  );
  const isCascadeFitMode = Boolean(isCascadeDecision && decisionStage >= 2);
  const hasNextOverride = getNextOverrideIndex(result.events, eventIndex) !== null;
  const isExperimentComplete = presentationEvent?.type === 'match.finished';
  const isCommonDecision = Boolean(
    activeDecision &&
    (
      activeDecision.mode === 'heuristic' ||
      (activeDecision.mode === 'ml-assisted' && !activeDecision.mlEligible)
    ),
  );
  const shouldShowAnalyzedHand = Boolean(
    activeDecision &&
    (
      activeDecision.mode === 'shadow' ||
      (activeDecision.mode === 'ml-assisted' && activeDecision.mlEligible)
    ),
  );
  const idleNarrative = resolveIdleNarrative(currentEvent);
  const intelligenceHeaderTitle = activeDecision?.overrideApplied
    ? 'Override em execução'
    : activeDecision?.mode === 'shadow'
      ? 'Shadow Runtime'
      : activeDecision
        ? 'Runtime de decisão'
        : 'Runtime ao vivo';
  const intelligenceLiveLabel = !playing
    ? 'PAUSADO'
    : activeDecision
      ? `ANALISANDO · ${speed}×`
      : `AO VIVO · ${speed}×`;

  return (
    <div ref={theaterRef} className="ai-lab-match-theater">
      <div ref={theaterViewportRef} className="ai-lab-match-theater__viewport">
        <header className="ai-lab-match-theater__header">
        <div className="ai-lab-match-theater__identity ai-lab-match-theater__identity--telemetry">
          <button type="button" onClick={onExit}>
            ← AI Lab
          </button>

          <LiveTelemetryBar stats={runtimeStats} seed={result.seed} />
        </div>

        <div className="ai-lab-match-theater__header-actions">
          <button
            type="button"
            className="is-technical"
            onClick={() => setDrawer('trace')}
          >
            Trace
          </button>

          <button
            type="button"
            className="is-technical"
            onClick={() => setDrawer('architecture')}
            disabled={!showArchitectureTrace}
          >
            Arquitetura
          </button>

          <button type="button" className="is-primary" onClick={onRunAgain}>
            Nova partida
          </button>
        </div>
      </header>

      <div className="ai-lab-match-theater__stage">
        <div className="ai-lab-match-theater__table">
          <MatchTableShell
            {...tableProps}
            handStatusLabel={
              activeDecision ? 'Analisando' : tableProps.handStatusLabel
            }
          />
        </div>

        <aside
          className={`ai-lab-match-intelligence ${activeModeClass}${activeOverrideClass}${
            activeDecision ? ' is-decision-active' : ''
          }${isCascadeFitMode ? ' is-cascade-fit' : ''}`}
        >
          <div className="ai-lab-match-intelligence__header">
            <div>
              <span>BOT INTELLIGENCE</span>
              <strong>{intelligenceHeaderTitle}</strong>
            </div>

            <div
              className={
                playing
                  ? 'ai-lab-match-intelligence__live is-live'
                  : 'ai-lab-match-intelligence__live'
              }
            >
              <i />
              {intelligenceLiveLabel}
            </div>
          </div>

          <div className="ai-lab-match-intelligence__body">
            <AnimatePresence mode="wait">
              {activeDecisionEvent?.decision ? (
                <motion.div
                  key={activeDecisionEvent.eventId}
                  className={`ai-lab-match-intelligence__decision ${
                    isCommonDecision ? 'is-compact' : ''
                  }${isCascadeFitMode ? ' is-cascade-fit' : ''}`}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                >
                  <div className="ai-lab-match-intelligence__actor">
                    <div>
                      <span>
                        DECISION #
                        {String(activeDecisionEvent.decision.decisionIndex).padStart(3, '0')}
                      </span>

                      <strong>
                        {playerIdToBotLabel(activeDecisionEvent.decision.playerId)}
                      </strong>

                      <small>
                        {activeBotConfig
                          ? `${AI_LAB_PROFILE_LABELS[activeBotConfig.profile]} · ${
                              AI_LAB_INTELLIGENCE_LABELS[activeBotConfig.intelligence]
                            }`
                          : AI_LAB_INTELLIGENCE_LABELS[activeDecisionEvent.decision.mode]}
                      </small>
                    </div>

                    <span className="ai-lab-match-intelligence__thinking">
                      <i />
                      ANALISANDO
                    </span>
                  </div>

                  {shouldShowAnalyzedHand &&
                  activeDecisionEvent.snapshot?.actorHand?.length ? (
                    <div
                      className={`ai-lab-match-intelligence__hand${
                        isCascadeFitMode ? ' is-compact' : ''
                      }`}
                    >
                      <span>CONTEXTO DA DECISÃO</span>

                      <div>
                        {activeDecisionEvent.snapshot.actorHand.map((card) => (
                          <strong key={card}>
                            {formatCardLabel(card)}
                          </strong>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <IntelligenceDecisionFlow
                    event={activeDecisionEvent}
                    stage={decisionStage}
                  />
                </motion.div>
              ) : isExperimentComplete ? (
                <ExperimentSummary result={result} stats={runtimeStats} />
              ) : (
                <motion.div
                  key="intelligence-idle"
                  className="ai-lab-match-intelligence__idle"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                >
                  <div className="ai-lab-intelligence-idle-hero">
                    <span>{idleNarrative.eyebrow}</span>
                    <strong>{idleNarrative.title}</strong>
                    <p>{idleNarrative.description}</p>

                    <div className="ai-lab-intelligence-idle-hero__pulse">
                      <i />
                      {idleNarrative.pulse}
                    </div>
                  </div>

                  <div className="ai-lab-intelligence-idle-bots">
                    <IdleBotCard label="BOT A" config={botA} accent="green" />
                    <IdleBotCard label="BOT B" config={botB} accent="gold" />
                  </div>

                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="ai-lab-match-intelligence__legend">
            <span>
              <i className="is-game" />
              JOGO
            </span>
            <span>
              <i className="is-intelligence" />
              RUNTIME IA
            </span>
            <span>
              <i className="is-override" />
              OVERRIDE ML
            </span>
          </div>
        </aside>
      </div>


      <footer className="ai-lab-match-theater__controls">
        <div className="ai-lab-match-theater__transport">
          <div className="ai-lab-match-theater__control-group is-playback">
            <button type="button" onClick={moveToPreviousBeat}>
              ← Momento anterior
            </button>

            <button
              type="button"
              className="is-primary"
              onClick={() => onPlayingChange(!playing)}
            >
              {playing ? 'Ⅱ Pausar' : '▶ Reproduzir'}
            </button>

            <button type="button" onClick={moveToNextBeat}>
              Próximo momento →
            </button>
          </div>

          <span className="ai-lab-match-theater__control-divider" aria-hidden />

          <div className="ai-lab-match-theater__control-group is-intelligence">
            <button type="button" onClick={jumpToNextDecision}>
              Próxima decisão
            </button>

            <button type="button" className="is-ai" onClick={jumpToNextMlMoment}>
              ✦ Próximo ML
            </button>

            <button
              type="button"
              className="is-override"
              onClick={jumpToNextOverride}
              disabled={!hasNextOverride}
              title={hasNextOverride ? 'Ir para o próximo override real' : 'Nenhum override adiante nesta partida'}
            >
              ✦ Próximo override
            </button>
          </div>

          <span className="ai-lab-match-theater__control-divider" aria-hidden />

          <div className="ai-lab-match-theater__control-group is-hand">
            <button type="button" onClick={jumpToNextHand}>
              Próxima mão
            </button>
          </div>
        </div>

        <div className="ai-lab-match-theater__speed">
          <span>
            Replay visual {countReplayBeats(result.events)} · Trace {result.events.length}
          </span>

          {([0.5, 1, 2, 4] as ReplaySpeed[]).map((option) => (
            <button
              key={option}
              type="button"
              className={speed === option ? 'is-active' : undefined}
              onClick={() => onSpeedChange(option)}
            >
              {option}×
            </button>
          ))}
        </div>
        </footer>
      </div>

      <AnimatePresence>
        {drawer ? (
          <>
            <motion.button
              type="button"
              aria-label="Fechar painel"
              className="ai-lab-match-theater__drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(null)}
            />

            <motion.section
              className="ai-lab-match-theater__drawer"
              initial={{ opacity: 0, y: 80 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 80 }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
              <header>
                <div>
                  <span>
                    {drawer === 'trace' ? 'TECHNICAL TRACE' : 'ARCHITECTURE TRACE'}
                  </span>
                  <strong>
                    {drawer === 'trace'
                      ? `${result.events.length} eventos internos por trás do replay`
                      : 'Do React ao Strategy Engine'}
                  </strong>
                </div>

                <button type="button" onClick={() => setDrawer(null)}>
                  Fechar ×
                </button>
              </header>

              {drawer === 'trace' ? (
                <div className="ai-lab-match-trace">
                  <div className="ai-lab-match-trace__filters">
                    {EVENT_FILTERS.map((filter) => (
                      <button
                        key={filter.id}
                        type="button"
                        className={eventFilter === filter.id ? 'is-active' : undefined}
                        onClick={() => setEventFilter(filter.id)}
                      >
                        {filter.label}
                      </button>
                    ))}
                  </div>

                  <div className="ai-lab-match-trace__list">
                    {filteredEvents.map((event) => (
                      <button
                        key={event.eventId}
                        ref={(element) => {
                          eventRefs.current[event.eventId] = element;
                        }}
                        type="button"
                        className={
                          event.sequence === eventIndex
                            ? `ai-lab-match-trace-event is-active is-${event.category}`
                            : `ai-lab-match-trace-event is-${event.category}`
                        }
                        onClick={() => {
                          onPlayingChange(false);
                          onEventIndexChange(event.sequence);
                        }}
                      >
                        <span>{String(event.sequence).padStart(3, '0')}</span>
                        <div>
                          <code>{event.type}</code>
                          <strong>{toSpectatorText(event.title)}</strong>
                          <small>{toSpectatorText(event.description)}</small>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="ai-lab-match-architecture">
                  <div className="ai-lab-match-architecture__flow">
                    {result.architecture.map((node, index) => (
                      <div key={node.id}>
                        <span>{String(index + 1).padStart(2, '0')}</span>
                        <div>
                          <strong>{node.label}</strong>
                          <small>{node.detail}</small>
                        </div>
                      </div>
                    ))}
                  </div>

                  {latestDecisionEvent?.decision ? (
                    <div className="ai-lab-match-architecture__decision">
                      <span>ÚLTIMA DECISÃO OBSERVADA</span>
                      <strong>
                        {playerIdToBotLabel(latestDecisionEvent.decision.playerId)} ·{' '}
                        {formatDecisionChoice(
                          latestDecisionEvent.decision.final ??
                            latestDecisionEvent.decision.baseline,
                        )}
                      </strong>
                      <small>
                        {AI_LAB_INTELLIGENCE_LABELS[latestDecisionEvent.decision.mode]}
                      </small>
                    </div>
                  ) : null}
                </div>
              )}
            </motion.section>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
