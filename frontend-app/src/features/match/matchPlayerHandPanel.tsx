import { motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  const maxSpread = cardCount <= 3 ? 18 : 22;
  const horizontalStep = cardCount <= 3 ? 46 : 40;
  const verticalDepth = cardCount <= 3 ? 7 : 10;
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

  // Patch 2 — Dealing animado.
  //
  // Detecta o momento em que o jogador acabou de receber uma nova mão (a
  // contagem de cartas saltou de 0 para >0). Durante uma janela curta
  // (~600ms) marcamos `isDealing = true`, o que faz cada carta entrar de
  // BAIXO da tela com um stagger visível (140ms) em vez do fade-in de 25ms
  // anterior. O resultado é a sensação de carteador distribuindo cartas, não
  // de cartas que teleportam pra mão do jogador.
  const previousCardCountRef = useRef<number>(cardCount);
  const [isDealing, setIsDealing] = useState<boolean>(false);

  useEffect(() => {
    const prev = previousCardCountRef.current;
    previousCardCountRef.current = cardCount;

    // Subiu de 0 (ou menos) pra ter cartas → é uma mão nova sendo entregue.
    if (prev === 0 && cardCount > 0) {
      setIsDealing(true);
      // Dura o bastante pra o último card (index 2) fazer seu spring.
      // Stagger 140ms * 3 + spring ~320ms = ~740ms. Arredondado pra 760.
      const timeout = window.setTimeout(() => setIsDealing(false), 760);
      return () => window.clearTimeout(timeout);
    }
    return undefined;
  }, [cardCount]);

  // Cada carta recebe uma direção de origem ligeiramente diferente: a da
  // esquerda vem de baixo-esquerda, a do meio de baixo-centro, a da direita
  // de baixo-direita. Dá a sensação de carteador que gira o pulso.
  const dealingOrigins = useMemo(
    () =>
      myCards.map((_, index) => {
        const midpoint = (cardCount - 1) / 2;
        const lateral = (index - midpoint) * 80;
        return {
          x: lateral,
          y: 340,
          rotate: (index - midpoint) * 14,
        };
      }),
    [myCards, cardCount],
  );

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
      className="relative flex h-[188px] items-end justify-center overflow-visible px-1"
      style={{ perspective: '1200px' }}
    >
      {/* CHANGE (issue B — hand feels disconnected from the felt):
          Stronger "pedestal" under the fan. Previously just a single soft
          shadow — now two layers: a wider, softer ambient mat that reads as
          the felt receiving light, plus a tighter, darker ground shadow
          right under the cards so they feel physically planted. */}
      <div
        className="pointer-events-none absolute inset-x-4 bottom-[-6px] h-16 rounded-[999px]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 50%, rgba(201,168,76,0.10) 0%, rgba(201,168,76,0.04) 38%, transparent 78%)',
          filter: 'blur(22px)',
          opacity: hasDecisionFocusHand ? 1 : hasPlayableHand ? 0.82 : 0.45,
          transition: 'opacity 0.3s',
        }}
      />
      <div
        className="pointer-events-none absolute inset-x-20 bottom-[2px] h-8 rounded-[999px]"
        style={{
          background: 'radial-gradient(circle at center, rgba(0,0,0,0.62), rgba(0,0,0,0) 72%)',
          filter: 'blur(10px)',
        }}
      />

      {/* Ambient glow — subtle gold breath when playable, gone otherwise. */}
      <div
        className="pointer-events-none absolute inset-x-[20%] bottom-6 h-16 rounded-[999px] transition-opacity duration-300"
        style={{
          opacity: hasDecisionFocusHand ? 1 : hasPlayableHand ? 1 : 0.22,
          background: hasDecisionFocusHand
            ? 'radial-gradient(circle, rgba(255,235,170,0.30) 0%, rgba(201,168,76,0.18) 38%, transparent 78%)'
            : hasPlayableHand
              ? 'radial-gradient(circle, rgba(255,235,170,0.22) 0%, rgba(201,168,76,0.12) 34%, transparent 74%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 74%)',
          filter: 'blur(16px)',
        }}
      />

      {/* Cards — container is tall enough (168 of inner height, 188 on the
          wrapper) to accommodate the hover lift without any page-level
          clipping. */}
      <div className="relative flex h-[168px] w-full items-end justify-center overflow-visible">
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
              initial={
                isDealing
                  ? {
                      // Patch 2 — vem de fora da tela (baixo) com rotação
                      // lateral, simulando carta sendo arremessada do monte.
                      opacity: 0,
                      y: dealingOrigins[index]?.y ?? 340,
                      x: dealingOrigins[index]?.x ?? 0,
                      scale: 0.68,
                      rotate: dealingOrigins[index]?.rotate ?? 0,
                    }
                  : {
                      opacity: 0,
                      y: 22,
                      scale: 0.95,
                      rotate: fan.rotate,
                      x: fan.x,
                    }
              }
              animate={{
                opacity: isLaunching ? 0 : 1,
                y: isLaunching ? -200 : fan.y,
                x: isLaunching ? fan.x + 90 : fan.x,
                rotate: isLaunching ? fan.rotate - 8 : fan.rotate,
                scale: isLaunching
                  ? 0.8
                  : isDecisionHeroCard
                    ? 1.04
                    : isBestCard
                      ? 1.02
                      : 1,
              }}
              transition={
                isDealing
                  ? {
                      // Spring mais "pesado" + stagger 140ms por carta para
                      // que cada uma seja perceptivelmente distribuída.
                      type: 'spring',
                      stiffness: 220,
                      damping: 22,
                      delay: isLaunching ? 0 : index * 0.14,
                    }
                  : {
                      type: 'spring',
                      stiffness: 300,
                      damping: 24,
                      delay: isLaunching ? 0 : index * 0.025,
                    }
              }
              whileHover={
                canInspectCards && !isLaunching
                  ? {
                      // CHANGE: shorter lift (was -34/-40) so a hovered card
                      // doesn't overflow the dock and get clipped by any
                      // parent container with overflow-hidden.
                      y: fan.y - (isDecisionFocus ? 26 : 22),
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
                  width: CARD_W,
                  height: CARD_H,
                  borderRadius: 16,
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
                  padding: '8px 9px',
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
                      fontSize: 26,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: textColor,
                      fontFamily: 'Georgia, serif',
                      textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                    }}
                  >
                    {card.rank}
                  </div>
                  <div style={{ fontSize: 17, lineHeight: 1, color: textColor, marginTop: 2 }}>
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
                      fontSize: centerDistance < 0.6 ? '4.4rem' : '4.0rem',
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
                      fontSize: 26,
                      fontWeight: 900,
                      lineHeight: 1,
                      color: textColor,
                      fontFamily: 'Georgia, serif',
                      textShadow: '0 1px 0 rgba(255,255,255,0.35)',
                    }}
                  >
                    {card.rank}
                  </div>
                  <div style={{ fontSize: 17, lineHeight: 1, color: textColor, marginTop: 2 }}>
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
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
