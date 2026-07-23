import type { AiLabSimulationEvent } from './aiLabSimulationApi';

const VISUAL_REPLAY_EVENT_TYPES = new Set([
  'simulation.started',
  'match.started',
  'hand.started',
  'cards.dealt',
  'decision.requested',
  'card.played',
  'round.resolved',
  'bet.requested',
  'bet.raised',
  'bet.accepted',
  'bet.declined',
  'special.accepted',
  'special.declined',
  'hand.finished',
  'match.finished',
]);

const GAMEPLAY_FOCUS_EVENT_TYPES = new Set([
  'hand.started',
  'cards.dealt',
  'card.played',
  'bet.accepted',
  'bet.declined',
  'special.accepted',
  'special.declined',
]);

const ML_MOMENT_TYPES = new Set([
  'ml.inference',
  'ml.override',
  'ml.unavailable',
]);

export function isVisualReplayEvent(event: AiLabSimulationEvent): boolean {
  return VISUAL_REPLAY_EVENT_TYPES.has(event.type);
}

export function isGameplayFocusEvent(event: AiLabSimulationEvent | null): boolean {
  return Boolean(event && GAMEPLAY_FOCUS_EVENT_TYPES.has(event.type));
}

export function getNextReplayEventIndex(
  events: AiLabSimulationEvent[],
  currentIndex: number,
): number | null {
  for (let index = currentIndex + 1; index < events.length; index += 1) {
    const event = events[index];

    if (event && isVisualReplayEvent(event)) {
      return index;
    }
  }

  return null;
}

export function getPreviousReplayEventIndex(
  events: AiLabSimulationEvent[],
  currentIndex: number,
): number | null {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event && isVisualReplayEvent(event)) {
      return index;
    }
  }

  return null;
}

export function getLatestPresentationEvent(
  events: AiLabSimulationEvent[],
  currentIndex: number,
): AiLabSimulationEvent | null {
  for (let index = currentIndex; index >= 0; index -= 1) {
    const event = events[index];

    if (event && isVisualReplayEvent(event)) {
      return event;
    }
  }

  return events[0] ?? null;
}

export function getReplayDelayMs(event: AiLabSimulationEvent): number {
  if (event.type === 'decision.requested') {
    const decision = event.decision;

    if (!decision) {
      return 1500;
    }

    if (decision.mode === 'heuristic') {
      return 1500;
    }

    if (decision.mode === 'shadow') {
      return 3900;
    }

    if (!decision.mlEligible) {
      return 1350;
    }

    if (
      !decision.modelAvailable ||
      decision.modelErrorType ||
      decision.predictionErrorType
    ) {
      return 2300;
    }

    if (decision.overrideApplied) {
      return 6500;
    }

    if (decision.prediction) {
      return 5700;
    }

    return 2600;
  }

  const delayByType: Record<string, number> = {
    'simulation.started': 650,
    'match.started': 700,
    'hand.started': 900,
    'cards.dealt': 1250,
    'card.played': 920,
    'round.resolved': 2250,
    'bet.requested': 2250,
    'bet.raised': 2250,
    'bet.accepted': 1450,
    'bet.declined': 1650,
    'special.accepted': 1850,
    'special.declined': 1850,
    'hand.finished': 4800,
    'match.finished': 5400,
  };

  return delayByType[event.type] ?? 700;
}

export function getNextDecisionIndex(
  events: AiLabSimulationEvent[],
  currentIndex: number,
): number | null {
  return findNextIndex(events, currentIndex, (event) => event.type === 'decision.requested');
}

export function getNextHandIndex(
  events: AiLabSimulationEvent[],
  currentIndex: number,
): number | null {
  return findNextIndex(events, currentIndex, (event) => event.type === 'hand.started');
}

export function getNextMlMomentIndex(
  events: AiLabSimulationEvent[],
  currentIndex: number,
): number | null {
  return findNextIndex(
    events,
    currentIndex,
    (event) =>
      ML_MOMENT_TYPES.has(event.type) ||
      event.decision?.overrideApplied === true ||
      event.decision?.shadowObserved === true,
  );
}

export function getNextOverrideIndex(
  events: AiLabSimulationEvent[],
  currentIndex: number,
): number | null {
  return findNextIndex(
    events,
    currentIndex,
    (event) =>
      event.type === 'decision.requested' &&
      event.decision?.overrideApplied === true,
  );
}

export function countReplayBeats(events: AiLabSimulationEvent[]): number {
  return events.filter(isVisualReplayEvent).length;
}

export function playerIdToBotLabel(playerId?: string | null): string | null {
  if (playerId === 'P1') {
    return 'BOT A';
  }

  if (playerId === 'P2') {
    return 'BOT B';
  }

  return null;
}

export function toSpectatorText(value?: string | null): string {
  if (!value) {
    return '';
  }

  return value
    .replace(/\bP1\b/g, 'BOT A')
    .replace(/\bP2\b/g, 'BOT B');
}

function findNextIndex(
  events: AiLabSimulationEvent[],
  currentIndex: number,
  predicate: (event: AiLabSimulationEvent) => boolean,
): number | null {
  for (let index = currentIndex + 1; index < events.length; index += 1) {
    const event = events[index];

    if (event && predicate(event)) {
      return index;
    }
  }

  return null;
}
