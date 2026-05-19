import { motion } from 'framer-motion';

export type PremiumOutcome = 'win' | 'loss' | 'tie' | 'team-win' | null;

const SEAL_LABEL_BY_OUTCOME: Record<NonNullable<PremiumOutcome>, string> = {
  win: 'VENCEU',
  loss: 'PERDEU',
  tie: 'EMPATE',
  'team-win': 'DUPLA',
};

type SealVisuals = {
  background: string;
  border: string;
  shadow: string;
  color: string;
  textShadow: string;
  edgeGlow: string;
  insetHighlight: string;
};

const SEAL_VISUALS: Record<NonNullable<PremiumOutcome>, SealVisuals> = {
  win: {
    background:
      'linear-gradient(180deg, rgba(255,245,206,0.98) 0%, rgba(242,212,136,0.98) 34%, rgba(201,168,76,0.98) 72%, rgba(111,79,20,0.98) 100%)',
    border: '1px solid rgba(255,241,184,0.92)',
    shadow:
      '0 8px 18px rgba(0,0,0,0.54), 0 0 24px rgba(201,168,76,0.26), inset 0 1px 0 rgba(255,255,255,0.62), inset 0 -1px 0 rgba(74,56,17,0.56)',
    color: '#160f03',
    textShadow: '0 1px 0 rgba(255,255,255,0.42)',
    edgeGlow: '0 0 0 1px rgba(255,223,128,0.18)',
    insetHighlight:
      'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 38%, transparent 100%)',
  },
  loss: {
    background:
      'linear-gradient(180deg, rgba(76,17,15,0.98) 0%, rgba(42,9,8,0.98) 56%, rgba(17,7,7,0.98) 100%)',
    border: '1px solid rgba(192,57,43,0.54)',
    shadow:
      '0 8px 16px rgba(0,0,0,0.58), 0 0 18px rgba(122,26,24,0.22), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.58)',
    color: '#f3d4d1',
    textShadow: '0 1px 0 rgba(0,0,0,0.68)',
    edgeGlow: '0 0 0 1px rgba(192,57,43,0.12)',
    insetHighlight:
      'linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.03) 30%, transparent 100%)',
  },
  tie: {
    background:
      'linear-gradient(180deg, rgba(248,250,252,0.98) 0%, rgba(203,213,225,0.98) 60%, rgba(148,163,184,0.98) 100%)',
    border: '1px solid rgba(255,255,255,0.92)',
    shadow:
      '0 7px 16px rgba(0,0,0,0.50), 0 0 18px rgba(148,163,184,0.20), inset 0 1px 0 rgba(255,255,255,0.74), inset 0 -1px 0 rgba(71,85,105,0.44)',
    color: '#1e293b',
    textShadow: '0 1px 0 rgba(255,255,255,0.54)',
    edgeGlow: '0 0 0 1px rgba(226,232,240,0.18)',
    insetHighlight:
      'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.06) 34%, transparent 100%)',
  },
  'team-win': {
    background:
      'linear-gradient(180deg, rgba(244,223,160,0.98) 0%, rgba(215,184,90,0.98) 58%, rgba(138,103,33,0.98) 100%)',
    border: '1px solid rgba(255,241,184,0.82)',
    shadow:
      '0 7px 16px rgba(0,0,0,0.50), 0 0 18px rgba(201,168,76,0.20), inset 0 1px 0 rgba(255,255,255,0.44), inset 0 -1px 0 rgba(74,56,17,0.44)',
    color: '#1a1204',
    textShadow: '0 1px 0 rgba(255,255,255,0.34)',
    edgeGlow: '0 0 0 1px rgba(255,223,128,0.14)',
    insetHighlight:
      'linear-gradient(180deg, rgba(255,255,255,0.28) 0%, rgba(255,255,255,0.07) 34%, transparent 100%)',
  },
};

/**
 * Premium verdict badge anchored to the lower card edge.
 *
 * NOTE: The badge intentionally crosses the lower boundary of the card so the
 * verdict feels attached to the played card instead of floating like a pill.
 */
export function PremiumOutcomeSeal({
  outcome,
  delayMs = 0,
  label: customLabel,
  compact = false,
}: {
  outcome: PremiumOutcome;
  delayMs?: number;
  label?: string | null;
  compact?: boolean;
}) {
  if (!outcome) {
    return null;
  }

  const visuals = SEAL_VISUALS[outcome];
  const label = customLabel ?? SEAL_LABEL_BY_OUTCOME[outcome];
  const isLoss = outcome === 'loss';
  const isTie = outcome === 'tie';

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-30"
      style={{
        top: compact ? -12 : -16,
        right: compact ? -24 : -30,
        transform: `rotate(${isLoss ? '4deg' : isTie ? '1deg' : '-4deg'})`,
      }}
      initial={{ opacity: 0, scale: 0.68, y: 6, x: -4 }}
      animate={{
        opacity: 1,
        scale: [0.68, 1.1, 1],
        y: 0,
        x: 0,
      }}
      transition={{
        duration: 0.42,
        delay: delayMs / 1000,
        times: [0, 0.58, 1],
        ease: [0.2, 0.9, 0.24, 1],
      }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          minWidth: compact ? 50 : 64,
          padding: compact ? '4px 8px 5px' : '5px 10px 6px',
          borderRadius: 999,
          background: visuals.background,
          border: visuals.border,
          boxShadow: `${visuals.shadow}, ${visuals.edgeGlow}`,
        }}
      >
        {/* NOTE: The corner seal keeps verdicts attached to the card without covering the rank. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-[1px]"
          style={{
            borderRadius: 999,
            background: visuals.insetHighlight,
          }}
        />

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-[8px] top-[1px] h-px"
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.58) 50%, transparent 100%)',
            opacity: isLoss ? 0.28 : 0.62,
          }}
        />

        <span
          className={`relative block text-center font-black uppercase leading-none ${
            compact ? 'text-[7px] tracking-[0.14em]' : 'text-[8px] tracking-[0.16em]'
          }`}
          style={{
            fontFamily: 'Georgia, serif',
            color: visuals.color,
            textShadow: visuals.textShadow,
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      </div>
    </motion.div>
  );
}

/**
 * One-shot felt pulse behind the winning card.
 *
 * NOTE: This stays deliberately grounded on the table felt to avoid the old
 * rotating chrome feeling.
 */
export function PremiumWinnerRays({
  size = 460,
  intensity = 1,
  tone = 'gold',
}: {
  size?: number;
  intensity?: number;
  tone?: 'gold' | 'rival' | 'silver';
}) {
  const palette =
    tone === 'rival'
      ? {
          core: 'rgba(255,226,226,0.66)',
          flare: 'rgba(248,113,113,0.34)',
          pool: 'rgba(127,29,29,0.16)',
          felt: 'rgba(127,29,29,0.14)',
          dust: 'rgba(252,165,165,0.56)',
        }
      : tone === 'silver'
        ? {
            core: 'rgba(248,250,252,0.58)',
            flare: 'rgba(226,232,240,0.30)',
            pool: 'rgba(148,163,184,0.14)',
            felt: 'rgba(148,163,184,0.12)',
            dust: 'rgba(226,232,240,0.50)',
          }
        : {
            core: 'rgba(255,244,214,0.72)',
            flare: 'rgba(255,223,128,0.38)',
            pool: 'rgba(201,168,76,0.18)',
            felt: 'rgba(201,168,76,0.16)',
            dust: 'rgba(255,223,128,0.56)',
          };

  const embers = [
    { x: -22, y: -16, size: 1.8, delay: 0.08 },
    { x: 22, y: -18, size: 1.6, delay: 0.14 },
    { x: -26, y: 12, size: 1.4, delay: 0.16 },
    { x: 26, y: 14, size: 1.5, delay: 0.1 },
  ] as const;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2"
      style={{
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        zIndex: -1,
        overflow: 'visible',
      }}
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: intensity, scale: 1 }}
      transition={{ duration: 0.48, ease: [0.2, 0.9, 0.24, 1] }}
    >
      <motion.div
        className="absolute left-1/2 top-[61%] rounded-full"
        initial={{ opacity: 0, scale: 0.62 }}
        animate={{
          opacity: [0, 0.58 * intensity, 0.3 * intensity],
          scale: [0.62, 1.12, 1.02],
        }}
        transition={{
          duration: 0.86,
          times: [0, 0.48, 1],
          ease: [0.2, 0.9, 0.24, 1],
        }}
        style={{
          width: size * 0.78,
          height: size * 0.26,
          marginLeft: -(size * 0.78) / 2,
          marginTop: -(size * 0.26) / 2,
          background: `radial-gradient(ellipse at 50% 50%, ${palette.core} 0%, ${palette.felt} 34%, transparent 72%)`,
          filter: 'blur(18px)',
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[61%] rounded-full"
        initial={{ opacity: 0, scaleX: 0.5, scaleY: 0.42 }}
        animate={{
          opacity: [0, 0.4 * intensity, 0.16 * intensity],
          scaleX: [0.5, 1.1, 0.92],
          scaleY: [0.42, 1, 0.7],
        }}
        transition={{
          duration: 0.72,
          times: [0, 0.42, 1],
          ease: [0.2, 0.9, 0.24, 1],
        }}
        style={{
          width: size * 0.52,
          height: size * 0.13,
          marginLeft: -(size * 0.52) / 2,
          marginTop: -(size * 0.13) / 2,
          border: `1px solid ${palette.flare}`,
          boxShadow: `0 0 16px ${palette.pool}, inset 0 0 18px ${palette.pool}`,
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[52%] rounded-full"
        initial={{ opacity: 0, scale: 0.36 }}
        animate={{
          opacity: [0, 0.72 * intensity, 0.24 * intensity],
          scale: [0.36, 1.08, 0.86],
        }}
        transition={{
          duration: 0.56,
          times: [0, 0.38, 1],
          ease: [0.2, 0.9, 0.24, 1],
        }}
        style={{
          width: size * 0.13,
          height: size * 0.13,
          marginLeft: -(size * 0.13) / 2,
          marginTop: -(size * 0.13) / 2,
          background: `radial-gradient(circle, ${palette.core} 0%, ${palette.flare} 36%, transparent 72%)`,
          boxShadow: `0 0 22px ${palette.flare}`,
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[52%] h-[2px] rounded-full"
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{
          opacity: [0, 0.36 * intensity, 0.06 * intensity],
          scaleX: [0, 1, 0.78],
        }}
        transition={{
          duration: 0.66,
          times: [0, 0.34, 1],
          ease: [0.2, 0.9, 0.24, 1],
        }}
        style={{
          width: size * 0.48,
          marginLeft: -(size * 0.48) / 2,
          transformOrigin: '50% 50%',
          background: `linear-gradient(90deg, transparent 0%, ${palette.flare} 24%, ${palette.core} 50%, ${palette.flare} 76%, transparent 100%)`,
          boxShadow: `0 0 10px ${palette.flare}, 0 0 16px ${palette.pool}`,
        }}
      />

      <motion.div
        className="absolute left-1/2 top-[52%] h-px rounded-full"
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{
          opacity: [0, 0.42 * intensity, 0],
          scaleX: [0, 0.82, 0.56],
        }}
        transition={{
          duration: 0.48,
          delay: 0.05,
          ease: [0.2, 0.9, 0.24, 1],
        }}
        style={{
          width: size * 0.38,
          marginLeft: -(size * 0.38) / 2,
          background: `linear-gradient(90deg, transparent 0%, ${palette.core} 50%, transparent 100%)`,
          boxShadow: `0 0 7px ${palette.core}`,
        }}
      />

      {embers.map((ember, index) => (
        <motion.span
          key={`winner-impact-ember-${index}`}
          className="absolute left-1/2 top-[52%] rounded-full"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.42 }}
          animate={{
            opacity: [0, 0.28 * intensity, 0],
            x: [0, ember.x],
            y: [0, ember.y],
            scale: [0.42, 0.88, 0.48],
          }}
          transition={{
            duration: 0.62,
            delay: ember.delay,
            ease: [0.2, 0.9, 0.24, 1],
          }}
          style={{
            width: ember.size,
            height: ember.size,
            marginLeft: -(ember.size / 2),
            marginTop: -(ember.size / 2),
            background: palette.dust,
            boxShadow: `0 0 ${ember.size * 3}px ${palette.dust}`,
          }}
        />
      ))}
    </motion.div>
  );
}

export function PremiumWinnerSheen({ borderRadius = 18 }: { borderRadius?: number }) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        inset: 0,
        borderRadius,
        overflow: 'hidden',
        mixBlendMode: 'overlay',
        opacity: 0.7,
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.55) 50%, transparent 65%)',
          backgroundSize: '300% 100%',
        }}
        initial={{ backgroundPosition: '120% 50%' }}
        animate={{ backgroundPosition: '-30% 50%' }}
        transition={{
          duration: 1.4,
          ease: 'easeOut',
          repeat: Infinity,
          repeatDelay: 1.6,
        }}
      />
    </motion.div>
  );
}

export function PremiumLoserBurn({
  borderRadius = 18,
  delayMs = 0,
}: {
  borderRadius?: number;
  delayMs?: number;
}) {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        inset: -2,
        borderRadius: borderRadius + 2,
        overflow: 'hidden',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.46, delay: delayMs / 1000 }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at 50% 80%, rgba(122,26,24,0.55) 0%, transparent 60%), radial-gradient(ellipse at 30% 30%, rgba(0,0,0,0.42) 0%, transparent 70%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius,
          border: '1px solid rgba(192,57,43,0.42)',
        }}
      />
    </motion.div>
  );
}

export function PremiumTieArc({
  width = 640,
  axis = 'horizontal',
}: {
  width?: number;
  axis?: 'horizontal' | 'vertical';
}) {
  const isVertical = axis === 'vertical';

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute z-[5]"
      style={{
        left: '50%',
        top: '50%',
        width: isVertical ? 4 : width,
        height: isVertical ? width : 4,
        transform: 'translate(-50%, -50%)',
        background: isVertical
          ? 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)'
          : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.85) 50%, transparent 100%)',
        boxShadow: '0 0 18px rgba(255,255,255,0.6), 0 0 36px rgba(160,200,255,0.3)',
      }}
      initial={{ opacity: 0, scaleX: isVertical ? 1 : 0.4, scaleY: isVertical ? 0.4 : 1 }}
      animate={{
        opacity: [0, 0.85, 0.55, 0.85, 0.55],
        scaleX: isVertical ? 1 : [0.4, 1, 0.95, 1, 0.95],
        scaleY: isVertical ? [0.4, 1, 0.95, 1, 0.95] : 1,
      }}
      transition={{
        duration: 1.2,
        times: [0, 0.18, 0.4, 0.7, 1],
        repeat: Infinity,
        repeatDelay: 0.4,
        ease: 'easeInOut',
      }}
    />
  );
}

export function PremiumPartnerGlow({ side = 'ours' }: { side?: 'ours' | 'theirs' }) {
  const color = side === 'ours' ? 'rgba(255,223,128,0.24)' : 'rgba(248,113,113,0.22)';
  const tail = side === 'ours' ? 'rgba(201,168,76,0.07)' : 'rgba(127,29,29,0.06)';

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        inset: -28,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, ${tail} 45%, transparent 75%)`,
        filter: 'blur(20px)',
        zIndex: -1,
      }}
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.2, 0.9, 0.24, 1] }}
    />
  );
}

