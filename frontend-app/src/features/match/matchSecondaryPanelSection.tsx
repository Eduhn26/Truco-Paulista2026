import { Suspense, lazy } from 'react';
import type { MatchStatePayload } from '../../services/socket/socketTypes';

const MatchLiveStatePanel = lazy(async () =>
  import('./matchLiveStatePanel').then((m) => ({ default: m.MatchLiveStatePanel }))
);
const MatchRoundsHistoryPanel = lazy(async () =>
  import('./matchRoundsHistoryPanel').then((m) => ({ default: m.MatchRoundsHistoryPanel }))
);

type Props = {
  showSecondary: boolean;
  onToggle: () => void;
  eventLog: string[];
  connectionStatus: 'offline' | 'online';
  resolvedMatchId: string;
  publicState: string;
  privateState: string;
  mySeat: string | null;
  currentTurnSeatId: string | null;
  canStartHand: boolean;
  canPlayCard: boolean;
  betState: string;
  specialState: string;
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  canRenderLiveState: boolean;
  rounds: NonNullable<MatchStatePayload['currentHand']>['rounds'];
  latestRound: NonNullable<MatchStatePayload['currentHand']>['rounds'][number] | null;
  playedRoundsCount: number;
};

export function MatchSecondaryPanelSection({
  showSecondary,
  onToggle,
  eventLog,
  connectionStatus,
  resolvedMatchId,
  publicState,
  privateState,
  mySeat,
  currentTurnSeatId,
  canStartHand,
  canPlayCard,
  betState,
  specialState,
  availableActions,
  canRenderLiveState,
  rounds,
  latestRound,
  playedRoundsCount,
}: Props) {
  return (
    <div className="mt-4 w-full">
      <button
        type="button"
        onClick={onToggle}
        className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300"
      >
        {showSecondary ? '▲' : '▼'} Painel Técnico
      </button>

      {showSecondary && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Suspense fallback={<PanelFallback title="Histórico de Rodadas" />}>
            <MatchRoundsHistoryPanel rounds={rounds} latestRound={latestRound} playedRoundsCount={playedRoundsCount} />
          </Suspense>

          <Suspense fallback={<PanelFallback title="Estado ao Vivo" />}>
            <MatchLiveStatePanel
              connectionStatus={connectionStatus}
              resolvedMatchId={resolvedMatchId}
              publicState={publicState}
              privateState={privateState}
              mySeat={mySeat}
              currentTurnSeatId={currentTurnSeatId}
              canStartHand={canStartHand}
              canPlayCard={canPlayCard}
              betState={betState}
              specialStateLabel={formatSpecialState(specialState)}
              availableActionsSummary={formatAvailableActionsSummary(availableActions)}
              canRenderLiveState={canRenderLiveState}
            />
          </Suspense>

          <section className="rounded-[20px] border border-white/5 bg-[#0a0f16]/80 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-200">Registro de Eventos</div>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500 border border-white/5">
                Client
              </span>
            </div>
            <div className="h-48 overflow-y-auto rounded-xl border border-white/5 bg-[#050810] p-3 scrollbar-thin scrollbar-thumb-amber-800 scrollbar-track-transparent">
              {eventLog.length > 0 ? (
                <pre className="text-[10px] leading-6 text-slate-400 font-mono whitespace-pre-wrap">
                  {eventLog.join('\n')}
                </pre>
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-slate-600">
                  Nenhum evento registrado.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PanelFallback({ title }: { title: string }) {
  return (
    <section className="rounded-[20px] border border-white/5 bg-[#0a0f16]/80 p-5">
      <div className="text-sm font-bold text-slate-200">{title}</div>
      <div className="mt-4 space-y-3">
        <div className="h-3 w-24 animate-pulse rounded-full bg-white/5" />
        <div className="h-3 w-32 animate-pulse rounded-full bg-white/5" />
        <div className="h-3 w-20 animate-pulse rounded-full bg-white/5" />
      </div>
    </section>
  );
}

function formatAvailableActionsSummary(actions: NonNullable<MatchStatePayload['currentHand']>['availableActions']): string {
  const enabled = [
    actions.canRequestTruco ? 'truco' : null,
    actions.canRaiseToSix ? 'raise6' : null,
    actions.canRaiseToNine ? 'raise9' : null,
    actions.canRaiseToTwelve ? 'raise12' : null,
    actions.canAcceptBet ? 'accept' : null,
    actions.canDeclineBet ? 'decline' : null,
    actions.canAcceptMaoDeOnze ? 'accept11' : null,
    actions.canDeclineMaoDeOnze ? 'decline11' : null,
    actions.canAttemptPlayCard ? 'playCard' : null,
  ].filter(Boolean);
  return enabled.length > 0 ? enabled.join(', ') : 'none';
}

function formatSpecialState(value: string): string {
  if (value === 'mao_de_onze') return 'Mão de 11';
  if (value === 'mao_de_ferro') return 'Mão de ferro';
  return value;
}
