import type { ReactNode } from 'react';

type MetricTone = 'default' | 'success' | 'danger';

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
    <section className="rounded-[30px] border border-white/10 bg-slate-950/50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-lg font-black tracking-tight text-slate-100">Match live state</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Painel técnico segue secundário, mas fiel ao payload.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
          server-driven
        </span>
      </div>

      <div className="mt-6 grid gap-4">
        <PanelMetric
          label="Connection"
          value={connectionStatus}
          tone={connectionStatus === 'online' ? 'success' : 'danger'}
        />
        <PanelMetric label="Match ID" value={resolvedMatchId || '-'} mono />
        <PanelMetric label="Public state" value={publicState || '-'} mono />
        <PanelMetric label="Private state" value={privateState || '-'} mono />
        <PanelMetric label="My seat" value={mySeat || '-'} mono />
        <PanelMetric label="Current turn seat" value={currentTurnSeatId ?? '-'} mono />
        <PanelMetric label="Can start" value={String(canStartHand)} mono />
        <PanelMetric label="Can play card" value={String(canPlayCard)} mono />
        <PanelMetric label="Bet state" value={betState} mono />
        <PanelMetric label="Special state" value={specialStateLabel} mono />
        <PanelMetric label="Available actions" value={availableActionsSummary} mono />

        {!canRenderLiveState ? (
          <div className="rounded-[28px] border border-amber-400/15 bg-amber-500/5 p-5 text-sm leading-6 text-amber-200">
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
        : 'text-slate-100';

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className={`mt-2 break-words text-sm ${mono ? 'font-mono' : 'font-semibold'} ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}
