import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import { useMatchActionBridge } from '../features/match/useMatchActionBridge';
import { MatchPageHeader } from '../features/match/matchPageHeader';
import { getLastActiveMatchId } from '../features/match/matchSnapshotStorage';
import { MatchTableShell } from '../features/match/matchTableShell';
import { useMatchPageViewModel } from '../features/match/useMatchPageViewModel';
import { useMatchRealtimeSession } from '../features/match/useMatchRealtimeSession';
import { useMatchTableTransition } from '../features/match/useMatchTableTransition';
import type { MatchStatePayload, Rank } from '../services/socket/socketTypes';

const MatchLiveStatePanel = lazy(async () =>
  import('../features/match/matchLiveStatePanel').then((module) => ({
    default: module.MatchLiveStatePanel,
  })),
);

const MatchRoundsHistoryPanel = lazy(async () =>
  import('../features/match/matchRoundsHistoryPanel').then((module) => ({
    default: module.MatchRoundsHistoryPanel,
  })),
);

const VIRA_RANK_OPTIONS: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const { session } = useAuth();

  const routeMatchId = params.matchId ?? '';
  const effectiveMatchId = routeMatchId || getLastActiveMatchId() || '';

  const mySeatRef = useRef<string | null>(null);
  const [viraRank, setViraRank] = useState<Rank>('4');

  const bootstrapTableTransition = useMatchTableTransition({
    tablePhase: 'missing_context',
    myPlayedCard: null,
    opponentPlayedCard: null,
    playedRoundsCount: 0,
    latestRoundFinished: false,
  });

  const handleRealtimeHandStarted = useCallback(
    (payload: { matchId?: string; viraRank?: Rank | null }) => {
      bootstrapTableTransition.beginHandTransition();

      if (payload.viraRank) {
        setViraRank(payload.viraRank);
      }
    },
    [bootstrapTableTransition],
  );

  const handleRealtimeCardPlayed = useCallback(
    (payload: { matchId?: string; playerId?: string | null; card?: string | null }) => {
      const owner = resolvePlayedCardOwner({
        payloadPlayerId: payload.playerId ?? null,
        mySeat: mySeatRef.current,
      });

      bootstrapTableTransition.registerIncomingPlayedCard({
        owner,
        card: payload.card ?? null,
      });
    },
    [bootstrapTableTransition],
  );

  const {
    initialSnapshot,
    connectionStatus,
    roomState,
    publicMatchState,
    privateMatchState,
    playerAssigned,
    eventLog,
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
  } = useMatchRealtimeSession({
    session,
    effectiveMatchId,
    onHandStarted: handleRealtimeHandStarted,
    onCardPlayed: handleRealtimeCardPlayed,
  });

  useEffect(() => {
    mySeatRef.current = playerAssigned?.seatId ?? initialSnapshot?.playerAssigned?.seatId ?? null;
  }, [initialSnapshot?.playerAssigned?.seatId, playerAssigned]);

  const { viewModel, hasHydratedMatchState } = useMatchPageViewModel({
    effectiveMatchId,
    playerAssigned,
    roomState,
    publicMatchState,
    privateMatchState,
  });

  const liveTableTransition = useMatchTableTransition({
    tablePhase: viewModel.tablePhase,
    myPlayedCard: viewModel.myPlayedCard,
    opponentPlayedCard: viewModel.opponentPlayedCard,
    playedRoundsCount: viewModel.playedRoundsCount,
    latestRoundFinished: Boolean(viewModel.latestRound?.finished),
  });

  useEffect(() => {
    if (viewModel.currentPrivateHand?.viraRank) {
      setViraRank(viewModel.currentPrivateHand.viraRank);
      return;
    }

    if (viewModel.currentPublicHand?.viraRank) {
      setViraRank(viewModel.currentPublicHand.viraRank);
    }
  }, [viewModel.currentPrivateHand?.viraRank, viewModel.currentPublicHand?.viraRank]);

  const { handleRefreshState, handleStartHand, handlePlayCard, handleMatchAction } =
    useMatchActionBridge({
      resolvedMatchId: viewModel.resolvedMatchId,
      mySeat: viewModel.mySeat,
      canPlayCard: viewModel.canPlayCard,
      availableActions: viewModel.availableActions,
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
      beginHandTransition: liveTableTransition.beginHandTransition,
      beginOwnCardLaunch: liveTableTransition.beginOwnCardLaunch,
    });

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);
  const canRenderLiveState = Boolean(
    session?.backendUrl && session?.authToken && viewModel.resolvedMatchId,
  );

  if (!hasMinimumSession) {
    return (
      <section className="mx-auto grid max-w-5xl gap-8">
        <section className="rounded-[36px] border border-amber-400/20 bg-slate-900/85 p-8 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-amber-300">
            Session required
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white lg:text-4xl">
            A MatchPage precisa de uma sessão íntegra antes de hidratar a mesa.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            A borda de rota já tenta impedir esta entrada, mas este fallback mantém a tela
            semanticamente honesta caso o estado do browser fique inconsistente.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/"
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Voltar para home
            </Link>
            <Link
              to="/lobby"
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
            >
              Ir para lobby
            </Link>
          </div>
        </section>
      </section>
    );
  }

  if (!effectiveMatchId) {
    return (
      <section className="mx-auto grid max-w-5xl gap-8">
        <section className="rounded-[36px] border border-white/10 bg-slate-900/85 p-8 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">
            Missing match context
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-white lg:text-4xl">
            Ainda não existe contexto suficiente para abrir esta partida.
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
            Nenhum matchId foi encontrado na rota nem no último snapshot salvo. Volte para o lobby,
            crie uma sala ou recupere uma partida ativa antes de entrar na mesa.
          </p>
          <div className="mt-6">
            <Link
              to="/lobby"
              className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
            >
              Voltar para lobby
            </Link>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="grid gap-5">
      <div className="overflow-hidden rounded-[34px] border border-white/10 bg-slate-900/85 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
        <MatchPageHeader
          connectionStatus={connectionStatus}
          resolvedMatchId={viewModel.resolvedMatchId}
          mySeat={viewModel.mySeat}
          viraRank={viraRank}
          viraRankOptions={VIRA_RANK_OPTIONS}
          canStartHand={viewModel.canStartHand}
          onRefreshState={handleRefreshState}
          onChangeViraRank={setViraRank}
          onStartHand={handleStartHand}
        />

        <div className="grid gap-4 px-5 py-5 lg:px-6 lg:py-6 xl:grid-cols-[minmax(0,1.3fr)_260px]">
          <div className="grid gap-4">
            {!hasHydratedMatchState ? (
              <section className="rounded-[26px] border border-white/10 bg-slate-950/45 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      Waiting for hydration
                    </div>
                    <div className="mt-2 text-lg font-black tracking-tight text-slate-100">
                      A mesa já tem matchId, mas ainda aguarda estado autoritativo suficiente.
                    </div>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                      Estado de entrada válido antes do primeiro room-state ou match-state.
                    </p>
                  </div>

                  <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {connectionStatus}
                  </div>
                </div>
              </section>
            ) : null}

            <section className="rounded-[30px] border border-white/10 bg-slate-950/35 p-3">
              <MatchTableShell
                handStatusLabel={viewModel.handStatusLabel}
                handStatusTone={viewModel.handStatusTone}
                betState={viewModel.betState}
                currentValue={viewModel.currentValue}
                pendingValue={viewModel.pendingValue}
                requestedBy={viewModel.requestedBy}
                specialState={viewModel.specialState}
                specialDecisionPending={viewModel.specialDecisionPending}
                specialDecisionBy={viewModel.specialDecisionBy}
                winner={viewModel.winner}
                awardedPoints={viewModel.awardedPoints}
                latestRound={viewModel.latestRound}
                tablePhase={viewModel.tablePhase}
                canStartHand={viewModel.canStartHand}
                scoreLabel={viewModel.scoreLabel}
                opponentSeatView={viewModel.opponentSeatView}
                mySeatView={viewModel.mySeatView}
                isOneVsOne={viewModel.isOneVsOne}
                roomMode={roomState?.mode ?? null}
                currentTurnSeatId={viewModel.currentTurnSeatId}
                displayedOpponentPlayedCard={liveTableTransition.displayedOpponentPlayedCard}
                displayedMyPlayedCard={liveTableTransition.displayedMyPlayedCard}
                opponentRevealKey={liveTableTransition.opponentRevealKey}
                myRevealKey={
                  liveTableTransition.pendingPlayedCard?.owner === 'mine'
                    ? liveTableTransition.pendingPlayedCard.id
                    : 0
                }
                myCardLaunching={
                  liveTableTransition.pendingPlayedCard?.owner === 'mine' &&
                  !viewModel.myPlayedCard
                }
                roundIntroKey={liveTableTransition.roundIntroKey}
                roundResolvedKey={liveTableTransition.roundResolvedKey}
                currentPrivateViraRank={viewModel.currentPrivateHand?.viraRank ?? null}
                currentPublicViraRank={viewModel.currentPublicHand?.viraRank ?? null}
                viraRank={viraRank}
                availableActions={viewModel.availableActions}
                onAction={handleMatchAction}
                myCards={viewModel.myCards}
                canPlayCard={viewModel.canPlayCard}
                launchingCardKey={liveTableTransition.launchingCardKey}
                currentPrivateHand={viewModel.currentPrivateHand}
                currentPublicHand={viewModel.currentPublicHand}
                onPlayCard={handlePlayCard}
              />
            </section>
          </div>

          <aside className="grid gap-4 self-start">
            <Suspense fallback={<MatchSecondaryPanelFallback title="Match live state" />}>
              <MatchLiveStatePanel
                connectionStatus={connectionStatus}
                resolvedMatchId={viewModel.resolvedMatchId}
                publicState={publicMatchState?.state || '-'}
                privateState={privateMatchState?.state || '-'}
                mySeat={viewModel.mySeat}
                currentTurnSeatId={viewModel.currentTurnSeatId}
                canStartHand={viewModel.canStartHand}
                canPlayCard={viewModel.canPlayCard}
                betState={viewModel.betState}
                specialStateLabel={formatSpecialState(viewModel.specialState)}
                availableActionsSummary={formatAvailableActionsSummary(viewModel.availableActions)}
                canRenderLiveState={canRenderLiveState}
              />
            </Suspense>

            <Suspense fallback={<MatchSecondaryPanelFallback title="Rounds played" />}>
              <MatchRoundsHistoryPanel
                rounds={viewModel.rounds}
                latestRound={viewModel.latestRound}
                playedRoundsCount={viewModel.playedRoundsCount}
              />
            </Suspense>

            <section className="rounded-[26px] border border-white/10 bg-slate-950/50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-base font-black tracking-tight text-slate-100">Event log</div>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    Visibilidade operacional com papel claramente secundário.
                  </p>
                </div>

                <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  client-side
                </span>
              </div>

              <div className="mt-4 rounded-[22px] border border-white/10 bg-slate-950/70 p-4">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-[11px] leading-6 text-slate-300">
                  {eventLog.length > 0 ? eventLog.join('\n') : 'No events yet.'}
                </pre>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </section>
  );
}

function MatchSecondaryPanelFallback({ title }: { title: string }) {
  return (
    <section className="rounded-[24px] border border-white/10 bg-slate-950/45 p-4">
      <div className="text-base font-black tracking-tight text-slate-100">{title}</div>
      <div className="mt-1 text-sm leading-6 text-slate-400">
        Carregando painel secundário da mesa.
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
          <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-4 w-3/4 animate-pulse rounded-full bg-white/10" />
        </div>
        <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
          <div className="h-3 w-20 animate-pulse rounded-full bg-white/10" />
          <div className="mt-3 h-4 w-2/3 animate-pulse rounded-full bg-white/10" />
        </div>
      </div>
    </section>
  );
}

function resolvePlayedCardOwner({
  payloadPlayerId,
  mySeat,
}: {
  payloadPlayerId: string | null;
  mySeat: string | null;
}): 'mine' | 'opponent' {
  if (!payloadPlayerId || !mySeat) {
    return 'opponent';
  }

  return payloadPlayerId === mySeat ? 'mine' : 'opponent';
}

function formatAvailableActionsSummary(
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
): string {
  const enabled = [
    availableActions.canRequestTruco ? 'truco' : null,
    availableActions.canRaiseToSix ? 'raise6' : null,
    availableActions.canRaiseToNine ? 'raise9' : null,
    availableActions.canRaiseToTwelve ? 'raise12' : null,
    availableActions.canAcceptBet ? 'acceptBet' : null,
    availableActions.canDeclineBet ? 'declineBet' : null,
    availableActions.canAcceptMaoDeOnze ? 'accept11' : null,
    availableActions.canDeclineMaoDeOnze ? 'decline11' : null,
    availableActions.canAttemptPlayCard ? 'playCard' : null,
  ].filter((action): action is string => action !== null);

  return enabled.length > 0 ? enabled.join(', ') : 'none';
}

function formatSpecialState(value: string): string {
  if (value === 'mao_de_onze') {
    return 'Mão de 11';
  }

  if (value === 'none') {
    return 'None';
  }

  return value;
}
