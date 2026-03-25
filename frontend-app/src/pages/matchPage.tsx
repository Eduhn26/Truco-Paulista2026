import { useParams } from 'react-router-dom';

export function MatchPage() {
  const params = useParams<{ matchId: string }>();

  return (
    <section className="grid gap-6">
      <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-300">
          Match shell
        </p>

        <h1 className="mt-3 text-3xl font-black tracking-tight">
          Match {params.matchId ?? '-'}
        </h1>

        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300">
          Aqui ainda não existe regra de mesa nem reconstrução local do estado.
          Esta tela é só a casca visual que vai receber, nas próximas micro-etapas,
          o estado derivado de <code>room-state</code> e <code>match-state</code>.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <div className="rounded-[2rem] border border-emerald-500/15 bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.18),_transparent_55%),linear-gradient(180deg,rgba(10,40,22,0.85),rgba(10,32,22,0.65))] p-6">
            <div className="mx-auto grid min-h-[420px] max-w-4xl place-items-center rounded-[2rem] border border-white/10">
              <div className="text-center">
                <div className="text-sm uppercase tracking-[0.25em] text-slate-400">
                  Truco table
                </div>
                <div className="mt-3 text-2xl font-black tracking-tight text-slate-100">
                  Visual shell only
                </div>
                <div className="mt-3 max-w-md text-sm leading-6 text-slate-300">
                  Próximo passo: refletir seats, turn, score, mão e jogadas a partir do
                  backend, sem mover regra de jogo para o client.
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="rounded-3xl border border-white/10 bg-slate-900/70 p-6">
          <h2 className="text-lg font-bold">Roadmap desta tela</h2>

          <ol className="mt-4 grid gap-3 text-sm text-slate-300">
            <li className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              1. Conectar room-state ao shell da mesa
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              2. Conectar match-state ao placar
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              3. Renderizar mão/cartas jogadas por estado do servidor
            </li>
            <li className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
              4. Integrar ações de ready / get-state / start-hand / play-card
            </li>
          </ol>
        </aside>
      </div>
    </section>
  );
}