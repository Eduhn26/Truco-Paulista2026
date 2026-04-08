import type { MatchStatePayload } from '../../services/socket/socketTypes';

type MatchActionType =
  | 'request-truco'
  | 'accept-bet'
  | 'decline-bet'
  | 'raise-to-six'
  | 'raise-to-nine'
  | 'raise-to-twelve'
  | 'accept-mao-de-onze'
  | 'decline-mao-de-onze';

type ActionButtonView = {
  action: MatchActionType;
  label: string;
  enabled: boolean;
  tone: 'emerald' | 'amber' | 'rose';
  emphasis: 'primary' | 'secondary';
};

export function MatchActionSurface({
  availableActions,
  onAction,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchActionType) => void;
}) {
  const buttons: ActionButtonView[] = [
    {
      action: 'request-truco',
      label: 'Pedir truco',
      enabled: availableActions.canRequestTruco,
      tone: 'rose',
      emphasis: 'primary',
    },
    {
      action: 'accept-bet',
      label: 'Aceitar aposta',
      enabled: availableActions.canAcceptBet,
      tone: 'emerald',
      emphasis: 'primary',
    },
    {
      action: 'decline-bet',
      label: 'Correr',
      enabled: availableActions.canDeclineBet,
      tone: 'rose',
      emphasis: 'secondary',
    },
    {
      action: 'raise-to-six',
      label: 'Pedir 6',
      enabled: availableActions.canRaiseToSix,
      tone: 'amber',
      emphasis: 'secondary',
    },
    {
      action: 'raise-to-nine',
      label: 'Pedir 9',
      enabled: availableActions.canRaiseToNine,
      tone: 'amber',
      emphasis: 'secondary',
    },
    {
      action: 'raise-to-twelve',
      label: 'Pedir 12',
      enabled: availableActions.canRaiseToTwelve,
      tone: 'amber',
      emphasis: 'secondary',
    },
    {
      action: 'accept-mao-de-onze',
      label: 'Aceitar mão de 11',
      enabled: availableActions.canAcceptMaoDeOnze,
      tone: 'emerald',
      emphasis: 'primary',
    },
    {
      action: 'decline-mao-de-onze',
      label: 'Recusar mão de 11',
      enabled: availableActions.canDeclineMaoDeOnze,
      tone: 'rose',
      emphasis: 'secondary',
    },
  ];

  const visibleButtons = buttons.filter((button) => button.enabled);
  const primaryButtons = visibleButtons.filter((button) => button.emphasis === 'primary');
  const secondaryButtons = visibleButtons.filter((button) => button.emphasis === 'secondary');

  return (
    <section className="overflow-hidden rounded-[28px] border border-white/10 bg-slate-950/45">
      <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(201,168,76,0.12),transparent_32%),linear-gradient(180deg,rgba(15,25,35,0.9),rgba(8,12,16,0.84))] px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/85">
              Action surface
            </div>
            <div className="mt-1.5 text-base font-black tracking-tight text-slate-100">
              Backend-authoritative decisions
            </div>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-400">
              The action rail only exposes moves explicitly released by the authoritative hand
              contract.
            </p>
          </div>

          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            truth first
          </span>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 sm:px-5">
        {visibleButtons.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-sm leading-6 text-slate-400">
            Nenhuma ação especial disponível neste momento. A mesa continua aguardando o próximo
            movimento liberado pelo backend.
          </div>
        ) : (
          <>
            {primaryButtons.length > 0 ? (
              <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {primaryButtons.map((button) => (
                  <ActionButton
                    key={button.action}
                    action={button.action}
                    label={button.label}
                    tone={button.tone}
                    emphasis={button.emphasis}
                    onAction={onAction}
                  />
                ))}
              </div>
            ) : null}

            {secondaryButtons.length > 0 ? (
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                {secondaryButtons.map((button) => (
                  <ActionButton
                    key={button.action}
                    action={button.action}
                    label={button.label}
                    tone={button.tone}
                    emphasis={button.emphasis}
                    onAction={onAction}
                  />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

function ActionButton({
  action,
  label,
  tone,
  emphasis,
  onAction,
}: {
  action: MatchActionType;
  label: string;
  tone: 'emerald' | 'amber' | 'rose';
  emphasis: 'primary' | 'secondary';
  onAction: (action: MatchActionType) => void;
}) {
  const toneClass =
    tone === 'emerald'
      ? emphasis === 'primary'
        ? 'border-emerald-400/35 bg-emerald-500/16 text-emerald-200 hover:bg-emerald-500/22'
        : 'border-emerald-400/22 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/16'
      : tone === 'rose'
        ? emphasis === 'primary'
          ? 'border-rose-400/35 bg-rose-500/16 text-rose-100 hover:bg-rose-500/22'
          : 'border-rose-400/22 bg-rose-500/10 text-rose-100 hover:bg-rose-500/16'
        : emphasis === 'primary'
          ? 'border-amber-400/35 bg-amber-500/16 text-amber-100 hover:bg-amber-500/22'
          : 'border-amber-400/22 bg-amber-500/10 text-amber-100 hover:bg-amber-500/16';

  const sizeClass =
    emphasis === 'primary'
      ? 'min-h-[72px] rounded-[22px] px-4 py-3 text-sm'
      : 'min-h-[62px] rounded-[20px] px-3.5 py-3 text-sm';

  return (
    <button
      type="button"
      onClick={() => onAction(action)}
      className={`group border text-left font-black transition ${toneClass} ${sizeClass}`}
    >
      <div className="flex h-full items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/45">
            Available now
          </div>
          <div className="mt-1.5">{label}</div>
        </div>

        <span className="rounded-full border border-white/10 bg-black/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-white/70 transition group-hover:bg-black/15">
          Act
        </span>
      </div>
    </button>
  );
}
