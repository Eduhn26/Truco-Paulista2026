import type { ReactNode } from 'react';

type MetricTone = 'default' | 'success' | 'danger' | 'warning';

type MatchLiveStatePanelProps = {
  connectionStatus: 'offline' | 'online';
  resolvedMatchId: string;
  publicState: string;
  privateState: string;
  mySeat: string | null;
  currentTurnSeatId: string | null;
  canStartHand: boolean;
  canPlayCard: boolean;
  betState: string;
  specialStateLabel: string;
  availableActionsSummary: string;
  canRenderLiveState: boolean;
};

export function MatchLiveStatePanel({
  connectionStatus,
  resolvedMatchId,
  publicState,
  privateState,
  mySeat,
  currentTurnSeatId,
  canStartHand,
  canPlayCard,
  betState,
  specialStateLabel,
  availableActionsSummary,
  canRenderLiveState,
}: MatchLiveStatePanelProps) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-slate-950/50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-base font-black tracking-tight text-slate-100">Match live state</div>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            Painel técnico curto, com só o que realmente ajuda a ler runtime.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          server-driven
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <PanelMetric
            label="Connection"
            value={connectionStatus}
            tone={connectionStatus === 'online' ? 'success' : 'danger'}
          />
          <PanelMetric label="My seat" value={mySeat || '-'} mono />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PanelMetric label="Public / private" value={`${publicState} / ${privateState}`} mono />
          <PanelMetric label="Turn" value={currentTurnSeatId ?? '-'} mono />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <PanelMetric
            label="Can start / play"
            value={`${String(canStartHand)} / ${String(canPlayCard)}`}
            mono
            tone={canStartHand || canPlayCard ? 'success' : 'default'}
          />
          <PanelMetric label="Bet / special" value={`${betState} / ${specialStateLabel}`} mono />
        </div>

        <PanelMetric label="Available actions" value={availableActionsSummary} mono />
        <PanelMetric label="Match ID" value={resolvedMatchId || '-'} mono />

        {!canRenderLiveState ? (
          <div className="rounded-[22px] border border-amber-400/15 bg-amber-500/5 px-4 py-4 text-sm leading-6 text-amber-200">
            Missing authenticated session or matchId to hydrate the live table.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PanelMetric({
  label,
  value,
  tone = 'default',
  mono = false,
}: {
  label: string;
  value: ReactNode;
  tone?: MetricTone;
  mono?: boolean;
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'danger'
        ? 'text-rose-300'
        : tone === 'warning'
          ? 'text-amber-200'
          : 'text-slate-100';

  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1.5 break-words text-sm ${mono ? 'font-mono' : 'font-semibold'} ${toneClass}`}
      >
        {value}
      </div>
    </div>
  );
}
