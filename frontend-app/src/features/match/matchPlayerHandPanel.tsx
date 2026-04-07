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
  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
      <div className="rounded-[30px] border border-white/10 bg-slate-950/38 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-base font-black tracking-tight text-slate-100">Minha mão</div>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              A mão visível vem exclusivamente do payload privado da partida.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] ${
              canPlayCard ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-slate-300'
            }`}
          >
            {canPlayCard ? 'Your turn' : 'Waiting'}
          </span>
        </div>

        <div className="mt-6 flex min-h-48 flex-wrap items-end gap-4">
          {myCards.length === 0 ? (
            <HandEmptyState tablePhase={tablePhase} />
          ) : (
            myCards.map((card, index) => {
              const cardKey = `${card.rank}|${card.suit}`;
              const isLaunching = launchingCardKey === cardKey;
              const hoverAnimation =
                canPlayCard && !isLaunching
                  ? { y: -22, scale: 1.06, rotate: index % 2 === 0 ? -2 : 2 }
                  : {};
              const tapAnimation = canPlayCard && !isLaunching ? { scale: 0.96 } : {};
              const animateState = isLaunching
                ? {
                    opacity: 0,
                    y: -220,
                    x: 34,
                    rotate: 14,
                    scale: 0.72,
                    filter: 'blur(2px)',
                  }
                : {
                    opacity: 1,
                    y: 0,
                    rotate: 0,
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
                    y: 34,
                    rotate: index % 2 === 0 ? -7 : 7,
                  }}
                  animate={animateState}
                  transition={{
                    delay: isLaunching ? 0 : index * 0.08,
                    type: 'spring',
                    stiffness: 240,
                    damping: 17,
                  }}
                  whileHover={hoverAnimation}
                  whileTap={tapAnimation}
                  className="flex h-44 w-28 flex-col items-center justify-between rounded-[24px] border border-white/15 bg-[linear-gradient(180deg,#ffffff,#eef2ff)] px-3 py-4 text-slate-950 shadow-[0_20px_42px_rgba(2,6,23,0.38)] transition disabled:cursor-not-allowed disabled:opacity-60"
                  title={`Play ${card.rank}${suitSymbol(card.suit)}`}
                >
                  <span className="self-start text-lg font-black">{card.rank}</span>
                  <span className={`text-4xl ${suitColorClass(card.suit)}`}>{suitSymbol(card.suit)}</span>
                  <span className="self-end text-lg font-black">{card.rank}</span>
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-4">
        <MiniMetric
          label="Vira"
          value={currentPrivateHand?.viraRank ?? currentPublicHand?.viraRank ?? '-'}
          mono
        />
        <MiniMetric label="Viewer" value={currentPrivateHand?.viewerPlayerId ?? '-'} mono />
        <MiniMetric label="Hand finished" value={String(currentPublicHand?.finished ?? false)} mono />
      </div>
    </div>
  );
}

function MiniMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className={`mt-2 text-sm text-slate-100 ${mono ? 'font-mono' : 'font-semibold'}`}>{value}</div>
    </div>
  );
}

function HandEmptyState({ tablePhase }: { tablePhase: TablePhase }) {
  let message = 'Waiting for start-hand.';

  if (tablePhase === 'playing') {
    message = 'Waiting for private hand state.';
  }

  if (tablePhase === 'hand_finished') {
    message = 'The hand is already resolved.';
  }

  if (tablePhase === 'match_finished') {
    message = 'The match has already ended.';
  }

  return (
    <div className="flex min-h-40 w-full items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-slate-950/35 px-6 py-10 text-center text-sm leading-7 text-slate-400">
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
  return suit === 'C' || suit === 'O' ? 'text-rose-600' : 'text-slate-900';
}
