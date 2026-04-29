import { AnimatePresence, motion } from 'framer-motion';
import { useId, useMemo } from 'react';

type ClashOutcome = 'win' | 'loss' | 'tie';

type RoundClashEffectsProps = {
  outcome: ClashOutcome | null;
  clashKey: string | number;
  isOpen: boolean;
};

type OutcomePalette = {
  ray: string;
  rayMid: string;
  rayCore: string;
  rayEdge: string;
  spark: string;
  flash: string;
  haze: string;
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
  },
  loss: {
    ray: 'rgba(248, 113, 113, 0.98)',
    rayMid: 'rgba(220, 38, 38, 1)',
    rayCore: 'rgba(255, 226, 226, 0.96)',
    rayEdge: 'rgba(127, 29, 29, 0)',
    spark: '#F87171',
    flash: 'rgba(220, 38, 38, 0.58)',
    haze: 'rgba(127, 29, 29, 0.22)',
  },
  tie: {
    ray: 'rgba(226, 232, 240, 0.92)',
    rayMid: 'rgba(148, 163, 184, 1)',
    rayCore: 'rgba(248, 250, 252, 0.96)',
    rayEdge: 'rgba(71, 85, 105, 0)',
    spark: '#CBD5E1',
    flash: 'rgba(203, 213, 225, 0.42)',
    haze: 'rgba(148, 163, 184, 0.15)',
  },
};

type Spark = {
  x: number;
  y: number;
  size: number;
  delay: number;
  angle: number;
  distance: number;
};

const SPARKS: Spark[] = [
  { x: 50, y: 50, size: 1.08, delay: 0, angle: 0, distance: 72 },
  { x: 50, y: 50, size: 0.92, delay: 0.01, angle: 180, distance: 72 },
  { x: 42, y: 45, size: 0.78, delay: 0.03, angle: -152, distance: 56 },
  { x: 58, y: 45, size: 0.78, delay: 0.03, angle: -28, distance: 56 },
  { x: 38, y: 57, size: 0.62, delay: 0.06, angle: 158, distance: 48 },
  { x: 62, y: 57, size: 0.62, delay: 0.06, angle: 22, distance: 48 },
  { x: 50, y: 38, size: 0.58, delay: 0.07, angle: -90, distance: 46 },
  { x: 50, y: 62, size: 0.58, delay: 0.07, angle: 90, distance: 46 },
  { x: 45, y: 52, size: 0.5, delay: 0.1, angle: 205, distance: 38 },
  { x: 55, y: 52, size: 0.5, delay: 0.1, angle: -25, distance: 38 },
];

export function RoundClashEffects({ outcome, clashKey, isOpen }: RoundClashEffectsProps) {
  const palette = useMemo(() => (outcome ? OUTCOME_PALETTE[outcome] : null), [outcome]);
  const id = useId();

  if (!palette || !outcome) {
    return null;
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          key={`clash-fx-${clashKey}-${outcome}`}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[15]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.38 }}
        >
          <motion.div
            className="absolute left-1/2 top-1/2 h-[178px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ opacity: 0, scale: 0.68 }}
            animate={{ opacity: [0, 0.72, 0.34, 0.12], scale: [0.68, 1.08, 1.18, 1.1] }}
            transition={{ duration: 1.28, times: [0, 0.22, 0.62, 1], ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              background: `radial-gradient(ellipse at 50% 50%, ${palette.flash} 0%, ${palette.haze} 38%, transparent 74%)`,
              filter: 'blur(16px)',
            }}
          />

          <motion.div
            className="absolute left-1/2 top-1/2 h-[78px] w-[78px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ opacity: 0, scale: 0.34, rotate: -28 }}
            animate={{ opacity: [0, 1, 0.46, 0], scale: [0.34, 1.22, 0.96, 0.72], rotate: 18 }}
            transition={{ duration: 0.92, times: [0, 0.34, 0.68, 1], ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              background: `radial-gradient(circle, ${palette.rayCore} 0%, ${palette.flash} 34%, transparent 72%)`,
              boxShadow: `0 0 34px ${palette.flash}`,
            }}
          />

          <motion.div
            className="absolute left-1/2 top-1/2 h-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: [0, 1.14, 1, 0.92], opacity: [0, 1, 0.92, 0.18] }}
            transition={{ duration: 1.02, times: [0, 0.3, 0.72, 1], ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              width: 408,
              transformOrigin: '50% 50%',
              background: `linear-gradient(90deg, ${palette.rayEdge} 0%, ${palette.ray} 19%, ${palette.rayCore} 50%, ${palette.ray} 81%, ${palette.rayEdge} 100%)`,
              boxShadow: `0 0 22px ${palette.ray}, 0 0 44px ${palette.flash}`,
            }}
          />

          <motion.div
            className="absolute left-1/2 top-1/2 h-[1px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: [0, 1, 0.88], opacity: [0, 0.88, 0] }}
            transition={{ duration: 0.82, delay: 0.16, ease: [0.2, 0.9, 0.24, 1] }}
            style={{
              width: 286,
              background: `linear-gradient(90deg, transparent 0%, ${palette.rayCore} 50%, transparent 100%)`,
              boxShadow: `0 0 12px ${palette.rayCore}`,
            }}
          />

          {SPARKS.map((spark, idx) => {
            const dx = Math.cos((spark.angle * Math.PI) / 180) * spark.distance;
            const dy = Math.sin((spark.angle * Math.PI) / 180) * spark.distance;

            return (
              <motion.span
                key={`${id}-spark-${idx}`}
                className="absolute block rounded-full"
                style={{
                  left: `${spark.x}%`,
                  top: `${spark.y}%`,
                  width: 7 * spark.size,
                  height: 7 * spark.size,
                  background: palette.spark,
                  boxShadow: `0 0 ${10 * spark.size}px ${palette.spark}`,
                  marginLeft: -3.5 * spark.size,
                  marginTop: -3.5 * spark.size,
                }}
                initial={{ x: 0, y: 0, opacity: 0, scale: 0.34 }}
                animate={{
                  x: [0, dx * 0.42, dx],
                  y: [0, dy * 0.38, dy + 10],
                  opacity: [0, 1, 0],
                  scale: [0.34, 1.16, 0.54],
                }}
                transition={{ duration: 0.92, delay: spark.delay + 0.08, ease: [0.2, 0.9, 0.24, 1] }}
              />
            );
          })}
        </motion.div>
      ) : null}
    </AnimatePresence>
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
    x: [0, dir * 13, dir * -5, 0],
    y: [0, -5, -2, 0],
    rotate: [0, dir * 0.9, dir * -0.35, 0],
    scale: [1, 1.08, 1.02, 1.04],
  };
}

export function buildLoserKick(side: 'left' | 'right'): ClashKick {
  const dir = side === 'left' ? -1 : 1;

  return {
    x: [0, dir * 16, dir * 10, dir * 8],
    y: [0, 6, 8, 7],
    rotate: [0, dir * -1.2, dir * -2.2, dir * -1.7],
    scale: [1, 0.94, 0.92, 0.93],
  };
}

export type { ClashOutcome };


