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
    // NOTE: Compact bar — removed verbose h1 + description to give maximum
    // vertical space to the table. All control info is in minimal chips.
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      style={{ borderBottom: '1px solid rgba(201,168,76,0.1)', background: 'rgba(0,0,0,0.3)' }}
    >
      {/* Left: connection + seat */}
      <div className="flex items-center gap-2">
        <div
          className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
          style={{
            background: isOnline ? 'rgba(45,106,79,0.15)' : 'rgba(192,57,43,0.1)',
            border: isOnline ? '1px solid rgba(45,106,79,0.35)' : '1px solid rgba(192,57,43,0.3)',
          }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: isOnline ? '#3d8a6a' : '#c0392b' }}
          />
          <span
            className="text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: isOnline ? '#3d8a6a' : '#c0392b' }}
          >
            {connectionStatus}
          </span>
        </div>

        {mySeat && (
          <div
            className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{
              background: 'rgba(201,168,76,0.08)',
              border: '1px solid rgba(201,168,76,0.2)',
              color: 'rgba(201,168,76,0.7)',
            }}
          >
            {mySeat}
          </div>
        )}

        {resolvedMatchId && (
          <div
            className="hidden rounded-full px-2 py-0.5 font-mono text-[9px] sm:block"
            style={{ color: 'rgba(255,255,255,0.2)' }}
            title={resolvedMatchId}
          >
            #{resolvedMatchId.slice(-8)}
          </div>
        )}
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRefreshState}
          className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[1px] transition"
          style={{
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          Sync
        </button>

        {/* Vira select */}
        <select
          value={viraRank}
          onChange={(event) => onChangeViraRank(event.target.value as Rank)}
          className="rounded-full px-2 py-1 text-[10px] font-bold outline-none transition"
          style={{
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'rgba(201,168,76,0.6)',
          }}
          title="Vira rank"
        >
          {viraRankOptions.map((option) => (
            <option key={option} value={option}>
              Vira {option}
            </option>
          ))}
        </select>

        {/* Start hand button — only when enabled */}
        {canStartHand && (
          <button
            type="button"
            onClick={onStartHand}
            className="rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[1.5px] transition"
            style={{
              background: 'rgba(201,168,76,0.15)',
              border: '1px solid rgba(201,168,76,0.4)',
              color: '#c9a84c',
            }}
          >
            Nova mão
          </button>
        )}

        {/* Lobby link */}
        <Link
          to="/lobby"
          className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[1px] transition"
          style={{
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          ↩ Lobby
        </Link>
      </div>
    </div>
  );
}
