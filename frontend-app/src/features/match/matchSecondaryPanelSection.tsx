import { Suspense, lazy } from 'react';
import type { MatchStatePayload } from '../../services/socket/socketTypes';

const MatchLiveStatePanel = lazy(async () =>
  import('./matchLiveStatePanel').then((m) => ({ default: m.MatchLiveStatePanel })),
);
const MatchRoundsHistoryPanel = lazy(async () =>
  import('./matchRoundsHistoryPanel').then((m) => ({ default: m.MatchRoundsHistoryPanel })),
);

type SecondaryPanelVariant = 'docked' | 'overlay';

type Props = {
  variant?: SecondaryPanelVariant;
  onClose?: () => void;
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
  botDecisionSource?: string | null;
  botDecisionProfile?: string | null;
  botLastAction?: string | null;
  botDecisionStrategy?: string | null;
  botHandStrength?: number | null;
  botReason?: string | null;
  botDecisionAt?: string | null;
};

export function MatchSecondaryPanelSection({
  variant = 'docked',
  onClose,
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
  botDecisionSource = null,
  botDecisionProfile = null,
  botLastAction = null,
  botDecisionStrategy = null,
  botHandStrength = null,
  botReason = null,
  botDecisionAt = null,
}: Props) {
  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-300/80">
            Painel Técnico
          </div>
          <div className="mt-1 text-sm font-bold text-slate-100">Observabilidade da partida</div>
        </div>

        {variant === 'overlay' ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 transition hover:border-white/15 hover:bg-white/[0.06] hover:text-slate-200"
          >
            Fechar
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-amber-800 scrollbar-track-transparent">
        <div className="space-y-4">
          <Suspense fallback={<PanelFallback title="Histórico de Rodadas" />}>
            <MatchRoundsHistoryPanel
              rounds={rounds}
              latestRound={latestRound}
              playedRoundsCount={playedRoundsCount}
            />
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
              botDecisionSource={botDecisionSource}
              botDecisionProfile={botDecisionProfile}
              botLastAction={botLastAction}
              botDecisionStrategy={botDecisionStrategy}
              botHandStrength={botHandStrength}
              botReason={botReason}
              botDecisionAt={botDecisionAt}
            />
          </Suspense>

          <section className="rounded-[20px] border border-white/5 bg-[#0a0f16]/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-slate-200">Registro de Eventos</div>
              <span className="rounded-full border border-white/5 bg-white/5 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                Client
              </span>
            </div>

            <div className="h-[220px] overflow-y-auto rounded-xl border border-white/5 bg-[#050810] p-3 scrollbar-thin scrollbar-thumb-amber-800 scrollbar-track-transparent">
              {eventLog.length > 0 ? (
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-5 text-slate-400">
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
      </div>
    </div>
  );

  if (variant === 'overlay') {
    return (
      <>
        <div
          className="fixed inset-0 z-[88] bg-black/45 backdrop-blur-[2px] xl:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
        <aside className="fixed bottom-0 right-0 top-0 z-[89] w-full max-w-[380px] border-l border-white/5 bg-[#060a11]/96 shadow-[-24px_0_60px_rgba(0,0,0,0.42)] backdrop-blur-xl xl:hidden">
          {content}
        </aside>
      </>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[24px] border border-white/5 bg-[#060a11]/92 shadow-[-18px_0_44px_rgba(0,0,0,0.24)]">
      {content}
    </aside>
  );
}

function PanelFallback({ title }: { title: string }) {
  return (
    <section className="rounded-[20px] border border-white/5 bg-[#0a0f16]/80 p-4">
      <div className="text-sm font-bold text-slate-200">{title}</div>
      <div className="mt-4 space-y-3">
        <div className="h-3 w-24 animate-pulse rounded-full bg-white/5" />
        <div className="h-3 w-32 animate-pulse rounded-full bg-white/5" />
        <div className="h-3 w-20 animate-pulse rounded-full bg-white/5" />
      </div>
    </section>
  );
}

function formatAvailableActionsSummary(
  actions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
): string {
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
  if (value === 'mao_de_onze') {
    return 'Mão de 11';
  }

  if (value === 'mao_de_ferro') {
    return 'Mão de ferro';
  }

  return value;
}
