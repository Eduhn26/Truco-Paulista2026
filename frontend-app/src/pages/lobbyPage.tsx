import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuth } from '../features/auth/authStore';
import { useLobbyRealtimeSession } from '../features/lobby/useLobbyRealtimeSession';
import type { MatchStatePayload } from '../services/socket/socketTypes';

export function LobbyPage() {
  const { session } = useAuth();
  const [matchId, setMatchId] = useState('');

  const {
    connectionStatus,
    roomState,
    playerAssigned,
    eventLog,
    derivedMatchId,
    roomPlayers,
    currentReady,
    hasLobbySnapshot,
    isSocketOnline,
    canConnect,
    canCreateMatch,
    canJoinMatch,
    canToggleReady,
    canRequestState,
    displayedMatchState,
    handleConnect,
    handleDisconnect,
    handleCreateMatch,
    handleJoinMatch,
    handleReady,
    handleGetState,
  } = useLobbyRealtimeSession(session, matchId);

  const hasMinimumSession = Boolean(session?.backendUrl && session?.authToken);

  const entryState = !hasMinimumSession
    ? {
        eyebrow: 'Session required',
        title: 'Sua sessão autenticada ainda não está pronta para o lobby.',
        detail:
          'O frontend precisa de authToken e backendUrl válidos antes de abrir o fluxo em tempo real. Volte para a home e refaça o login se necessário.',
        tone: 'warning' as const,
      }
    : !hasLobbySnapshot && !isSocketOnline
      ? {
          eyebrow: 'Socket offline',
          title: 'Conecte o socket para começar a hidratar a sala.',
          detail:
            'Sem conexão e sem snapshot salvo, o lobby ainda não recebeu room-state nem match-state. Esta é uma espera válida de entrada, não uma falha da regra do jogo.',
          tone: 'neutral' as const,
        }
      : !derivedMatchId
        ? {
            eyebrow: 'Waiting for match context',
            title: 'Crie uma partida ou informe um matchId para seguir para a mesa.',
            detail:
              'A tela já pode mostrar sessão e conectividade, mas ainda falta contexto suficiente para abrir a MatchPage com segurança semântica.',
            tone: 'neutral' as const,
          }
        : {
            eyebrow: 'Match context ready',
            title: 'O lobby já tem contexto suficiente para a próxima etapa.',
            detail:
              'Quando quiser, siga para a tela dedicada da partida com o matchId derivado do estado autoritativo recebido.',
            tone: 'success' as const,
          };

  return (
    <section className="grid gap-8">
      <div className="overflow-hidden rounded-[32px] border border-white/10 bg-slate-900/80 shadow-[0_28px_90px_rgba(15,23,42,0.45)]">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_45%)] px-8 py-8 lg:px-10 lg:py-10">
          <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr] xl:items-end">
            <div>
              <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-emerald-300">
                Authenticated lobby
              </div>

              <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight text-white lg:text-5xl">
                Entre na sala e deixe a partida pronta para começar.
              </h1>

              <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
                O lobby agora prioriza entrada, leitura rápida de status e ações principais. A
                lógica continua intacta, mas a experiência visual fica mais próxima de um produto
                jogável de verdade.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rounded-3xl border border-white/10 bg-slate-950/65 p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Connection
                </div>
                <div
                  className={`mt-3 inline-flex rounded-full px-3 py-1.5 text-sm font-bold ${
                    connectionStatus === 'online'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {connectionStatus}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/65 p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Assigned seat
                </div>
                <div className="mt-3 text-lg font-bold text-slate-100">
                  {playerAssigned?.seatId ?? '-'}
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/65 p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                  Active match
                </div>
                <div className="mt-3 break-all text-sm font-bold text-slate-100">
                  {derivedMatchId || '-'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-8 px-8 py-8 lg:px-10 lg:py-10 xl:grid-cols-[420px_1fr]">
          <aside className="grid gap-6 self-start">
            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">Player session</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Contexto da sessão mantido em destaque, mas sem competir com as ações principais.
                  </p>
                </div>

                <div
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] ${
                    session?.authToken
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : 'bg-rose-500/15 text-rose-300'
                  }`}
                >
                  {session?.authToken ? 'Auth ready' : 'Auth missing'}
                </div>
              </div>

              <div className="mt-6 grid gap-4 text-sm">
                <div className="rounded-3xl border border-emerald-400/15 bg-emerald-500/5 px-5 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-300">
                    User
                  </div>
                  <div className="mt-3 text-lg font-bold text-slate-100">
                    {session?.user?.displayName ?? session?.user?.email ?? 'Unknown user'}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Provider
                  </div>
                  <div className="mt-3 text-slate-100">{session?.user?.provider ?? '-'}</div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    User ID
                  </div>
                  <div className="mt-3 break-all font-mono text-xs text-slate-100">
                    {session?.user?.id ?? '-'}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-5 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Backend URL
                  </div>
                  <div className="mt-3 break-all font-mono text-xs text-slate-100">
                    {session?.backendUrl || '-'}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div>
                <div className="text-lg font-black tracking-tight text-slate-100">Lobby actions</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Conecte, crie ou entre em uma sala e siga para a mesa dedicada quando a partida
                  estiver pronta.
                </p>
              </div>

              <label className="mt-6 grid gap-2 text-sm">
                <span className="font-medium text-slate-300">Match ID</span>
                <input
                  value={matchId}
                  onChange={(event) => setMatchId(event.target.value)}
                  className="rounded-3xl border border-white/10 bg-slate-950 px-5 py-4 text-slate-100 outline-none transition focus:border-emerald-400/40"
                  placeholder="Paste a matchId to join an existing room"
                />
              </label>

              <div className="mt-6 grid gap-4">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={!canConnect || isSocketOnline}
                  className="rounded-3xl bg-emerald-500 px-5 py-4 text-base font-black text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Connect socket
                </button>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={!isSocketOnline}
                    className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Disconnect
                  </button>

                  <button
                    type="button"
                    onClick={handleGetState}
                    disabled={!canRequestState}
                    className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Get state
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={handleCreateMatch}
                    disabled={!canCreateMatch}
                    className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Create match
                  </button>

                  <button
                    type="button"
                    onClick={() => handleJoinMatch(matchId)}
                    disabled={!canJoinMatch}
                    className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Join match
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleReady}
                  disabled={!canToggleReady}
                  className={`rounded-3xl border px-5 py-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    currentReady
                      ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15'
                      : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
                  }`}
                >
                  {currentReady ? 'Set not ready' : 'Set ready'}
                </button>

                {derivedMatchId ? (
                  <Link
                    to={`/match/${derivedMatchId}`}
                    className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-5 py-4 text-center text-sm font-black text-emerald-300 transition hover:bg-emerald-500/15"
                  >
                    Open match screen
                  </Link>
                ) : null}
              </div>
            </section>
          </aside>

          <div className="grid gap-6">
            <section
              className={`rounded-[28px] border p-6 ${getEntryToneClass(entryState.tone)}`}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    {entryState.eyebrow}
                  </div>
                  <div className="mt-3 text-2xl font-black tracking-tight text-slate-100">
                    {entryState.title}
                  </div>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
                    {entryState.detail}
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  entry-state
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">Room overview</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Estado da sala agrupado para leitura rápida antes da ida para a mesa.
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  server-driven
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    matchId
                  </div>
                  <div className="mt-3 break-all font-mono text-sm text-slate-100">
                    {roomState?.matchId || '-'}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    currentTurnSeatId
                  </div>
                  <div className="mt-3 font-mono text-sm text-slate-100">
                    {roomState?.currentTurnSeatId || '-'}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    canStart
                  </div>
                  <div className="mt-3 font-mono text-sm text-slate-100">
                    {String(roomState?.canStart ?? false)}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    players
                  </div>
                  <div className="mt-3 font-mono text-sm text-slate-100">{roomPlayers.length}</div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {roomPlayers.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400">
                    No players received yet.
                  </div>
                ) : (
                  roomPlayers.map((player) => (
                    <div
                      key={player.seatId}
                      className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-base font-black text-slate-100">{player.seatId}</div>
                        <div
                          className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] ${
                            player.ready
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-white/5 text-slate-400'
                          }`}
                        >
                          {player.ready ? 'Ready' : 'Waiting'}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-2 text-sm text-slate-400">
                        <div>bot: {String(player.isBot ?? false)}</div>
                        <div>team: {player.teamId ?? '-'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">Match preview</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Resumo compacto da partida antes da transição para a tela jogável.
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {displayedMatchState ? 'private or public view' : 'no match-state'}
                </div>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <PreviewMetricCard label="matchId" value={displayedMatchState?.matchId || '-'} mono />
                <PreviewMetricCard label="state" value={displayedMatchState?.state || '-'} mono />
                <PreviewMetricCard
                  label="score"
                  value={`T1 ${displayedMatchState?.score.playerOne ?? 0} × T2 ${displayedMatchState?.score.playerTwo ?? 0}`}
                  mono
                />
                <PreviewMetricCard
                  label="currentValue"
                  value={String(displayedMatchState?.currentHand?.currentValue ?? '-')}
                  mono
                />
                <PreviewMetricCard
                  label="betState"
                  value={displayedMatchState?.currentHand?.betState ?? '-'}
                  mono
                />
                <PreviewMetricCard
                  label="pendingValue"
                  value={String(displayedMatchState?.currentHand?.pendingValue ?? '-')}
                  mono
                />
                <PreviewMetricCard
                  label="specialState"
                  value={displayedMatchState?.currentHand?.specialState ?? '-'}
                  mono
                />
                <PreviewMetricCard
                  label="availableActions"
                  value={formatAvailableActionsSummary(displayedMatchState)}
                  mono
                />
              </div>

              {displayedMatchState?.currentHand ? (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Player one hand
                    </div>
                    <div className="mt-3 font-mono text-sm text-slate-100">
                      {displayedMatchState.currentHand.playerOneHand.join(', ') || '-'}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      Player two hand
                    </div>
                    <div className="mt-3 font-mono text-sm text-slate-100">
                      {displayedMatchState.currentHand.playerTwoHand.join(', ') || '-'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] p-5 text-sm text-slate-400">
                  No match-state payload received yet.
                </div>
              )}
            </section>

            <section className="rounded-[28px] border border-white/10 bg-slate-950/60 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-100">Event log</div>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    Visibilidade operacional mantida, mas agora com menos peso visual que o fluxo
                    principal da tela.
                  </p>
                </div>

                <div className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  client-side
                </div>
              </div>

              <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/70 p-5">
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs leading-7 text-slate-300">
                  {eventLog.length > 0 ? eventLog.join('\n') : 'No events yet.'}
                </pre>
              </div>
            </section>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewMetricCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className={`mt-3 break-all text-sm text-slate-100 ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function formatAvailableActionsSummary(matchState: { currentHand?: MatchStatePayload['currentHand'] } | null): string {
  const actions = matchState?.currentHand?.availableActions;

  if (!actions) {
    return '-';
  }

  const enabled = [
    actions.canRequestTruco ? 'truco' : null,
    actions.canRaiseToSix ? 'raise6' : null,
    actions.canRaiseToNine ? 'raise9' : null,
    actions.canRaiseToTwelve ? 'raise12' : null,
    actions.canAcceptBet ? 'acceptBet' : null,
    actions.canDeclineBet ? 'declineBet' : null,
    actions.canAcceptMaoDeOnze ? 'accept11' : null,
    actions.canDeclineMaoDeOnze ? 'decline11' : null,
    actions.canAttemptPlayCard ? 'playCard' : null,
  ].filter((action): action is string => action !== null);

  return enabled.length > 0 ? enabled.join(', ') : 'none';
}

function getEntryToneClass(tone: 'neutral' | 'warning' | 'success'): string {
  if (tone === 'success') {
    return 'border-emerald-400/20 bg-emerald-500/10';
  }

  if (tone === 'warning') {
    return 'border-amber-400/20 bg-amber-500/10';
  }

  return 'border-white/10 bg-slate-950/60';
}
