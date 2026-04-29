import { useEffect, useMemo, useRef } from 'react';

import type { MatchAction } from './matchActionTypes';
import type { CardPayload, MatchStatePayload } from '../../services/socket/socketTypes';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';

type PendingPlayCardEmission = {
  matchId: string;
  cardKey: string;
  serverCard: string;
  emittedAt: number;
};

type UseMatchActionBridgeParams = {
  resolvedMatchId: string;
  mySeat: string | null;
  canStartHand: boolean;
  canPlayCard: boolean;
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  appendLog: (line: string) => void;
  emitGetState: (matchId: string) => void;
  emitStartHand: (matchId: string) => void;
  emitPlayCard: (matchId: string, card: CardPayload) => void;
  emitRequestTruco: (matchId: string) => void;
  emitAcceptBet: (matchId: string) => void;
  emitDeclineBet: (matchId: string) => void;
  emitRaiseToSix: (matchId: string) => void;
  emitRaiseToNine: (matchId: string) => void;
  emitRaiseToTwelve: (matchId: string) => void;
  emitAcceptMaoDeOnze: (matchId: string) => void;
  emitDeclineMaoDeOnze: (matchId: string) => void;
  beginHandTransition: () => void;
  beginOwnCardLaunch: (params: { cardKey: string; serverCard: string }) => void;
  // P0 turn-gate context. Must be sourced from the authoritative view model
  // (currentTurnSeatId, nextDecisionType, tablePhase, isResolvingRound) so
  // the bridge can refuse a play-card emission when the visual UI temporarily
  // disagrees with the authoritative state.
  currentTurnSeatId: string | null;
  nextDecisionType: string | null;
  tablePhase: TablePhase;
  isResolvingRound: boolean;
  isTableInteractionLocked: boolean;
};

type UseMatchActionBridgeResult = {
  handleRefreshState: () => void;
  handleStartHand: () => void;
  handlePlayCard: (card: CardPayload) => void;
  handleMatchAction: (action: MatchAction) => void;
};

const DIFFERENT_CARD_EMISSION_LOCK_MS = 900;

export function useMatchActionBridge(
  params: UseMatchActionBridgeParams,
): UseMatchActionBridgeResult {
  const {
    resolvedMatchId,
    mySeat,
    canStartHand,
    canPlayCard,
    availableActions,
    appendLog,
    emitGetState,
    emitStartHand,
    emitPlayCard,
    emitRequestTruco,
    emitAcceptBet,
    emitDeclineBet,
    emitRaiseToSix,
    emitRaiseToNine,
    emitRaiseToTwelve,
    emitAcceptMaoDeOnze,
    emitDeclineMaoDeOnze,
    beginHandTransition,
    beginOwnCardLaunch,
    currentTurnSeatId,
    nextDecisionType,
    tablePhase,
    isResolvingRound,
    isTableInteractionLocked,
  } = params;

  const pendingPlayCardEmissionRef = useRef<PendingPlayCardEmission | null>(null);

  useEffect(() => {
    const shouldResetPendingPlayCard =
      !resolvedMatchId || tablePhase !== 'playing' || nextDecisionType !== 'play-card';

    if (shouldResetPendingPlayCard) {
      pendingPlayCardEmissionRef.current = null;
    }
  }, [resolvedMatchId, tablePhase, nextDecisionType]);

  return useMemo(
    () => ({
      handleRefreshState(): void {
        if (!resolvedMatchId) {
          appendLog('No matchId available for get-state.');
          return;
        }

        emitGetState(resolvedMatchId);
        appendLog(`Emitted get-state (${resolvedMatchId}).`);
      },

      handleStartHand(): void {
        if (!resolvedMatchId) {
          appendLog('No matchId available for start-hand.');
          return;
        }

        if (!canStartHand) {
          appendLog('Ignored start-hand because the current state does not allow it.');
          return;
        }

        pendingPlayCardEmissionRef.current = null;

        // NOTE: Starting a new hand is the one place where a full table reset is expected.
        beginHandTransition();
        emitStartHand(resolvedMatchId);
        appendLog(`Emitted start-hand (${resolvedMatchId}).`);
      },

      handlePlayCard(card: CardPayload): void {
        // NOTE (P0 — authoritative turn gate): the bridge is the last line of
        // defense before a play-card socket emission. The panel already gates
        // by canPlayCard + isMyTurn + tablePhase, but a click can still slip
        // through during the tiny window where the visual state lags the
        // authoritative state (e.g., right after a round resolves on the
        // server but the resolution hold has not yet expired locally).
        // Refusing here prevents the "It is not this player turn" server
        // error and keeps the backend authoritative.
        if (!resolvedMatchId || !mySeat) {
          appendLog('Cannot play card: missing match context.');
          return;
        }

        if (!canPlayCard) {
          appendLog('Ignored play-card: backend reports canAttemptPlayCard=false.');
          return;
        }

        if (currentTurnSeatId !== mySeat) {
          appendLog(
            `Ignored play-card: turn belongs to ${currentTurnSeatId ?? 'no one'}, not ${mySeat}.`,
          );
          return;
        }

        if (nextDecisionType !== 'play-card') {
          appendLog(`Ignored play-card: nextDecisionType=${nextDecisionType ?? 'idle'}.`);
          return;
        }

        if (tablePhase !== 'playing') {
          appendLog(`Ignored play-card: tablePhase=${tablePhase}.`);
          return;
        }

        if (isResolvingRound) {
          appendLog('Ignored play-card: a round is currently resolving.');
          return;
        }

        if (isTableInteractionLocked) {
          appendLog('Ignored play-card: table interaction is locked by a visual transition.');
          return;
        }

        const now = Date.now();
        const cardKey = `${card.rank}|${card.suit}`;
        const serverCard = `${card.rank}${card.suit}`;
        const pendingPlayCardEmission = pendingPlayCardEmissionRef.current;

        if (pendingPlayCardEmission?.matchId === resolvedMatchId) {
          if (pendingPlayCardEmission.cardKey === cardKey) {
            appendLog(
              `Ignored play-card: ${pendingPlayCardEmission.serverCard} was already emitted for this turn.`,
            );
            return;
          }

          if (now - pendingPlayCardEmission.emittedAt < DIFFERENT_CARD_EMISSION_LOCK_MS) {
            appendLog(
              'Ignored play-card: another card emission is already waiting for server acknowledgement.',
            );
            return;
          }
        }

        pendingPlayCardEmissionRef.current = {
          matchId: resolvedMatchId,
          cardKey,
          serverCard,
          emittedAt: now,
        };

        beginOwnCardLaunch({ cardKey, serverCard });
        emitPlayCard(resolvedMatchId, card);
        appendLog(`Emitted play-card (${card.rank}${card.suit}).`);
      },

      handleMatchAction(action: MatchAction): void {
        if (!resolvedMatchId) {
          appendLog(`No matchId available for action ${action}.`);
          return;
        }

        switch (action) {
          case 'request-truco': {
            if (!availableActions.canRequestTruco) {
              appendLog('Cannot request truco in the current state.');
              return;
            }

            emitRequestTruco(resolvedMatchId);
            appendLog(`Emitted request-truco (${resolvedMatchId}).`);
            return;
          }

          case 'accept-bet': {
            if (!availableActions.canAcceptBet) {
              appendLog('Cannot accept bet in the current state.');
              return;
            }

            emitAcceptBet(resolvedMatchId);
            appendLog(`Emitted accept-bet (${resolvedMatchId}).`);
            return;
          }

          case 'decline-bet': {
            if (!availableActions.canDeclineBet) {
              appendLog('Cannot decline bet in the current state.');
              return;
            }

            emitDeclineBet(resolvedMatchId);
            appendLog(`Emitted decline-bet (${resolvedMatchId}).`);
            return;
          }

          case 'raise-to-six': {
            if (!availableActions.canRaiseToSix) {
              appendLog('Cannot raise to six in the current state.');
              return;
            }

            emitRaiseToSix(resolvedMatchId);
            appendLog(`Emitted raise-to-six (${resolvedMatchId}).`);
            return;
          }

          case 'raise-to-nine': {
            if (!availableActions.canRaiseToNine) {
              appendLog('Cannot raise to nine in the current state.');
              return;
            }

            emitRaiseToNine(resolvedMatchId);
            appendLog(`Emitted raise-to-nine (${resolvedMatchId}).`);
            return;
          }

          case 'raise-to-twelve': {
            if (!availableActions.canRaiseToTwelve) {
              appendLog('Cannot raise to twelve in the current state.');
              return;
            }

            emitRaiseToTwelve(resolvedMatchId);
            appendLog(`Emitted raise-to-twelve (${resolvedMatchId}).`);
            return;
          }

          case 'accept-mao-de-onze': {
            if (!availableActions.canAcceptMaoDeOnze) {
              appendLog('Cannot accept mao de onze in the current state.');
              return;
            }

            emitAcceptMaoDeOnze(resolvedMatchId);
            appendLog(`Emitted accept-mao-de-onze (${resolvedMatchId}).`);
            return;
          }

          case 'decline-mao-de-onze': {
            if (!availableActions.canDeclineMaoDeOnze) {
              appendLog('Cannot decline mao de onze in the current state.');
              return;
            }

            emitDeclineMaoDeOnze(resolvedMatchId);
            appendLog(`Emitted decline-mao-de-onze (${resolvedMatchId}).`);
            return;
          }

          default: {
            appendLog(`Unsupported action: ${action}.`);
          }
        }
      },
    }),
    [
      resolvedMatchId,
      mySeat,
      canStartHand,
      canPlayCard,
      availableActions,
      appendLog,
      emitGetState,
      emitStartHand,
      emitPlayCard,
      emitRequestTruco,
      emitAcceptBet,
      emitDeclineBet,
      emitRaiseToSix,
      emitRaiseToNine,
      emitRaiseToTwelve,
      emitAcceptMaoDeOnze,
      emitDeclineMaoDeOnze,
      beginHandTransition,
      beginOwnCardLaunch,
      currentTurnSeatId,
      nextDecisionType,
      tablePhase,
      isResolvingRound,
      isTableInteractionLocked,
    ],
  );
}
