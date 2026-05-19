import { AnimatePresence, motion } from 'framer-motion';
import { useId, useMemo } from 'react';

/**
 * Premium round-resolution effects kept behind the original public API.
 * The layer adds an explicit, card-anchored climax: stronger local shockwaves,
 * winner crowns, loser cuts, tie frost rings, and drifting sparks without touching
 * match rules or timing.
 */

type ClashOutcome = 'win' | 'loss' | 'tie';
type RoundClashEffectsVariant = 'default' | 'hero-bottom' | 'card-anchor';
type RoundClashAnchorTone = 'winner' | 'partner' | 'loser' | 'tie';

export type RoundClashAnchor = {
  id: string;
  x: string;
  y: string;
  tone: RoundClashAnchorTone;
};

type RoundClashEffectsProps = {
  outcome: ClashOutcome | null;
  clashKey: string | number;
  isOpen: boolean;
  variant?: RoundClashEffectsVariant;
  anchors?: RoundClashAnchor[];
};

type OutcomePalette = {
  ray: string;
  rayMid: string;
  rayCore: string;
  rayEdge: string;
  spark: string;
  flash: string;
  haze: string;
  vignette: string;
  ring: string;
  ringSecond: string;
  crownRay: string;
};

type ClashLayoutProfile = {
  centerTop: string;
  hazeWidth: number;
  hazeHeight: number;
  hazeBlur: number;
  coreSize: number;
  lineWidth: number;
  lineGlowWidth: number;
  lineGlowHeight: number;
  lineYOffset: number;
  sparkDistanceMultiplier: number;
  secondaryLineDelay: number;
};

type AnchoredClashProfile = {
  hazeWidth: number;
  hazeHeight: number;
  hazeBlur: number;
  coreSize: number;
  lineWidth: number;
  lineGlowWidth: number;
  lineGlowHeight: number;
  rayOpacity: number;
  sparkScale: number;
  delay: number;
};

const OUTCOME_PALETTE: Record<ClashOutcome, OutcomePalette> = {
  win: {
    ray: 'rgba(252, 222, 90, 0.98)',
    rayMid: 'rgba(242, 166, 35, 1)',
    rayCore: 'rgba(255, 248, 214, 1)',
    rayEdge: 'rgba(232, 93, 36, 0)',
    spark: '#FCDE5A',
    flash: 'rgba(252, 222, 90, 0.64)',
    haze: 'rgba(201, 168, 76, 0.20)',
    vignette: 'rgba(201, 168, 76, 0.14)',
    ring: 'rgba(255, 241, 184, 0.72)',
    ringSecond: 'rgba(201, 168, 76, 0.44)',
    crownRay: 'rgba(255, 248, 214, 0.88)',
  },
  loss: {
    ray: 'rgba(248, 113, 113, 0.98)',
    rayMid: 'rgba(220, 38, 38, 1)',
    rayCore: 'rgba(255, 226, 226, 0.96)',
    rayEdge: 'rgba(127, 29, 29, 0)',
    spark: '#F87171',
    flash: 'rgba(248, 113, 113, 0.66)',
    haze: 'rgba(127, 29, 29, 0.28)',
    vignette: 'rgba(127, 29, 29, 0.10)',
    ring: 'rgba(248, 113, 113, 0.60)',
    ringSecond: 'rgba(127, 29, 29, 0.40)',
    crownRay: 'rgba(255, 226, 226, 0.70)',
  },
  tie: {
    ray: 'rgba(226, 232, 240, 0.92)',
    rayMid: 'rgba(148, 163, 184, 1)',
    rayCore: 'rgba(248, 250, 252, 0.96)',
    rayEdge: 'rgba(71, 85, 105, 0)',
    spark: '#CBD5E1',
    flash: 'rgba(203, 213, 225, 0.42)',
    haze: 'rgba(148, 163, 184, 0.15)',
    vignette: 'rgba(100, 116, 139, 0.12)',
    ring: 'rgba(226, 232, 240, 0.54)',
    ringSecond: 'rgba(148, 163, 184, 0.30)',
    crownRay: 'rgba(248, 250, 252, 0.60)',
  },
};

const CLASH_LAYOUT_BY_VARIANT: Record<RoundClashEffectsVariant, ClashLayoutProfile> = {
  default: {
    centerTop: '50%',
    hazeWidth: 460, hazeHeight: 192, hazeBlur: 20,
    coreSize: 84,
    lineWidth: 440, lineGlowWidth: 308, lineGlowHeight: 5,
    lineYOffset: 0,
    sparkDistanceMultiplier: 1,
    secondaryLineDelay: 0.16,
  },
  'hero-bottom': {
    centerTop: '70%',
    hazeWidth: 540, hazeHeight: 200, hazeBlur: 22,
    coreSize: 96,
    lineWidth: 540, lineGlowWidth: 360, lineGlowHeight: 4,
    lineYOffset: 12,
    sparkDistanceMultiplier: 1.12,
    secondaryLineDelay: 0.14,
  },
  'card-anchor': {
    centerTop: '50%',
    hazeWidth: 260, hazeHeight: 112, hazeBlur: 16,
    coreSize: 64,
    lineWidth: 252, lineGlowWidth: 168, lineGlowHeight: 4,
    lineYOffset: 0,
    sparkDistanceMultiplier: 0.72,
    secondaryLineDelay: 0.12,
  },
};

const ANCHORED_CLASH_PROFILE_BY_TONE: Record<RoundClashAnchorTone, AnchoredClashProfile> = {
  winner: { hazeWidth: 520, hazeHeight: 214, hazeBlur: 22, coreSize: 118, lineWidth: 470, lineGlowWidth: 330, lineGlowHeight: 7, rayOpacity: 1, sparkScale: 1.18, delay: 0 },
  partner: { hazeWidth: 310, hazeHeight: 132, hazeBlur: 16, coreSize: 72, lineWidth: 286, lineGlowWidth: 190, lineGlowHeight: 4, rayOpacity: 0.76, sparkScale: 0.74, delay: 0.06 },
  loser:   { hazeWidth: 340, hazeHeight: 150, hazeBlur: 16, coreSize: 78, lineWidth: 308, lineGlowWidth: 204, lineGlowHeight: 4, rayOpacity: 0.88, sparkScale: 0.78, delay: 0.04 },
  tie:     { hazeWidth: 300, hazeHeight: 126, hazeBlur: 16, coreSize: 68, lineWidth: 266, lineGlowWidth: 176, lineGlowHeight: 4, rayOpacity: 0.7, sparkScale: 0.64, delay: 0.06 },
};

type Spark = { x: number; y: number; size: number; delay: number; angle: number; distance: number; drift?: boolean };

const SPARKS: Spark[] = [
  { x: 50, y: 50, size: 1.18, delay: 0,    angle: 0,    distance: 78 },
  { x: 50, y: 50, size: 1.04, delay: 0.01, angle: 180,  distance: 78 },
  { x: 42, y: 45, size: 0.84, delay: 0.04, angle: -152, distance: 60 },
  { x: 58, y: 45, size: 0.84, delay: 0.04, angle: -28,  distance: 60 },
  { x: 38, y: 57, size: 0.66, delay: 0.06, angle: 158,  distance: 50 },
  { x: 62, y: 57, size: 0.66, delay: 0.06, angle: 22,   distance: 50 },
  { x: 50, y: 38, size: 0.62, delay: 0.07, angle: -90,  distance: 48 },
  { x: 50, y: 62, size: 0.62, delay: 0.07, angle: 90,   distance: 48 },
  { x: 45, y: 52, size: 0.54, delay: 0.1,  angle: 205,  distance: 40 },
  { x: 55, y: 52, size: 0.54, delay: 0.1,  angle: -25,  distance: 40 },
  // NOTE: Late embers drift upward to keep the clash visible without another banner.
  { x: 48, y: 50, size: 0.4, delay: 0.18, angle: -90, distance: 96, drift: true },
  { x: 52, y: 50, size: 0.4, delay: 0.22, angle: -75, distance: 110, drift: true },
  { x: 50, y: 48, size: 0.34, delay: 0.28, angle: -105, distance: 88, drift: true },
  { x: 46, y: 51, size: 0.36, delay: 0.32, angle: -60, distance: 102, drift: true },
];

// NOTE: Crown rays frame a winning clash without touching the verdict plaque.
const CROWN_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

function buildClashVignetteBackground({
  outcome, palette, originX, originY, hasAnchors,
}: {
  outcome: ClashOutcome;
  palette: OutcomePalette;
  originX: string;
  originY: string;
  hasAnchors: boolean;
}): string {
  if (outcome === 'loss') {
    const coreAlpha = hasAnchors ? 0.2 : 0.16;
    const edgeAlpha = hasAnchors ? 0.1 : 0.08;
    return `radial-gradient(ellipse at ${originX} ${originY}, rgba(220, 38, 38, ${coreAlpha}) 0%, rgba(127, 29, 29, ${edgeAlpha}) 34%, transparent 64%)`;
  }
  return `radial-gradient(ellipse at ${originX} ${originY}, transparent 34%, ${palette.vignette} 100%)`;
}

export function RoundClashEffects({
  outcome,
  clashKey,
  isOpen,
  variant = 'default',
  anchors = [],
}: RoundClashEffectsProps) {
  const palette = useMemo(() => (outcome ? OUTCOME_PALETTE[outcome] : null), [outcome]);
  const id = useId();
  const layout = CLASH_LAYOUT_BY_VARIANT[variant];
  const primaryAnchor = anchors.find((a) => a.tone === 'winner') ?? anchors[0] ?? null;
  const vignetteOriginX = primaryAnchor?.x ?? '50%';
  const vignetteOriginY = primaryAnchor?.y ?? '50%';

  if (!palette || !outcome) return null;

  const isWin = outcome === 'win';
  const isLoss = outcome === 'loss';
  const vignetteBackground = buildClashVignetteBackground({
    outcome, palette, originX: vignetteOriginX, originY: vignetteOriginY,
    hasAnchors: anchors.length > 0,
  });

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key={`clash-fx-${clashKey}-${outcome}-${variant}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[34]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.38 }}
        >
          {/* Vignette. */}
          <div
            className="clash-vignette-anim absolute inset-0"
            style={{ background: vignetteBackground }}
          />

          {/* Loss extra dim layer. */}
          {isLoss ? (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.16, 0.07] }}
              transition={{ duration: 1.1, times: [0, 0.25, 1] }}
              style={{
                background:
                  'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(60,10,10,0.28) 100%)',
              }}
            />
          ) : null}

          {anchors.length > 0 ? (
            <>
              <AnchoredClashStage anchors={anchors} outcome={outcome} />
              {anchors.map((anchor) => (
                <AnchoredClashBurst key={`${anchor.id}-${anchor.tone}`} anchor={anchor} id={id} />
              ))}
            </>
          ) : (
            <div
              className="absolute left-1/2"
              style={{ top: layout.centerTop, transform: 'translate(-50%, -50%)' }}
            >
              {/* Haze. */}
              <motion.div
                className="absolute left-1/2 top-1/2 rounded-full"
                initial={{ opacity: 0, scale: 0.68 }}
                animate={{ opacity: [0, 0.72, 0.34, 0.12], scale: [0.68, 1.08, 1.18, 1.1] }}
                transition={{ duration: 1.32, times: [0, 0.22, 0.62, 1], ease: [0.2, 0.9, 0.24, 1] }}
                style={{
                  width: layout.hazeWidth, height: layout.hazeHeight,
                  marginLeft: -(layout.hazeWidth / 2), marginTop: -(layout.hazeHeight / 2),
                  background: `radial-gradient(ellipse at 50% 50%, ${palette.flash} 0%, ${palette.haze} 38%, transparent 74%)`,
                  filter: `blur(${layout.hazeBlur}px)`,
                }}
              />

              {/* Win-only heat shimmer. */}
              {isWin ? (
                <motion.div
                  className="absolute left-1/2 top-1/2 rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.18, 0], scale: [0.8, 1.1, 0.9] }}
                  transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
                  style={{
                    width: layout.coreSize * 2.4,
                    height: layout.coreSize * 2.4,
                    marginLeft: -(layout.coreSize * 1.2),
                    marginTop: -(layout.coreSize * 1.2),
                    background: `radial-gradient(circle, ${palette.flash} 0%, transparent 70%)`,
                    filter: 'blur(22px)',
                    mixBlendMode: 'screen',
                  }}
                />
              ) : null}

              {/* Core. */}
              <motion.div
                className="absolute left-1/2 top-1/2 rounded-full"
                initial={{ opacity: 0, scale: 0.34, rotate: -28 }}
                animate={{ opacity: [0, 1, 0.46, 0], scale: [0.34, 1.22, 0.96, 0.72], rotate: 18 }}
                transition={{ duration: 0.92, times: [0, 0.34, 0.68, 1], ease: [0.2, 0.9, 0.24, 1] }}
                style={{
                  width: layout.coreSize, height: layout.coreSize,
                  marginLeft: -(layout.coreSize / 2), marginTop: -(layout.coreSize / 2),
                  background: `radial-gradient(circle, ${palette.rayCore} 0%, ${palette.flash} 34%, transparent 72%)`,
                  boxShadow: `0 0 34px ${palette.flash}`,
                }}
              />

              {/* Primary shock ring. */}
              <motion.div
                className="absolute left-1/2 top-1/2 rounded-full"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: [0, 0.88, 0], scale: [0.3, 3.2, 4.0] }}
                transition={{ duration: 0.78, ease: [0.2, 0.7, 0.2, 1] }}
                style={{
                  width: layout.coreSize * 0.8, height: layout.coreSize * 0.8,
                  marginLeft: -(layout.coreSize * 0.4), marginTop: -(layout.coreSize * 0.4),
                  border: `2px solid ${palette.ring}`,
                  boxShadow: `0 0 14px ${palette.ring}`,
                }}
              />

              {/* Delayed win shock ring. */}
              {isWin ? (
                <motion.div
                  className="absolute left-1/2 top-1/2 rounded-full"
                  initial={{ opacity: 0, scale: 0.3 }}
                  animate={{ opacity: [0, 0.60, 0], scale: [0.3, 4.0, 5.0] }}
                  transition={{ duration: 0.9, delay: 0.14, ease: [0.2, 0.7, 0.2, 1] }}
                  style={{
                    width: layout.coreSize * 0.8, height: layout.coreSize * 0.8,
                    marginLeft: -(layout.coreSize * 0.4), marginTop: -(layout.coreSize * 0.4),
                    border: `1.5px solid ${palette.ringSecond}`,
                  }}
                />
              ) : null}

              {/* Win crown rays. */}
              {isWin ? CROWN_ANGLES.map((angle, i) => {
                const length = 72 + (i % 2 === 0 ? 20 : 0);
                return (
                  <motion.div
                    key={`crown-${i}`}
                    className="absolute left-1/2 top-1/2"
                    initial={{ opacity: 0, scaleY: 0 }}
                    animate={{ opacity: [0, 0.68, 0], scaleY: [0, 1, 0.56] }}
                    transition={{ duration: 0.56, delay: 0.05 + i * 0.018, ease: [0.2, 0.9, 0.24, 1] }}
                    style={{
                      width: 2,
                      height: length,
                      marginLeft: -1,
                      marginTop: 0,
                      transformOrigin: '50% 0%',
                      transform: `rotate(${angle}deg)`,
                      background: `linear-gradient(180deg, ${palette.crownRay} 0%, transparent 100%)`,
                      boxShadow: `0 0 6px ${palette.crownRay}`,
                    }}
                  />
                );
              }) : null}

              {/* Primary ray. */}
              <motion.div
                className="absolute left-1/2 top-1/2 rounded-full"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: [0, 1.14, 1, 0.92], opacity: [0, 1, 0.92, 0.18] }}
                transition={{ duration: 1.04, times: [0, 0.3, 0.72, 1], ease: [0.2, 0.9, 0.24, 1] }}
                style={{
                  width: layout.lineWidth, height: layout.lineGlowHeight,
                  marginLeft: -(layout.lineWidth / 2), marginTop: -layout.lineGlowHeight / 2 + layout.lineYOffset,
                  transformOrigin: '50% 50%',
                  background: `linear-gradient(90deg, ${palette.rayEdge} 0%, ${palette.ray} 19%, ${palette.rayCore} 50%, ${palette.ray} 81%, ${palette.rayEdge} 100%)`,
                  boxShadow: `0 0 22px ${palette.ray}, 0 0 44px ${palette.flash}`,
                }}
              />

              {/* Secondary ray. */}
              <motion.div
                className="absolute left-1/2 top-1/2 rounded-full"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: [0, 1, 0.88], opacity: [0, 0.88, 0] }}
                transition={{ duration: 0.82, delay: layout.secondaryLineDelay, ease: [0.2, 0.9, 0.24, 1] }}
                style={{
                  width: layout.lineGlowWidth, height: 1,
                  marginLeft: -(layout.lineGlowWidth / 2),
                  background: `linear-gradient(90deg, transparent 0%, ${palette.rayCore} 50%, transparent 100%)`,
                  boxShadow: `0 0 12px ${palette.rayCore}`,
                }}
              />

              {/* Hero-bottom extra wash. */}
              {variant === 'hero-bottom' ? (
                <motion.div
                  className="absolute left-1/2 top-1/2 rounded-full"
                  initial={{ opacity: 0, scaleX: 0.64 }}
                  animate={{ opacity: [0, 0.42, 0], scaleX: [0.64, 1.06, 1.2] }}
                  transition={{ duration: 0.96, delay: 0.08, ease: [0.2, 0.9, 0.24, 1] }}
                  style={{
                    width: layout.lineWidth + 36, height: 28,
                    marginLeft: -((layout.lineWidth + 36) / 2), marginTop: -6,
                    background: `radial-gradient(ellipse at 50% 50%, ${palette.flash} 0%, transparent 68%)`,
                    filter: 'blur(12px)',
                  }}
                />
              ) : null}

              {/* Sparks and upward embers. */}
              {SPARKS.map((spark, idx) => {
                const dx = Math.cos((spark.angle * Math.PI) / 180) * spark.distance * layout.sparkDistanceMultiplier;
                const dy = Math.sin((spark.angle * Math.PI) / 180) * spark.distance * layout.sparkDistanceMultiplier;
                const driftJitterX = ((idx % 3) - 1) * 8;

                return (
                  <motion.span
                    key={`${id}-spark-${idx}`}
                    className="absolute block rounded-full"
                    style={{
                      left: `${spark.x}%`, top: `${spark.y}%`,
                      width: 7 * spark.size, height: 7 * spark.size,
                      background: spark.drift ? palette.rayCore : palette.spark,
                      boxShadow: `0 0 ${10 * spark.size}px ${spark.drift ? palette.flash : palette.spark}`,
                      marginLeft: -3.5 * spark.size, marginTop: -3.5 * spark.size,
                    }}
                    initial={{ x: 0, y: 0, opacity: 0, scale: 0.34 }}
                    animate={spark.drift ? {
                      x: [0, dx * 0.3, dx * 0.5 + driftJitterX],
                      y: [0, dy * 0.4, dy - 40],
                      opacity: [0, 0.82, 0],
                      scale: [0.34, 0.9, 0.24],
                    } : {
                      x: [0, dx * 0.42, dx],
                      y: [0, dy * 0.38, dy + 10],
                      opacity: [0, 1, 0],
                      scale: [0.34, 1.16, 0.54],
                    }}
                    transition={{
                      duration: spark.drift ? 1.4 : 0.96,
                      delay: spark.delay + 0.08,
                      ease: spark.drift ? [0.0, 0.0, 0.58, 1.0] : [0.2, 0.9, 0.24, 1],
                    }}
                  />
                );
              })}

              {/* Win-only scanline. */}
              {isWin ? (
                <div
                  aria-hidden
                  className="clash-scanline-anim pointer-events-none absolute"
                  style={{
                    left: -160, top: -90, width: 320, height: 220,
                    background: `linear-gradient(180deg, transparent 0%, ${palette.flash} 50%, transparent 100%)`,
                    mixBlendMode: 'screen',
                    filter: 'blur(8px)',
                  }}
                />
              ) : null}
            </div>
          )}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}


function AnchoredClashStage({
  anchors,
  outcome,
}: {
  anchors: RoundClashAnchor[];
  outcome: ClashOutcome;
}) {
  const primaryAnchor = anchors.find((anchor) => anchor.tone === 'winner') ?? anchors[0] ?? null;

  if (!primaryAnchor) {
    return null;
  }

  const palette = getAnchoredPalette(primaryAnchor.tone);
  const isWin = outcome === 'win';
  const isLoss = outcome === 'loss';
  const isTie = outcome === 'tie';

  return (
    <div
      className="absolute"
      style={{ left: primaryAnchor.x, top: primaryAnchor.y, transform: 'translate(-50%, -50%)' }}
    >
      {/* NOTE: This stage exists because the table usually renders card anchors; center-only effects are barely visible in the real match layout. */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        initial={{ opacity: 0, scale: 0.16 }}
        animate={{ opacity: [0, isWin ? 0.86 : 0.62, 0], scale: [0.16, isWin ? 5.8 : 4.6, isWin ? 7.2 : 5.8] }}
        transition={{ duration: isWin ? 0.94 : 0.78, ease: [0.16, 0.78, 0.22, 1] }}
        style={{
          width: 78,
          height: 78,
          marginLeft: -39,
          marginTop: -39,
          border: `2px solid ${palette.ring}`,
          boxShadow: `0 0 20px ${palette.ring}, inset 0 0 18px ${palette.ringSecond}`,
        }}
      />

      {isWin ? (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          initial={{ opacity: 0, scale: 0.24, rotate: -8 }}
          animate={{ opacity: [0, 0.54, 0], scale: [0.24, 4.8, 6.3], rotate: 10 }}
          transition={{ duration: 1.08, delay: 0.11, ease: [0.16, 0.78, 0.22, 1] }}
          style={{
            width: 92,
            height: 92,
            marginLeft: -46,
            marginTop: -46,
            border: `1px solid ${palette.ringSecond}`,
          }}
        />
      ) : null}

      {isWin ? (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0.5, 0], scale: [0.5, 1.18, 1.38] }}
          transition={{ duration: 0.74, delay: 0.04, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            width: 260,
            height: 260,
            marginLeft: -130,
            marginTop: -130,
            background: `radial-gradient(circle, ${palette.flash} 0%, ${palette.haze} 34%, transparent 70%)`,
            filter: 'blur(18px)',
            mixBlendMode: 'screen',
          }}
        />
      ) : null}

      {isWin
        ? CROWN_ANGLES.map((angle, index) => {
            const length = 122 + (index % 2 === 0 ? 38 : 0);

            return (
              <motion.div
                key={`anchored-stage-crown-${angle}`}
                className="absolute left-1/2 top-1/2"
                initial={{ opacity: 0, scaleY: 0, y: 2 }}
                animate={{ opacity: [0, 0.86, 0], scaleY: [0, 1, 0.48], y: [2, -8, -14] }}
                transition={{ duration: 0.68, delay: 0.04 + index * 0.02, ease: [0.2, 0.9, 0.24, 1] }}
                style={{
                  width: 3,
                  height: length,
                  marginLeft: -1.5,
                  marginTop: -8,
                  transformOrigin: '50% 0%',
                  transform: `rotate(${angle}deg)`,
                  background: `linear-gradient(180deg, ${palette.crownRay} 0%, ${palette.ray} 38%, transparent 100%)`,
                  boxShadow: `0 0 10px ${palette.crownRay}`,
                }}
              />
            );
          })
        : null}

      {isLoss ? (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          initial={{ opacity: 0, scaleX: 0.2, rotate: -18 }}
          animate={{ opacity: [0, 0.82, 0], scaleX: [0.2, 1.18, 0.92], rotate: -12 }}
          transition={{ duration: 0.68, delay: 0.04, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            width: 360,
            height: 5,
            marginLeft: -180,
            marginTop: -2.5,
            background: `linear-gradient(90deg, transparent 0%, ${palette.ray} 48%, ${palette.rayCore} 52%, transparent 100%)`,
            boxShadow: `0 0 20px ${palette.flash}`,
          }}
        />
      ) : null}

      {isTie ? (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          initial={{ opacity: 0, scaleX: 0.4, scaleY: 0.3 }}
          animate={{ opacity: [0, 0.72, 0], scaleX: [0.4, 2.8, 3.4], scaleY: [0.3, 1.3, 1.6] }}
          transition={{ duration: 0.86, delay: 0.03, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            width: 132,
            height: 132,
            marginLeft: -66,
            marginTop: -66,
            border: `1.5px solid ${palette.ring}`,
            boxShadow: `0 0 16px ${palette.flash}`,
          }}
        />
      ) : null}
    </div>
  );
}

function getAnchoredPalette(tone: RoundClashAnchorTone): OutcomePalette {
  if (tone === 'loser') return OUTCOME_PALETTE.loss;
  if (tone === 'tie') return OUTCOME_PALETTE.tie;
  return OUTCOME_PALETTE.win;
}

function AnchoredClashBurst({ anchor, id }: { anchor: RoundClashAnchor; id: string }) {
  const palette = getAnchoredPalette(anchor.tone);
  const profile = ANCHORED_CLASH_PROFILE_BY_TONE[anchor.tone];
  const isWinner = anchor.tone === 'winner';
  const isLoser = anchor.tone === 'loser';

  return (
    <div
      className="absolute"
      style={{ left: anchor.x, top: anchor.y, transform: 'translate(-50%, -50%)' }}
    >
      {/* Haze. */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        initial={{ opacity: 0, scale: 0.58 }}
        animate={{ opacity: [0, isWinner ? 0.76 : 0.48, 0.18, 0], scale: [0.58, 1.1, 1.22, 1.06] }}
        transition={{ duration: isWinner ? 1.12 : 0.86, delay: profile.delay, times: [0, 0.26, 0.7, 1], ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          width: profile.hazeWidth, height: profile.hazeHeight,
          marginLeft: -(profile.hazeWidth / 2), marginTop: -(profile.hazeHeight / 2),
          background: `radial-gradient(ellipse at 50% 50%, ${palette.flash} 0%, ${palette.haze} 42%, transparent 76%)`,
          filter: `blur(${profile.hazeBlur}px)`,
        }}
      />

      {/* Anchor-local shock ring. */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, isWinner ? 0.72 : 0.44, 0], scale: [0.2, 2.4, 3.0] }}
        transition={{ duration: 0.64, delay: profile.delay, ease: [0.2, 0.7, 0.2, 1] }}
        style={{
          width: profile.coreSize * 0.7, height: profile.coreSize * 0.7,
          marginLeft: -(profile.coreSize * 0.35), marginTop: -(profile.coreSize * 0.35),
          border: `1.5px solid ${palette.ring}`,
          boxShadow: `0 0 10px ${palette.ring}`,
        }}
      />

      {isWinner ? (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          initial={{ opacity: 0, scale: 0.18 }}
          animate={{ opacity: [0, 0.7, 0], scale: [0.18, 3.8, 4.8] }}
          transition={{ duration: 0.72, delay: profile.delay + 0.08, ease: [0.16, 0.78, 0.22, 1] }}
          style={{
            width: profile.coreSize * 0.9,
            height: profile.coreSize * 0.9,
            marginLeft: -(profile.coreSize * 0.45),
            marginTop: -(profile.coreSize * 0.45),
            border: `2px solid ${palette.ringSecond}`,
            boxShadow: `0 0 16px ${palette.ring}`,
          }}
        />
      ) : null}

      {isWinner
        ? CROWN_ANGLES.map((angle, index) => {
            const length = 68 + (index % 2 === 0 ? 22 : 0);

            return (
              <motion.div
                key={`anchor-crown-${anchor.id}-${angle}`}
                className="absolute left-1/2 top-1/2"
                initial={{ opacity: 0, scaleY: 0 }}
                animate={{ opacity: [0, 0.72, 0], scaleY: [0, 1, 0.5] }}
                transition={{ duration: 0.56, delay: profile.delay + 0.04 + index * 0.018, ease: [0.2, 0.9, 0.24, 1] }}
                style={{
                  width: 2,
                  height: length,
                  marginLeft: -1,
                  marginTop: -2,
                  transformOrigin: '50% 0%',
                  transform: `rotate(${angle}deg)`,
                  background: `linear-gradient(180deg, ${palette.crownRay} 0%, transparent 100%)`,
                  boxShadow: `0 0 7px ${palette.crownRay}`,
                }}
              />
            );
          })
        : null}

      {isLoser ? (
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-full"
          initial={{ opacity: 0, scaleX: 0.2, rotate: -18 }}
          animate={{ opacity: [0, 0.78, 0], scaleX: [0.2, 1, 0.7], rotate: -14 }}
          transition={{ duration: 0.54, delay: profile.delay + 0.04, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            width: profile.lineWidth * 1.12,
            height: 4,
            marginLeft: -(profile.lineWidth * 0.56),
            marginTop: -2,
            background: `linear-gradient(90deg, transparent 0%, ${palette.ray} 50%, transparent 100%)`,
            boxShadow: `0 0 14px ${palette.flash}`,
          }}
        />
      ) : null}

      {/* Core. */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        initial={{ opacity: 0, scale: 0.3, rotate: isLoser ? 18 : -20 }}
        animate={{ opacity: [0, isWinner ? 1 : 0.72, 0.36, 0], scale: [0.3, isWinner ? 1.18 : 0.96, 0.84, 0.62], rotate: isLoser ? -12 : 16 }}
        transition={{ duration: isWinner ? 0.9 : 0.72, delay: profile.delay, times: [0, 0.34, 0.7, 1], ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          width: profile.coreSize, height: profile.coreSize,
          marginLeft: -(profile.coreSize / 2), marginTop: -(profile.coreSize / 2),
          background: `radial-gradient(circle, ${palette.rayCore} 0%, ${palette.flash} 34%, transparent 72%)`,
          boxShadow: `0 0 ${isWinner ? 34 : 20}px ${palette.flash}`,
        }}
      />

      {/* Ray. */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, isWinner ? 1.1 : 0.96, isWinner ? 0.98 : 0.82], opacity: [0, profile.rayOpacity, profile.rayOpacity * 0.54, 0] }}
        transition={{ duration: isWinner ? 0.98 : 0.72, delay: profile.delay + 0.02, times: [0, 0.32, 0.72, 1], ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          width: profile.lineWidth, height: profile.lineGlowHeight,
          marginLeft: -(profile.lineWidth / 2), marginTop: -profile.lineGlowHeight / 2,
          transformOrigin: '50% 50%',
          background: `linear-gradient(90deg, ${palette.rayEdge} 0%, ${palette.ray} 18%, ${palette.rayCore} 50%, ${palette.ray} 82%, ${palette.rayEdge} 100%)`,
          boxShadow: `0 0 ${isWinner ? 22 : 14}px ${palette.ray}, 0 0 ${isWinner ? 42 : 24}px ${palette.flash}`,
        }}
      />

      {/* Secondary ray. */}
      <motion.div
        className="absolute left-1/2 top-1/2 rounded-full"
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{ scaleX: [0, 1, 0.74], opacity: [0, isWinner ? 0.86 : 0.54, 0] }}
        transition={{ duration: isWinner ? 0.74 : 0.58, delay: profile.delay + 0.12, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          width: profile.lineGlowWidth, height: 1,
          marginLeft: -(profile.lineGlowWidth / 2),
          background: `linear-gradient(90deg, transparent 0%, ${palette.rayCore} 50%, transparent 100%)`,
          boxShadow: `0 0 10px ${palette.rayCore}`,
        }}
      />

      {/* Sparks. */}
      {SPARKS.slice(0, isWinner ? 14 : 8).map((spark, idx) => {
        const dx = Math.cos((spark.angle * Math.PI) / 180) * spark.distance * profile.sparkScale;
        const dy = Math.sin((spark.angle * Math.PI) / 180) * spark.distance * profile.sparkScale;
        const driftJitterX = ((idx % 3) - 1) * 7;
        const size = spark.size * (isWinner ? 1 : 0.72);

        return (
          <motion.span
            key={`${id}-${anchor.id}-spark-${idx}`}
            className="absolute block rounded-full"
            style={{
              left: `${spark.x}%`, top: `${spark.y}%`,
              width: 7 * size, height: 7 * size,
              background: spark.drift ? palette.rayCore : palette.spark,
              boxShadow: `0 0 ${10 * size}px ${spark.drift ? palette.flash : palette.spark}`,
              marginLeft: -3.5 * size, marginTop: -3.5 * size,
            }}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.3 }}
            animate={spark.drift ? {
              x: [0, dx * 0.3, dx * 0.5 + driftJitterX],
              y: [0, dy * 0.4, dy - 32],
              opacity: [0, isWinner ? 0.86 : 0.58, 0],
              scale: [0.3, 0.94, 0.26],
            } : {
              x: [0, dx * 0.42, dx],
              y: [0, dy * 0.38, dy + 8],
              opacity: [0, isWinner ? 0.96 : 0.68, 0],
              scale: [0.3, 1.08, 0.48],
            }}
            transition={{
              duration: spark.drift ? 1.26 : isWinner ? 0.9 : 0.7,
              delay: profile.delay + spark.delay + 0.06,
              ease: spark.drift ? [0.0, 0.0, 0.58, 1.0] : [0.2, 0.9, 0.24, 1],
            }}
          />
        );
      })}
    </div>
  );
}

export type ClashKick = {
  x: number[] | number;
  y?: number[] | number;
  rotate?: number[] | number;
  scale?: number[];
};

export function buildKickAnimation(side: 'left' | 'right'): ClashKick {
  const dir = side === 'left' ? 1 : -1;
  return {
    x: [0, dir * 6, dir * -2, 0],
    y: [0, -14, -9, -7],
    rotate: [0, dir * 0.85, dir * -0.2, dir * 0.12],
    scale: [1, 1.155, 1.08, 1.1],
  };
}

export function buildLoserKick(side: 'left' | 'right'): ClashKick {
  const dir = side === 'left' ? -1 : 1;
  return {
    x: [0, dir * 18, dir * 14, dir * 12],
    y: [0, 9, 14, 12],
    rotate: [0, dir * -1.2, dir * -2.6, dir * -1.8],
    scale: [1, 0.9, 0.86, 0.88],
  };
}

export type { ClashOutcome, RoundClashAnchorTone, RoundClashEffectsVariant };
