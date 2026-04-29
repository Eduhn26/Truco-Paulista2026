import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import type { ValeTier } from './matchPresentationSelectors';

type TrucoDramaOverlayProps = {
  isOpen: boolean;
  pendingValue: number;
  requesterIsMine: boolean;
  tier: ValeTier;
  headline?: string;
  detail?: string;
};

const CALL_WORD_BY_VALUE: Record<number, string> = {
  3: 'TRUCO!',
  6: 'SEIS!',
  9: 'NOVE!',
  12: 'DOZE!',
};

const BIG_HOLD_MS = 1080;

type DramaVisuals = {
  word: string;
  glow: string;
  radial: string;
  aura: string;
  auraStrong: string;
  chipBg: string;
  chipBorder: string;
  stroke: string;
};

function resolveVisuals(tier: ValeTier, requesterIsMine: boolean): DramaVisuals {
  const base = (() => {
    switch (tier) {
      case 'gold':
        return {
          word: '#ffe89a',
          glow: 'rgba(255,215,128,0.58)',
          radial: 'rgba(255,215,128,0.38)',
          aura: 'rgba(255,215,128,0.26)',
          auraStrong: 'rgba(255,215,128,0.48)',
          chipBg: 'linear-gradient(180deg, rgba(58,40,10,0.94), rgba(30,19,5,0.96))',
          chipBorder: 'rgba(255,215,128,0.54)',
          stroke: 'rgba(0,0,0,0.45)',
        };
      case 'orange':
        return {
          word: '#ffcb7a',
          glow: 'rgba(251,146,60,0.64)',
          radial: 'rgba(251,146,60,0.42)',
          aura: 'rgba(251,146,60,0.30)',
          auraStrong: 'rgba(251,146,60,0.56)',
          chipBg: 'linear-gradient(180deg, rgba(70,30,6,0.95), rgba(30,12,4,0.97))',
          chipBorder: 'rgba(251,146,60,0.60)',
          stroke: 'rgba(0,0,0,0.50)',
        };
      case 'red':
      case 'red-pulse':
        return {
          word: '#ffd4d4',
          glow: 'rgba(239,68,68,0.74)',
          radial: 'rgba(239,68,68,0.50)',
          aura: 'rgba(239,68,68,0.34)',
          auraStrong: 'rgba(248,113,113,0.64)',
          chipBg: 'linear-gradient(180deg, rgba(90,14,14,0.96), rgba(36,5,5,0.98))',
          chipBorder: 'rgba(248,113,113,0.68)',
          stroke: 'rgba(0,0,0,0.55)',
        };
      case 'muted':
      default:
        return {
          word: '#ffe89a',
          glow: 'rgba(255,215,128,0.48)',
          radial: 'rgba(255,215,128,0.30)',
          aura: 'rgba(255,215,128,0.22)',
          auraStrong: 'rgba(255,215,128,0.40)',
          chipBg: 'linear-gradient(180deg, rgba(58,40,10,0.92), rgba(32,22,6,0.94))',
          chipBorder: 'rgba(255,215,128,0.42)',
          stroke: 'rgba(0,0,0,0.45)',
        };
    }
  })();

  if (requesterIsMine) {
    return {
      ...base,
      radial: base.radial.replace(/0\.[0-9]+\)/, '0.24)'),
      aura: base.aura.replace(/0\.[0-9]+\)/, '0.16)'),
      auraStrong: base.auraStrong.replace(/0\.[0-9]+\)/, '0.32)'),
    };
  }

  return base;
}

export function TrucoDramaOverlay({
  isOpen,
  pendingValue,
  requesterIsMine,
  tier,
  headline,
  detail,
}: TrucoDramaOverlayProps) {
  const [phase, setPhase] = useState<'big' | 'chip'>('big');

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setPhase('big');
    const timeout = window.setTimeout(() => setPhase('chip'), BIG_HOLD_MS);

    return () => window.clearTimeout(timeout);
  }, [isOpen, pendingValue, requesterIsMine]);

  const word = useMemo(() => CALL_WORD_BY_VALUE[pendingValue] ?? 'TRUCO!', [pendingValue]);
  const visuals = useMemo(
    () => resolveVisuals(tier, requesterIsMine),
    [requesterIsMine, tier],
  );
  const pressureLabel = requesterIsMine ? 'Aguardando resposta' : 'Sua decisão';

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key={`truco-drama-${pendingValue}-${requesterIsMine}`}
          className="pointer-events-none absolute inset-0 z-[65] overflow-hidden rounded-[28px]"
          // PATCH E — Truco / Seis / Nove / Doze are decision-critical events.
          // Assertive aria-live ensures screen readers announce the call
          // immediately (e.g. "Truco! Sua decisão"). atomic=true so the call
          // word + pressure label are read as a single update, not chunked.
          role="status"
          aria-live="assertive"
          aria-atomic="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* Table ownership layer: the whole felt reacts while the bet is pending. */}
          <motion.div
            className="absolute inset-0 rounded-[28px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'big' ? 0.82 : 0.48 }}
            transition={{ duration: phase === 'big' ? 0.22 : 0.46 }}
            style={{
              background:
                'radial-gradient(ellipse at 50% 44%, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.42) 72%, rgba(0,0,0,0.72) 100%)',
            }}
          />

          <motion.div
            className="absolute inset-[8px] rounded-[24px]"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{
              opacity: phase === 'big' ? [0.0, 1, 0.74] : [0.48, 0.66, 0.48],
              scale: phase === 'big' ? [0.98, 1.012, 1] : [1, 1.006, 1],
            }}
            transition={{
              duration: phase === 'big' ? 0.56 : 1.6,
              repeat: phase === 'chip' ? Infinity : 0,
            }}
            style={{
              border: `1px solid ${visuals.auraStrong}`,
              boxShadow: `
                inset 0 0 36px ${visuals.aura},
                inset 0 0 92px rgba(0,0,0,0.34),
                0 0 30px ${visuals.aura},
                0 0 74px ${visuals.aura}
              `,
            }}
          />

          <motion.div
            key={`radial-${pendingValue}-${requesterIsMine}`}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{
              opacity: phase === 'big' ? [0, 0.95, 0.58, 0.44] : [0.26, 0.38, 0.26],
            }}
            transition={{
              duration: phase === 'big' ? 0.5 : 1.8,
              repeat: phase === 'chip' ? Infinity : 0,
              ...(phase === 'big' ? { times: [0, 0.28, 0.65, 1] } : {}),
            }}
            style={{
              background: `radial-gradient(ellipse 95% 72% at 50% 50%, transparent 34%, ${visuals.radial} 100%)`,
            }}
          />

          <AnimatePresence mode="wait">
            {phase === 'big' ? (
              <motion.div
                key="big-word"
                className="absolute inset-x-0 top-[11%] flex justify-center px-6 text-center"
                initial={{ scale: 0.34, opacity: 0, rotate: -3, y: 16 }}
                animate={{
                  scale: [0.34, 1.08, 1],
                  opacity: 1,
                  rotate: [-3, 1.5, 0],
                  y: [16, -4, 0],
                }}
                exit={{ scale: 0.42, opacity: 0, y: -34 }}
                transition={{
                  duration: 0.42,
                  times: [0, 0.58, 1],
                  ease: [0.2, 0.8, 0.2, 1],
                }}
              >
                <div className="select-none">
                  <div
                    style={{
                      fontFamily: 'Georgia, serif',
                      fontSize: 'clamp(78px, 12.5vw, 176px)',
                      fontWeight: 900,
                      color: visuals.word,
                      letterSpacing: '0.035em',
                      textShadow: `
                        0 0 30px ${visuals.glow},
                        0 0 82px ${visuals.glow},
                        0 6px 0 ${visuals.stroke},
                        0 18px 46px rgba(0,0,0,0.70)
                      `,
                      WebkitTextStroke: `1.5px ${visuals.stroke}`,
                      lineHeight: 0.9,
                    }}
                  >
                    {word}
                  </div>

                  <div
                    className="mt-5 inline-flex flex-col items-center rounded-full px-5 py-2.5"
                    style={{
                      background: 'rgba(8,10,8,0.56)',
                      border: `1px solid ${visuals.chipBorder}`,
                      boxShadow: `0 0 28px ${visuals.aura}, 0 16px 34px rgba(0,0,0,0.44)`,
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    {headline ? (
                      <span
                        style={{
                          color: 'rgba(255,248,222,0.92)',
                          fontSize: 13,
                          fontWeight: 900,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {headline}
                      </span>
                    ) : null}
                    {detail ? (
                      <span
                        className="mt-1"
                        style={{
                          color: 'rgba(255,248,222,0.66)',
                          fontSize: 11,
                          fontWeight: 800,
                          letterSpacing: '0.14em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {detail}
                      </span>
                    ) : null}
                  </div>
                </div>
              </motion.div>
            ) : (
              // PATCH F.2 — Pressure chip v2.
              //
              // The legacy chip read as a status ribbon: tiny 17px word,
              // thin separator, two single-line labels. After the big
              // TRUCO! drama ended, the user dropped from cinematic to
              // dashboard in a single beat.
              //
              // v2 contract:
              //   - Chip moved up to top-[44px] and given a serif scaled
              //     headline (the tier word in 28px) so it visually inherits
              //     from the big drama instead of replacing it.
              //   - The kicker line below is uppercase with a longer tracking,
              //     so the "Sua decisão" / "Aguardando resposta" reads as a
              //     command, not a label.
              //   - When the bot is the requester (requesterIsMine === false),
              //     the chip carries an aggressive red-pulse aura — the user
              //     must respond. The pulse is stronger and faster.
              //   - When the player is the requester, the aura is the gentle
              //     "waiting" gold pulse — same room as the TRUCO! drama
              //     they just triggered, not a downgrade.
              //   - A subtle hairline beneath the chip echoes the
              //     RoundClashVerdict / HandTransitionVeil family.
              //
              // The pulse animation is wired through Framer's `animate` prop
              // so it can be paused by `transition` if reduced-motion is
              // ever required (the rest of the table follows the same idiom).
              <motion.div
                key="pressure-chip"
                className="absolute inset-x-0 top-[44px] flex justify-center px-6"
                initial={{ scale: 0.86, opacity: 0, y: -10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: -8 }}
                transition={{ duration: 0.34, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <motion.div
                  className="flex max-w-[min(720px,calc(100%-24px))] flex-col items-center rounded-[18px] px-7 py-3.5"
                  animate={{
                    boxShadow: requesterIsMine
                      ? [
                          `0 0 22px ${visuals.aura}, inset 0 1px 0 rgba(255,235,170,0.18), inset 0 -2px 0 rgba(0,0,0,0.50), 0 16px 32px rgba(0,0,0,0.42)`,
                          `0 0 36px ${visuals.auraStrong}, inset 0 1px 0 rgba(255,235,170,0.22), inset 0 -2px 0 rgba(0,0,0,0.50), 0 18px 34px rgba(0,0,0,0.46)`,
                          `0 0 22px ${visuals.aura}, inset 0 1px 0 rgba(255,235,170,0.18), inset 0 -2px 0 rgba(0,0,0,0.50), 0 16px 32px rgba(0,0,0,0.42)`,
                        ]
                      : [
                          `0 0 26px ${visuals.aura}, inset 0 1px 0 rgba(255,210,210,0.22), inset 0 -2px 0 rgba(0,0,0,0.55), 0 16px 32px rgba(0,0,0,0.42)`,
                          `0 0 44px ${visuals.auraStrong}, inset 0 1px 0 rgba(255,210,210,0.30), inset 0 -2px 0 rgba(0,0,0,0.55), 0 20px 38px rgba(0,0,0,0.50)`,
                          `0 0 26px ${visuals.aura}, inset 0 1px 0 rgba(255,210,210,0.22), inset 0 -2px 0 rgba(0,0,0,0.55), 0 16px 32px rgba(0,0,0,0.42)`,
                        ],
                  }}
                  transition={{
                    duration: requesterIsMine ? 1.9 : 1.1,
                    repeat: Infinity,
                    ease: [0.4, 0, 0.6, 1],
                  }}
                  style={{
                    background: visuals.chipBg,
                    border: `1px solid ${visuals.chipBorder}`,
                    color: visuals.word,
                    fontFamily: 'Georgia, serif',
                    backdropFilter: 'blur(14px)',
                  }}
                >
                  {/* Tier headline — the bet word at scaled size, gold/red
                      depending on tier. Inherits the same serif as the big
                      drama so the chip feels like a continuation. */}
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 900,
                      lineHeight: 1,
                      letterSpacing: '0.06em',
                      textShadow: `0 2px 0 ${visuals.stroke}, 0 0 18px ${visuals.glow}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {word.replace('!', '')}
                  </span>

                  {/* Kicker line — context (who called) + state (waiting /
                      your decision). Two phrases, separated by a thin
                      gold-tinted dot, all uppercase with strong tracking. */}
                  <div className="mt-1.5 flex items-center gap-2.5">
                    <span
                      style={{
                        color: 'rgba(255,248,222,0.74)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.20em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {headline ?? pressureLabel}
                    </span>
                    <span
                      aria-hidden
                      style={{
                        height: 4,
                        width: 4,
                        borderRadius: 999,
                        background: visuals.chipBorder,
                        boxShadow: `0 0 6px ${visuals.aura}`,
                      }}
                    />
                    <span
                      style={{
                        color: requesterIsMine
                          ? 'rgba(255,232,170,0.86)'
                          : 'rgba(255,226,164,0.96)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        textShadow: requesterIsMine
                          ? 'none'
                          : `0 0 10px ${visuals.aura}`,
                      }}
                    >
                      {requesterIsMine ? 'Aguardando resposta' : 'Sua decisão'}
                    </span>
                  </div>

                  {/* Subtle hairline below the chip — same family as the
                      RoundClashVerdict and HandTransitionVeil v2. Anchors
                      the chip to the felt. */}
                  <div
                    aria-hidden
                    className="mt-2.5 h-px w-full"
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${visuals.chipBorder} 50%, transparent 100%)`,
                      opacity: 0.66,
                    }}
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
