import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';

import { loadMatchSnapshot } from '../features/match/matchSnapshotStorage';

const TABLE_SEAT_ORDER = ['T1B', 'T2A', 'T1A', 'T2B'] as const;

export function MatchPage() {
  const params = useParams<{ matchId: string }>();
  const matchId = params.matchId ?? '';

  const snapshot = useMemo(() => loadMatchSnapshot(matchId), [matchId]);

  const roomState = snapshot?.roomState ?? null;
  const matchState = snapshot?.matchState ?? null;
  const playerAssigned = snapshot?.playerAssigned ?? null;

  const seatCards = TABLE_SEAT_ORDER.map((seatId) => {
    const player = roomState?.players.find((entry) => entry.seatId === seatId);

    return {
      seatId,
      ready: player?.ready ?? false,
      isCurrentTurn: roomState?.currentTurnSeatId === seatId,
      isMine: playerAssigned?.seatId === seatId,
    };
  });

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Match screen bootstrap
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight">
          Match {matchId || '-'}
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Esta tela já consome o último snapshot conhecido de
          <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">room-state</code>
          e
          <code className="mx-1 rounded bg-white/5 px-2 py-1 text-xs">match-state</code>.
          Ainda não existe mesa autoritativa no client: isso continua no backend.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/lobby"
            className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400"
          >
            Voltar para lobby
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="rounded-[2rem] border border-emerald-500/15 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.18),_transparent_55%),linear-gradient(180deg,rgba(10,40,22,0.85),rgba(10,32,22,0.65))] p-6">
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {seatCards.map((seat) => (
                  <div
                    key={seat.seatId}
                    className={`rounded-3xl border p-4 ${
                      seat.isCurrentTurn
                        ? 'border-emerald-400/40 bg-emerald-500/10'
                        : 'border-white/10 bg-slate-950/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-black tracking-wide text-slate-100">
                        {seat.seatId}
                      </div>

                      {seat.isMine ? (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
                          You
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-4 text-sm text-slate-300">
                      ready: {String(seat.ready)}
                    </div>
                    <div className="mt-1 text-sm text-slate-400">
                      turn: {seat.isCurrentTurn ? 'active' : 'idle'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-white/10 bg-slate-950/40 p-6">
                <div className="text-center">
                  <div className="text-sm uppercase tracking-[0.25em] text-slate-400">
                    Truco table
                  </div>
                  <div className="mt-3 text-2xl font-black tracking-tight text-slate-100">
                    State-reflective shell
                  </div>
                  <div className="mt-3 max-w-xl mx-auto text-sm leading-6 text-slate-300">
                    A mesa agora já reflete o último estado conhecido do backend.
                    O próximo passo será receber esse estado ao vivo também dentro desta tela.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-lg font-bold">Match snapshot</h2>

          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">matchId</div>
              <div className="mt-2 break-all font-mono text-sm text-slate-100">
                {matchState?.matchId || roomState?.matchId || matchId || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">state</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {matchState?.state || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">score</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                T1 {matchState?.score.playerOne ?? 0} × T2 {matchState?.score.playerTwo ?? 0}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">
                currentTurnSeatId
              </div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {roomState?.currentTurnSeatId || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">mySeat</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {playerAssigned?.seatId || '-'}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-slate-500">canStart</div>
              <div className="mt-2 font-mono text-sm text-slate-100">
                {String(roomState?.canStart ?? false)}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}