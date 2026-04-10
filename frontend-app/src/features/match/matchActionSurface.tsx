import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { MatchAction } from './matchActionTypes';
import type { MatchStatePayload } from '../../services/socket/socketTypes';

type ActionTier = 'primary' | 'accept' | 'decline' | 'raise';

type ActionButton = {
  action: MatchAction;
  label: string;
  enabled: boolean;
  tier: ActionTier;
  persistWhenDisabled?: boolean;
};

function buildButtons(
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'],
): ActionButton[] {
  return [
    {
      action: 'request-truco',
      label: 'Truco',
      enabled: availableActions.canRequestTruco,
      tier: 'primary',
      persistWhenDisabled: true,
    },
    {
      action: 'accept-bet',
      label: 'Aceitar',
      enabled: availableActions.canAcceptBet,
      tier: 'accept',
    },
    {
      action: 'decline-bet',
      label: 'Correr',
      enabled: availableActions.canDeclineBet,
      tier: 'decline',
    },
    {
      action: 'raise-to-six',
      label: 'Pedir 6',
      enabled: availableActions.canRaiseToSix,
      tier: 'raise',
    },
    {
      action: 'raise-to-nine',
      label: 'Pedir 9',
      enabled: availableActions.canRaiseToNine,
      tier: 'raise',
    },
    {
      action: 'raise-to-twelve',
      label: 'Pedir 12',
      enabled: availableActions.canRaiseToTwelve,
      tier: 'raise',
    },
    {
      action: 'accept-mao-de-onze',
      label: 'Aceitar 11',
      enabled: availableActions.canAcceptMaoDeOnze,
      tier: 'accept',
    },
    {
      action: 'decline-mao-de-onze',
      label: 'Recusar 11',
      enabled: availableActions.canDeclineMaoDeOnze,
      tier: 'decline',
    },
  ];
}

export function MatchActionSurface({
  availableActions,
  onAction,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
}) {
  const [trucoParticles, setTrucoParticles] = useState(false);

  const buttons = useMemo(() => buildButtons(availableActions), [availableActions]);

  const visibleButtons = buttons.filter((button) => button.enabled || button.persistWhenDisabled);

  const enabledButtons = buttons.filter((button) => button.enabled);

  const handleActionClick = (button: ActionButton) => {
    if (!button.enabled) {
      return;
    }

    if (button.action === 'request-truco') {
      setTrucoParticles(true);
      window.setTimeout(() => setTrucoParticles(false), 600);
    }

    onAction(button.action);
  };

  return (
    <div className="relative w-full overflow-hidden rounded-[22px] border border-amber-400/18 bg-[#08121b]/88 px-3 py-3 shadow-[0_14px_34px_rgba(0,0,0,0.34)] backdrop-blur-xl sm:px-4 sm:py-3.5">
      {/* NOTE: The action rail now stays compact enough to fit the viewport at 100%
          zoom while still preserving the premium betting-band feel. */}
      <div className="pointer-events-none absolute inset-x-10 top-0 h-8 rounded-b-full bg-amber-400/7 blur-2xl" />
      <div className="pointer-events-none absolute inset-[1px] rounded-[21px] border border-white/5" />

      <div className="relative z-10 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="rounded-full border border-amber-400/24 bg-amber-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-amber-300">
              Arena de Ações
            </span>

            <span className="text-[10px] font-medium text-slate-500">
              {enabledButtons.length > 0
                ? `${enabledButtons.length} decisões disponíveis`
                : 'Aguardando decisão da mesa'}
            </span>
          </div>

          <div className="rounded-full border border-white/8 bg-black/28 px-2.5 py-1 text-[9px] text-slate-500">
            Truco rail
          </div>
        </div>

        <div className="rounded-[18px] border border-white/7 bg-black/16 px-3 py-3">
          {visibleButtons.length === 0 ? (
            <div className="text-center text-[10px] text-slate-500">
              Nenhuma ação especial disponível neste momento.
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {visibleButtons.map((button) => {
                const isDisabled = !button.enabled;

                return (
                  <motion.button
                    key={button.action}
                    type="button"
                    onClick={() => handleActionClick(button)}
                    whileHover={isDisabled ? {} : { y: -2, scale: 1.015 }}
                    whileTap={isDisabled ? {} : { scale: 0.985 }}
                    animate={
                      button.action === 'request-truco' && trucoParticles
                        ? { x: [-2, 2, -2, 2, 0] }
                        : {}
                    }
                    transition={{ duration: 0.2 }}
                    disabled={isDisabled}
                    title={
                      isDisabled && button.action === 'request-truco'
                        ? 'Truco indisponível neste momento'
                        : undefined
                    }
                    className={`relative overflow-hidden rounded-[14px] border px-4 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${getButtonClasses(
                      button.tier,
                      isDisabled,
                    )}`}
                  >
                    <span className="relative z-10 drop-shadow-sm">{button.label}</span>

                    {button.action === 'request-truco' && trucoParticles && !isDisabled && (
                      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px]">
                        {[...Array(8)].map((_, index) => (
                          <motion.div
                            key={index}
                            initial={{ opacity: 1, x: 0, y: 0 }}
                            animate={{
                              opacity: 0,
                              x: (Math.random() - 0.5) * 80,
                              y: -Math.random() * 50,
                            }}
                            transition={{ duration: 0.5 }}
                            className="absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-amber-200"
                          />
                        ))}
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getButtonClasses(tier: ActionTier, isDisabled: boolean): string {
  if (isDisabled) {
    return 'cursor-not-allowed border-white/10 bg-white/[0.04] text-slate-500 opacity-70';
  }

  const base = 'relative shadow-[0_10px_22px_rgba(0,0,0,0.28)]';

  switch (tier) {
    case 'primary':
      return `${base} border-red-500/38 bg-gradient-to-b from-red-500 via-red-700 to-red-900 text-white hover:border-red-300/55 hover:shadow-[0_0_24px_rgba(239,68,68,0.38),0_10px_24px_rgba(0,0,0,0.35)]`;
    case 'accept':
      return `${base} border-emerald-500/30 bg-gradient-to-b from-emerald-600 via-emerald-800 to-emerald-950 text-emerald-50 hover:border-emerald-300/45 hover:shadow-[0_0_24px_rgba(16,185,129,0.22),0_10px_24px_rgba(0,0,0,0.35)]`;
    case 'decline':
      return `${base} border-slate-500/22 bg-gradient-to-b from-slate-700 to-slate-950 text-slate-100 hover:border-slate-300/30 hover:shadow-[0_0_18px_rgba(148,163,184,0.14),0_10px_24px_rgba(0,0,0,0.35)]`;
    case 'raise':
      return `${base} border-amber-500/32 bg-gradient-to-b from-amber-500 via-amber-700 to-amber-900 text-amber-50 hover:border-amber-300/50 hover:shadow-[0_0_24px_rgba(245,158,11,0.24),0_10px_24px_rgba(0,0,0,0.35)]`;
    default:
      return base;
  }
}
