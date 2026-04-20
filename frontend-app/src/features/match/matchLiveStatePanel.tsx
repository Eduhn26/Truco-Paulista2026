import type { ReactNode } from 'react';

type MetricTone = 'default' | 'success' | 'danger' | 'muted';

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
  botDecisionSource?: string | null;
  botDecisionProfile?: string | null;
  botLastAction?: string | null;
  botDecisionStrategy?: string | null;
  botHandStrength?: number | null;
  botReason?: string | null;
  botDecisionAt?: string | null;
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
  botDecisionSource = null,
  botDecisionProfile = null,
  botLastAction = null,
  botDecisionStrategy = null,
  botHandStrength = null,
  botReason = null,
  botDecisionAt = null,
}: MatchLiveStatePanelProps) {
  const hasBotDecisionTelemetry = Boolean(
    botDecisionSource ||
      botDecisionProfile ||
      botLastAction ||
      botDecisionStrategy ||
      botHandStrength !== null ||
      botReason ||
      botDecisionAt,
  );

  return (
    <section className="rounded-[20px] border border-white/5 bg-slate-950/50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-black tracking-tight text-slate-100">Match live state</div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Painel técnico desacoplado da mesa principal.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          server-driven
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
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
        <PanelMetric
          label="Available actions"
          value={availableActionsSummary}
          mono
          valueClassName="text-[11px] leading-4"
        />
      </div>

      <div className="mt-3 rounded-[18px] border border-amber-400/10 bg-amber-500/[0.035] p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-300/90">
            Bot decision telemetry
          </div>

          <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
            {hasBotDecisionTelemetry ? 'live' : 'idle'}
          </span>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <PanelMetric
            label="Bot decision source"
            value={botDecisionSource ?? '-'}
            mono
            tone={botDecisionSource ? 'default' : 'muted'}
          />
          <PanelMetric
            label="Bot decision profile"
            value={botDecisionProfile ?? '-'}
            mono
            tone={botDecisionProfile ? 'default' : 'muted'}
          />
          <PanelMetric
            label="Bot last action"
            value={botLastAction ?? '-'}
            mono
            tone={botLastAction ? 'default' : 'muted'}
          />
          <PanelMetric
            label="Bot decision strategy"
            value={botDecisionStrategy ?? '-'}
            mono
            tone={botDecisionStrategy ? 'default' : 'muted'}
          />
          <PanelMetric
            label="Bot hand strength"
            value={formatHandStrength(botHandStrength)}
            mono
            tone={botHandStrength !== null ? 'default' : 'muted'}
          />
          <PanelMetric
            label="Bot fallback reason"
            value={botReason ?? '-'}
            mono
            tone={botReason ? 'default' : 'muted'}
          />
          <PanelMetric
            label="Bot decision at"
            value={formatDecisionTimestamp(botDecisionAt)}
            mono
            tone={botDecisionAt ? 'default' : 'muted'}
          />
        </div>
      </div>

      {!canRenderLiveState ? (
        <div className="mt-4 rounded-[20px] border border-amber-400/15 bg-amber-500/5 p-4 text-sm leading-6 text-amber-200">
          Missing authenticated session or matchId to hydrate the live table.
        </div>
      ) : null}
    </section>
  );
}

function PanelMetric({
  label,
  value,
  tone = 'default',
  mono = false,
  valueClassName = '',
}: {
  label: string;
  value: ReactNode;
  tone?: MetricTone;
  mono?: boolean;
  valueClassName?: string;
}) {
  const toneClass =
    tone === 'success'
      ? 'text-amber-300'
      : tone === 'danger'
        ? 'text-rose-300'
        : tone === 'muted'
          ? 'text-slate-500'
          : 'text-slate-100';

  return (
    <div className="rounded-[16px] border border-white/10 bg-white/[0.03] p-2.5">
      <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>

      <div
        className={`mt-1 break-words text-[11px] ${
          mono ? 'font-mono' : 'font-semibold'
        } ${toneClass} ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  );
}

function formatHandStrength(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }

  return value.toFixed(2);
}

function formatDecisionTimestamp(value: string | null): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}
