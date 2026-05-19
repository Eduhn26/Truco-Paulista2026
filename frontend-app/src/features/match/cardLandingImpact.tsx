import { AnimatePresence, motion } from 'framer-motion';

import type { CardImpactState } from './useCardImpactFx';

type CardLandingImpactProps = {
  impact: CardImpactState | null;
};

function resolveImpactScale(variant: CardImpactState['variant']): number {
  switch (variant) {
    case 'opponent':
      return 1.08;
    case 'seat':
      return 0.96;
    case 'own':
    default:
      return 1;
  }
}

export function CardLandingImpact({ impact }: CardLandingImpactProps) {
  return (
    <AnimatePresence>
      {impact ? (
        <motion.div
          key={impact.key}
          aria-hidden
          className="pointer-events-none absolute z-[88]"
          initial={{ opacity: 0, scale: 0.72, x: '-50%', y: '-50%' }}
          animate={{
            opacity: [0, 0.78, 0.36, 0],
            scale: [0.72, 1, 1.18, 1.34],
            x: '-50%',
            y: '-50%',
          }}
          exit={{ opacity: 0, scale: 1.18, transition: { duration: 0.1 } }}
          transition={{ duration: 0.38, times: [0, 0.22, 0.62, 1], ease: 'easeOut' }}
          style={{
            left: impact.point.left,
            top: impact.point.top,
          }}
        >
          <div
            className="relative rounded-full"
            style={{
              width: 154 * resolveImpactScale(impact.variant),
              height: 58 * resolveImpactScale(impact.variant),
              background: [
                'radial-gradient(ellipse at center, rgba(255,232,166,0.34) 0%, ',
                'rgba(201,168,76,0.18) 36%, rgba(201,168,76,0.06) 58%, ',
                'rgba(201,168,76,0) 72%)',
              ].join(''),
              boxShadow:
                '0 0 18px rgba(255,232,166,0.20), inset 0 0 18px rgba(255,255,255,0.08)',
            }}
          >
            <motion.span
              className="absolute left-1/2 top-1/2 block rounded-full border"
              initial={{ opacity: 0.64, scaleX: 0.56, scaleY: 0.38 }}
              animate={{
                opacity: [0.64, 0.34, 0],
                scaleX: [0.56, 1, 1.22],
                scaleY: [0.38, 0.72, 0.88],
              }}
              transition={{ duration: 0.34, ease: 'easeOut' }}
              style={{
                width: '100%',
                height: '100%',
                marginLeft: '-50%',
                marginTop: '-50%',
                borderColor: 'rgba(255,232,166,0.34)',
              }}
            />
            <span
              className="absolute left-1/2 top-1/2 block rounded-full"
              style={{
                width: '66%',
                height: '46%',
                marginLeft: '-33%',
                marginTop: '-23%',
                background: [
                  'radial-gradient(ellipse at center, rgba(0,0,0,0.26) 0%, ',
                  'rgba(0,0,0,0.16) 44%, rgba(0,0,0,0) 78%)',
                ].join(''),
              }}
            />
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
