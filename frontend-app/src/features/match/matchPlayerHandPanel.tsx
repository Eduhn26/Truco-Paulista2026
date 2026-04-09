import { motion } from 'framer-motion';
import type { CardPayload, MatchStatePayload } from '../../services/socket/socketTypes';

type MatchPlayerHandPanelProps = {
  myCards: CardPayload[];
  canPlayCard: boolean;
  tablePhase: string;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
};

// ── Mapeamento de Naipes e Cores ──
const SUIT_MAP: Record<string, { symbol: string; colorClass: string }> = {
  C: { symbol: '♣', colorClass: 'text-slate-900' }, // Paus
  O: { symbol: '♦', colorClass: 'text-red-700' }, // Ouros
  P: { symbol: '♥', colorClass: 'text-red-700' }, // Copas
  E: { symbol: '♠', colorClass: 'text-slate-900' }, // Espadas
};

export function MatchPlayerHandPanel({
  myCards,
  canPlayCard,
  tablePhase,
  launchingCardKey,
  currentPrivateHand,
  currentPublicHand,
  onPlayCard,
}: MatchPlayerHandPanelProps) {
  const cardCount = myCards.length;

  // ── Lógica do Efeito Leque (Fan) ──
  // Calcula o ângulo de rotação para cada carta baseado no índice
  const getFanStyle = (index: number) => {
    const total = cardCount;
    const spread = total === 1 ? 0 : 28; // Abertura total em graus
    const startAngle = -spread / 2;
    const angle = startAngle + (index * spread) / (total > 1 ? total - 1 : 1);
    return { rotate: angle };
  };

  // Estado de espera (loading)
  if (myCards.length === 0 && tablePhase === 'waiting') {
    return (
      <div className="flex h-32 items-center justify-center opacity-40">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-amber-400/60 animate-bounce" />
          <div className="h-2 w-2 rounded-full bg-amber-400/60 animate-bounce delay-100" />
          <div className="h-2 w-2 rounded-full bg-amber-400/60 animate-bounce delay-200" />
        </div>
      </div>
    );
  }

  if (myCards.length === 0) {
    return <div className="h-32" />;
  }

  return (
    <div className="relative flex h-44 items-end justify-center px-4 pb-4 perspective-1000">
      {myCards.map((card, index) => {
        const cardKey = `${card.rank}-${card.suit}`;
        const isLaunching = launchingCardKey === cardKey;
        const suitData = SUIT_MAP[card.suit] || { symbol: '?', colorClass: 'text-black' };

        // Determina se a carta é vermelha ou preta
        const isRed = card.suit === 'P' || card.suit === 'O';
        const textColor = isRed ? 'text-red-700' : 'text-slate-900';

        return (
          <motion.button
            key={cardKey}
            // 🚀 CRÍTICO: layoutId permite que a carta "deslize" para a mesa sem sumir
            layoutId={cardKey}
            type="button"
            onClick={() => onPlayCard(card)}
            disabled={!canPlayCard || isLaunching}
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{
              // Quando está lançando, ela sobe e some (ou vai para o centro)
              opacity: isLaunching ? 0 : 1,
              y: isLaunching ? -350 : 0,
              x: isLaunching ? 150 : 0,
              scale: isLaunching ? 0.6 : 1,
              // Se não está lançando, aplica o efeito leque
              ...(!isLaunching && getFanStyle(index)),
            }}
            transition={{
              type: 'spring',
              stiffness: 350,
              damping: 25,
              delay: isLaunching ? 0.1 : index * 0.05, // Efeito cascata na distribuição
            }}
            whileHover={
              canPlayCard && !isLaunching
                ? { y: -40, scale: 1.15, zIndex: 50, rotate: 0 }
                : {}
            }
            whileTap={canPlayCard && !isLaunching ? { scale: 0.95 } : {}}
            style={{
              position: 'relative',
              marginLeft: index > 0 ? '-45px' : '0', // Sobreposição das cartas
              zIndex: index,
              transformOrigin: 'bottom center',
            }}
            className={`
              relative flex h-36 w-24 flex-col items-center justify-between rounded-xl py-3 shadow-2xl transition-shadow duration-200
              ${canPlayCard && !isLaunching
                ? 'hover:shadow-[0_0_20px_rgba(201,168,76,0.5)] cursor-pointer ring-1 ring-white/20 hover:ring-amber-400/50'
                : 'cursor-not-allowed opacity-90'
              }
              ${isLaunching ? 'z-[100]' : ''}
            `}
          >
            {/* Fundo da Carta (Textura de papel) */}
            <div className="absolute inset-0 rounded-xl bg-[#fdfbf7] border border-slate-200" />
            
            {/* Conteúdo da Carta */}
            {/* Canto Superior */}
            <span className={`relative z-10 ml-2 mt-1 text-lg font-black leading-none ${textColor}`}>
              {card.rank}
            </span>

            {/* Centro (Símbolo Grande) */}
            <span className={`relative z-10 text-5xl leading-none drop-shadow-sm ${textColor}`}>
              {suitData.symbol}
            </span>

            {/* Canto Inferior (Invertido) */}
            <span className={`relative z-10 mr-2 mb-1 rotate-180 text-lg font-black leading-none ${textColor}`}>
              {card.rank}
            </span>

            {/* Efeito de brilho ao passar o mouse (opcional, via CSS) */}
            <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-transparent via-white/40 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </motion.button>
        );
      })}
    </div>
  );
}
