import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { Rank } from '../../services/socket/socketTypes';
import { resolveValeTier, type ValeTier } from './matchPresentationSelectors';

function getViraLabel(viraRank: Rank): string {
  return `Vira ${viraRank}`;
}

function getValeTierVisuals(tier: ValeTier) {
  switch (tier) {
    case 'gold':
      return {
        background: 'linear-gradient(135deg, #e8c76a 0%, #c9a84c 55%, #8a6a28 100%)',
        border: '1px solid rgba(255,223,128,0.64)',
        textColor: '#1a0a00',
        glow: '0 0 18px rgba(201,168,76,0.30)',
        pulse: false,
      };
    case 'orange':
      return {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 55%, #92400e 100%)',
        border: '1px solid rgba(251,191,36,0.62)',
        textColor: '#1a0500',
        glow: '0 0 24px rgba(245,158,11,0.42)',
        pulse: false,
      };
    case 'red':
      return {
        background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 55%, #7f1d1d 100%)',
        border: '1px solid rgba(252,165,165,0.60)',
        textColor: '#fff5f5',
        glow: '0 0 28px rgba(220,38,38,0.52)',
        pulse: false,
      };
    case 'red-pulse':
      return {
        background: 'linear-gradient(135deg, #fca5a5 0%, #dc2626 55%, #450a0a 100%)',
        border: '1px solid rgba(254,226,226,0.82)',
        textColor: '#ffffff',
        glow: '0 0 36px rgba(248,113,113,0.62)',
        pulse: true,
      };
    case 'muted':
    default:
      return {
        background: 'linear-gradient(180deg, rgba(28,24,16,0.92), rgba(16,14,10,0.86))',
        border: '1px solid rgba(230,195,100,0.20)',
        textColor: 'rgba(232,199,106,0.86)',
        glow: '0 4px 12px rgba(0,0,0,0.28)',
        pulse: false,
      };
  }
}

export function MatchPageHeader({
  connectionStatus,
  resolvedMatchId,
  mySeat,
  viraRank,
  canStartHand,
  onRefreshState,
  onStartHand,
  scoreLabel,
  currentValue,
}: {
  connectionStatus: 'offline' | 'online';
  resolvedMatchId: string;
  mySeat: string | null;
  viraRank: Rank;
  canStartHand: boolean;
  onRefreshState: () => void;
  onStartHand: () => void;
  scoreLabel?: string;
  currentValue?: number;
}) {
  const isOnline = connectionStatus === 'online';

  const scoreT1 = scoreLabel?.match(/T1\s+(\d+)/)?.[1] ?? '0';
  const scoreT2 = scoreLabel?.match(/T2\s+(\d+)/)?.[1] ?? '0';
  const resolvedCurrentValue = currentValue ?? 1;
  const abbreviatedMatchId = resolvedMatchId ? `#${resolvedMatchId.slice(-6)}` : null;
  const seatLabel = mySeat ?? '—';

  const valeTier = resolveValeTier(resolvedCurrentValue);
  const valeVisuals = getValeTierVisuals(valeTier);

  const [auxOpen, setAuxOpen] = useState(false);

  return (
    <div
      className="relative overflow-hidden px-5 py-3"
      style={{
        // CHANGE: header now sits in the exact same colour family as the
        // mesa below it, so they read as one continuous surface. The bottom
        // hairline is barely there; it separates without creating a seam.
        background: 'linear-gradient(180deg, rgba(7,14,20,0.98), rgba(8,16,14,0.94))',
        borderBottom: '1px solid rgba(201,168,76,0.10)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        {/* LEFT — brand lockup */}
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-[10px]"
            style={{
              background:
                'linear-gradient(180deg, #102319 0%, #0d1815 55%, #0a1210 100%)',
              border: '1px solid rgba(230,195,100,0.34)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 10px rgba(0,0,0,0.36)',
            }}
          >
            <span
              className="text-[12px] font-black"
              style={{
                fontFamily: 'Georgia, serif',
                background:
                  'linear-gradient(180deg, #f2d488 0%, #c9a84c 55%, #8a6a28 100%)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                color: 'transparent',
              }}
            >
              TP
            </span>
          </div>

          <div className="flex flex-col leading-tight">
            <span
              className="text-[15px] font-black"
              style={{
                color: '#e8d5a0',
                fontFamily: 'Georgia, serif',
                letterSpacing: '0.01em',
                lineHeight: 1.1,
              }}
            >
              Truco
            </span>
            <span
              className="text-[10px] font-black uppercase tracking-[0.22em]"
              style={{ color: 'rgba(232,213,160,0.62)', fontFamily: 'Georgia, serif' }}
            >
              Paulista
            </span>
          </div>
        </div>

        {/* Spacer */}
        <div className="hidden flex-1 md:block" />

        {/* RIGHT cluster */}
        <div className="flex items-center gap-2">
          {/* Compact score pill */}
          <div
            className="flex items-center gap-2 rounded-[12px] px-4 py-1.5"
            style={{
              background: 'linear-gradient(180deg, rgba(18,24,20,0.94), rgba(10,14,12,0.88))',
              border: '1px solid rgba(230,195,100,0.26)',
              boxShadow: '0 6px 14px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
          >
            <span
              className="text-[12px] font-black leading-none"
              style={{ color: 'rgba(232,213,160,0.74)', fontFamily: 'Georgia, serif' }}
            >
              T1:
            </span>
            <span
              className="text-[19px] font-black leading-none"
              style={{ color: '#e8d5a0', fontFamily: 'Georgia, serif' }}
            >
              {scoreT1}
            </span>
            <span
              className="px-0.5 text-[12px] font-black"
              style={{ color: 'rgba(232,213,160,0.32)', fontFamily: 'Georgia, serif' }}
            >
              x
            </span>
            <span
              className="text-[12px] font-black leading-none"
              style={{ color: 'rgba(232,213,160,0.74)', fontFamily: 'Georgia, serif' }}
            >
              T2:
            </span>
            <span
              className="text-[19px] font-black leading-none"
              style={{ color: '#e8d5a0', fontFamily: 'Georgia, serif' }}
            >
              {scoreT2}
            </span>
          </div>

          {/* VALE tier pill */}
          <div
            className={valeVisuals.pulse ? 'tier-pulse-anim' : ''}
            style={{
              borderRadius: 999,
              padding: '4px 10px',
              background: valeVisuals.background,
              border: valeVisuals.border,
              boxShadow: valeVisuals.glow,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                className="text-[8px] font-black uppercase tracking-[0.18em]"
                style={{ color: valeVisuals.textColor, opacity: 0.82 }}
              >
                Vale
              </span>
              <span
                className="text-[14px] font-black leading-none"
                style={{ color: valeVisuals.textColor, fontFamily: 'Georgia, serif' }}
              >
                {resolvedCurrentValue}
              </span>
            </div>
          </div>

          {/* Online dot */}
          <div
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: isOnline ? 'rgba(22,101,52,0.18)' : 'rgba(153,27,27,0.18)',
              border: isOnline
                ? '1px solid rgba(34,197,94,0.26)'
                : '1px solid rgba(239,68,68,0.26)',
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: isOnline ? '#22c55e' : '#ef4444' }}
            />
          </div>

          <button
            type="button"
            onClick={() => setAuxOpen((previous) => !previous)}
            aria-expanded={auxOpen}
            className="rounded-[10px] px-3 py-1.5 text-[11px] font-bold transition-all duration-200"
            style={{
              background: auxOpen
                ? 'rgba(230,195,100,0.14)'
                : 'rgba(255,255,255,0.04)',
              border: auxOpen
                ? '1px solid rgba(230,195,100,0.30)'
                : '1px solid rgba(255,255,255,0.08)',
              color: auxOpen ? '#e8c76a' : 'rgba(255,255,255,0.62)',
            }}
          >
            {auxOpen ? '▴' : '▾'}
          </button>

          <button
            type="button"
            onClick={onStartHand}
            disabled={!canStartHand}
            aria-disabled={!canStartHand}
            className="rounded-[10px] px-4 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] transition-all duration-200"
            style={
              canStartHand
                ? {
                    background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
                    border: '1px solid rgba(230,195,100,0.52)',
                    color: '#1a0a00',
                    boxShadow:
                      '0 0 12px rgba(230,195,100,0.22), 0 4px 10px rgba(0,0,0,0.34)',
                  }
                : {
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.22)',
                    cursor: 'not-allowed',
                  }
            }
          >
            Nova mão
          </button>

          <Link
            to="/lobby"
            className="rounded-[10px] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.62)',
              textDecoration: 'none',
            }}
          >
            ← Lobby
          </Link>
        </div>
      </div>

      {auxOpen ? (
        <div className="relative z-10 mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.04] pt-2">
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span
              className="text-[7px] font-black uppercase tracking-[0.18em]"
              style={{ color: 'rgba(255,255,255,0.36)' }}
            >
              Assento
            </span>
            <span
              className="text-[8px] font-black uppercase tracking-[0.18em]"
              style={{ color: '#e8c76a' }}
            >
              {seatLabel}
            </span>
          </span>

          <span
            className="rounded-full px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.16em]"
            style={{
              background: 'rgba(230,195,100,0.08)',
              border: '1px solid rgba(230,195,100,0.16)',
              color: 'rgba(232,199,106,0.82)',
            }}
          >
            {getViraLabel(viraRank)}
          </span>

          {abbreviatedMatchId ? (
            <span
              className="rounded-full px-2 py-1 font-mono text-[8px]"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.40)',
              }}
              title={resolvedMatchId}
            >
              {abbreviatedMatchId}
            </span>
          ) : null}

          <button
            type="button"
            onClick={onRefreshState}
            className="rounded-lg px-3 py-1 text-[8px] font-bold uppercase tracking-[0.16em] transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.58)',
            }}
          >
            Sync
          </button>
        </div>
      ) : null}
    </div>
  );
}

