import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { Rank } from '../../services/socket/socketTypes';

const SUIT_SYMBOL_MAP: Record<string, string> = {
  P: '♣',
  O: '♦',
  C: '♥',
  E: '♠',
};

type ViraRevealProps = {
  rank: Rank;
  suit: string;
  isRed?: boolean;
  manilhaLabel?: string;
  onComplete?: () => void;
};

type Phase = 'title' | 'deck-in' | 'cut' | 'draw' | 'flip' | 'seal' | 'done';

type Spark = {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
};

const DEALER_REVEAL_COMPLETE_MS = 2720;

const GOLD_SPARKS: Spark[] = Array.from({ length: 18 }, (_, index) => {
  const angle = (Math.PI * 2 * index) / 18;
  const radius = 60 + (index % 5) * 9;

  return {
    id: index,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    size: 2.4 + (index % 4) * 0.9,
    delay: 0.04 + index * 0.018,
  };
});

export function ViraRevealAnimation({
  rank,
  suit,
  isRed = false,
  manilhaLabel,
  onComplete,
}: ViraRevealProps) {
  const [phase, setPhase] = useState<Phase>('title');
  const timeoutsRef = useRef<number[]>([]);
  const didCompleteRef = useRef(false);
  const symbol = SUIT_SYMBOL_MAP[suit] ?? suit;
  const shouldShowDealerSequence = phase !== 'title';
  const shouldShowRevealedCard = phase === 'flip' || phase === 'seal';

  useEffect(() => {
    const schedule = (callback: () => void, delay: number) => {
      const timeoutId = window.setTimeout(callback, delay);
      timeoutsRef.current.push(timeoutId);
    };

    schedule(() => setPhase('deck-in'), 520);
    schedule(() => setPhase('cut'), 760);
    schedule(() => setPhase('draw'), 1080);
    schedule(() => setPhase('flip'), 1360);
    schedule(() => setPhase('seal'), 1640);
    schedule(() => {
      if (didCompleteRef.current) {
        return;
      }

      didCompleteRef.current = true;
      setPhase('done');
      onComplete?.();
    }, DEALER_REVEAL_COMPLETE_MS);

    return () => {
      timeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      timeoutsRef.current = [];
    };
  }, [onComplete]);

  if (phase === 'done') {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <motion.div
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase === 'seal' ? 0.76 : 0.68 }}
          transition={{ duration: 0.32 }}
          style={{
            background:
              'radial-gradient(ellipse at 50% 42%, rgba(16,36,24,0.42) 0%, rgba(4,10,9,0.80) 58%, rgba(0,0,0,0.94) 100%)',
          }}
        />

        <motion.div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[360px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          initial={{ opacity: 0, scale: 0.72 }}
          animate={{
            opacity: phase === 'seal' ? [0.42, 0.72, 0.46] : [0.22, 0.48, 0.26],
            scale: phase === 'seal' ? [0.94, 1.16, 1.02] : [0.86, 1.05, 0.96],
          }}
          transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background:
              'radial-gradient(ellipse, rgba(255,241,184,0.22) 0%, rgba(201,168,76,0.14) 34%, rgba(32,87,49,0.08) 52%, transparent 74%)',
            filter: 'blur(28px)',
          }}
        />

        {phase === 'title' ? <NewHandTitlePrologue /> : null}

        <motion.div
          className="absolute top-[15%] text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{
            opacity:
              phase === 'deck-in' || phase === 'cut'
                ? [0, 0.92, 0.76]
                : phase === 'draw'
                  ? 0.28
                  : 0,
            y: phase === 'deck-in' || phase === 'cut' ? 0 : -10,
          }}
          transition={{ duration: 0.32, ease: [0.2, 0.9, 0.24, 1] }}
        >
          <div
            className="text-[10px] font-black uppercase tracking-[0.38em]"
            style={{ color: 'rgba(246,223,160,0.86)' }}
          >
            Nova mão
          </div>
          <div
            className="mt-2 h-px w-48"
            style={{
              background:
                'linear-gradient(90deg, transparent, rgba(255,241,184,0.68), transparent)',
              boxShadow: '0 0 18px rgba(201,168,76,0.26)',
            }}
          />
        </motion.div>

        {shouldShowDealerSequence ? (
          <div
            className="relative flex h-[340px] w-[440px] items-center justify-center"
            style={{ perspective: 1080 }}
          >
            <DealerDeck phase={phase} />

          {phase === 'draw' ? (
            <motion.div
              className="absolute"
              initial={{ opacity: 0, y: 42, rotate: -4, scale: 0.86 }}
              animate={{ opacity: 1, y: -30, rotate: 0, scale: 1.04 }}
              transition={{ duration: 0.34, ease: [0.2, 0.9, 0.24, 1] }}
            >
              <FaceDownCard />
            </motion.div>
          ) : null}

          {phase === 'flip' ? (
            <motion.div
              className="absolute"
              initial={{ rotateY: 0, y: -30, scale: 1.04, rotate: 0 }}
              animate={{ rotateY: 90, y: -36, scale: 1.08, rotate: 1.4 }}
              transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <FaceDownCard />
            </motion.div>
          ) : null}

          {shouldShowRevealedCard ? (
            <motion.div
              className="absolute"
              initial={{ rotateY: -90, y: -36, scale: 1.08, rotate: -1.4 }}
              animate={{
                rotateY: 0,
                y: phase === 'seal' ? -24 : -34,
                scale: phase === 'seal' ? 1.02 : 1.08,
                rotate: 0,
              }}
              transition={{ duration: 0.3, ease: [0.2, 0.9, 0.24, 1] }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              <RevealedViraCard
                rank={rank}
                symbol={symbol}
                isRed={isRed}
                isSealed={phase === 'seal'}
              />

              {phase === 'seal' ? <GoldenSealRing /> : null}

              {phase === 'seal' && manilhaLabel ? (
                <motion.div
                  className="absolute -bottom-14 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-5 py-2"
                  initial={{ opacity: 0, y: -4, scale: 0.94 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, delay: 0.08, ease: [0.2, 0.9, 0.24, 1] }}
                  style={{
                    background: 'rgba(8,12,20,0.88)',
                    border: '1px solid rgba(255,241,184,0.34)',
                    color: 'rgba(255,241,184,0.94)',
                    fontSize: 10,
                    fontWeight: 900,
                    letterSpacing: '0.18em',
                    backdropFilter: 'blur(10px)',
                    boxShadow:
                      '0 0 20px rgba(201,168,76,0.22), 0 16px 28px rgba(0,0,0,0.38)',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    textTransform: 'uppercase',
                  }}
                >
                  {manilhaLabel}
                </motion.div>
              ) : null}

              {phase === 'seal'
                ? GOLD_SPARKS.map((spark) => (
                    <motion.span
                      key={spark.id}
                      className="absolute rounded-full"
                      initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                      animate={{
                        opacity: [0, 0.95, 0],
                        x: [0, spark.x * 0.44, spark.x],
                        y: [0, spark.y * 0.44, spark.y],
                        scale: [0, 1, 0],
                      }}
                      transition={{
                        duration: 0.66,
                        delay: spark.delay,
                        ease: [0.2, 0.9, 0.24, 1],
                      }}
                      style={{
                        left: '50%',
                        top: '50%',
                        width: spark.size,
                        height: spark.size,
                        marginLeft: -(spark.size / 2),
                        marginTop: -(spark.size / 2),
                        background: spark.id % 2 === 0 ? '#fff1b8' : '#e8c76a',
                        boxShadow: `0 0 ${spark.size * 3.4}px rgba(232,199,106,0.82)`,
                      }}
                    />
                  ))
                : null}
            </motion.div>
          ) : null}
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}

function NewHandTitlePrologue() {
  return (
    <motion.div
      className="absolute inset-0 z-20 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <motion.div
        className="relative text-center"
        initial={{ y: 18, scale: 0.92, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        transition={{ duration: 0.36, ease: [0.2, 0.9, 0.24, 1] }}
      >
        <motion.div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[150px] w-[min(520px,70vw)] -translate-x-1/2 -translate-y-1/2 rounded-full"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: [0, 0.52, 0.32], scale: [0.7, 1.12, 1] }}
          transition={{ duration: 0.62, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            background:
              'radial-gradient(ellipse, rgba(255,241,184,0.30) 0%, rgba(201,168,76,0.12) 38%, transparent 72%)',
            filter: 'blur(24px)',
          }}
        />

        <div
          className="relative select-none"
          style={{
            fontFamily: 'Georgia, serif',
            fontWeight: 900,
            fontSize: 'clamp(48px, 6.2vw, 88px)',
            letterSpacing: '0.08em',
            lineHeight: 1,
            background:
              'linear-gradient(135deg, #fff1b8 0%, #e8c76a 36%, #c9a84c 68%, #7a5520 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.58))',
          }}
        >
          NOVA MÃO
        </div>

        <motion.div
          className="relative mx-auto mt-4 h-px w-[min(420px,58vw)]"
          initial={{ scaleX: 0.18, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 0.88 }}
          transition={{ duration: 0.42, delay: 0.1, ease: [0.2, 0.9, 0.24, 1] }}
          style={{
            background:
              'linear-gradient(90deg, transparent 0%, rgba(255,241,184,0.86) 50%, transparent 100%)',
            boxShadow: '0 0 22px rgba(201,168,76,0.42)',
            transformOrigin: '50% 50%',
          }}
        />

        <motion.div
          className="relative mt-3 text-[10px] font-black uppercase tracking-[0.28em]"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 0.86, y: 0 }}
          transition={{ duration: 0.28, delay: 0.18 }}
          style={{ color: 'rgba(246,223,160,0.82)' }}
        >
          Cortando o baralho
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

function DealerDeck({ phase }: { phase: Phase }) {
  const splitProgress = phase === 'cut' || phase === 'draw' || phase === 'flip' || phase === 'seal';
  const fadeDeck = phase === 'seal';
  const dimDeck = phase === 'flip';

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <motion.div
        aria-hidden
        className="absolute h-[56px] w-[320px] rounded-full"
        initial={{ opacity: 0, scaleX: 0.3 }}
        animate={{ opacity: [0.14, 0.44, 0.22], scaleX: [0.56, 1, 0.9] }}
        transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          top: 210,
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(255,241,184,0.24), rgba(201,168,76,0.12) 42%, transparent 72%)',
          filter: 'blur(9px)',
        }}
      />

      <DeckHalf side="left" split={splitProgress} hidden={fadeDeck} dimmed={dimDeck} />
      <DeckHalf side="right" split={splitProgress} hidden={fadeDeck} dimmed={dimDeck} />

      <motion.div
        aria-hidden
        className="absolute h-px w-[250px]"
        initial={{ opacity: 0, scaleX: 0.24 }}
        animate={{
          opacity: splitProgress && !fadeDeck ? [0, 0.95, 0.16] : 0,
          scaleX: [0.24, 1, 0.76],
        }}
        transition={{ duration: 0.62, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          top: 169,
          background:
            'linear-gradient(90deg, transparent, rgba(255,241,184,0.92), transparent)',
          boxShadow: '0 0 22px rgba(201,168,76,0.42)',
        }}
      />
    </div>
  );
}

function DeckHalf({
  side,
  split,
  hidden,
  dimmed,
}: {
  side: 'left' | 'right';
  split: boolean;
  hidden: boolean;
  dimmed: boolean;
}) {
  const direction = side === 'left' ? -1 : 1;
  const cards = useMemo(() => [0, 1, 2, 3, 4], []);

  return (
    <motion.div
      className="absolute"
      initial={{ opacity: 0, x: direction * 22, y: 14, rotate: direction * 6, scale: 0.88 }}
      animate={{
        opacity: hidden ? 0 : dimmed ? 0.32 : 1,
        x: split ? direction * 72 : direction * 22,
        y: split ? 20 : 12,
        rotate: split ? direction * 8 : direction * 3,
        scale: split ? 0.96 : 1,
      }}
      transition={{ duration: split ? 0.42 : 0.42, ease: [0.2, 0.9, 0.24, 1] }}
      style={{ top: 98 }}
    >
      <div className="relative h-[130px] w-[94px]">
        {cards.map((cardIndex) => (
          <motion.div
            key={`${side}-deck-card-${cardIndex}`}
            className="absolute"
            initial={{ y: -28, opacity: 0 }}
            animate={{ y: cardIndex * 3.2, opacity: 1 }}
            transition={{ duration: 0.3, delay: cardIndex * 0.038, ease: [0.2, 0.9, 0.24, 1] }}
            style={{ x: direction * cardIndex * 2.2, rotate: direction * (cardIndex - 2) * 1.1 }}
          >
            <FaceDownCard compact />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function GoldenSealRing() {
  return (
    <motion.div
      aria-hidden
      className="absolute left-1/2 top-1/2 rounded-full"
      initial={{ opacity: 0, scale: 0.32 }}
      animate={{ opacity: [0, 0.88, 0], scale: [0.32, 2.4, 3.05] }}
      transition={{ duration: 0.82, ease: [0.2, 0.7, 0.2, 1] }}
      style={{
        width: 110,
        height: 110,
        marginLeft: -55,
        marginTop: -55,
        border: '2px solid rgba(255,241,184,0.72)',
        boxShadow: '0 0 18px rgba(255,241,184,0.44)',
      }}
    />
  );
}

function RevealedViraCard({
  rank,
  symbol,
  isRed,
  isSealed,
}: {
  rank: Rank;
  symbol: string;
  isRed: boolean;
  isSealed: boolean;
}) {
  return (
    <motion.div
      className="relative rounded-[18px]"
      animate={
        isSealed
          ? {
              boxShadow: [
                '0 0 0 3px rgba(255,223,128,0.82), 0 0 0 5px rgba(212,177,94,0.38), 0 0 64px 8px rgba(255,210,120,0.52), 0 32px 56px rgba(0,0,0,0.62)',
                '0 0 0 5px rgba(255,241,184,0.98), 0 0 0 9px rgba(232,199,106,0.52), 0 0 96px 18px rgba(255,210,120,0.72), 0 32px 56px rgba(0,0,0,0.62)',
                '0 0 0 3px rgba(255,223,128,0.82), 0 0 0 5px rgba(212,177,94,0.38), 0 0 64px 8px rgba(255,210,120,0.52), 0 32px 56px rgba(0,0,0,0.62)',
              ],
            }
          : {}
      }
      transition={{ duration: 1.05, ease: 'easeInOut' }}
      style={{
        width: 146,
        height: 206,
        background: 'linear-gradient(180deg, #fefdf8 0%, #f8f5ec 50%, #f5f0e4 100%)',
        border: '1px solid rgba(0,0,0,0.14)',
        boxShadow:
          '0 0 0 3px rgba(255,223,128,0.78), 0 0 0 5px rgba(212,177,94,0.34), 0 0 58px 8px rgba(255,210,120,0.48), 0 32px 56px rgba(0,0,0,0.62)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[18px]"
        style={{
          background:
            'linear-gradient(145deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.42) 20%, transparent 38%)',
        }}
      />

      <div
        className="pointer-events-none absolute inset-[7px] rounded-[13px]"
        style={{ border: '1px solid rgba(201,168,76,0.24)' }}
      />

      <div className="absolute left-3 top-2 flex flex-col items-start leading-none">
        <span
          className="text-[30px] font-black"
          style={{
            color: isRed ? '#b91c1c' : '#0f172a',
            fontFamily: 'Cormorant Garamond, Georgia, serif',
          }}
        >
          {rank}
        </span>
        <span className="text-[21px] font-black leading-none" style={{ color: isRed ? '#ef4444' : '#111827' }}>
          {symbol}
        </span>
      </div>

      <div
        className="absolute inset-0 flex items-center justify-center text-[66px] font-black"
        style={{ color: isRed ? '#ef4444' : '#111827', opacity: 0.92 }}
      >
        {symbol}
      </div>

      <div className="absolute bottom-2 right-3 rotate-180 leading-none">
        <span className="text-[21px] font-black" style={{ color: isRed ? '#ef4444' : '#111827' }}>
          {symbol}
        </span>
      </div>

      <motion.div
        className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1"
        initial={{ opacity: 0, y: 4, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.12, duration: 0.26, ease: [0.2, 0.9, 0.24, 1] }}
        style={{
          background: 'linear-gradient(135deg, #fff1b8 0%, #e8c76a 50%, #c9a84c 100%)',
          border: '1px solid rgba(255,241,184,0.72)',
          boxShadow:
            '0 0 20px rgba(201,168,76,0.6), 0 4px 12px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
          color: '#1a0800',
          fontSize: 9,
          fontWeight: 900,
          letterSpacing: '0.28em',
          fontFamily: 'Inter, system-ui, sans-serif',
          whiteSpace: 'nowrap',
        }}
      >
        VIRA
      </motion.div>
    </motion.div>
  );
}

function FaceDownCard({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: compact ? 84 : 146,
        height: compact ? 119 : 206,
        borderRadius: compact ? 13 : 17,
        background: 'linear-gradient(180deg, #122819 0%, #0d1914 50%, #09120f 100%)',
        border: '1px solid rgba(230,195,100,0.34)',
        boxShadow:
          '0 15px 30px rgba(0,0,0,0.55), inset 0 0 18px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.06)',
      }}
    >
      <div
        className="absolute inset-[5px] rounded-[12px]"
        style={{
          background:
            'repeating-linear-gradient(45deg, rgba(255,255,255,0.024) 0px, rgba(255,255,255,0.024) 1px, transparent 1px, transparent 4px)',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      />
      <motion.div
        aria-hidden
        className="absolute inset-y-0 -left-1/2 w-1/2 skew-x-[-18deg]"
        animate={{ x: ['0%', '320%'] }}
        transition={{ duration: 1.45, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,241,184,0.17), transparent)',
        }}
      />
      <div
        className="absolute inset-0 flex items-center justify-center font-black"
        style={{
          fontFamily: 'Georgia, serif',
          fontSize: compact ? 23 : 36,
          color: 'transparent',
          background: 'linear-gradient(180deg, #f2d488 0%, #c9a84c 55%, #8a6a28 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.30))',
        }}
      >
        TP
      </div>
    </div>
  );
}
