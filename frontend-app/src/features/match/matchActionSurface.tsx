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
    tone: 'truco' | 'accept' | 'decline' | 'raise';
  }> = [
    {
      action: 'request-truco',
      label: 'TRUCO!',
      enabled: availableActions.canRequestTruco,
      tone: 'truco',
    },
    {
      action: 'accept-bet',
      label: 'ACEITAR',
      enabled: availableActions.canAcceptBet,
      tone: 'accept',
    },
    {
      action: 'decline-bet',
      label: 'CORRER',
      enabled: availableActions.canDeclineBet,
      tone: 'decline',
    },
    {
      action: 'raise-to-six',
      label: 'PEDIR 6',
      enabled: availableActions.canRaiseToSix,
      tone: 'raise',
    },
    {
      action: 'raise-to-nine',
      label: 'PEDIR 9',
      enabled: availableActions.canRaiseToNine,
      tone: 'raise',
    },
    {
      action: 'raise-to-twelve',
      label: 'PEDIR 12',
      enabled: availableActions.canRaiseToTwelve,
      tone: 'raise',
    },
    {
      action: 'accept-mao-de-onze',
      label: 'ACEITAR 11',
      enabled: availableActions.canAcceptMaoDeOnze,
      tone: 'accept',
    },
    {
      action: 'decline-mao-de-onze',
      label: 'RECUSAR 11',
      enabled: availableActions.canDeclineMaoDeOnze,
      tone: 'decline',
    },
  ];

  const visibleButtons = buttons.filter((button) => button.enabled);

  return (
    <div className="rounded-2xl border border-amber-400/15 bg-slate-950/60 p-4">
      <div className="flex flex-wrap justify-center gap-3">
        {visibleButtons.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-3 text-sm text-slate-500">
            Nenhuma ação disponível neste momento.
          </div>
        ) : (
          visibleButtons.map((button) => (
            <button
              key={button.action}
              type="button"
              onClick={() => onAction(button.action)}
              className={`rounded-xl px-6 py-3 text-sm font-black tracking-wide transition ${
                button.tone === 'truco'
                  ? 'bg-red-700 text-white shadow-[0_0_18px_rgba(185,28,28,0.4)] hover:bg-red-600'
                  : button.tone === 'accept'
                    ? 'border border-amber-400/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                    : button.tone === 'decline'
                      ? 'border border-slate-500/40 bg-slate-700/50 text-slate-300 hover:bg-slate-700'
                      : 'border border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'
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
