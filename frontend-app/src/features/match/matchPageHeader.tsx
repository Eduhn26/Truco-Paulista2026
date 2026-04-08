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
      ? 'text-amber-300'
      : tone === 'danger'
        ? 'text-rose-300'
        : 'text-slate-100';

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className={`mt-3 break-all text-sm font-bold ${mono ? 'font-mono' : ''} ${toneClass}`}>
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
    <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,168,76,0.12),transparent_42%)] px-8 py-8 lg:px-10 lg:py-10">
      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr] xl:items-end">
        <div>
          <div className="inline-flex rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-amber-300">
            Live match
          </div>

          <h1 className="mt-5 max-w-4xl text-4xl font-black tracking-tight text-white lg:text-5xl">
            Mesa pronta para jogar, ler turno e seguir o ritmo da mão.
          </h1>

          <p className="mt-4 max-w-3xl text-base leading-8 text-slate-300">
            Reestruturada para ler o payload autoritativo primeiro, reduzir derivação ambígua e
            tratar melhor a transição entre rodada, fim de mão e próxima mão.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Connection"
            value={connectionStatus}
            tone={connectionStatus === 'online' ? 'success' : 'danger'}
          />
          <MetricCard label="Match ID" value={resolvedMatchId || '-'} mono />
          <MetricCard label="My seat" value={mySeat || '-'} />
        </div>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          to="/lobby"
          className="rounded-3xl bg-amber-600 px-5 py-4 text-sm font-black text-slate-900 transition hover:bg-amber-500"
        >
          Voltar para lobby
        </Link>

        <button
          type="button"
          onClick={onRefreshState}
          className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 text-sm font-bold text-slate-100 transition hover:bg-white/10"
        >
          Get state
        </button>

        <select
          value={viraRank}
          onChange={(event) => onChangeViraRank(event.target.value as Rank)}
          className="rounded-3xl border border-white/10 bg-slate-950 px-5 py-4 text-sm font-bold text-slate-100 outline-none transition focus:border-amber-400/40"
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
          className={`rounded-3xl border px-5 py-4 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
            canStartHand
              ? 'border-amber-400/30 bg-amber-500/15 text-amber-300 hover:bg-amber-500/20'
              : 'border-white/10 bg-white/5 text-slate-100 hover:bg-white/10'
          }`}
        >
          Start next hand
        </button>
      </div>
    </div>
  );
}
