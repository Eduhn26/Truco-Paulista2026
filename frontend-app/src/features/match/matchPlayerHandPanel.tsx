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
  isCompactTable?: boolean;
  onCardElementChange?: ((cardKey: string, element: HTMLButtonElement | null) => void) | undefined;
};

type FanMetrics = {
  rotate: number;
  x: number;
  y: number;
};

const RANK_ORDER: Rank[] = ['4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3'];

const SUIT_STRENGTH = {
  O: 0,
  E: 1,
  C: 2,
  P: 3,
} as const;

// CHANGE (final surgical round — issue A & B): the cards themselves needed a
// small size bump AND the container geometry needed more room because the
// previous 158px height was too tight for the hover lift.  New sizing:
//   • CARD_W/CARD_H: 108 x 152 (previously 102x144). Stronger presence.
//   • Container height: 188 (was 158) — includes headroom for the hover lift
//     so the top of a hovered card never gets clipped by the page's outer
//     overflow-hidden wrappers.
//   • Hover lift shortened: from -34/-40 to -22/-26. Cards still pop, but the
//     movement fits inside the dock without needing the page to overflow.
const CARD_W = 108;
const CARD_H = 152;
const COMPACT_CARD_W = 'clamp(72px, 18.5vw, 88px)';
const COMPACT_CARD_H = 'clamp(100px, 26vw, 124px)';

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

function getFanMetrics(cardCount: number, index: number, compact = false): FanMetrics {
  if (cardCount <= 1) {
    return { rotate: 0, x: 0, y: 0 };
  }
  const midpoint = (cardCount - 1) / 2;
  const offsetFromCenter = index - midpoint;
  const maxSpread = compact ? (cardCount <= 3 ? 14 : 18) : cardCount <= 3 ? 18 : 22;
  const horizontalStep = compact ? (cardCount <= 3 ? 38 : 34) : cardCount <= 3 ? 46 : 40;
  const verticalDepth = compact ? (cardCount <= 3 ? 5 : 7) : cardCount <= 3 ? 7 : 10;
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

    if (strength > bestStrength || (strength === bestStrength && index > bestCardIndex)) {
      bestStrength = strength;
      bestCardIndex = index;
    }
  });

  return bestCardIndex;
}

type OrderedHandCard = {
  card: CardPayload;
  sourceIndex: number;
};

function getCardKey(card: CardPayload): string {
  return `${card.rank}-${card.suit}`;
}

function orderCardsWithStrongestOnRight(myCards: CardPayload[], viraRank: Rank): OrderedHandCard[] {
  return myCards
    .map((card, sourceIndex) => ({ card, sourceIndex }))
    .sort((left, right) => {
      const strengthDelta =
        getCardStrength(left.card, viraRank) - getCardStrength(right.card, viraRank);

      if (strengthDelta !== 0) {
        return strengthDelta;
      }

      return left.sourceIndex - right.sourceIndex;
    });
}

/**
 * Step 5 polish — premium presence for the player's own hand.
 *
 * Goals (from audit Etapa 5):
 *  - The hand should look "lit by the table light" when playable: the J♣
 *    in the user's mockup has a clear gold glow projecting onto the felt
 *    below it. We do this with a felt-light "carpet" projected behind
 *    the fan whenever cards are playable.
 *  - The "best card" indicator was a flat 2px gold border. Now it gets
 *    a small "MANILHA" / "MAIOR" tag floating on the top edge so the
 *    relationship between vira → manilha is visible without forcing the
 *    player to count.
 *  - Hover sheen is now a subtle diagonal swipe instead of a static
 *    overlay.
 *  - All visual changes are non-functional: API and behaviour identical
 *    to the previous panel.
 */
export function MatchPlayerHandPanel({
  myCards,
  canPlayCard,
  tablePhase,
  launchingCardKey,
  onPlayCard,
  isMyTurn = false,
  viraRank = '4',
  isDecisionFocus = false,
  isCompactTable = false,
  onCardElementChange,
}: MatchPlayerHandPanelProps) {
  const cardCount = myCards.length;
  const orderedHandCards = orderCardsWithStrongestOnRight(myCards, viraRank);
  const bestCardIndex = getBestCardIndex(myCards, viraRank);
  const bestCardKey = bestCardIndex >= 0 ? getCardKey(myCards[bestCardIndex]!) : null;
  const hasPlayableHand = cardCount > 0 && canPlayCard && isMyTurn && tablePhase === 'playing';
  const hasDecisionFocusHand = cardCount > 0 && isDecisionFocus;
  const canInspectCards = isMyTurn || isDecisionFocus;
  const hasActiveLaunch = launchingCardKey !== null;
  const cardWidth = isCompactTable ? COMPACT_CARD_W : 'clamp(82px, 22vw, 108px)';
  const cardHeight = isCompactTable ? COMPACT_CARD_H : 'clamp(116px, 31vw, 152px)';
  // NOTE: The mobile hand scales with the viewport so cards remain
  // clickable without relying on page scroll. Desktop keeps the original
  // upper bounds through the clamp maximum values.
  const panelHeight = isCompactTable ? 'clamp(104px, 31vw, 126px)' : 'clamp(142px, 38vw, 188px)';
  const innerHeight = isCompactTable ? 'clamp(94px, 28vw, 110px)' : 'clamp(126px, 34vw, 168px)';
  const hoverLift = isCompactTable ? (isDecisionFocus ? 14 : 10) : isDecisionFocus ? 26 : 22;

  // Knowing whether the "best card in hand" is also the manilha drives the
  // tag label — players really want to know which card is the manilha in
  // their hand the moment they look at it.
  const manilhaRankInHand = getManilhaRank(viraRank);
  const bestCardIsManilha =
    bestCardIndex >= 0 && myCards[bestCardIndex]?.rank === manilhaRankInHand;

  if (cardCount === 0 && tablePhase === 'waiting') {
    return (
      <div className="flex h-20 items-center justify-center opacity-40">
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
    return <div className="h-10" />;
  }

  return (
    <div
      className="relative flex items-end justify-center overflow-visible px-1"
      style={{ perspective: '1200px', height: panelHeight }}
    >
      {/* CHANGE (issue B — hand feels disconnected from the felt):
          Stronger "pedestal" under the fan. Two layers: a wider ambient
          mat that reads as the felt receiving light, plus a tighter,
          darker ground shadow right under the cards so they feel
          physically planted.

          Step 5 polish: third layer added below — a felt-light carpet
          (warm rectangular gold gradient) that only lights up on
          playable/decision states. This is the visual signature from the
          mockup: the J♣ "glows down onto the felt". */}
      <div
        className="pointer-events-none absolute inset-x-4 bottom-[-6px] rounded-[999px]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(201,168,76,0.10) 0%, rgba(201,168,76,0.04) 38%, transparent 78%)',
          filter: 'blur(22px)',
          opacity: hasDecisionFocusHand ? 1 : hasPlayableHand ? 0.82 : 0.45,
          transition: 'opacity 0.3s',
          height: isCompactTable ? 48 : 64,
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-20 bottom-[2px] h-8 rounded-[999px]"
        style={{
          background: 'radial-gradient(circle at center, rgba(0,0,0,0.62), rgba(0,0,0,0) 72%)',
          filter: 'blur(10px)',
        }}
      />

      {/* Felt-light carpet — the gold stage under the centre card. Visible
          only when the player can act, otherwise transparent. mix-blend
          screen on top of the felt so the colour reads as light, not paint. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 transition-opacity duration-300"
        style={{
          bottom: -8,
          width: isCompactTable ? 220 : 280,
          height: isCompactTable ? 70 : 92,
          opacity: hasDecisionFocusHand ? 0.86 : hasPlayableHand ? 0.66 : 0,
          background:
            'radial-gradient(ellipse at 50% 30%, rgba(255,238,180,0.42) 0%, rgba(201,168,76,0.20) 32%, rgba(201,168,76,0.06) 60%, transparent 80%)',
          filter: 'blur(18px)',
          mixBlendMode: 'screen',
        }}
      />

      {/* Ambient glow — subtle gold breath when playable, gone otherwise. */}
      <div
        className="pointer-events-none absolute inset-x-[20%] bottom-5 rounded-[999px] transition-opacity duration-300"
        style={{
          opacity: hasDecisionFocusHand ? 1 : hasPlayableHand ? 1 : 0.22,
          background: hasDecisionFocusHand
            ? 'radial-gradient(circle, rgba(255,235,170,0.30) 0%, rgba(201,168,76,0.18) 38%, transparent 78%)'
            : hasPlayableHand
              ? 'radial-gradient(circle, rgba(255,235,170,0.22) 0%, rgba(201,168,76,0.12) 34%, transparent 74%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 74%)',
          filter: 'blur(16px)',
          height: isCompactTable ? 44 : 64,
        }}
      />

      {/* Cards — container is tall enough (168 of inner height, 188 on the
          wrapper) to accommodate the hover lift without any page-level
          clipping. */}
      <div
        className="relative flex w-full items-end justify-center overflow-visible"
        style={{ height: innerHeight }}
      >
        {orderedHandCards.map(({ card }, index) => {
          const cardKey = getCardKey(card);
          const isLaunching = launchingCardKey === cardKey;
          const suitData = getSuitDisplay(card.suit);
          const isRed = isSuitRed(card.suit);
          const textColor = isRed ? '#c0392b' : '#1a1a2e';
          const fan = getFanMetrics(cardCount, index, isCompactTable);
          const isBestCard = cardKey === bestCardKey && !isLaunching;
          const centerDistance = Math.abs(index - (cardCount - 1) / 2);
          const isDecisionHeroCard = isDecisionFocus && centerDistance <= 0.5;
          const canPlaySelectedCard = hasPlayableHand && !hasActiveLaunch;
          const isManilhaCard = card.rank === manilhaRankInHand && !isLaunching;
          const showManilhaTag = isManilhaCard;
          const isPrimaryManilhaTag = isManilhaCard && isBestCard;
          const showBestTag = isBestCard && !bestCardIsManilha;
          const registerCardElement = (element: HTMLButtonElement | null) => {
            onCardElementChange?.(cardKey, element);
          };

          const handleCardClick = () => {
            if (!canPlaySelectedCard) {
              return;
            }

            onPlayCard(card);
          };

          return (
            <motion.button
              ref={registerCardElement}
              key={cardKey}
              layoutId={cardKey}
              type="button"
              onClick={handleCardClick}
              disabled={!canPlaySelectedCard}
              initial={{
                opacity: 0,
                y: 22,
                scale: 0.95,
                rotate: fan.rotate,
                x: fan.x,
              }}
              animate={{
                opacity: isLaunching ? 0 : 1,
                y: isLaunching ? -200 : fan.y,
                x: isLaunching ? fan.x + 90 : fan.x,
                rotate: isLaunching ? fan.rotate - 8 : fan.rotate,
                scale: isLaunching ? 0.8 : isDecisionHeroCard ? 1.04 : isBestCard ? 1.02 : 1,
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
                      // CHANGE: shorter lift (was -34/-40) so a hovered card
                      // doesn't overflow the dock and get clipped by any
                      // parent container with overflow-hidden.
                      y: fan.y - hoverLift,
                      rotate: fan.rotate * 0.12,
                      scale: isDecisionHeroCard ? 1.09 : isBestCard ? 1.075 : 1.06,
                      zIndex: 140,
                    }
                  : {}
              }
              whileTap={canPlaySelectedCard ? { scale: 0.985 } : {}}
              style={{
                position: 'absolute',
                bottom: 0,
                transformOrigin: 'bottom center',
                zIndex: isLaunching ? 220 : 30 + index,
                cursor: canPlaySelectedCard ? 'pointer' : 'default',
              }}
              className="relative focus:outline-none"
            >
              {/* Back glow — hero-card treatment for the best card / decision focus. */}
              <div
                className="pointer-events-none absolute inset-0 rounded-[18px]"
                style={{
                  transform: 'scale(1.08)',
                  background: isDecisionHeroCard
                    ? 'radial-gradient(circle, rgba(255,228,140,0.36) 0%, rgba(201,168,76,0.18) 36%, transparent 76%)'
                    : isBestCard
                      ? 'radial-gradient(circle, rgba(255,228,140,0.26) 0%, rgba(201,168,76,0.12) 34%, transparent 74%)'
                      : 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 76%)',
                  filter: 'blur(14px)',
                  opacity: isLaunching ? 0 : 1,
                }}
              />

              <div
                className="relative flex flex-col justify-between overflow-hidden playing-card"
                style={{
                  width: cardWidth,
                  height: cardHeight,
                  borderRadius: isCompactTable ? 14 : 16,
                  background: 'linear-gradient(145deg, #fffefb 0%, #faf6ee 52%, #f2ead6 100%)',
                  boxShadow: isDecisionHeroCard
                    ? '0 0 32px rgba(201,168,76,0.42), 0 18px 36px rgba(0,0,0,0.44), inset 0 1px 0 rgba(255,255,255,0.98)'
                    : isBestCard
                      ? '0 0 26px rgba(201,168,76,0.34), 0 16px 32px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.98)'
                      : '0 12px 26px rgba(0,0,0,0.42), 0 4px 10px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.94)',
                  border: isDecisionHeroCard
                    ? '2px solid rgba(255,223,128,0.62)'
                    : isBestCard
                      ? '2px solid rgba(201,168,76,0.46)'
                      : '1px solid rgba(0,0,0,0.1)',
                  padding: isCompactTable ? '7px 8px' : '8px 9px',
                }}
              >
                {/* Paper highlight */}
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
                    borderRadius: '14px',
                    border: isBestCard
                      ? '1px solid rgba(201,168,76,0.18)'
                      : '1px solid rgba(0,0,0,0.03)',
                    pointerEvents: 'none',
                  }}
                />

                {/* Top-left rank/suit */}
                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div
                    style={{
                      fontSize: isCompactTable ? 22 : 'clamp(20px, 6vw, 26px)',
                      fontWeight: 900,
                      lineHeight: 1,
                      color: textColor,
                      fontFamily: 'Georgia, serif',
                      textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                    }}
                  >
                    {card.rank}
                  </div>
                  <div
                    style={{
                      fontSize: isCompactTable ? 14 : 'clamp(13px, 4vw, 17px)',
                      lineHeight: 1,
                      color: textColor,
                      marginTop: 2,
                    }}
                  >
                    {suitData.symbol}
                  </div>
                </div>

                {/* Center symbol */}
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
                      fontSize: isCompactTable
                        ? centerDistance < 0.6
                          ? '3.7rem'
                          : '3.35rem'
                        : centerDistance < 0.6
                          ? 'clamp(3.25rem, 11vw, 4.4rem)'
                          : 'clamp(3rem, 10vw, 4rem)',
                      lineHeight: 1,
                      color: textColor,
                      transform: isBestCard ? 'scale(1.04)' : 'scale(1)',
                      transition: 'transform 0.2s',
                      filter: isBestCard
                        ? 'drop-shadow(0 3px 6px rgba(201,168,76,0.22))'
                        : 'drop-shadow(0 2px 3px rgba(0,0,0,0.08))',
                    }}
                  >
                    {suitData.symbol}
                  </span>
                </div>

                {/* Bottom-right (rotated) */}
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
                      fontSize: isCompactTable ? 22 : 'clamp(20px, 6vw, 26px)',
                      fontWeight: 900,
                      lineHeight: 1,
                      color: textColor,
                      fontFamily: 'Georgia, serif',
                      textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                    }}
                  >
                    {card.rank}
                  </div>
                  <div
                    style={{
                      fontSize: isCompactTable ? 14 : 'clamp(13px, 4vw, 17px)',
                      lineHeight: 1,
                      color: textColor,
                      marginTop: 2,
                    }}
                  >
                    {suitData.symbol}
                  </div>
                </div>

                {/* Hover sheen */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 hover:opacity-100"
                  style={{
                    background:
                      'linear-gradient(130deg, transparent 36%, rgba(255,255,255,0.38) 48%, rgba(255,255,255,0.12) 52%, transparent 64%)',
                    borderRadius: 'inherit',
                  }}
                />
              </div>

              {/* MANILHA / MAIOR badge — premium corner cartouche.
                  The previous floating badge sat too high and read as a
                  disconnected sticker. This version stays visually attached
                  to the card body: inset in the top-right corner, away from
                  the rank pip, with a jewel-like gold finish for MANILHA and
                  a darker brass label for MAIOR. */}
              {showManilhaTag || showBestTag ? (
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0, y: 3, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.28, delay: 0.14, ease: [0.2, 0.9, 0.24, 1] }}
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full"
                  style={{
                    top: isCompactTable ? -4 : -6,
                    minWidth: isCompactTable ? 46 : 54,
                    padding: isCompactTable ? '3px 8px' : '4px 10px',
                    borderRadius: 999,
                    background: showManilhaTag
                      ? 'linear-gradient(160deg, rgba(255,248,216,0.98) 0%, rgba(245,224,149,0.98) 28%, rgba(201,168,76,0.98) 64%, rgba(111,79,20,0.98) 100%)'
                      : 'linear-gradient(160deg, rgba(52,41,24,0.98) 0%, rgba(29,23,14,0.98) 54%, rgba(18,14,10,0.98) 100%)',
                    border: showManilhaTag
                      ? '1px solid rgba(255,241,188,0.95)'
                      : '1px solid rgba(201,168,76,0.5)',
                    boxShadow: showManilhaTag
                      ? '0 10px 18px rgba(0,0,0,0.26), 0 0 16px rgba(242,212,136,0.34), inset 0 1px 0 rgba(255,255,255,0.42)'
                      : '0 10px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.08)',
                    zIndex: 4,
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      inset: '1px',
                      borderRadius: 999,
                      background: showManilhaTag
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.34) 0%, rgba(255,255,255,0.08) 42%, rgba(255,255,255,0) 100%)'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 42%, rgba(255,255,255,0) 100%)',
                    }}
                  />
                  <span
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      display: 'block',
                      textAlign: 'center',
                      color: showManilhaTag ? '#1f1506' : '#f2d488',
                      fontFamily: 'Georgia, serif',
                      fontSize: isCompactTable ? 7.5 : 8.5,
                      fontWeight: 900,
                      letterSpacing: '0.16em',
                      lineHeight: 1.1,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                      textShadow: showManilhaTag
                        ? '0 1px 0 rgba(255,255,255,0.22)'
                        : '0 1px 0 rgba(0,0,0,0.3)',
                    }}
                  >
                    {showManilhaTag ? 'MANILHA' : 'MAIOR'}
                  </span>
                </motion.div>
              ) : null}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}


