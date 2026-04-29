import { Link } from 'react-router-dom';
import { useState } from 'react';
import type { Rank } from '../../services/socket/socketTypes';
import { resolveValeTier, type ValeTier } from './matchPresentationSelectors';

// CHANGE (debt #6 — header read like a SaaS dashboard):
// Refactor of the in-table header. The score becomes the centerpiece
// (large serif numerals "NÓS / ELES" with an oxidized brass divider),
// the Vale tier is a circular medallion in the divider so it reads as
// the "stake on the table", and the brand lockup + actions are pushed
// to the edges as quiet ghost chips. Net result: the header stops
// stealing attention from the felt and starts narrating the match.
//
// The auxOpen drawer keeps the technical chips (seat / vira / matchId
// / sync) so QA still has them, but only on demand.
//
// All visual tokens stay inside the existing dark/cobre/vinho palette;
// no new fonts, no new colors. Layout fits in ~58px (vs ~64px before).

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
        glow: '0 0 18px rgba(201,168,76,0.36)',
        pulse: false,
      };
    case 'orange':
      return {
        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 55%, #92400e 100%)',
        border: '1px solid rgba(251,191,36,0.62)',
        textColor: '#1a0500',
        glow: '0 0 24px rgba(245,158,11,0.46)',
        pulse: false,
      };
    case 'red':
      return {
        background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 55%, #7f1d1d 100%)',
        border: '1px solid rgba(252,165,165,0.60)',
        textColor: '#fff5f5',
        glow: '0 0 28px rgba(220,38,38,0.55)',
        pulse: false,
      };
    case 'red-pulse':
      return {
        background: 'linear-gradient(135deg, #fca5a5 0%, #dc2626 55%, #450a0a 100%)',
        border: '1px solid rgba(254,226,226,0.82)',
        textColor: '#ffffff',
        glow: '0 0 36px rgba(248,113,113,0.66)',
        pulse: true,
      };
    case 'muted':
    default:
      return {
        background: 'linear-gradient(180deg, rgba(28,24,16,0.92), rgba(16,14,10,0.86))',
        border: '1px solid rgba(230,195,100,0.22)',
        textColor: 'rgba(232,199,106,0.86)',
        glow: '0 4px 12px rgba(0,0,0,0.30)',
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

  // NOTE: We re-derive "us / them" from the seatId so the score reads
  // from the player's frame of reference, not from raw T1/T2.
  const scoreT1 = scoreLabel?.match(/T1\s+(\d+)/)?.[1] ?? '0';
  const scoreT2 = scoreLabel?.match(/T2\s+(\d+)/)?.[1] ?? '0';
  const myTeam = mySeat === 'T1A' || mySeat === 'T1B' ? 'T1' : mySeat === 'T2A' || mySeat === 'T2B' ? 'T2' : null;
  const usScore = myTeam === 'T2' ? scoreT2 : scoreT1;
  const themScore = myTeam === 'T2' ? scoreT1 : scoreT2;

  const resolvedCurrentValue = currentValue ?? 1;
  const abbreviatedMatchId = resolvedMatchId ? `#${resolvedMatchId.slice(-6)}` : null;
  const seatLabel = mySeat ?? '—';

  const valeTier = resolveValeTier(resolvedCurrentValue);
  const valeVisuals = getValeTierVisuals(valeTier);

  const [auxOpen, setAuxOpen] = useState(false);

  return (
    <div
      className="relative overflow-hidden px-5 py-2.5"
      style={{
        background: 'linear-gradient(180deg, rgba(7,14,20,0.98), rgba(8,16,14,0.94))',
        borderBottom: '1px solid rgba(201,168,76,0.10)',
        backdropFilter: 'blur(14px)',
      }}
    >
      <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        {/* LEFT — quiet brand chip + status dot, low visual weight */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="inline-flex h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background: isOnline ? '#22c55e' : '#ef4444',
              boxShadow: isOnline ? '0 0 8px rgba(34,197,94,0.48)' : '0 0 8px rgba(239,68,68,0.48)',
            }}
            aria-label={isOnline ? 'Online' : 'Offline'}
          />
          <span
            className="text-[10px] font-black uppercase tracking-[0.24em] truncate"
            style={{ color: 'rgba(232,213,160,0.46)', fontFamily: 'Georgia, serif' }}
          >
            Truco Paulista
          </span>
        </div>

        {/* CENTER — the score is the head-act. Big serif numerals on each
            side, oxidized brass divider with the Vale medallion in the
            middle. This is the "scoreboard" look the felt deserves. */}
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <div className="flex flex-col items-end leading-none">
            <span
              className="text-[8px] font-black uppercase tracking-[0.30em]"
              style={{ color: 'rgba(232,213,160,0.46)' }}
            >
              Nós
            </span>
            <span
              className="mt-0.5 text-[26px] font-black leading-none sm:text-[30px]"
              style={{
                color: '#f0e6d3',
                fontFamily: 'Georgia, serif',
                textShadow: '0 1px 0 rgba(0,0,0,0.4)',
              }}
            >
              {usScore}
            </span>
          </div>

          {/* Vale medallion as the divider — circular, gold, small but
              dominant in this slot. Uses the same vocabulary as the Vira's
              "V" wax-seal medallion on the felt, deliberately. */}
          <div className="flex flex-col items-center">
            <div
              className={valeVisuals.pulse ? 'tier-pulse-anim' : ''}
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: valeVisuals.background,
                border: valeVisuals.border,
                boxShadow: valeVisuals.glow,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={`Vale ${resolvedCurrentValue}`}
            >
              <span
                className="leading-none"
                style={{
                  fontFamily: 'Georgia, serif',
                  fontWeight: 900,
                  fontSize: 17,
                  color: valeVisuals.textColor,
                  textShadow:
                    valeTier === 'gold'
                      ? '0 1px 0 rgba(255,255,255,0.32)'
                      : '0 1px 0 rgba(0,0,0,0.32)',
                }}
              >
                {resolvedCurrentValue}
              </span>
            </div>
            <span
              className="mt-1 text-[7px] font-black uppercase tracking-[0.30em]"
              style={{ color: 'rgba(232,213,160,0.46)' }}
            >
              Vale
            </span>
          </div>

          <div className="flex flex-col items-start leading-none">
            <span
              className="text-[8px] font-black uppercase tracking-[0.30em]"
              style={{ color: 'rgba(232,213,160,0.46)' }}
            >
              Eles
            </span>
            <span
              className="mt-0.5 text-[26px] font-black leading-none sm:text-[30px]"
              style={{
                color: '#f0e6d3',
                fontFamily: 'Georgia, serif',
                textShadow: '0 1px 0 rgba(0,0,0,0.4)',
              }}
            >
              {themScore}
            </span>
          </div>
        </div>

        {/* RIGHT — actions as ghost outline chips. "Nova mão" stays gold
            because it's the only state-changing primary action. */}
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onStartHand}
            disabled={!canStartHand}
            aria-disabled={!canStartHand}
            className="rounded-[10px] px-3.5 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] transition-all duration-200"
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
            className="rounded-[10px] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.18em] transition-colors duration-200 hover:border-amber-300/30 hover:bg-white/[0.06] hover:text-amber-200"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
              color: 'rgba(232,213,160,0.55)',
              textDecoration: 'none',
            }}
          >
            Lobby
          </Link>

          <button
            type="button"
            onClick={() => setAuxOpen((previous) => !previous)}
            aria-expanded={auxOpen}
            aria-label="Mais informações"
            className="rounded-[10px] px-2.5 py-1.5 text-[11px] font-bold transition-all duration-200"
            style={{
              background: auxOpen ? 'rgba(230,195,100,0.14)' : 'rgba(255,255,255,0.03)',
              border: auxOpen
                ? '1px solid rgba(230,195,100,0.30)'
                : '1px solid rgba(255,255,255,0.06)',
              color: auxOpen ? '#e8c76a' : 'rgba(232,213,160,0.55)',
            }}
          >
            {auxOpen ? '▴' : '▾'}
          </button>
        </div>
      </div>

      {auxOpen ? (
        <div className="relative z-10 mt-2.5 flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.04] pt-2">
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
