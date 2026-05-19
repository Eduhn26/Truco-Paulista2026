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
  botActorSeatId?: string | null;
  botActorTeamId?: string | null;
  botPartnerSeatId?: string | null;
  botWinningSeatIdBeforeDecision?: string | null;
  botWinningTeamIdBeforeDecision?: string | null;
  botWinningCardBeforeDecision?: string | null;
  botPartnerWasWinning?: boolean | null;
  botActorHandBefore?: string[] | null;
  botSelectedCard?: string | null;
  botExecutionStatus?: string | null;
  botExecutedAction?: string | null;
  botExecutionReason?: string | null;
  botExecutionError?: string | null;
  botBetCurrentValue?: number | null;
  botBetPendingValue?: number | null;
  botBetSelectedAction?: string | null;
  botBetProgressBoost?: number | null;
  botBetScoreBoost?: number | null;
  botBetEffectiveStrength?: number | null;
  botBetAcceptThreshold?: number | null;
  botBetRaiseThreshold?: number | null;
  botBetInitiativeThreshold?: number | null;
  botBetDeclineFloor?: number | null;
  botBetMyPointsToWin?: number | null;
  botBetOpponentPointsToWin?: number | null;
  botBetDeclineLosesMatch?: boolean | null;
  botBetAcceptRisksMatch?: boolean | null;
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
  botActorSeatId = null,
  botActorTeamId = null,
  botPartnerSeatId = null,
  botWinningSeatIdBeforeDecision = null,
  botWinningTeamIdBeforeDecision = null,
  botWinningCardBeforeDecision = null,
  botPartnerWasWinning = null,
  botActorHandBefore = null,
  botSelectedCard = null,
  botExecutionStatus = null,
  botExecutedAction = null,
  botExecutionReason = null,
  botExecutionError = null,
  botBetCurrentValue = null,
  botBetPendingValue = null,
  botBetSelectedAction = null,
  botBetProgressBoost = null,
  botBetScoreBoost = null,
  botBetEffectiveStrength = null,
  botBetAcceptThreshold = null,
  botBetRaiseThreshold = null,
  botBetInitiativeThreshold = null,
  botBetDeclineFloor = null,
  botBetMyPointsToWin = null,
  botBetOpponentPointsToWin = null,
  botBetDeclineLosesMatch = null,
  botBetAcceptRisksMatch = null,
}: Props) {
  const content = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-amber-300/10 px-4 py-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.24em] text-amber-200/80">
            Painel da Partida
          </div>
          <div className="mt-1 text-sm font-bold text-[#f0e6d3]">Leitura auxiliar da mesa</div>
        </div>

        {variant === 'overlay' ? (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-amber-300/10 bg-amber-500/[0.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/60 transition hover:border-amber-300/20 hover:bg-amber-500/[0.08] hover:text-amber-100"
          >
            Fechar
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 scrollbar-thin scrollbar-thumb-amber-700/70 scrollbar-track-transparent">
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

          <BotDecisionAuditPanel
            actorSeatId={botActorSeatId}
            actorTeamId={botActorTeamId}
            partnerSeatId={botPartnerSeatId}
            winningSeatIdBeforeDecision={botWinningSeatIdBeforeDecision}
            winningTeamIdBeforeDecision={botWinningTeamIdBeforeDecision}
            winningCardBeforeDecision={botWinningCardBeforeDecision}
            partnerWasWinning={botPartnerWasWinning}
            actorHandBefore={botActorHandBefore}
            selectedCard={botSelectedCard}
            strategy={botDecisionStrategy}
            handStrength={botHandStrength}
            executionStatus={botExecutionStatus}
            executedAction={botExecutedAction}
            executionReason={botExecutionReason}
            executionError={botExecutionError}
            betCurrentValue={botBetCurrentValue}
            betPendingValue={botBetPendingValue}
            betSelectedAction={botBetSelectedAction}
            betProgressBoost={botBetProgressBoost}
            betScoreBoost={botBetScoreBoost}
            betEffectiveStrength={botBetEffectiveStrength}
            betAcceptThreshold={botBetAcceptThreshold}
            betRaiseThreshold={botBetRaiseThreshold}
            betInitiativeThreshold={botBetInitiativeThreshold}
            betDeclineFloor={botBetDeclineFloor}
            betMyPointsToWin={botBetMyPointsToWin}
            betOpponentPointsToWin={botBetOpponentPointsToWin}
            betDeclineLosesMatch={botBetDeclineLosesMatch}
            betAcceptRisksMatch={botBetAcceptRisksMatch}
          />

          <section className="rounded-[20px] border border-amber-300/10 bg-[linear-gradient(180deg,rgba(9,19,19,0.92),rgba(7,12,18,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-bold text-[#f0e6d3]">Registro de Eventos</div>
              <span className="rounded-full border border-amber-300/10 bg-amber-500/[0.06] px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-100/40">
                Client
              </span>
            </div>

            <div className="h-[220px] overflow-y-auto rounded-xl border border-amber-300/10 bg-[#05080d] p-3 scrollbar-thin scrollbar-thumb-amber-700/70 scrollbar-track-transparent">
              {eventLog.length > 0 ? (
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-5 text-amber-50/55">
                  {eventLog.join('\n')}
                </pre>
              ) : (
                <div className="flex h-full items-center justify-center text-[10px] text-amber-100/25">
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
          className="fixed inset-0 z-[88] bg-black/55 backdrop-blur-[3px] xl:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
        <aside className="fixed bottom-0 right-0 top-0 z-[89] w-full max-w-[392px] border-l border-amber-300/10 bg-[linear-gradient(180deg,rgba(6,12,14,0.97),rgba(5,9,14,0.96))] shadow-[-24px_0_60px_rgba(0,0,0,0.42)] backdrop-blur-xl xl:hidden">
          {content}
        </aside>
      </>
    );
  }

  return (
    <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[28px] border border-amber-300/10 bg-[linear-gradient(180deg,rgba(6,12,14,0.95),rgba(5,9,14,0.92))] shadow-[-18px_0_44px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.03)]">
      {content}
    </aside>
  );
}

type BotDecisionAuditPanelProps = {
  actorSeatId: string | null;
  actorTeamId: string | null;
  partnerSeatId: string | null;
  winningSeatIdBeforeDecision: string | null;
  winningTeamIdBeforeDecision: string | null;
  winningCardBeforeDecision: string | null;
  partnerWasWinning: boolean | null;
  actorHandBefore: string[] | null;
  selectedCard: string | null;
  strategy: string | null;
  handStrength: number | null;
  executionStatus: string | null;
  executedAction: string | null;
  executionReason: string | null;
  executionError: string | null;
  betCurrentValue: number | null;
  betPendingValue: number | null;
  betSelectedAction: string | null;
  betProgressBoost: number | null;
  betScoreBoost: number | null;
  betEffectiveStrength: number | null;
  betAcceptThreshold: number | null;
  betRaiseThreshold: number | null;
  betInitiativeThreshold: number | null;
  betDeclineFloor: number | null;
  betMyPointsToWin: number | null;
  betOpponentPointsToWin: number | null;
  betDeclineLosesMatch: boolean | null;
  betAcceptRisksMatch: boolean | null;
};

function BotDecisionAuditPanel({
  actorSeatId,
  actorTeamId,
  partnerSeatId,
  winningSeatIdBeforeDecision,
  winningTeamIdBeforeDecision,
  winningCardBeforeDecision,
  partnerWasWinning,
  actorHandBefore,
  selectedCard,
  strategy,
  handStrength,
  executionStatus,
  executedAction,
  executionReason,
  executionError,
  betCurrentValue,
  betPendingValue,
  betSelectedAction,
  betProgressBoost,
  betScoreBoost,
  betEffectiveStrength,
  betAcceptThreshold,
  betRaiseThreshold,
  betInitiativeThreshold,
  betDeclineFloor,
  betMyPointsToWin,
  betOpponentPointsToWin,
  betDeclineLosesMatch,
  betAcceptRisksMatch,
}: BotDecisionAuditPanelProps) {
  const rows = [
    { label: 'ator', value: actorSeatId },
    { label: 'time', value: actorTeamId },
    { label: 'parceiro', value: partnerSeatId },
    { label: 'vencendo', value: winningSeatIdBeforeDecision },
    { label: 'time vencendo', value: winningTeamIdBeforeDecision },
    { label: 'carta vencendo', value: winningCardBeforeDecision },
    { label: 'parceiro vence', value: formatNullablePanelValue(partnerWasWinning) },
    { label: 'carta escolhida', value: selectedCard },
    { label: 'estratégia', value: strategy },
    { label: 'mão antes', value: actorHandBefore?.join(', ') ?? null },
    { label: 'execução', value: executionStatus },
    { label: 'ação executada', value: executedAction },
    { label: 'motivo exec.', value: executionReason },
    { label: 'erro exec.', value: executionError },
    { label: 'valor atual', value: formatNullablePanelNumber(betCurrentValue) },
    { label: 'valor pedido', value: formatNullablePanelNumber(betPendingValue) },
    { label: 'ação aposta', value: betSelectedAction },
    { label: 'força aposta', value: formatNullablePanelNumber(betEffectiveStrength) },
    { label: 'força mão', value: formatNullablePanelNumber(handStrength) },
    { label: 'boost rodada', value: formatNullablePanelNumber(betProgressBoost) },
    { label: 'boost placar', value: formatNullablePanelNumber(betScoreBoost) },
    { label: 'limite aceitar', value: formatNullablePanelNumber(betAcceptThreshold) },
    { label: 'limite subir', value: formatNullablePanelNumber(betRaiseThreshold) },
    { label: 'limite iniciar', value: formatNullablePanelNumber(betInitiativeThreshold) },
    { label: 'piso correr', value: formatNullablePanelNumber(betDeclineFloor) },
    { label: 'faltam nós', value: formatNullablePanelNumber(betMyPointsToWin) },
    { label: 'faltam eles', value: formatNullablePanelNumber(betOpponentPointsToWin) },
    { label: 'correr perde', value: formatNullablePanelValue(betDeclineLosesMatch) },
    { label: 'aceitar arrisca', value: formatNullablePanelValue(betAcceptRisksMatch) },
  ];

  return (
    <section className="rounded-[20px] border border-amber-300/10 bg-[linear-gradient(180deg,rgba(9,19,19,0.92),rgba(7,12,18,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-[#f0e6d3]">Bot Decision Audit</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/35">
            Leitura tática antes da jogada
          </div>
        </div>
        <span className="rounded-full border border-amber-300/10 bg-amber-500/[0.06] px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-amber-100/40">
          Debug
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="rounded-xl border border-amber-300/10 bg-black/18 px-3 py-2"
          >
            <div className="font-mono text-[8px] font-black uppercase tracking-[0.20em] text-amber-100/30">
              {row.label}
            </div>
            <div className="mt-1 break-words font-mono text-[10px] font-bold text-amber-50/70">
              {formatNullablePanelValue(row.value)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatNullablePanelNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-';
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function formatNullablePanelValue(value: string | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function PanelFallback({ title }: { title: string }) {
  return (
    <section className="rounded-[20px] border border-amber-300/10 bg-[linear-gradient(180deg,rgba(9,19,19,0.92),rgba(7,12,18,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
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
