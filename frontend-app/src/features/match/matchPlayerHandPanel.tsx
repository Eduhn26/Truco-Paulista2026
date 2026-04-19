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
  isDecisionFocus?: boolean;
};

type FanMetrics = {
  rotate: number;
  x: number;
  y: number;
};

const RANK_ORDER: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const SUIT_STRENGTH = {
  C: 0,
  P: 1,
  E: 2,
  O: 3,
} as const;

function getManilhaRank(viraRank: Rank): Rank {
  const viraIndex = RANK_ORDER.indexOf(viraRank);
  if (viraIndex === -1) {
    return '5';
  }
  return RANK_ORDER[(viraIndex + 1) % RANK_ORDER.length]!;
}

function getCardStrength(card: CardPayload, viraRank: Rank): number {
  const manilhaRank = getManilhaRank(viraRank);
  const rankIndex = RANK_ORDER.indexOf(card.rank);
  if (card.rank === manilhaRank) {
    return 100 + SUIT_STRENGTH[card.suit as keyof typeof SUIT_STRENGTH];
  }
  return rankIndex;
}

function getFanMetrics(cardCount: number, index: number): FanMetrics {
  if (cardCount <= 1) {
    return { rotate: 0, x: 0, y: 0 };
  }
  const midpoint = (cardCount - 1) / 2;
  const offsetFromCenter = index - midpoint;
  const maxSpread = cardCount <= 3 ? 16 : 20;
  const horizontalStep = cardCount <= 3 ? 36 : 32;
  const verticalDepth = cardCount <= 3 ? 6 : 9;
  return {
    rotate: offsetFromCenter * maxSpread * 0.24,
    x: offsetFromCenter * horizontalStep,
    y: Math.abs(offsetFromCenter) * verticalDepth,
  };
}

function getBestCardIndex(myCards: CardPayload[], viraRank: Rank): number {
  let bestCardIndex = -1;
  let bestStrength = -Infinity;
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
  isDecisionFocus = false,
}: MatchPlayerHandPanelProps) {
  const cardCount = myCards.length;
  const bestCardIndex = getBestCardIndex(myCards, viraRank);
  const hasPlayableHand = cardCount > 0 && canPlayCard && tablePhase === 'playing';
  const hasDecisionFocusHand = cardCount > 0 && isDecisionFocus;
  const canInspectCards = canPlayCard || isDecisionFocus;

  if (cardCount === 0 && tablePhase === 'waiting') {
    return (
      <div className="flex h-12 items-center justify-center opacity-40">
        <div className="flex items-center gap-2">
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-amber-400/70"
            style={{ animationDelay: '0ms' }}
          />
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-amber-400/70"
            style={{ animationDelay: '150ms' }}
          />
          <div
            className="h-2 w-2 animate-bounce rounded-full bg-amber-400/70"
            style={{ animationDelay: '300ms' }}
          />
        </div>
      </div>
    );
  }

  if (cardCount === 0) {
    return <div className="h-8" />;
  }

  return (
    <div
      className="relative flex h-[128px] items-end justify-center overflow-visible px-1 pb-1 pt-1"
      style={{ perspective: '1100px' }}
    >
      {/* NOTE: Keep the base shadow subtle while preserving card prominence. */}
      <div
        className="pointer-events-none absolute inset-x-8 bottom-0 h-8 rounded-[999px]"
        style={{
          background: 'radial-gradient(circle at center, rgba(0,0,0,0.46), rgba(0,0,0,0) 72%)',
          filter: 'blur(10px)',
        }}
      />
      
      {/* NOTE: This ambient glow helps the hand feel premium without making the panel larger. */}
      <div
        className="pointer-events-none absolute inset-x-10 bottom-1 h-10 rounded-[999px] transition-opacity duration-300"
        style={{
          opacity: hasDecisionFocusHand ? 1 : hasPlayableHand ? 1 : 0.22,
          background:
            'radial-gradient(circle at center, rgba(201,168,76,0.1), rgba(201,168,76,0) 68%)',
          filter: 'blur(12px)',
        }}
      />
      
      <div
        className="pointer-events-none absolute inset-x-[24%] bottom-3 h-14 rounded-[999px]"
        style={{
          opacity: hasDecisionFocusHand ? 1 : hasPlayableHand ? 1 : 0.35,
          background: hasDecisionFocusHand
            ? 'radial-gradient(circle, rgba(255,235,170,0.22) 0%, rgba(201,168,76,0.14) 38%, transparent 78%)'
            : hasPlayableHand
              ? 'radial-gradient(circle, rgba(255,235,170,0.16) 0%, rgba(201,168,76,0.08) 34%, transparent 74%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 74%)',
          filter: 'blur(14px)',
        }}
      />
      
      {/* NOTE: Card size stays the same. The improvement is in presentation, not scale. */}
      <div className="relative flex h-[118px] w-full items-end justify-center overflow-visible">
        {myCards.map((card, index) => {
          const cardKey = `${card.rank}-${card.suit}`;
          const isLaunching = launchingCardKey === cardKey;
          const suitData = getSuitDisplay(card.suit);
          const isRed = isSuitRed(card.suit);
          const textColor = isRed ? '#c0392b' : '#1a1a2e';
          const fan = getFanMetrics(cardCount, index);
          const isBestCard = index === bestCardIndex && !isLaunching;
          const centerDistance = Math.abs(index - (cardCount - 1) / 2);
          const isDecisionHeroCard = isDecisionFocus && centerDistance <= 0.5;
          
          return (
            <motion.button
              key={cardKey}
              layoutId={cardKey}
              type="button"
              onClick={() => onPlayCard(card)}
              disabled={!canPlayCard || isLaunching}
              initial={{
                opacity: 0,
                y: 18,
                scale: 0.95,
                rotate: fan.rotate,
                x: fan.x,
              }}
              animate={{
                opacity: isLaunching ? 0 : 1,
                y: isLaunching ? -180 : fan.y,
                x: isLaunching ? fan.x + 82 : fan.x,
                rotate: isLaunching ? fan.rotate - 7 : fan.rotate,
                scale: isLaunching
                  ? 0.8
                  : isDecisionHeroCard
                    ? 1.04
                    : isBestCard
                      ? 1.02
                      : 1,
              }}
              transition={{
                type: 'spring',
                stiffness: 300,
                damping: 24,
                delay: isLaunching ? 0 : index * 0.025,
              }}
              whileHover={
                canInspectCards && !isLaunching
                  ? {
                      y: fan.y - (isDecisionFocus ? 34 : 28),
                      rotate: fan.rotate * 0.12,
                      scale: isDecisionHeroCard ? 1.09 : isBestCard ? 1.075 : 1.06,
                      zIndex: 140,
                    }
                  : {}
              }
              whileTap={canPlayCard && !isLaunching ? { scale: 0.985 } : {}}
              style={{
                position: 'absolute',
                bottom: 0,
                transformOrigin: 'bottom center',
                zIndex: isLaunching ? 220 : 30 + index,
                cursor: canPlayCard && !isLaunching ? 'pointer' : 'default',
              }}
              className="relative focus:outline-none"
            >
              {/* NOTE: Back glow gives a hero-card feel without using an external badge. */}
              <div
                className="pointer-events-none absolute inset-0 rounded-[16px]"
                style={{
                  transform: 'scale(1.08)',
                  background: isDecisionHeroCard
                    ? 'radial-gradient(circle, rgba(255,228,140,0.34) 0%, rgba(201,168,76,0.18) 36%, transparent 76%)'
                    : isBestCard
                      ? 'radial-gradient(circle, rgba(255,228,140,0.26) 0%, rgba(201,168,76,0.12) 34%, transparent 74%)'
                      : 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 76%)',
                  filter: 'blur(12px)',
                  opacity: isLaunching ? 0 : 1,
                }}
              />
              
              <div
                className="relative flex flex-col justify-between overflow-hidden playing-card"
                style={{
                  width: 84,
                  height: 118,
                  borderRadius: 14,
                  background: 'linear-gradient(145deg, #fffefb 0%, #faf6ee 52%, #f2ead6 100%)',
                  boxShadow: isDecisionHeroCard
                    ? '0 0 28px rgba(201,168,76,0.36), 0 14px 30px rgba(0,0,0,0.36), inset 0 1px 0 rgba(255,255,255,0.98)'
                    : isBestCard
                      ? '0 0 22px rgba(201,168,76,0.3), 0 12px 26px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.98)'
                      : '0 8px 20px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.92)',
                  border: isDecisionHeroCard
                    ? '2px solid rgba(255,223,128,0.62)'
                    : isBestCard
                      ? '2px solid rgba(201,168,76,0.46)'
                      : '1px solid rgba(0,0,0,0.1)',
                  padding: '7px 7px',
                }}
              >
                {/* NOTE: Stronger paper highlight improves the premium feel. */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                      'linear-gradient(150deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.3) 20%, rgba(255,255,255,0) 38%)',
                    borderRadius: 'inherit',
                    pointerEvents: 'none',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: '1px',
                    borderRadius: '12px',
                    border: isBestCard
                      ? '1px solid rgba(201,168,76,0.18)'
                      : '1px solid rgba(0,0,0,0.03)',
                    pointerEvents: 'none',
                  }}
                />
                
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: textColor,
                      fontFamily: 'Georgia, serif',
                      textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                    }}
                  >
                    {card.rank}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1, color: textColor, marginTop: 2 }}>
                    {suitData.symbol}
                  </div>
                </div>
                
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                    pointerEvents: 'none',
                  }}
                >
                  <span
                    style={{
                      fontSize: centerDistance < 0.6 ? '3.4rem' : '3.1rem',
                      lineHeight: 1,
                      color: textColor,
                      transform: isBestCard ? 'scale(1.04)' : 'scale(1)',
                      transition: 'transform 0.2s',
                      filter: isBestCard
                        ? 'drop-shadow(0 3px 6px rgba(201,168,76,0.18))'
                        : 'drop-shadow(0 2px 3px rgba(0,0,0,0.08))',
                    }}
                  >
                    {suitData.symbol}
                  </span>
                </div>
                
                <div
                  style={{
                    position: 'relative',
                    zIndex: 1,
                    transform: 'rotate(180deg)',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      fontSize: 20,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: textColor,
                      fontFamily: 'Georgia, serif',
                      textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                    }}
                  >
                    {card.rank}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1, color: textColor, marginTop: 2 }}>
                    {suitData.symbol}
                  </div>
                </div>
                
                {/* NOTE: Keep the sheen elegant and internal, without external tags or tabs. */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100"
                  style={{
                    background:
                      'linear-gradient(130deg, transparent 36%, rgba(255,255,255,0.38) 48%, rgba(255,255,255,0.12) 52%, transparent 64%)',
                    borderRadius: 'inherit',
                  }}
                />
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
