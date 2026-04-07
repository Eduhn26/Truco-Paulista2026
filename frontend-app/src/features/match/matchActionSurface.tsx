import type { MatchStatePayload } from '../../services/socket/socketTypes';

export function MatchActionSurface({
  availableActions,
  onAction,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (
    action:
      | 'request-truco'
      | 'accept-bet'
      | 'decline-bet'
      | 'raise-to-six'
      | 'raise-to-nine'
      | 'raise-to-twelve'
      | 'accept-mao-de-onze'
      | 'decline-mao-de-onze',
  ) => void;
}) {
  const buttons: Array<{
    action:
      | 'request-truco'
      | 'accept-bet'
      | 'decline-bet'
      | 'raise-to-six'
      | 'raise-to-nine'
      | 'raise-to-twelve'
      | 'accept-mao-de-onze'
      | 'decline-mao-de-onze';
    label: string;
    enabled: boolean;
    tone: 'emerald' | 'amber' | 'rose';
  }> = [
    {
      action: 'request-truco',
      label: 'Pedir truco',
      enabled: availableActions.canRequestTruco,
      tone: 'emerald',
    },
    {
      action: 'accept-bet',
      label: 'Aceitar aposta',
      enabled: availableActions.canAcceptBet,
      tone: 'emerald',
    },
    {
      action: 'decline-bet',
      label: 'Correr',
      enabled: availableActions.canDeclineBet,
      tone: 'rose',
    },
    {
      action: 'raise-to-six',
      label: 'Pedir 6',
      enabled: availableActions.canRaiseToSix,
      tone: 'amber',
    },
    {
      action: 'raise-to-nine',
      label: 'Pedir 9',
      enabled: availableActions.canRaiseToNine,
      tone: 'amber',
    },
    {
      action: 'raise-to-twelve',
      label: 'Pedir 12',
      enabled: availableActions.canRaiseToTwelve,
      tone: 'amber',
    },
    {
      action: 'accept-mao-de-onze',
      label: 'Aceitar mão de 11',
      enabled: availableActions.canAcceptMaoDeOnze,
      tone: 'emerald',
    },
    {
      action: 'decline-mao-de-onze',
      label: 'Recusar mão de 11',
      enabled: availableActions.canDeclineMaoDeOnze,
      tone: 'rose',
    },
  ];

  const visibleButtons = buttons.filter((button) => button.enabled);

  return (
    <div className="rounded-[30px] border border-white/10 bg-slate-950/38 p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-base font-black tracking-tight text-slate-100">
            Available actions
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-400">
            A barra responde ao contrato autoritativo da mão. Nenhum botão é liberado por inferência
            paralela.
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
          backend truth
        </span>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {visibleButtons.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-slate-400">
            Nenhuma ação especial disponível neste momento.
          </div>
        ) : (
          visibleButtons.map((button) => (
            <button
              key={button.action}
              type="button"
              onClick={() => onAction(button.action)}
              className={`rounded-2xl border px-4 py-3 text-sm font-bold transition ${
                button.tone === 'emerald'
                  ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/18'
                  : button.tone === 'rose'
                    ? 'border-rose-400/25 bg-rose-500/12 text-rose-200 hover:bg-rose-500/18'
                    : 'border-amber-400/25 bg-amber-500/12 text-amber-200 hover:bg-amber-500/18'
              }`}
            >
              {button.label}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
