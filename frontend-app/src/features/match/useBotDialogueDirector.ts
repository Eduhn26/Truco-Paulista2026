import { useEffect, useMemo, useRef, useState } from 'react';

import {
  pickBotDialogueLine,
  type BotDialogueEvent,
  type BotDialogueRelationship,
} from './botDialogueCatalog';

export type BotDialogueSeatContext = {
  seatId: string;
  isBot: boolean;
  relationship: BotDialogueRelationship;
  profile: string | null;
};

export type BotDialogueSignal = {
  key: string;
  seatId: string;
  event: BotDialogueEvent;
  priority: number;
};

export type BotDialogueActiveSpeech = {
  id: string;
  text: string;
  event: BotDialogueEvent;
  relationship: BotDialogueRelationship;
};

const BOT_DIALOGUE_DEFAULT_DURATION_MS = 2400;
const BOT_DIALOGUE_RECENT_TEXT_LIMIT = 4;

const BOT_DIALOGUE_DURATION_BY_EVENT: Partial<Record<BotDialogueEvent, number>> = {
  'bot-thinking': 2200,
  'bot-played-card': 2300,
  'bot-won-round': 2800,
  'bot-lost-round': 2400,
  'partner-won-round': 2800,
  'partner-lost-round': 2400,
  'bot-requested-truco': 3000,
  'bot-accepted-truco': 2800,
  'bot-declined-truco': 2600,
  'bot-raised-bet': 3000,
  'mao-de-onze-pressure': 3000,
  'mao-de-ferro-pressure': 3100,
  'match-point-pressure': 2800,
};

const BOT_DIALOGUE_COOLDOWN_BY_EVENT: Partial<Record<BotDialogueEvent, number>> = {
  'bot-thinking': 2500,
  'bot-played-card': 2200,
  'bot-won-round': 2400,
  'bot-lost-round': 2200,
  'partner-won-round': 2400,
  'partner-lost-round': 2200,
  'bot-requested-truco': 1700,
  'bot-accepted-truco': 1800,
  'bot-declined-truco': 1800,
  'bot-raised-bet': 1700,
  'mao-de-onze-pressure': 2600,
  'mao-de-ferro-pressure': 2600,
  'match-point-pressure': 2500,
};

const BOT_DIALOGUE_INTERRUPT_PRIORITY = 70;

function resolveDialogueDuration(event: BotDialogueEvent): number {
  return BOT_DIALOGUE_DURATION_BY_EVENT[event] ?? BOT_DIALOGUE_DEFAULT_DURATION_MS;
}

function resolveDialogueCooldown(event: BotDialogueEvent): number {
  return BOT_DIALOGUE_COOLDOWN_BY_EVENT[event] ?? 2400;
}

function isHighPrioritySignal(signal: BotDialogueSignal): boolean {
  return signal.priority >= BOT_DIALOGUE_INTERRUPT_PRIORITY;
}

export function useBotDialogueDirector({
  seats,
  signals,
  currentValue,
  isMuted,
}: {
  seats: BotDialogueSeatContext[];
  signals: BotDialogueSignal[];
  currentValue: number;
  isMuted: boolean;
}): Record<string, BotDialogueActiveSpeech | undefined> {
  const [activeSpeechBySeat, setActiveSpeechBySeat] = useState<
    Record<string, BotDialogueActiveSpeech | undefined>
  >({});
  const seenSignalsRef = useRef<Set<string>>(new Set());
  const cooldownUntilBySeatRef = useRef<Record<string, number>>({});
  const clearTimeoutsBySeatRef = useRef<Record<string, number | undefined>>({});
  const recentTextsBySeatRef = useRef<Record<string, string[]>>({});
  const sequenceBySeatRef = useRef<Record<string, number>>({});

  const botSeatsById = useMemo(() => {
    return seats.reduce<Record<string, BotDialogueSeatContext>>((acc, seat) => {
      if (seat.isBot) {
        acc[seat.seatId] = seat;
      }

      return acc;
    }, {});
  }, [seats]);

  useEffect(() => {
    if (!isMuted) {
      return;
    }

    Object.values(clearTimeoutsBySeatRef.current).forEach((timeoutId) => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    });

    clearTimeoutsBySeatRef.current = {};
    setActiveSpeechBySeat({});
  }, [isMuted]);

  useEffect(() => {
    if (isMuted || signals.length === 0) {
      return;
    }

    const now = Date.now();
    const orderedSignals = [...signals].sort((left, right) => right.priority - left.priority);

    orderedSignals.forEach((signal) => {
      if (seenSignalsRef.current.has(signal.key)) {
        return;
      }

      seenSignalsRef.current.add(signal.key);

      const seat = botSeatsById[signal.seatId];
      if (!seat) {
        return;
      }

      const cooldownUntil = cooldownUntilBySeatRef.current[signal.seatId] ?? 0;
      const canInterruptCooldown = isHighPrioritySignal(signal);

      if (cooldownUntil > now && !canInterruptCooldown) {
        return;
      }

      const sequence = (sequenceBySeatRef.current[signal.seatId] ?? 0) + 1;
      sequenceBySeatRef.current = {
        ...sequenceBySeatRef.current,
        [signal.seatId]: sequence,
      };

      const text = pickBotDialogueLine({
        event: signal.event,
        relationship: seat.relationship,
        profile: seat.profile,
        currentValue,
        seed: `${signal.key}:${signal.seatId}:${sequence}`,
        avoidTexts: recentTextsBySeatRef.current[signal.seatId] ?? [],
      });

      if (!text) {
        return;
      }

      const id = `${signal.key}:${now}:${sequence}`;
      const speech: BotDialogueActiveSpeech = {
        id,
        text,
        event: signal.event,
        relationship: seat.relationship,
      };

      const existingTimeout = clearTimeoutsBySeatRef.current[signal.seatId];
      if (existingTimeout !== undefined) {
        window.clearTimeout(existingTimeout);
      }

      const nextRecentTexts = [
        text,
        ...(recentTextsBySeatRef.current[signal.seatId] ?? []).filter(
          (recentText) => recentText !== text,
        ),
      ].slice(0, BOT_DIALOGUE_RECENT_TEXT_LIMIT);

      recentTextsBySeatRef.current = {
        ...recentTextsBySeatRef.current,
        [signal.seatId]: nextRecentTexts,
      };

      cooldownUntilBySeatRef.current = {
        ...cooldownUntilBySeatRef.current,
        [signal.seatId]: now + resolveDialogueCooldown(signal.event),
      };

      setActiveSpeechBySeat((current) => ({
        ...current,
        [signal.seatId]: speech,
      }));

      clearTimeoutsBySeatRef.current[signal.seatId] = window.setTimeout(() => {
        setActiveSpeechBySeat((current) => {
          if (current[signal.seatId]?.id !== id) {
            return current;
          }

          const next = { ...current };
          delete next[signal.seatId];
          return next;
        });

        delete clearTimeoutsBySeatRef.current[signal.seatId];
      }, resolveDialogueDuration(signal.event));
    });
  }, [botSeatsById, currentValue, isMuted, signals]);

  useEffect(() => {
    return () => {
      Object.values(clearTimeoutsBySeatRef.current).forEach((timeoutId) => {
        if (timeoutId !== undefined) {
          window.clearTimeout(timeoutId);
        }
      });
    };
  }, []);

  return activeSpeechBySeat;
}
