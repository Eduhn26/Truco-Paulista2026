import type { CSSProperties } from 'react';
import { motion, type MotionStyle } from 'framer-motion';

export type RoundVerdictPlaqueTone = 'ours' | 'theirs' | 'tie';

type RoundVerdictPlaqueProps = {
  tone: RoundVerdictPlaqueTone;
  title: string;
  detail: string;
  style: CSSProperties;
  variant?: 'one-vs-one' | 'two-vs-two';
};

type PlaqueVisuals = {
  panelBg: string;
  border: string;
  rail: string;
  accent: string;
  accentSoft: string;
  title: string;
  detail: string;
  medallionBg: string;
  medallionBorder: string;
  medallionLabel: string;
  medallionIcon: string;
  glow: string;
  shadowTint: string;
};

const PLAQUE_VISUALS: Record<RoundVerdictPlaqueTone, PlaqueVisuals> = {
  ours: {
    panelBg:
      'linear-gradient(135deg, rgba(63,43,10,0.985) 0%, rgba(32,22,8,0.98) 50%, rgba(8,7,5,0.99) 100%)',
    border: 'rgba(255,223,128,0.50)',
    rail: 'rgba(255,223,128,0.86)',
    accent: '#f2d488',
    accentSoft: 'rgba(255,223,128,0.24)',
    title: '#fff1b8',
    detail: 'rgba(255,248,225,0.78)',
    medallionBg:
      'radial-gradient(circle at 35% 22%, rgba(255,250,219,0.98) 0%, rgba(255,223,128,0.92) 25%, rgba(201,168,76,0.98) 60%, rgba(68,43,12,0.99) 100%)',
    medallionBorder: 'rgba(255,241,184,0.72)',
    medallionLabel: 'NÓS',
    medallionIcon: '♛',
    glow: 'rgba(242,212,136,0.34)',
    shadowTint: 'rgba(201,168,76,0.20)',
  },
  theirs: {
    panelBg:
      'linear-gradient(135deg, rgba(57,13,18,0.98) 0%, rgba(31,12,14,0.975) 50%, rgba(8,7,7,0.99) 100%)',
    border: 'rgba(248,113,113,0.38)',
    rail: 'rgba(248,113,113,0.72)',
    accent: '#f2d488',
    accentSoft: 'rgba(248,113,113,0.20)',
    title: '#fff1d6',
    detail: 'rgba(255,232,224,0.74)',
    medallionBg:
      'radial-gradient(circle at 35% 22%, rgba(255,241,184,0.88) 0%, rgba(232,199,106,0.72) 25%, rgba(127,29,29,0.98) 63%, rgba(20,6,7,0.99) 100%)',
    medallionBorder: 'rgba(248,113,113,0.58)',
    medallionLabel: 'ELES',
    medallionIcon: '◆',
    glow: 'rgba(220,38,38,0.30)',
    shadowTint: 'rgba(220,38,38,0.16)',
  },
  tie: {
    panelBg:
      'linear-gradient(135deg, rgba(30,41,59,0.97) 0%, rgba(15,23,42,0.97) 50%, rgba(6,10,18,0.99) 100%)',
    border: 'rgba(203,213,225,0.34)',
    rail: 'rgba(203,213,225,0.60)',
    accent: '#e2e8f0',
    accentSoft: 'rgba(148,163,184,0.20)',
    title: '#f8fafc',
    detail: 'rgba(226,232,240,0.72)',
    medallionBg:
      'radial-gradient(circle at 35% 22%, rgba(248,250,252,0.82) 0%, rgba(203,213,225,0.66) 25%, rgba(71,85,105,0.98) 63%, rgba(15,23,42,0.99) 100%)',
    medallionBorder: 'rgba(203,213,225,0.52)',
    medallionLabel: 'EMPATE',
    medallionIcon: '◆',
    glow: 'rgba(148,163,184,0.26)',
    shadowTint: 'rgba(148,163,184,0.15)',
  },
};

export function RoundVerdictPlaque({
  tone,
  title,
  detail,
  style,
  variant = 'one-vs-one',
}: RoundVerdictPlaqueProps) {
  const visuals = PLAQUE_VISUALS[tone];
  const isCompact = variant === 'two-vs-two';

  return (
    <motion.div
      className="pointer-events-none absolute z-30 overflow-visible"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Resultado da vaza: ${title}. ${detail}`}
      initial={{ opacity: 0, x: -22, y: 14, scale: 0.92, filter: 'blur(1.5px)' }}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: -10, y: 8, scale: 0.96, filter: 'blur(1px)' }}
      transition={{ duration: 0.48, ease: [0.2, 0.9, 0.24, 1] }}
      style={style as MotionStyle}
    >
      <motion.div
        aria-hidden
        className="absolute -inset-5 rounded-[34px]"
        initial={{ opacity: 0, scale: 0.86 }}
        animate={{ opacity: [0.16, 0.4, 0.24], scale: [0.94, 1.045, 1] }}
        transition={{ duration: 1.55, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: `radial-gradient(ellipse at 28% 52%, ${visuals.glow} 0%, transparent 72%)`,
          filter: 'blur(13px)',
        }}
      />

      <div
        className={`relative flex items-center gap-2.5 overflow-hidden rounded-[22px] backdrop-blur-xl ${
          isCompact ? 'min-h-[86px] px-3.5 py-2.5' : 'min-h-[90px] px-3.5 py-2.5'
        }`}
        style={{
          background: visuals.panelBg,
          border: `1px solid ${visuals.border}`,
          boxShadow: [
            '0 18px 38px rgba(0,0,0,0.46)',
            `0 0 24px ${visuals.glow}`,
            `0 0 0 1px ${visuals.shadowTint}`,
            'inset 0 1px 0 rgba(255,255,255,0.09)',
            'inset 0 -10px 24px rgba(0,0,0,0.22)',
          ].join(', '),
        }}
      >
        <div
          aria-hidden
          className="absolute left-4 right-4 top-0 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${visuals.accent} 50%, transparent 100%)`,
            opacity: 0.76,
          }}
        />

        <div
          aria-hidden
          className="absolute bottom-0 left-4 right-4 h-px"
          style={{
            background: `linear-gradient(90deg, transparent 0%, ${visuals.rail} 50%, transparent 100%)`,
            opacity: 0.48,
          }}
        />

        <div
          aria-hidden
          className="absolute bottom-3 left-0 top-3 w-[3px] rounded-full"
          style={{
            background: `linear-gradient(180deg, transparent 0%, ${visuals.rail} 45%, transparent 100%)`,
            boxShadow: `0 0 11px ${visuals.glow}`,
          }}
        />

        <motion.div
          aria-hidden
          className="absolute -right-12 -top-14 h-32 w-32 rounded-full"
          initial={{ opacity: 0.36, scale: 0.88 }}
          animate={{ opacity: [0.34, 0.54, 0.34], scale: [0.9, 1.06, 0.96] }}
          transition={{ duration: 1.65, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: `radial-gradient(circle, ${visuals.accentSoft} 0%, transparent 68%)`,
            filter: 'blur(8px)',
          }}
        />

        <motion.div
          className="relative flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full"
          initial={{ rotate: -9, scale: 0.82 }}
          animate={{ rotate: [-9, 4, 0], scale: [0.82, 1.1, 1] }}
          transition={{ duration: 0.46, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            background: visuals.medallionBg,
            border: `1px solid ${visuals.medallionBorder}`,
            boxShadow: `0 0 19px ${visuals.glow}, inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -7px 14px rgba(0,0,0,0.38)`,
          }}
        >
          <div
            aria-hidden
            className="absolute inset-[5px] rounded-full"
            style={{
              border: '1px solid rgba(255,241,184,0.24)',
              boxShadow: 'inset 0 0 13px rgba(0,0,0,0.40)',
            }}
          />

          <span
            aria-hidden
            className="absolute top-2.5 text-[11px] leading-none"
            style={{
              color: '#fff1b8',
              filter: 'drop-shadow(0 2px 5px rgba(0,0,0,0.44))',
            }}
          >
            {visuals.medallionIcon}
          </span>

          <span
            className="relative mt-3.5 text-center text-[9.5px] font-black uppercase leading-none tracking-[0.11em]"
            style={{
              color: '#fff1b8',
              fontFamily: 'Georgia, serif',
              textShadow: '0 2px 6px rgba(0,0,0,0.56)',
            }}
          >
            {visuals.medallionLabel}
          </span>
        </motion.div>

        <div className="relative min-w-0 flex-1">
          <div
            className="text-[7.5px] font-black uppercase leading-none tracking-[0.24em]"
            style={{
              color: visuals.accent,
              fontFamily: 'Georgia, serif',
              textShadow: `0 0 8px ${visuals.glow}`,
            }}
          >
            Resultado da vaza
          </div>

          <div
            className="mt-1.5 text-[17px] font-black uppercase leading-[1.05] tracking-[0.07em]"
            style={{
              color: visuals.title,
              fontFamily: 'Georgia, serif',
              textShadow: '0 3px 12px rgba(0,0,0,0.52)',
            }}
          >
            {title.toLocaleUpperCase('pt-BR')}
          </div>

          <div
            className="mt-2 h-px w-full"
            style={{
              background: `linear-gradient(90deg, ${visuals.rail} 0%, rgba(255,255,255,0.15) 48%, transparent 100%)`,
            }}
          />

          <div
            className="mt-1.5 truncate text-[9px] font-black tracking-[0.07em]"
            style={{
              color: visuals.detail,
              fontFamily: 'Georgia, serif',
            }}
          >
            {detail}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
