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
  const visibleViraRank = currentPrivateHand?.viraRank ?? currentPublicHand?.viraRank ?? '-';
  const viewerPlayerId = currentPrivateHand?.viewerPlayerId ?? '-';
  const handFinished = String(currentPublicHand?.finished ?? false);

  return (
    <section className="overflow-hidden rounded-[26px] border border-white/10 bg-slate-950/42">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(45,106,79,0.12),transparent_36%),linear-gradient(180deg,rgba(15,25,35,0.88),rgba(8,12,16,0.76))] px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/85">
              Private hand
            </div>
            <div className="mt-1.5 text-base font-black tracking-tight text-slate-100">
              Sua área de jogo
            </div>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">
              A mão do jogador fica integrada ao fluxo principal de decisão, não separada como bloco
              isolado.
            </p>
          </div>

          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
              canPlayCard
                ? 'border border-emerald-400/25 bg-emerald-500/15 text-emerald-300'
                : 'border border-white/10 bg-white/[0.04] text-slate-300'
            }`}
          >
            {canPlayCard ? 'Your turn' : 'Waiting'}
          </span>
        </div>
      </div>

      <div className="grid gap-3 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniMetric label="Vira" value={visibleViraRank} highlight={visibleViraRank !== '-'} mono />
          <MiniMetric label="Viewer" value={viewerPlayerId} mono />
          <MiniMetric label="Hand finished" value={handFinished} mono />
        </div>

        <div className="rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,16,0.42),rgba(8,12,16,0.18))] p-4">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-sm font-black tracking-tight text-slate-100">Playable cards</div>
              <p className="mt-1 text-sm leading-6 text-slate-400">
                Hover and click feedback is active only when the backend contract says you can play.
              </p>
            </div>

            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              {myCards.length} card{myCards.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="mt-4 flex min-h-36 flex-wrap items-end gap-3">
            {myCards.length === 0 ? (
              <HandEmptyState tablePhase={tablePhase} />
            ) : (
              myCards.map((card, index) => {
                const cardKey = `${card.rank}|${card.suit}`;
                const isLaunching = launchingCardKey === cardKey;
                const hoverAnimation =
                  canPlayCard && !isLaunching
                    ? { y: -16, scale: 1.04, rotate: index % 2 === 0 ? -2 : 2 }
                    : {};
                const tapAnimation = canPlayCard && !isLaunching ? { scale: 0.97 } : {};
                const animateState = isLaunching
                  ? {
                      opacity: 0,
                      y: -180,
                      x: 26,
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
                      y: 28,
                      rotate: index % 2 === 0 ? -6 : 6,
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
                    className="flex h-36 w-24 min-w-[96px] flex-col items-center justify-between rounded-[20px] border border-white/15 bg-[linear-gradient(180deg,#fffdf7,#ece7d8)] px-2.5 py-3 text-slate-950 shadow-[0_22px_44px_rgba(2,6,23,0.38)] transition disabled:cursor-not-allowed disabled:opacity-60"
                    title={`Play ${card.rank}${suitSymbol(card.suit)}`}
                  >
                    <span className="self-start text-base font-black">{card.rank}</span>
                    <span className={`text-3xl ${suitColorClass(card.suit)}`}>
                      {suitSymbol(card.suit)}
                    </span>
                    <span className="self-end text-base font-black">{card.rank}</span>
                  </motion.button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniMetric({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[18px] border px-4 py-3 ${
        highlight
          ? 'border-amber-400/18 bg-amber-500/10'
          : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1.5 text-sm text-slate-100 ${mono ? 'font-mono' : 'font-semibold'}`}>
        {value}
      </div>
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
    <div className="flex min-h-32 w-full items-center justify-center rounded-[20px] border border-dashed border-white/10 bg-slate-950/35 px-6 py-6 text-center text-sm leading-7 text-slate-400">
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
