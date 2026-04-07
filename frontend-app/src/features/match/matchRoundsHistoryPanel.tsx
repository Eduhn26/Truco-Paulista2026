import { motion } from 'framer-motion';
import type { MatchStatePayload } from '../../services/socket/socketTypes';

type RoundItem = NonNullable<MatchStatePayload['currentHand']>['rounds'][number];

const roundResolvedAnimation = {
  boxShadow: [
    '0 0 0 rgba(250,204,21,0)',
    '0 0 26px rgba(250,204,21,0.24)',
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
    <section className="rounded-[30px] border border-white/10 bg-slate-950/40 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-lg font-black tracking-tight text-slate-100">Rounds played</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Histórico vindo do `currentHand.rounds`, sem depender de narrativa local.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-300">
          {playedRoundsCount} / 3
        </span>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((index) => {
          const round = rounds[index] ?? null;
          const played = Boolean(round?.playerOneCard || round?.playerTwoCard);
          const isLatestResolved =
            latestRound != null && latestRound.finished && rounds.indexOf(latestRound) === index;

          return (
            <motion.div
              key={index}
              animate={isLatestResolved ? roundResolvedAnimation : {}}
              transition={{ duration: 1.2 }}
              className={`rounded-[28px] border p-5 ${
                played
                  ? 'border-white/10 bg-white/[0.03]'
                  : 'border-dashed border-white/10 bg-white/[0.02]'
              }`}
            >
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Round {index + 1}
              </div>

              <div className="mt-4 grid gap-3 text-sm">
                <RoundLine label="T1" value={round?.playerOneCard ?? '—'} />
                <RoundLine label="T2" value={round?.playerTwoCard ?? '—'} />
              </div>

              <div className="mt-4 text-xs text-slate-400">
                Result: {formatRoundResult(round?.result ?? null)}
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
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/45 px-3 py-2 text-slate-200">
      <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <span className="font-mono text-sm">{value}</span>
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
