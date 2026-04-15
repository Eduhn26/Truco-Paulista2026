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
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
      style={{
        background: 'rgba(5,8,16,0.9)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(12px)',
      }}
    >
      {/* Left: Status indicators */}
      <div className="flex items-center gap-2.5">
        {/* Online/Offline dot */}
        <div
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
          style={{
            background: isOnline ? 'rgba(22,101,52,0.2)' : 'rgba(153,27,27,0.2)',
            border: isOnline ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(239,68,68,0.25)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: isOnline ? '#22c55e' : '#ef4444' }}
          />
          <span
            className="text-[9px] font-black uppercase tracking-widest"
            style={{ color: isOnline ? '#4ade80' : '#f87171' }}
          >
            {connectionStatus}
          </span>
        </div>

        {/* Seat */}
        {mySeat && (
          <div
            className="rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-widest"
            style={{
              background: 'rgba(201,168,76,0.12)',
              border: '1px solid rgba(201,168,76,0.25)',
              color: '#c9a84c',
            }}
          >
            {mySeat}
          </div>
        )}

        {/* Match ID (abbreviated) */}
        {resolvedMatchId && (
          <span
            className="hidden rounded-full px-2.5 py-1 font-mono text-[8px] sm:block"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.3)',
            }}
            title={resolvedMatchId}
          >
            #{resolvedMatchId.slice(-8)}
          </span>
        )}
      </div>

      {/* Center: Truco Paulista logo text */}
      <div className="hidden flex-1 justify-center md:flex">
        <span
          className="text-[11px] font-black uppercase tracking-[0.3em]"
          style={{ color: 'rgba(201,168,76,0.5)' }}
        >
          Truco Paulista
        </span>
      </div>

      {/* Right: Controls */}
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={onRefreshState}
          className="rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)',
          }}
          onMouseEnter={(e) => {
            (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
            (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)';
          }}
          onMouseLeave={(e) => {
            (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)';
            (e.target as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
          }}
        >
          Sync
        </button>

        <select
          value={viraRank}
          onChange={(e) => onChangeViraRank(e.target.value as Rank)}
          className="cursor-pointer rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-widest outline-none transition-all"
          style={{
            background: '#0a0f16',
            border: '1px solid rgba(201,168,76,0.2)',
            color: '#c9a84c',
          }}
        >
          {viraRankOptions.map((opt) => (
            <option key={opt} value={opt} style={{ background: '#0a0f16', color: '#d1d5db' }}>
              Vira {opt}
            </option>
          ))}
        </select>

        {/* Nova Mão CTA */}
        <button
          type="button"
          onClick={onStartHand}
          disabled={!canStartHand}
          aria-disabled={!canStartHand}
          className="rounded-lg px-5 py-1.5 text-[9px] font-black uppercase tracking-wider transition-all duration-200"
          style={
            canStartHand
              ? {
                  background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
                  border: '1px solid rgba(201,168,76,0.5)',
                  color: '#1a0a00',
                  boxShadow: '0 0 18px rgba(201,168,76,0.3), 0 4px 12px rgba(0,0,0,0.3)',
                }
              : {
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  color: 'rgba(255,255,255,0.2)',
                  cursor: 'not-allowed',
                }
          }
        >
          Nova mão
        </button>

        <Link
          to="/lobby"
          className="rounded-lg px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider transition-all duration-200"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.5)',
            textDecoration: 'none',
          }}
        >
          ← Lobby
        </Link>
      </div>
    </div>
  );
}
