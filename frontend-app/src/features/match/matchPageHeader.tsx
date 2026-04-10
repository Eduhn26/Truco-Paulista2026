import { Link } from 'react-router-dom';
import type { Rank } from '../../services/socket/socketTypes';

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
  const isOnline = connectionStatus === 'online';

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-[#050810]/60 px-4 py-2 backdrop-blur-sm">
      {/* Left: Status & Seat */}
      <div className="flex items-center gap-2">
        <div
          className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition ${
            isOnline ? 'bg-green-500/10' : 'bg-red-500/10'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span
            className={`text-[9px] font-bold uppercase tracking-wider ${
              isOnline ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {connectionStatus}
          </span>
        </div>

        {mySeat && (
          <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-amber-400">
            {mySeat}
          </div>
        )}

        {resolvedMatchId && (
          <span
            className="hidden rounded-full bg-white/5 px-2 py-0.5 font-mono text-[8px] text-slate-500 sm:block"
            title={resolvedMatchId}
          >
            #{resolvedMatchId.slice(-8)}
          </span>
        )}
      </div>

      {/* Right: Controls */}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onRefreshState}
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        >
          Sync
        </button>

        <select
          value={viraRank}
          onChange={(e) => onChangeViraRank(e.target.value as Rank)}
          className="cursor-pointer rounded-lg border border-white/10 bg-[#0a0f16] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-amber-400/80 outline-none transition hover:border-amber-400/30 focus:border-amber-400/50"
        >
          {viraRankOptions.map((opt) => (
            <option key={opt} value={opt} className="bg-[#0a0f16] text-slate-300">
              Vira {opt}
            </option>
          ))}
        </select>

        {/* NOTE: Keep the primary CTA visible at all times.
            The action state should communicate readiness through disabled styling,
            not by removing the button and breaking spatial continuity in the header. */}
        <button
          type="button"
          onClick={onStartHand}
          disabled={!canStartHand}
          aria-disabled={!canStartHand}
          title={canStartHand ? 'Start next hand' : 'Waiting for all players to be ready'}
          className={`rounded-lg px-4 py-1.5 text-[9px] font-black uppercase tracking-wider shadow-lg transition-all duration-300 ${
            canStartHand
              ? 'text-black hover:scale-105 hover:shadow-amber-500/40 active:scale-95'
              : 'cursor-not-allowed text-black/50 opacity-60'
          }`}
          style={{
            background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
            border: '1px solid #c9a84c',
            boxShadow: canStartHand ? '0 0 15px rgba(201, 168, 76, 0.4)' : 'none',
          }}
        >
          Nova mão
        </button>

        <Link
          to="/lobby"
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
        >
          Lobby
        </Link>
      </div>
    </div>
  );
}
