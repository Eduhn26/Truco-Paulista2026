import { motion } from 'framer-motion';

import { getSuitDisplay, isSuitRed } from '../../services/socket/socketTypes';
import type { CardPayload, MatchStatePayload, Rank } from '../../services/socket/socketTypes';

type MatchPlayerHandPanelProps = {
  myCards: CardPayload[];
  canPlayCard: boolean;
  tablePhase: string;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
  isMyTurn?: boolean;
  viraRank?: Rank;
};

type FanMetrics = {
  rotate: number;
  x: number;
  y: number;
};

const RANK_ORDER: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

function getCardStrength(card: CardPayload, viraRank: Rank): number {
  const rankIndex = RANK_ORDER.indexOf(card.rank);

  // NOTE: This ordering stays strictly presentational. It only helps the hand
  // give a subtle premium emphasis to a stronger-looking card.
  if (card.rank === viraRank) {
    return 100 + rankIndex;
  }

  return rankIndex;
}

function getFanMetrics(cardCount: number, index: number): FanMetrics {
  if (cardCount <= 1) {
    return { rotate: 0, x: 0, y: 0 };
  }

  const midpoint = (cardCount - 1) / 2;
  const offsetFromCenter = index - midpoint;
  const maxSpread = cardCount <= 3 ? 28 : cardCount === 4 ? 32 : 36;
  const horizontalStep = cardCount <= 3 ? 44 : cardCount === 4 ? 38 : 32;
  const verticalDepth = cardCount <= 3 ? 10 : 14;

  return {
    rotate: offsetFromCenter * maxSpread * 0.34,
    x: offsetFromCenter * horizontalStep,
    y: Math.abs(offsetFromCenter) * verticalDepth,
  };
}

function getBestCardIndex(myCards: CardPayload[], viraRank: Rank): number {
  let bestCardIndex = -1;
  let bestStrength = -1;

  myCards.forEach((card, index) => {
    const strength = getCardStrength(card, viraRank);

    if (strength > bestStrength) {
      bestStrength = strength;
      bestCardIndex = index;
    }
  });

  return bestCardIndex;
}

export function MatchPlayerHandPanel({
  myCards,
  canPlayCard,
  tablePhase,
  launchingCardKey,
  onPlayCard,
  viraRank = '4',
}: MatchPlayerHandPanelProps) {
  const cardCount = myCards.length;
  const bestCardIndex = getBestCardIndex(myCards, viraRank);
  const hasPlayableHand = cardCount > 0 && canPlayCard && tablePhase === 'playing';

  if (cardCount === 0 && tablePhase === 'waiting') {
    return (
      <div className="flex h-20 items-center justify-center opacity-45">
        <div className="flex items-center gap-2.5">
          <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-amber-400/70" />
          <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-amber-400/70 delay-100" />
          <div className="h-2.5 w-2.5 animate-bounce rounded-full bg-amber-400/70 delay-200" />
        </div>
      </div>
    );
  }

  if (cardCount === 0) {
    return <div className="h-16" />;
  }

  return (
    <div
      className="relative flex min-h-[180px] items-end justify-center overflow-visible px-2 pb-2 pt-1"
      style={{ perspective: '1400px' }}
    >
      <div
        className="pointer-events-none absolute inset-x-8 bottom-0 h-10 rounded-[999px]"
        style={{
          background: 'radial-gradient(circle at center, rgba(0,0,0,0.55), rgba(0,0,0,0) 72%)',
          filter: 'blur(12px)',
        }}
      />

      <div
        className={`pointer-events-none absolute inset-x-10 bottom-2 h-16 rounded-[999px] transition-opacity duration-300 ${
          hasPlayableHand ? 'opacity-100' : 'opacity-45'
        }`}
        style={{
          background:
            'radial-gradient(circle at center, rgba(201,168,76,0.18), rgba(201,168,76,0) 70%)',
          filter: 'blur(18px)',
        }}
      />

      <div className="relative flex h-[168px] items-end justify-center">
        {myCards.map((card, index) => {
          const cardKey = `${card.rank}-${card.suit}`;
          const isLaunching = launchingCardKey === cardKey;
          const suitData = getSuitDisplay(card.suit);
          const isRed = isSuitRed(card.suit);
          const textColor = isRed ? 'text-red-700' : 'text-slate-900';
          const fan = getFanMetrics(cardCount, index);
          const isBestCard = index === bestCardIndex && !isLaunching;
          const centerDistance = Math.abs(index - (cardCount - 1) / 2);

          return (
            <motion.button
              key={cardKey}
              layoutId={cardKey}
              type="button"
              onClick={() => onPlayCard(card)}
              disabled={!canPlayCard || isLaunching}
              initial={{
                opacity: 0,
                y: 28,
                scale: 0.96,
                rotate: fan.rotate,
                x: fan.x,
              }}
              animate={{
                opacity: isLaunching ? 0 : 1,
                y: isLaunching ? -280 : fan.y,
                x: isLaunching ? fan.x + 112 : fan.x,
                rotate: isLaunching ? fan.rotate - 8 : fan.rotate,
                scale: isLaunching ? 0.72 : isBestCard ? 1.02 : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 320,
                damping: 24,
                delay: isLaunching ? 0 : index * 0.03,
              }}
              whileHover={
                canPlayCard && !isLaunching
                  ? {
                      y: fan.y - 28,
                      rotate: fan.rotate * 0.2,
                      scale: isBestCard ? 1.06 : 1.04,
                      zIndex: 100,
                    }
                  : {}
              }
              whileTap={canPlayCard && !isLaunching ? { scale: 0.98 } : {}}
              style={{
                position: 'absolute',
                bottom: 0,
                transformOrigin: 'bottom center',
                zIndex: isLaunching ? 220 : 30 + index,
              }}
              className={`
                relative flex h-[152px] w-[104px] flex-col items-center justify-between overflow-hidden rounded-[24px] border bg-[#fdfbf7] px-2.5 py-2 shadow-[0_20px_34px_rgba(0,0,0,0.36)] transition-all duration-200
                ${
                  canPlayCard && !isLaunching ? 'cursor-pointer' : 'cursor-not-allowed opacity-95'
                }
                ${
                  isBestCard
                    ? 'border-amber-300 shadow-[0_0_22px_rgba(250,204,21,0.26),0_20px_34px_rgba(0,0,0,0.38)]'
                    : 'border-slate-200'
                }
              `}
            >
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'linear-gradient(150deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.22) 16%, rgba(255,255,255,0) 32%)',
                }}
              />

              <div className="pointer-events-none absolute inset-x-0 top-0 h-5 bg-black/[0.02]" />

              <div className="relative z-10 flex w-full items-start justify-between">
                <span className={`text-[24px] font-black leading-none ${textColor}`}>
                  {card.rank}
                </span>
                <span className={`text-[16px] leading-none ${textColor}`}>{suitData.symbol}</span>
              </div>

              <div className="relative z-10 flex flex-1 items-center justify-center">
                <span
                  className={`drop-shadow-sm ${textColor}`}
                  style={{
                    fontSize: centerDistance < 0.6 ? '4rem' : '3.55rem',
                    lineHeight: 1,
                    transform: isBestCard ? 'scale(1.03)' : 'scale(1)',
                  }}
                >
                  {suitData.symbol}
                </span>
              </div>

              <div className="relative z-10 flex w-full items-end justify-between">
                <span className={`rotate-180 text-[24px] font-black leading-none ${textColor}`}>
                  {card.rank}
                </span>
                <span className={`rotate-180 text-[16px] leading-none ${textColor}`}>
                  {suitData.symbol}
                </span>
              </div>

              <div className="pointer-events-none absolute inset-0 rounded-[24px] bg-gradient-to-tr from-transparent via-white/30 to-transparent opacity-0 transition-opacity duration-300 hover:opacity-100" />
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
