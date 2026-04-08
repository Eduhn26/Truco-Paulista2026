import { motion } from 'framer-motion';

import type { CardPayload, MatchStatePayload } from '../../services/socket/socketTypes';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';

export function MatchPlayerHandPanel({
  myCards,
  canPlayCard,
  tablePhase,
  launchingCardKey,
  currentPrivateHand,
  currentPublicHand,
  onPlayCard,
}: {
  myCards: CardPayload[];
  canPlayCard: boolean;
  tablePhase: TablePhase;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
}) {
  const cardCount = myCards.length;
  // Fan angles for cards: spread them like a real hand of cards
  const fanAngles: number[] =
    cardCount === 1
      ? [0]
      : cardCount === 2
        ? [-6, 6]
        : [-10, 0, 10];

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
      <div className="rounded-2xl border border-amber-400/15 bg-slate-950/50 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-bold text-slate-200">Minha mão</div>
          <span
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] ${
              canPlayCard
                ? 'bg-amber-500/20 text-amber-300 shadow-[0_0_14px_rgba(201,168,76,0.2)]'
                : 'bg-white/5 text-slate-400'
            }`}
          >
            {canPlayCard ? 'Seu turno' : 'Aguardando'}
          </span>
        </div>

        {/* Card fan area */}
        <div className="relative mt-6 flex min-h-48 items-end justify-center gap-0">
          {myCards.length === 0 ? (
            <HandEmptyState tablePhase={tablePhase} />
          ) : (
            myCards.map((card, index) => {
              const cardKey = `${card.rank}|${card.suit}`;
              const isLaunching = launchingCardKey === cardKey;
              const baseAngle = fanAngles[index] ?? 0;
              const hoverAnimation =
                canPlayCard && !isLaunching
                  ? { y: -28, scale: 1.08, rotate: 0, zIndex: 10 }
                  : {};
              const tapAnimation = canPlayCard && !isLaunching ? { scale: 0.95 } : {};
              const animateState = isLaunching
                ? {
                    opacity: 0,
                    y: -240,
                    x: 30,
                    rotate: baseAngle + 18,
                    scale: 0.7,
                    filter: 'blur(3px)',
                  }
                : {
                    opacity: 1,
                    y: 0,
                    rotate: baseAngle,
                    scale: 1,
                    filter: 'blur(0px)',
                  };

              return (
                <motion.button
                  key={cardKey}
                  type="button"
                  onClick={() => onPlayCard(card)}
                  disabled={!canPlayCard || isLaunching}
                  initial={{
                    opacity: 0,
                    y: 40,
                    rotate: baseAngle * 2,
                  }}
                  animate={animateState}
                  transition={{
                    delay: isLaunching ? 0 : index * 0.09,
                    type: 'spring',
                    stiffness: 220,
                    damping: 18,
                  }}
                  whileHover={hoverAnimation}
                  whileTap={tapAnimation}
                  style={{ marginLeft: index > 0 ? '-18px' : 0 }}
                  className={`relative flex h-44 w-28 flex-col items-center justify-between rounded-2xl border px-3 py-4 shadow-[0_16px_40px_rgba(2,6,23,0.5)] transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    canPlayCard && !isLaunching
                      ? 'border-amber-400/40 bg-[linear-gradient(160deg,#fffdf5,#f5e6c8)] text-slate-900 shadow-[0_0_18px_rgba(201,168,76,0.2)]'
                      : 'border-white/20 bg-[linear-gradient(160deg,#ffffff,#eef2ff)] text-slate-900'
                  }`}
                  title={`Jogar ${card.rank}${suitSymbol(card.suit)}`}
                >
                  <span className="self-start text-lg font-black">{card.rank}</span>
                  <span className={`text-4xl ${suitColorClass(card.suit)}`}>{suitSymbol(card.suit)}</span>
                  <span className="self-end rotate-180 text-lg font-black">{card.rank}</span>
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-3">
        <MiniMetric
          label="Vira"
          value={currentPrivateHand?.viraRank ?? currentPublicHand?.viraRank ?? '-'}
          mono
        />
        <MiniMetric label="Viewer" value={currentPrivateHand?.viewerPlayerId ?? '-'} mono />
        <MiniMetric
          label="Mão terminada"
          value={String(currentPublicHand?.finished ?? false)}
          mono
        />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className={`mt-2 text-sm text-slate-100 ${mono ? 'font-mono' : 'font-semibold'}`}>{value}</div>
    </div>
  );
}

function HandEmptyState({ tablePhase }: { tablePhase: TablePhase }) {
  let message = 'Aguardando início da mão.';

  if (tablePhase === 'playing') {
    message = 'Aguardando estado privado da mão.';
  }

  if (tablePhase === 'hand_finished') {
    message = 'A mão já foi resolvida.';
  }

  if (tablePhase === 'match_finished') {
    message = 'A partida já encerrou.';
  }

  return (
    <div className="flex min-h-40 w-full items-center justify-center rounded-xl border border-dashed border-amber-400/15 bg-slate-950/40 px-6 py-10 text-center text-sm leading-7 text-slate-500">
      {message}
    </div>
  );
}

function suitSymbol(suit: CardPayload['suit']): string {
  if (suit === 'C') {
    return '♥';
  }

  if (suit === 'O') {
    return '♦';
  }

  if (suit === 'P') {
    return '♣';
  }

  return '♠';
}

function suitColorClass(suit: CardPayload['suit']): string {
  return suit === 'C' || suit === 'O' ? 'text-red-600' : 'text-slate-900';
}
