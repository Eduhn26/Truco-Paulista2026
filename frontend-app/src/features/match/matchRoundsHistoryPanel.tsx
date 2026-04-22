import { motion } from 'framer-motion';
import type { MatchStatePayload } from '../../services/socket/socketTypes';

type RoundItem = NonNullable<MatchStatePayload['currentHand']>['rounds'][number];

const roundResolvedAnimation = {
  boxShadow: [
    '0 0 0 rgba(250,204,21,0)',
    '0 0 18px rgba(250,204,21,0.18)',
    '0 0 0 rgba(250,204,21,0)',
  ],
};

export function MatchRoundsHistoryPanel({
  rounds,
  latestRound,
  playedRoundsCount,
}: {
  rounds: RoundItem[];
  latestRound: RoundItem | null;
  playedRoundsCount: number;
}) {
  return (
    <section className="rounded-[22px] border border-amber-300/10 bg-[linear-gradient(180deg,rgba(10,19,19,0.9),rgba(7,12,18,0.84))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-black tracking-tight text-[#f0e6d3]">
            Rounds played
          </div>
          <p className="mt-1 text-[11px] leading-5 text-amber-50/42">
            Histórico vindo do `currentHand.rounds`, sem depender de narrativa local.
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-amber-300/10 bg-amber-500/[0.05] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/60">
          {playedRoundsCount} / 3
        </span>
      </div>

      <div className="mt-4 grid gap-3">
        {[0, 1, 2].map((index) => {
          const round = rounds[index] ?? null;
          const played = Boolean(round?.playerOneCard || round?.playerTwoCard);
          const isLatestResolved =
            latestRound != null && latestRound.finished && rounds.indexOf(latestRound) === index;

          return (
            <motion.div
              key={index}
              animate={isLatestResolved ? roundResolvedAnimation : {}}
              transition={{ duration: 1.1 }}
              className={`rounded-[20px] border p-3 ${
                played
                  ? 'border-amber-300/10 bg-white/[0.025]'
                  : 'border-dashed border-amber-300/10 bg-white/[0.018]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-100/35">
                  Round {index + 1}
                </div>

                <div className="text-[10px] font-semibold text-amber-50/45">
                  {formatRoundResult(round?.result ?? null)}
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                <RoundLine label="T1" value={round?.playerOneCard ?? '—'} />
                <RoundLine label="T2" value={round?.playerTwoCard ?? '—'} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}

function RoundLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[32px_minmax(0,1fr)] items-center gap-2 rounded-xl border border-amber-300/10 bg-[#070b11]/72 px-2.5 py-2 text-[#f0e6d3]">
      <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-100/35">
        {label}
      </span>

      <span className="truncate text-right font-mono text-[12px]">{value}</span>
    </div>
  );
}

function formatRoundResult(result: string | null): string {
  if (result === 'P1') {
    return 'T1';
  }

  if (result === 'P2') {
    return 'T2';
  }

  if (result === 'TIE') {
    return 'Tie';
  }

  return '—';
}

