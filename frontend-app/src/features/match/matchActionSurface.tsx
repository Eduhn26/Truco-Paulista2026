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
      label: 'Seis',
      enabled: availableActions.canRaiseToSix,
      tier: 'raise',
    },
    {
      action: 'raise-to-nine',
      label: 'Nove',
      enabled: availableActions.canRaiseToNine,
      tier: 'raise',
    },
    {
      action: 'raise-to-twelve',
      label: 'Doze',
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

// CHANGE: buttons got a bigger minHeight when the prominence is "primary" so
// response buttons feel like real decisions, not toolbar chips. Same palette,
// heavier presence — especially when the PressureOverlay is visible above.
function getButtonStyle(tier: ActionTier, isDisabled: boolean, isPrimary: boolean): MotionStyle {
  if (isDisabled) {
    return {
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.05)',
      color: 'rgba(255,255,255,0.14)',
      cursor: 'not-allowed',
      boxShadow: 'none',
    };
  }

  switch (tier) {
    case 'primary':
      return {
        background: 'linear-gradient(180deg, #ea3423 0%, #c81d0d 55%, #9e1408 100%)',
        border: '1px solid rgba(248,113,113,0.42)',
        color: '#fff',
        boxShadow: isPrimary
          ? '0 0 20px rgba(220,38,38,0.32), 0 10px 22px rgba(0,0,0,0.30)'
          : '0 0 12px rgba(220,38,38,0.20), 0 8px 18px rgba(0,0,0,0.24)',
      };
    case 'accept':
      return {
        background: 'linear-gradient(180deg, #22a04f 0%, #166534 100%)',
        border: '1px solid rgba(74,222,128,0.36)',
        color: '#f0fdf4',
        boxShadow: isPrimary
          ? '0 0 18px rgba(34,197,94,0.26), 0 10px 22px rgba(0,0,0,0.24)'
          : '0 8px 16px rgba(0,0,0,0.18)',
      };
    case 'decline':
      return {
        background: 'linear-gradient(180deg, rgba(48,58,72,0.98), rgba(22,29,40,0.98))',
        border: '1px solid rgba(255,255,255,0.14)',
        color: '#e5e7eb',
        boxShadow: isPrimary
          ? '0 0 16px rgba(255,255,255,0.04), 0 10px 22px rgba(0,0,0,0.28)'
          : '0 8px 16px rgba(0,0,0,0.18)',
      };
    case 'raise':
      return {
        background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)',
        border: '1px solid rgba(251,191,36,0.34)',
        color: '#fef3c7',
        boxShadow: '0 8px 16px rgba(0,0,0,0.18)',
      };
    default:
      return {};
  }
}

export function MatchActionSurface({
  availableActions,
  onAction,
  isCritical = false,
  emphasisLabel = null,
}: {
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
  isCritical?: boolean;
  emphasisLabel?: string | null;
}) {
  const [trucoShake, setTrucoShake] = useState(false);

  const buttons = useMemo(() => buildButtons(availableActions), [availableActions]);
  const visibleButtons = buttons.filter((button) => button.enabled || button.persistWhenDisabled);

  const acceptButtons = visibleButtons.filter((button) => button.tier === 'accept');
  const declineButtons = visibleButtons.filter((button) => button.tier === 'decline');
  const raiseButtons = visibleButtons.filter((button) => button.tier === 'raise');
  const responseButtons = [...acceptButtons, ...declineButtons, ...raiseButtons];
  const trucoButton =
    visibleButtons.find((button) => button.action === 'request-truco') ?? null;

  const hasDecisionState = responseButtons.some((button) => button.enabled);
  const helperLabel = hasDecisionState
    ? emphasisLabel ?? 'Decisão pendente'
    : emphasisLabel ?? 'Pressão disponível';

  const handleActionClick = (button: ActionButton) => {
    if (!button.enabled) {
      return;
    }

    if (button.action === 'request-truco') {
      setTrucoShake(true);
      window.setTimeout(() => setTrucoShake(false), 480);
    }

    onAction(button.action);
  };

  const renderButton = (button: ActionButton, prominence: 'primary' | 'secondary') => {
    const isDisabled = !button.enabled;
    const isPrimary = prominence === 'primary';

    return (
      <motion.button
        key={button.action}
        type="button"
        onClick={() => handleActionClick(button)}
        whileHover={isDisabled ? {} : { y: -1, scale: 1.02 }}
        whileTap={isDisabled ? {} : { scale: 0.97 }}
        style={{
          ...getButtonStyle(button.tier, isDisabled, isPrimary),
          borderRadius: 999,
          // CHANGE: response buttons (Aceitar / Correr) bumped to minHeight 44
          // so they feel like decisive actions, not secondary chips.
          minHeight: isPrimary ? 44 : 32,
          minWidth: isPrimary ? 96 : 56,
          padding: isPrimary ? '10px 22px' : '6px 12px',
          fontSize: isPrimary ? 12 : 9,
          fontWeight: 900,
          letterSpacing: isPrimary ? '0.16em' : '0.13em',
          textTransform: 'uppercase',
          position: 'relative',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {button.label}
      </motion.button>
    );
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: 20,
        // CHANGE: the red "critical" wrapper was redundant with the new
        // PressureOverlay that already screams "truco incoming" in the
        // centre-top of the mesa. The action surface goes back to a calm,
        // premium dark base in every state. Less visual noise, cleaner dock.
        background: 'linear-gradient(180deg, rgba(6,12,22,0.84), rgba(3,8,16,0.90))',
        border: isCritical
          ? '1px solid rgba(201,168,76,0.22)'
          : '1px solid rgba(201,168,76,0.10)',
        backdropFilter: 'blur(12px)',
        padding: hasDecisionState ? '12px 14px' : '8px 10px',
        boxShadow: isCritical
          ? '0 0 0 1px rgba(201,168,76,0.08), inset 0 1px 0 rgba(255,255,255,0.04)'
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
      }}
    >
      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em]"
            style={{
              background: hasDecisionState
                ? 'rgba(201,168,76,0.14)'
                : 'rgba(201,168,76,0.08)',
              border: hasDecisionState
                ? '1px solid rgba(201,168,76,0.26)'
                : '1px solid rgba(201,168,76,0.12)',
              color: hasDecisionState ? '#e8c76a' : 'rgba(201,168,76,0.78)',
            }}
          >
            {helperLabel}
          </span>

          {trucoButton && !hasDecisionState ? (
            <motion.button
              type="button"
              onClick={() => handleActionClick(trucoButton)}
              whileHover={!trucoButton.enabled ? {} : { y: -1, scale: 1.02 }}
              whileTap={!trucoButton.enabled ? {} : { scale: 0.98 }}
              animate={trucoShake ? { x: [-2, 2, -2, 2, 0] } : {}}
              style={{
                ...getButtonStyle(trucoButton.tier, !trucoButton.enabled, true),
                borderRadius: 999,
                minHeight: 38,
                minWidth: 112,
                padding: '8px 18px',
                fontSize: 11,
                fontWeight: 900,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {trucoButton.enabled ? (
                <motion.div
                  className="pointer-events-none absolute inset-0 rounded-full"
                  animate={{ opacity: [0, 0.14, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  style={{
                    background:
                      'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.24), transparent 70%)',
                  }}
                />
              ) : null}
              {trucoButton.label}
            </motion.button>
          ) : null}
        </div>

        {hasDecisionState ? (
          // CHANGE: response row centred with more breathing room so each
          // button reads as a distinct decision. Was tight and cramped before.
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {responseButtons.filter((button) => button.enabled).map((button) => {
              const prominence =
                button.tier === 'accept' || button.tier === 'decline' ? 'primary' : 'secondary';

              return renderButton(button, prominence);
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
