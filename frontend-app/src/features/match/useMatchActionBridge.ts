import { useMemo } from 'react';

import type { Rank } from '../../services/socket/socketTypes';
import type { CardPayload, MatchStatePayload } from '../../services/socket/socketTypes';

type MatchActionType =
  | 'request-truco'
  | 'accept-bet'
  | 'decline-bet'
  | 'raise-to-six'
  | 'raise-to-nine'
  | 'raise-to-twelve'
  | 'accept-mao-de-onze'
  | 'decline-mao-de-onze';

type UseMatchActionBridgeParams = {
  resolvedMatchId: string;
  mySeat: string | null;
  canPlayCard: boolean;
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  viraRank: Rank;
  appendLog: (line: string) => void;
  emitGetState: (matchId: string) => void;
  emitStartHand: (matchId: string, viraRank: Rank) => void;
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
  handleMatchAction: (action: MatchActionType) => void;
};

export function useMatchActionBridge(
  params: UseMatchActionBridgeParams,
): UseMatchActionBridgeResult {
  const {
    resolvedMatchId,
    mySeat,
    canPlayCard,
    availableActions,
    viraRank,
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

        beginHandTransition();
        emitStartHand(resolvedMatchId, viraRank);
        appendLog(`Emitted start-hand (${resolvedMatchId}, ${viraRank}).`);
      },

      handlePlayCard(card: CardPayload): void {
        if (!resolvedMatchId || !mySeat || !canPlayCard) {
          appendLog('Cannot play card in the current state.');
          return;
        }

        const cardKey = `${card.rank}|${card.suit}`;
        const serverCard = `${card.rank}${card.suit}`;

        beginOwnCardLaunch({
          cardKey,
          serverCard,
        });

        emitPlayCard(resolvedMatchId, card);
        appendLog(`Emitted play-card (${card.rank}${suitSymbol(card.suit)}).`);
      },

      handleMatchAction(action: MatchActionType): void {
        if (!resolvedMatchId) {
          appendLog(`No matchId available for ${action}.`);
          return;
        }

        if (!isActionEnabled(availableActions, action)) {
          appendLog(`Action ${action} is not available in the current backend state.`);
          return;
        }

        if (action === 'request-truco') emitRequestTruco(resolvedMatchId);
        if (action === 'accept-bet') emitAcceptBet(resolvedMatchId);
        if (action === 'decline-bet') emitDeclineBet(resolvedMatchId);
        if (action === 'raise-to-six') emitRaiseToSix(resolvedMatchId);
        if (action === 'raise-to-nine') emitRaiseToNine(resolvedMatchId);
        if (action === 'raise-to-twelve') emitRaiseToTwelve(resolvedMatchId);
        if (action === 'accept-mao-de-onze') emitAcceptMaoDeOnze(resolvedMatchId);
        if (action === 'decline-mao-de-onze') emitDeclineMaoDeOnze(resolvedMatchId);

        appendLog(`Emitted ${action} (${resolvedMatchId}).`);
      },
    }),
    [
      resolvedMatchId,
      mySeat,
      canPlayCard,
      availableActions,
      viraRank,
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

function isActionEnabled(
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
  action:
    | 'request-truco'
    | 'accept-bet'
    | 'decline-bet'
    | 'raise-to-six'
    | 'raise-to-nine'
    | 'raise-to-twelve'
    | 'accept-mao-de-onze'
    | 'decline-mao-de-onze',
): boolean {
  if (action === 'request-truco') return availableActions.canRequestTruco;
  if (action === 'accept-bet') return availableActions.canAcceptBet;
  if (action === 'decline-bet') return availableActions.canDeclineBet;
  if (action === 'raise-to-six') return availableActions.canRaiseToSix;
  if (action === 'raise-to-nine') return availableActions.canRaiseToNine;
  if (action === 'raise-to-twelve') return availableActions.canRaiseToTwelve;
  if (action === 'accept-mao-de-onze') return availableActions.canAcceptMaoDeOnze;
  if (action === 'decline-mao-de-onze') return availableActions.canDeclineMaoDeOnze;

  return false;
}

function suitSymbol(suit: CardPayload['suit']): string {
  if (suit === 'H') return '♥';
  if (suit === 'D') return '♦';
  if (suit === 'C') return '♣';
  return '♠';
}