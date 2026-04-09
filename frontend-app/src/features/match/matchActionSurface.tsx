import { AnimatePresence, motion } from 'framer-motion';

import type { MatchStatePayload } from '../../services/socket/socketTypes';

type MatchAction =
  | 'request-truco'
  | 'accept-bet'
  | 'decline-bet'
  | 'raise-to-six'
  | 'raise-to-nine'
  | 'raise-to-twelve'
  | 'accept-mao-de-onze'
  | 'decline-mao-de-onze';

type ActionTier = 'primary' | 'accept' | 'decline' | 'raise';

type ActionButton = {
  action: MatchAction;
  label: string;
  enabled: boolean;
  tier: ActionTier;
};

export function MatchActionSurface({
  availableActions,
  onAction,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
}) {
  const buttons: ActionButton[] = [
    {
      action: 'request-truco',
      label: 'TRUCO!',
      enabled: availableActions.canRequestTruco,
      tier: 'primary',
    },
    {
      action: 'accept-bet',
      label: 'ACEITAR',
      enabled: availableActions.canAcceptBet,
      tier: 'accept',
    },
    {
      action: 'decline-bet',
      label: 'CORRER',
      enabled: availableActions.canDeclineBet,
      tier: 'decline',
    },
    {
      action: 'raise-to-six',
      label: 'PEDIR 6',
      enabled: availableActions.canRaiseToSix,
      tier: 'raise',
    },
    {
      action: 'raise-to-nine',
      label: 'PEDIR 9',
      enabled: availableActions.canRaiseToNine,
      tier: 'raise',
    },
    {
      action: 'raise-to-twelve',
      label: 'PEDIR 12',
      enabled: availableActions.canRaiseToTwelve,
      tier: 'raise',
    },
    {
      action: 'accept-mao-de-onze',
      label: 'ACEITAR 11',
      enabled: availableActions.canAcceptMaoDeOnze,
      tier: 'accept',
    },
    {
      action: 'decline-mao-de-onze',
      label: 'RECUSAR 11',
      enabled: availableActions.canDeclineMaoDeOnze,
      tier: 'decline',
    },
  ];

  const visibleButtons = buttons.filter((button) => button.enabled);

  return (
    <section className="rounded-[24px] border border-white/10 bg-black/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
          Barra de ação
        </div>

        <div className="text-sm text-slate-400">
          As decisões disponíveis aparecem somente quando o backend libera a ação.
        </div>
      </div>

      <div className="mt-4">
        <AnimatePresence mode="wait">
          {visibleButtons.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="rounded-[18px] border border-dashed border-white/10 bg-white/[0.02] px-4 py-4 text-center text-sm text-slate-500"
            >
              Nenhuma ação especial disponível neste momento.
            </motion.div>
          ) : (
            <motion.div
              key={visibleButtons.map((button) => button.action).join('-')}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex flex-wrap gap-3"
            >
              {visibleButtons.map((button) => (
                <motion.button
                  key={button.action}
                  type="button"
                  onClick={() => onAction(button.action)}
                  whileHover={{ y: -2, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.16 }}
                  className={buildActionButtonClassName(button.tier)}
                >
                  {button.label}
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// NOTE: The visual hierarchy lives in className instead of inline style so the
// Framer Motion button keeps a clean MotionStyle contract under strict typing.
function buildActionButtonClassName(tier: ActionTier): string {
  const baseClassName =
    'rounded-[18px] border px-5 py-3 text-sm font-black tracking-[0.08em] transition disabled:cursor-not-allowed disabled:opacity-50';

  if (tier === 'primary') {
    return `${baseClassName} border-red-500/40 bg-red-600 text-white shadow-[0_0_22px_rgba(220,38,38,0.35)] hover:bg-red-500`;
  }

  if (tier === 'accept') {
    return `${baseClassName} border-amber-400/35 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25`;
  }

  if (tier === 'decline') {
    return `${baseClassName} border-slate-500/35 bg-slate-700/45 text-slate-200 hover:bg-slate-700/65`;
  }

  return `${baseClassName} border-amber-400/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/18`;
}
