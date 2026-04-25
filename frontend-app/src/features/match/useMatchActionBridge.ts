import { useMemo } from 'react';

import type { MatchAction } from './matchActionTypes';
import type { CardPayload, MatchStatePayload } from '../../services/socket/socketTypes';

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
};

type UseMatchActionBridgeResult = {
  handleRefreshState: () => void;
  handleStartHand: () => void;
  handlePlayCard: (card: CardPayload) => void;
  handleMatchAction: (action: MatchAction) => void;
};

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
  } = params;

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

        // NOTE: Starting a new hand is the one place where a full table reset is expected.
        beginHandTransition();
        emitStartHand(resolvedMatchId);
        appendLog(`Emitted start-hand (${resolvedMatchId}).`);
      },

      handlePlayCard(card: CardPayload): void {
        if (!resolvedMatchId || !mySeat || !canPlayCard) {
          appendLog('Cannot play card in the current state.');
          return;
        }

        const cardKey = `${card.rank}|${card.suit}`;
        const serverCard = `${card.rank}${card.suit}`;

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
    ],
  );
}
