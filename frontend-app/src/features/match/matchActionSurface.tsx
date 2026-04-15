import { motion, type MotionStyle } from 'framer-motion';
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
      label: 'Truco!',
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
      label: 'Aumentar (6)',
      enabled: availableActions.canRaiseToSix,
      tier: 'raise',
    },
    {
      action: 'raise-to-nine',
      label: 'Aumentar (9)',
      enabled: availableActions.canRaiseToNine,
      tier: 'raise',
    },
    {
      action: 'raise-to-twelve',
      label: 'Aumentar (12)',
      enabled: availableActions.canRaiseToTwelve,
      tier: 'raise',
    },
    {
      action: 'accept-mao-de-onze',
      label: 'Aceitar Mão 11',
      enabled: availableActions.canAcceptMaoDeOnze,
      tier: 'accept',
    },
    {
      action: 'decline-mao-de-onze',
      label: 'Recusar Mão 11',
      enabled: availableActions.canDeclineMaoDeOnze,
      tier: 'decline',
    },
  ];
}

function getButtonStyle(tier: ActionTier, isDisabled: boolean): MotionStyle {
  if (isDisabled) {
    return {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      color: 'rgba(255,255,255,0.2)',
      cursor: 'not-allowed',
      boxShadow: 'none',
    };
  }

  switch (tier) {
    case 'primary':
      return {
        background: 'linear-gradient(180deg, #dc2626 0%, #b91c1c 55%, #991b1b 100%)',
        border: '1px solid rgba(239,68,68,0.38)',
        color: '#fff',
        boxShadow: '0 0 16px rgba(220,38,38,0.22), 0 8px 18px rgba(0,0,0,0.26)',
      };
    case 'accept':
      return {
        background: 'linear-gradient(180deg, #166534 0%, #14532d 100%)',
        border: '1px solid rgba(74,222,128,0.22)',
        color: '#dcfce7',
        boxShadow: '0 0 12px rgba(22,163,74,0.14), 0 8px 18px rgba(0,0,0,0.24)',
      };
    case 'decline':
      return {
        background: 'linear-gradient(180deg, rgba(43,52,66,0.92) 0%, rgba(24,31,42,0.98) 100%)',
        border: '1px solid rgba(255,255,255,0.09)',
        color: '#d1d5db',
        boxShadow: '0 8px 18px rgba(0,0,0,0.24)',
      };
    case 'raise':
      return {
        background: 'linear-gradient(180deg, #b45309 0%, #92400e 55%, #78350f 100%)',
        border: '1px solid rgba(245,158,11,0.22)',
        color: '#fef3c7',
        boxShadow: '0 0 12px rgba(180,83,9,0.14), 0 8px 18px rgba(0,0,0,0.24)',
      };
    default:
      return {};
  }
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
  const hasActiveActions = enabledButtons.length > 0;

  const handleActionClick = (button: ActionButton) => {
    if (!button.enabled) {
      return;
    }

    if (button.action === 'request-truco') {
      setTrucoParticles(true);
      window.setTimeout(() => setTrucoParticles(false), 650);
    }

    onAction(button.action);
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: 18,
        background: hasActiveActions
          ? 'linear-gradient(180deg, rgba(6,12,20,0.56), rgba(4,8,14,0.72))'
          : 'linear-gradient(180deg, rgba(5,10,16,0.42), rgba(4,8,14,0.58))',
        border: hasActiveActions
          ? '1px solid rgba(201,168,76,0.08)'
          : '1px solid rgba(255,255,255,0.035)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
        backdropFilter: 'blur(10px)',
        padding: '8px 10px',
      }}
    >
      {/* NOTE: This top glow keeps the rail alive without turning it back into a heavy toolbar. */}
      <div
        className="pointer-events-none absolute inset-x-[20%] top-0 h-5 rounded-b-full"
        style={{
          background: hasActiveActions
            ? 'rgba(201,168,76,0.06)'
            : 'rgba(255,255,255,0.02)',
          filter: 'blur(10px)',
        }}
      />

      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex min-w-0 shrink items-center gap-2">
          <span
            className="shrink-0 rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em]"
            style={{
              background: hasActiveActions ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.035)',
              border: hasActiveActions
                ? '1px solid rgba(201,168,76,0.18)'
                : '1px solid rgba(255,255,255,0.06)',
              color: hasActiveActions ? '#c9a84c' : 'rgba(255,255,255,0.28)',
            }}
          >
            Ações
          </span>

          <span className="truncate text-[9px]" style={{ color: 'rgba(255,255,255,0.24)' }}>
            {hasActiveActions
              ? `${enabledButtons.length} disponível${enabledButtons.length !== 1 ? 'is' : ''}`
              : 'Aguardando a mesa'}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {visibleButtons.length === 0 ? (
            <div
              className="rounded-full px-3 py-1 text-[8px] font-bold uppercase tracking-[0.16em]"
              style={{
                color: 'rgba(255,255,255,0.2)',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              Aguardando
            </div>
          ) : (
            visibleButtons.map((button) => {
              const isDisabled = !button.enabled;
              const baseStyle = getButtonStyle(button.tier, isDisabled);
              const isPrimary = button.tier === 'primary';

              const buttonStyle: MotionStyle = {
                ...baseStyle,
                borderRadius: 999,
                padding: isPrimary ? '8px 18px' : '7px 13px',
                fontSize: isPrimary ? 11 : 9,
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                position: 'relative',
                overflow: 'hidden',
                transition: 'box-shadow 0.18s, transform 0.15s',
                minHeight: 34,
              };

              return (
                <motion.button
                  key={button.action}
                  type="button"
                  onClick={() => handleActionClick(button)}
                  whileHover={isDisabled ? {} : { y: -1, scale: 1.015 }}
                  whileTap={isDisabled ? {} : { scale: 0.98 }}
                  animate={
                    button.action === 'request-truco' && trucoParticles
                      ? { x: [-2, 2, -2, 2, 0] }
                      : {}
                  }
                  transition={{ duration: 0.18 }}
                  disabled={isDisabled}
                  style={buttonStyle}
                >
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: isDisabled
                        ? 'none'
                        : 'linear-gradient(180deg, rgba(255,255,255,0.1), transparent 34%)',
                      opacity: 0.75,
                    }}
                  />

                  <span style={{ position: 'relative', zIndex: 1 }}>{button.label}</span>

                  {button.action === 'request-truco' && trucoParticles && !isDisabled ? (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        overflow: 'hidden',
                        borderRadius: 'inherit',
                        pointerEvents: 'none',
                      }}
                    >
                      {[...Array(10)].map((_, index) => (
                        <motion.div
                          key={index}
                          initial={{ opacity: 1, x: 0, y: 0 }}
                          animate={{
                            opacity: 0,
                            x: (Math.random() - 0.5) * 80,
                            y: -Math.random() * 48,
                          }}
                          transition={{ duration: 0.55 }}
                          style={{
                            position: 'absolute',
                            left: '50%',
                            top: '50%',
                            width: 4,
                            height: 4,
                            borderRadius: '50%',
                            background: '#fde047',
                          }}
                        />
                      ))}
                    </div>
                  ) : null}
                </motion.button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
