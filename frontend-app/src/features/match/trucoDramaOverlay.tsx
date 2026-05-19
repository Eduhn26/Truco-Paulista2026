import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';

import type { ValeTier } from './matchPresentationSelectors';

type TrucoDramaOverlayLayout = 'default' | 'two-versus-two';

type TrucoDramaOverlayProps = {
  isOpen: boolean;
  pendingValue: number;
  requesterIsMine: boolean;
  tier: ValeTier;
  headline?: string;
  detail?: string;
  layout?: TrucoDramaOverlayLayout;
};

const CALL_WORD_BY_VALUE: Record<number, string> = {
  3: 'TRUCO!',
  6: 'SEIS!',
  9: 'NOVE!',
  12: 'DOZE!',
};

type DramaValueIdentity = {
  stageLabel: string;
  subtitle: string;
  requesterDetail: string;
  responderDetail: string;
  watermark: string;
};

const DEFAULT_VALUE_IDENTITY: DramaValueIdentity = {
  stageLabel: 'Desafio lançado',
  subtitle: 'Primeira pressão',
  requesterDetail: 'Você chamou a queda e espera a resposta.',
  responderDetail: 'A mesa vale 3. Aceite, corra ou aumente.',
  watermark: '3',
};

const VALUE_IDENTITY_BY_VALUE: Record<number, DramaValueIdentity> = {
  3: DEFAULT_VALUE_IDENTITY,
  6: {
    stageLabel: 'Mesa dobrada',
    subtitle: 'Vale seis',
    requesterDetail: 'Você dobrou a aposta e colocou pressão na mesa.',
    responderDetail: 'A queda subiu para 6. A resposta pesa mais agora.',
    watermark: '6',
  },
  9: {
    stageLabel: 'Pressão máxima',
    subtitle: 'Vale nove',
    requesterDetail: 'Você levou a disputa para perto da decisão.',
    responderDetail: 'A mesa vale 9. Cada carta pode virar a partida.',
    watermark: '9',
  },
  12: {
    stageLabel: 'Queda decisiva',
    subtitle: 'Vale doze',
    requesterDetail: 'Você colocou tudo na mesa.',
    responderDetail: 'A mesa vale 12. É aceitar a queda ou correr agora.',
    watermark: '12',
  },
};

function resolveValueIdentity(pendingValue: number): DramaValueIdentity {
  return VALUE_IDENTITY_BY_VALUE[pendingValue] ?? DEFAULT_VALUE_IDENTITY;
}

/**
 * The "BIG" phase plays the announcement at full size right after a request
 * lands. Then we fall back to a smaller `chip` phase that the player can
 * read while their decision buttons are visible. Tuned to leave enough
 * silence for the announcement to register but not so long that the chip
 * is late to the decision.
 */
const BIG_HOLD_MS = 1040;

type DramaVisuals = {
  /** Display colour for the announcement word. */
  word: string;
  /** Soft glow under the word. */
  glow: string;
  /** Tinted radial wash projected from above. */
  radial: string;
  /** Aura ring around the table while pressure is on. */
  aura: string;
  /** Brighter aura used for the peak of the breathing animation. */
  auraStrong: string;
  /** Background for the announcement chip. */
  chipBg: string;
  /** Border colour for the announcement chip. */
  chipBorder: string;
  /** Text-stroke colour for the announcement word — kept dark for legibility. */
  stroke: string;
  /** Background for the smaller pressure-chip rendered after `BIG_HOLD_MS`. */
  pressureBg: string;
  /** Text colour inside the pressure chip. */
  pressureText: string;
};

function resolveVisuals(tier: ValeTier, requesterIsMine: boolean): DramaVisuals {
  const base = ((): DramaVisuals => {
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
          pressureBg: 'linear-gradient(180deg, rgba(52,35,8,0.96), rgba(19,13,5,0.97) 100%)',
          pressureText: '#fff2bf',
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
          pressureBg: 'linear-gradient(180deg, rgba(68,30,8,0.97), rgba(22,10,4,0.98) 100%)',
          pressureText: '#ffe0a6',
        };
      case 'red':
        return {
          word: '#ffd4d4',
          glow: 'rgba(239,68,68,0.74)',
          radial: 'rgba(239,68,68,0.50)',
          aura: 'rgba(239,68,68,0.34)',
          auraStrong: 'rgba(248,113,113,0.64)',
          chipBg: 'linear-gradient(180deg, rgba(90,14,14,0.96), rgba(36,5,5,0.98))',
          chipBorder: 'rgba(248,113,113,0.68)',
          stroke: 'rgba(0,0,0,0.55)',
          pressureBg: 'linear-gradient(180deg, rgba(76,12,12,0.97), rgba(24,5,5,0.98) 100%)',
          pressureText: '#ffe1d8',
        };
      case 'red-pulse':
        return {
          word: '#fff3f3',
          glow: 'rgba(254,202,202,0.84)',
          radial: 'rgba(248,113,113,0.58)',
          aura: 'rgba(248,113,113,0.40)',
          auraStrong: 'rgba(254,226,226,0.72)',
          chipBg: 'linear-gradient(180deg, rgba(108,18,18,0.98), rgba(45,6,6,0.99))',
          chipBorder: 'rgba(254,226,226,0.78)',
          stroke: 'rgba(0,0,0,0.58)',
          pressureBg:
            'linear-gradient(180deg, rgba(94,14,14,0.98), rgba(31,5,5,0.99) 100%)',
          pressureText: '#fff1e8',
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
          pressureBg: 'linear-gradient(180deg, rgba(48,34,9,0.95), rgba(18,13,5,0.97) 100%)',
          pressureText: '#ffecaf',
        };
    }
  })();

  if (requesterIsMine) {
    // When YOU asked, the table doesn't pressure you — the aura should be
    // an ambient, calm version of the colour, not a strobe. We keep the
    // chip palette intact and only soften the radials.
    return {
      ...base,
      radial: base.radial.replace(/0\.[0-9]+\)/, '0.24)'),
      aura: base.aura.replace(/0\.[0-9]+\)/, '0.16)'),
      auraStrong: base.auraStrong.replace(/0\.[0-9]+\)/, '0.32)'),
    };
  }

  return base;
}

/**
 * TrucoDramaOverlay — the "drama zone" that announces and holds a pending
 * bet (truco / 6 / 9 / 12).
 *
 * Behaviour overview:
 *  - Mounts `BIG` for `BIG_HOLD_MS`: the announcement word lands at the top
 *    of the table with a tinted aura around the shell and a wider radial
 *    wash. Loud but contained.
 *  - Then transitions to `chip`: a smaller, persistent pressure chip with
 *    a breathing aura. The decision buttons remain readable underneath.
 *
 * Notable additions vs. the previous iteration:
 *  - A vertical wood-edge rim sweep that flashes once on enter, like
 *    spotlights catching the gold bezel of the table.
 *  - The tier ramp is reflected in the aura intensity AND the breathing
 *    cadence — at value ≥ 9 the chip pulses faster.
 *  - The announcement word now has a thin gold underline that shimmers in
 *    sync with the aura, so the bet word reads as a "stamp" rather than
 *    floating text.
 */
export function TrucoDramaOverlay({
  isOpen,
  pendingValue,
  requesterIsMine,
  tier,
  headline,
  detail,
  layout = 'default',
}: TrucoDramaOverlayProps) {
  const [phase, setPhase] = useState<'big' | 'chip'>('big');

  const bigHoldMs = requesterIsMine
    ? BIG_HOLD_MS
    : pendingValue >= 12
      ? 1820
      : pendingValue >= 9
        ? 1660
        : pendingValue >= 6
          ? 1520
          : 1340;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setPhase('big');
    const timeout = window.setTimeout(() => setPhase('chip'), bigHoldMs);

    return () => window.clearTimeout(timeout);
  }, [bigHoldMs, detail, headline, isOpen, pendingValue, requesterIsMine]);

  const word = useMemo(() => CALL_WORD_BY_VALUE[pendingValue] ?? 'TRUCO!', [pendingValue]);
  const identity = useMemo(() => resolveValueIdentity(pendingValue), [pendingValue]);
  const visuals = useMemo(() => resolveVisuals(tier, requesterIsMine), [requesterIsMine, tier]);
  const compactWord = word.replace('!', '');
  const pressureLabel = requesterIsMine ? 'Aguardando resposta' : 'Sua decisão';
  const resolvedHeadline = headline ?? identity.stageLabel;
  const resolvedDetail = detail ?? (requesterIsMine ? identity.requesterDetail : identity.responderDetail);
  const pressureDetail = resolvedDetail;

  // 2v2 has a tighter top header so the drama zone moves down a little to
  // avoid colliding with the partner nameplate.
  const isTwoVersusTwoLayout = layout === 'two-versus-two';
  const bigWordPositionClassName = isTwoVersusTwoLayout
    ? 'absolute inset-x-0 top-[15%] flex justify-center px-6 text-center'
    : 'absolute inset-x-0 top-[12%] flex justify-center px-6 text-center';
  const pressureChipPositionClassName = isTwoVersusTwoLayout
    ? 'absolute inset-x-0 top-[76px] flex justify-center px-6 text-center'
    : 'absolute inset-x-0 top-[54px] flex justify-center px-6 text-center';
  const pressureChipWidthClassName = isTwoVersusTwoLayout
    ? 'relative flex w-[min(440px,calc(100%-24px))] flex-col items-center rounded-[22px] px-5 py-3.5'
    : 'relative flex w-[min(560px,calc(100%-24px))] flex-col items-center rounded-[22px] px-6 py-4';

  // Escalation cadence: tier value drives the breathing speed of both the
  // shell aura and the chip. Higher values pulse faster.
  const isHotTier = tier === 'red' || tier === 'red-pulse';
  const isMediumTier = tier === 'orange';

  const auraDuration = requesterIsMine ? 1.9 : isHotTier ? 0.85 : isMediumTier ? 1.05 : 1.4;
  const chipDuration = requesterIsMine ? 1.85 : isHotTier ? 0.95 : isMediumTier ? 1.15 : 1.45;
  const responderImpact = !requesterIsMine;
  const bigVignetteOpacity = responderImpact ? 0.86 : 0.78;
  const chipVignetteOpacity = responderImpact ? 0.44 : 0.36;
  const bigAuraPeak = responderImpact ? 1.16 : 1;
  const bigRadialPeak = responderImpact ? 1 : 0.92;

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key={`truco-drama-${pendingValue}-${requesterIsMine}`}
          className="pointer-events-none absolute inset-0 z-[65] overflow-hidden rounded-[28px]"
          role="status"
          aria-live="assertive"
          aria-atomic="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* Vignette darken — focuses the eye on the announcement during
              `big` and recedes during `chip`. */}
          <motion.div
            className="absolute inset-0 rounded-[28px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'big' ? bigVignetteOpacity : chipVignetteOpacity }}
            transition={{ duration: phase === 'big' ? 0.22 : 0.5 }}
            style={{
              background:
                'radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0.02) 0%, rgba(0,0,0,0.30) 68%, rgba(0,0,0,0.62) 100%)',
            }}
          />

          {/* Outer aura ring — sits on the inside of the felt frame; this
              is the layer that makes the whole table look "lit up" by the
              bet. */}
          <motion.div
            className="absolute inset-[8px] rounded-[24px]"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{
              opacity: phase === 'big' ? [0, bigAuraPeak, 0.76] : [0.38, 0.62, 0.38],
              scale: phase === 'big' ? [0.98, 1.012, 1] : [1, 1.004, 1],
            }}
            transition={{
              duration: phase === 'big' ? 0.56 : auraDuration,
              repeat: phase === 'chip' ? Infinity : 0,
            }}
            style={{
              border: `1px solid ${visuals.auraStrong}`,
              boxShadow: `
                inset 0 0 28px ${visuals.aura},
                inset 0 0 84px rgba(0,0,0,0.34),
                0 0 28px ${visuals.aura},
                0 0 66px ${visuals.aura}
              `,
            }}
          />

          {/* NEW — rim sweep that runs once across the inside of the bezel
              when the announcement enters. Looks like a stage spotlight
              dragging across the table edge. CSS-only animation so it's
              cheap and predictable. */}
          {phase === 'big' ? (
            <div
              aria-hidden
              className="drama-rim-sweep-anim pointer-events-none absolute inset-[8px] rounded-[24px] overflow-hidden"
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: `linear-gradient(110deg, transparent 32%, ${visuals.glow} 50%, transparent 68%)`,
                  mixBlendMode: 'screen',
                  filter: 'blur(8px)',
                }}
              />
            </div>
          ) : null}

          {/* Tinted radial wash projected from above — sells the colour of
              the tier without painting the cards. */}
          <motion.div
            key={`radial-${pendingValue}-${requesterIsMine}`}
            className="absolute left-1/2 top-[-6%] -translate-x-1/2 rounded-full"
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{
              opacity: phase === 'big' ? [0, bigRadialPeak, 0.52] : [0.24, 0.46, 0.24],
              scale: phase === 'big' ? [0.86, 1.06, 1.02] : [1, 1.04, 1],
            }}
            transition={{
              duration: phase === 'big' ? 0.7 : auraDuration,
              repeat: phase === 'chip' ? Infinity : 0,
            }}
            style={{
              width: '88%',
              height: 280,
              marginLeft: '-44%',
              background: `radial-gradient(ellipse at 50% 50%, ${visuals.radial} 0%, transparent 64%)`,
              filter: 'blur(28px)',
            }}
          />

          <AnimatePresence mode="wait">
            {phase === 'big' ? (
              <motion.div
                key="big-word"
                className={bigWordPositionClassName}
                initial={{ y: -22, opacity: 0, scale: 0.84, rotate: -2 }}
                animate={{ y: 0, opacity: 1, scale: responderImpact ? 1.05 : 1, rotate: 0 }}
                exit={{ y: -10, opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.46, ease: [0.20, 0.90, 0.24, 1] }}
              >
                <div className="relative flex flex-col items-center">
                  <motion.div
                    className="mb-3 rounded-full px-4 py-1.5 text-[10px] font-black uppercase tracking-[0.30em]"
                    initial={{ opacity: 0, y: 8, scale: 0.94 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.32, delay: 0.08, ease: [0.20, 0.90, 0.24, 1] }}
                    style={{
                      background: 'rgba(8,10,8,0.56)',
                      border: `1px solid ${visuals.chipBorder}`,
                      color: 'rgba(255,248,222,0.86)',
                      boxShadow: `0 0 20px ${visuals.aura}`,
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    {identity.stageLabel}
                  </motion.div>

                  <motion.span
                    aria-hidden
                    className="absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 select-none"
                    initial={{ opacity: 0, scale: 0.72 }}
                    animate={{
                      opacity: pendingValue >= 9 ? [0.08, 0.18, 0.10] : [0.06, 0.14, 0.08],
                      scale: pendingValue >= 9 ? [0.92, 1.08, 0.98] : [0.96, 1.04, 0.98],
                    }}
                    transition={{
                      duration: pendingValue >= 9 ? 0.95 : 1.25,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    style={{
                      color: visuals.word,
                      fontFamily: 'Georgia, serif',
                      fontSize: pendingValue >= 12 ? 'clamp(164px, 23vw, 282px)' : 'clamp(130px, 19vw, 220px)',
                      fontWeight: 900,
                      lineHeight: 0.8,
                      textShadow: `0 0 40px ${visuals.glow}`,
                    }}
                  >
                    {identity.watermark}
                  </motion.span>

                  <span
                    style={{
                      color: visuals.word,
                      fontFamily: 'Georgia, serif',
                      fontSize: pendingValue >= 12 ? 'clamp(72px, 11vw, 154px)' : responderImpact ? 'clamp(62px, 9.8vw, 134px)' : 'clamp(56px, 9vw, 124px)',
                      fontWeight: 900,
                      letterSpacing: '0.04em',
                      lineHeight: 1,
                      textShadow: `0 4px 0 ${visuals.stroke}, 0 0 28px ${visuals.glow}, 0 0 64px ${visuals.glow}`,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {word}
                  </span>

                  {/* Gold underline — a thin shimmering rule under the word.
                      It signs the announcement like a stamp. */}
                  <motion.span
                    aria-hidden
                    className="mt-3 h-[2px] rounded-full"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: '64%', opacity: 0.92 }}
                    transition={{ duration: 0.46, delay: 0.18, ease: [0.20, 0.90, 0.24, 1] }}
                    style={{
                      background: `linear-gradient(90deg, transparent 0%, ${visuals.chipBorder} 50%, transparent 100%)`,
                      boxShadow: `0 0 14px ${visuals.aura}`,
                    }}
                  />

                  <div
                    className="mt-4 inline-flex flex-col items-center rounded-full px-5 py-2.5"
                    style={{
                      background: 'rgba(8,10,8,0.58)',
                      border: `1px solid ${visuals.chipBorder}`,
                      boxShadow: `0 0 28px ${visuals.aura}, 0 16px 34px rgba(0,0,0,0.44)`,
                      backdropFilter: 'blur(10px)',
                    }}
                  >
                    <span
                      style={{
                        color: 'rgba(255,248,222,0.92)',
                        fontSize: 12,
                        fontWeight: 900,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {resolvedHeadline}
                    </span>
                    <span
                      className="mt-1"
                      style={{
                        color: 'rgba(255,248,222,0.66)',
                        fontSize: 10,
                        fontWeight: 800,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {identity.subtitle}
                    </span>
                    <span
                      className="mt-1"
                      style={{
                        color: 'rgba(255,248,222,0.52)',
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {resolvedDetail}
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="pressure-chip"
                className={pressureChipPositionClassName}
                initial={{ scale: 0.92, opacity: 0, y: -10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.96, opacity: 0, y: -8 }}
                transition={{ duration: 0.32, ease: [0.20, 0.80, 0.20, 1] }}
              >
                <motion.div
                  className={pressureChipWidthClassName}
                  animate={{
                    boxShadow: requesterIsMine
                      ? [
                          `0 0 22px ${visuals.aura}, inset 0 1px 0 rgba(255,235,170,0.20), inset 0 -2px 0 rgba(0,0,0,0.54), 0 18px 36px rgba(0,0,0,0.44)`,
                          `0 0 38px ${visuals.auraStrong}, inset 0 1px 0 rgba(255,235,170,0.24), inset 0 -2px 0 rgba(0,0,0,0.54), 0 20px 40px rgba(0,0,0,0.50)`,
                          `0 0 22px ${visuals.aura}, inset 0 1px 0 rgba(255,235,170,0.20), inset 0 -2px 0 rgba(0,0,0,0.54), 0 18px 36px rgba(0,0,0,0.44)`,
                        ]
                      : [
                          `0 0 28px ${visuals.aura}, inset 0 1px 0 rgba(255,210,210,0.24), inset 0 -2px 0 rgba(0,0,0,0.58), 0 18px 36px rgba(0,0,0,0.44)`,
                          `0 0 48px ${visuals.auraStrong}, inset 0 1px 0 rgba(255,210,210,0.32), inset 0 -2px 0 rgba(0,0,0,0.58), 0 22px 44px rgba(0,0,0,0.52)`,
                          `0 0 28px ${visuals.aura}, inset 0 1px 0 rgba(255,210,210,0.24), inset 0 -2px 0 rgba(0,0,0,0.58), 0 18px 36px rgba(0,0,0,0.44)`,
                        ],
                  }}
                  transition={{
                    duration: chipDuration,
                    repeat: Infinity,
                    ease: [0.4, 0, 0.6, 1],
                  }}
                  style={{
                    background: visuals.pressureBg,
                    border: `1px solid ${visuals.chipBorder}`,
                    color: visuals.pressureText,
                    fontFamily: 'Georgia, serif',
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  <div
                    aria-hidden
                    className="absolute inset-x-5 top-0 h-px"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${visuals.chipBorder}, transparent)`,
                    }}
                  />

                  <div
                    className="mb-2 text-center text-[9px] font-black uppercase tracking-[0.30em]"
                    style={{
                      color: 'rgba(255,248,222,0.70)',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      textShadow: `0 0 10px ${visuals.aura}`,
                    }}
                  >
                    {identity.stageLabel}
                  </div>

                  <div className="flex w-full items-center justify-center gap-3">
                    <motion.span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      animate={{ opacity: [0.4, 1, 0.4], scale: [0.82, 1.16, 0.82] }}
                      transition={{ duration: chipDuration, repeat: Infinity }}
                      style={{
                        background: visuals.chipBorder,
                        boxShadow: `0 0 14px ${visuals.auraStrong}`,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 24,
                        fontWeight: 900,
                        lineHeight: 1,
                        letterSpacing: '0.08em',
                        textShadow: `0 2px 0 ${visuals.stroke}, 0 0 18px ${visuals.glow}`,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {compactWord}
                    </span>
                    <motion.span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      animate={{ opacity: [1, 0.4, 1], scale: [1.16, 0.82, 1.16] }}
                      transition={{ duration: chipDuration, repeat: Infinity }}
                      style={{
                        background: visuals.chipBorder,
                        boxShadow: `0 0 14px ${visuals.auraStrong}`,
                      }}
                    />
                  </div>

                  <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1">
                    <span
                      style={{
                        color: 'rgba(255,248,222,0.76)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.20em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {resolvedHeadline}
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
                          ? 'rgba(255,232,170,0.88)'
                          : 'rgba(255,226,164,0.98)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        textShadow: requesterIsMine ? 'none' : `0 0 10px ${visuals.aura}`,
                      }}
                    >
                      {identity.subtitle}
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
                          ? 'rgba(255,232,170,0.78)'
                          : 'rgba(255,226,164,0.88)',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 10,
                        fontWeight: 900,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        textShadow: requesterIsMine ? 'none' : `0 0 10px ${visuals.aura}`,
                      }}
                    >
                      {pressureLabel}
                    </span>
                  </div>

                  <div
                    className="mt-2 max-w-full truncate text-center"
                    style={{
                      color: 'rgba(255,248,222,0.58)',
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {pressureDetail}
                  </div>

                  <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
                    {[0, 1, 2].map((index) => (
                      <motion.span
                        key={index}
                        className="h-1.5 w-1.5 rounded-full"
                        animate={{ opacity: [0.24, 1, 0.24], y: [0, -2, 0] }}
                        transition={{
                          duration: 0.95,
                          repeat: Infinity,
                          delay: index * 0.16,
                        }}
                        style={{ background: visuals.chipBorder }}
                      />
                    ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
