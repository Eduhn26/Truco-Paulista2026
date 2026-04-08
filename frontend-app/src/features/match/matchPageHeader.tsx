import { Link } from 'react-router-dom';

import type { Rank } from '../../services/socket/socketTypes';

function MetricCard({
  label,
  value,
  mono = false,
  tone = 'default',
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'default' | 'success' | 'danger';
}) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-300'
      : tone === 'danger'
        ? 'text-rose-300'
        : 'text-slate-100';

  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className={`mt-2 break-all text-sm font-bold ${mono ? 'font-mono' : ''} ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

export function MatchPageHeader({
  connectionStatus,
  resolvedMatchId,
  mySeat,
  viraRank,
  viraRankOptions,
  canStartHand,
  onRefreshState,
  onChangeViraRank,
  onStartHand,
}: {
  connectionStatus: 'offline' | 'online';
  resolvedMatchId: string;
  mySeat: string | null;
  viraRank: Rank;
  viraRankOptions: Rank[];
  canStartHand: boolean;
  onRefreshState: () => void;
  onChangeViraRank: (value: Rank) => void;
  onStartHand: () => void;
}) {
  return (
    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_40%),radial-gradient(circle_at_top_right,rgba(201,168,76,0.12),transparent_28%)] px-6 py-6 lg:px-8 lg:py-7">
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
        <div>
          <div className="inline-flex rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-emerald-300">
            Live match
          </div>

          <h1 className="mt-4 max-w-4xl text-3xl font-black tracking-tight text-white lg:text-4xl">
            Mesa pronta para ler turno, pressão da aposta e ritmo da mão.
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
            The hero surface now prioritizes readable match context first, keeping the table as the
            dominant visual center while preserving explicit control over refresh and hand start.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricCard
            label="Connection"
            value={connectionStatus}
            tone={connectionStatus === 'online' ? 'success' : 'danger'}
          />
          <MetricCard label="Match ID" value={resolvedMatchId || '-'} mono />
          <MetricCard label="My seat" value={mySeat || '-'} />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2.5">
        <Link
          to="/lobby"
          className="rounded-[22px] bg-emerald-500 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-emerald-400"
        >
          Voltar para lobby
        </Link>

        <button
          type="button"
          onClick={onRefreshState}
          className="rounded-[22px] border border-white/10 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
        >
          Get state
        </button>

        <select
          value={viraRank}
          onChange={(event) => onChangeViraRank(event.target.value as Rank)}
          className="rounded-[22px] border border-white/10 bg-slate-950 px-4 py-3 text-sm font-bold text-slate-100 outline-none transition focus:border-emerald-400/40"
        >
          {viraRankOptions.map((option) => (
            <option key={option} value={option}>
              Vira {option}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onStartHand}
          disabled={!canStartHand}
          className={`rounded-[22px] border px-4 py-3 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
            canStartHand
              ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/20'
              : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
          }`}
        >
          Start next hand
        </button>
      </div>
    </div>
  );
}
