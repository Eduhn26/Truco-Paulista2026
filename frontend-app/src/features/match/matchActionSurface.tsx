import { motion, type MotionStyle } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { MatchAction } from './matchActionTypes';
import type { MatchStatePayload } from '../../services/socket/socketTypes';

/**
 * PREMIUM PATCH — matchActionSurface
 *
 * Preserva 100%: lógica buildButtons, getButtonStyle tiers, handleActionClick,
 * trucoShake, visibleButtons, hasDecisionState, renderButton, layout.
 *
 * Refinos visuais:
 *   • Cada botão activo ganha um shimmer-overlay interno (pseudo-element via
 *     motion.div filho) que desliza no hover — efeito que já existe no CSS
 *     global pra CTAs gold, replicado aqui inline pra todos os tiers.
 *   • "TRUCO!" ativo tem pulsação vermelha mais nítida + inner glow mais
 *     quente.
 *   • Botão "Aceitar" tem inner highlight mais luminoso (efeito de metal
 *     polido verde).
 *   • "Correr" ganha borda com glassmorfismo mais definido.
 *   • Raises ficam com borda amber mais brilhante.
 *   • Helper label: pill mais polida com inner hairline.
 *   • Container: hairline dourada no topo + fundo walnut mais profundo.
 */

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
        border: '1px solid rgba(248,113,113,0.46)',
        color: '#fff',
        boxShadow: isPrimary
          ? '0 0 26px rgba(220,38,38,0.36), 0 0 8px rgba(248,113,113,0.28), 0 10px 22px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,180,180,0.28)'
          : '0 0 14px rgba(220,38,38,0.22), 0 8px 18px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,180,180,0.18)',
      };
    case 'accept':
      return {
        background: 'linear-gradient(180deg, #22a04f 0%, #166534 100%)',
        border: '1px solid rgba(74,222,128,0.40)',
        color: '#f0fdf4',
        boxShadow: isPrimary
          ? '0 0 22px rgba(34,197,94,0.30), 0 10px 22px rgba(0,0,0,0.26), inset 0 1px 0 rgba(134,239,172,0.28)'
          : '0 8px 16px rgba(0,0,0,0.20), inset 0 1px 0 rgba(134,239,172,0.18)',
      };
    case 'decline':
      return {
        background: 'linear-gradient(180deg, rgba(52,64,80,0.98), rgba(22,29,40,0.98))',
        border: '1px solid rgba(255,255,255,0.18)',
        color: '#e5e7eb',
        boxShadow: isPrimary
          ? '0 0 14px rgba(255,255,255,0.04), 0 10px 22px rgba(0,0,0,0.30), inset 0 1px 0 rgba(255,255,255,0.10)'
          : '0 8px 16px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.08)',
      };
    case 'raise':
      return {
        background: 'linear-gradient(180deg, #d97706 0%, #92400e 100%)',
        border: '1px solid rgba(251,191,36,0.44)',
        color: '#fef3c7',
        boxShadow: '0 8px 16px rgba(0,0,0,0.20), 0 0 12px rgba(217,119,6,0.24), inset 0 1px 0 rgba(254,243,199,0.22)',
      };
    default:
      return {};
  }
}

/* Shimmer overlay colors per tier */
const SHIMMER_COLOR: Record<ActionTier, string> = {
  primary: 'rgba(255,200,200,0.28)',
  accept: 'rgba(167,243,208,0.28)',
  decline: 'rgba(255,255,255,0.18)',
  raise: 'rgba(254,243,199,0.28)',
};

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
  const visibleButtons = buttons.filter((b) => b.enabled || b.persistWhenDisabled);

  const acceptButtons = visibleButtons.filter((b) => b.tier === 'accept');
  const declineButtons = visibleButtons.filter((b) => b.tier === 'decline');
  const raiseButtons = visibleButtons.filter((b) => b.tier === 'raise');
  const responseButtons = [...acceptButtons, ...declineButtons, ...raiseButtons];
  const trucoButton = visibleButtons.find((b) => b.action === 'request-truco') ?? null;

  const hasDecisionState = responseButtons.some((b) => b.enabled);
  const helperLabel = hasDecisionState
    ? emphasisLabel ?? 'Decisão pendente'
    : emphasisLabel ?? 'Pressão disponível';

  const handleActionClick = (button: ActionButton) => {
    if (!button.enabled) return;
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
        whileHover={isDisabled ? {} : { y: -1.5, scale: 1.025 }}
        whileTap={isDisabled ? {} : { scale: 0.96 }}
        style={{
          ...getButtonStyle(button.tier, isDisabled, isPrimary),
          borderRadius: 999,
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
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {/* Shimmer sweep on hover — runs via CSS animation, resets on leave */}
        {!isDisabled ? (
          <motion.div
            className="pointer-events-none absolute inset-0 rounded-full"
            initial={{ opacity: 0, x: '-110%' }}
            whileHover={{ opacity: 1, x: '110%' }}
            transition={{ duration: 0.55, ease: [0.20, 0.90, 0.24, 1] }}
            style={{
              background: `linear-gradient(115deg, transparent 30%, ${SHIMMER_COLOR[button.tier]} 50%, transparent 70%)`,
              mixBlendMode: 'overlay',
            }}
          />
        ) : null}
        {button.label}
      </motion.button>
    );
  };

  return (
    <div
      className="relative overflow-hidden"
      style={{
        borderRadius: 20,
        background: 'linear-gradient(180deg, rgba(8,14,24,0.86), rgba(4,8,18,0.92))',
        border: isCritical
          ? '1px solid rgba(201,168,76,0.26)'
          : '1px solid rgba(201,168,76,0.12)',
        backdropFilter: 'blur(14px)',
        padding: hasDecisionState ? '12px 14px' : '8px 10px',
        boxShadow: isCritical
          ? '0 0 0 1px rgba(201,168,76,0.08), 0 0 28px rgba(201,168,76,0.06), inset 0 1px 0 rgba(255,255,255,0.05)'
          : 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      {/* Hairline top */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-4 top-0 h-px"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(201,168,76,0.42), transparent)',
        }}
      />

      <div className="relative z-10 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span
            className="rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-[0.18em]"
            style={{
              background: hasDecisionState
                ? 'linear-gradient(180deg, rgba(201,168,76,0.18), rgba(150,118,40,0.10))'
                : 'rgba(201,168,76,0.07)',
              border: hasDecisionState
                ? '1px solid rgba(201,168,76,0.32)'
                : '1px solid rgba(201,168,76,0.12)',
              color: hasDecisionState ? '#e8c76a' : 'rgba(201,168,76,0.72)',
              boxShadow: hasDecisionState
                ? 'inset 0 1px 0 rgba(255,241,184,0.12)'
                : 'none',
            }}
          >
            {helperLabel}
          </span>

          {trucoButton && !hasDecisionState ? (
            <motion.button
              type="button"
              onClick={() => handleActionClick(trucoButton)}
              whileHover={!trucoButton.enabled ? {} : { y: -1.5, scale: 1.025 }}
              whileTap={!trucoButton.enabled ? {} : { scale: 0.97 }}
              animate={trucoShake ? { x: [-3, 3, -3, 3, 0] } : {}}
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
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {trucoButton.enabled ? (
                <>
                  {/* Pulsação interna vermelha */}
                  <motion.div
                    className="pointer-events-none absolute inset-0 rounded-full"
                    animate={{ opacity: [0, 0.18, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                    style={{
                      background:
                        'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.28), transparent 68%)',
                    }}
                  />
                  {/* Shimmer sweep */}
                  <motion.div
                    className="pointer-events-none absolute inset-0 rounded-full"
                    initial={{ opacity: 0, x: '-110%' }}
                    whileHover={{ opacity: 1, x: '110%' }}
                    transition={{ duration: 0.55 }}
                    style={{
                      background:
                        'linear-gradient(115deg, transparent 30%, rgba(255,180,180,0.32) 50%, transparent 70%)',
                      mixBlendMode: 'overlay',
                    }}
                  />
                </>
              ) : null}
              {trucoButton.label}
            </motion.button>
          ) : null}
        </div>

        {hasDecisionState ? (
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            {responseButtons.filter((b) => b.enabled).map((button) => {
              const prominence =
                button.tier === 'accept' || button.tier === 'decline'
                  ? 'primary'
                  : 'secondary';
              return renderButton(button, prominence);
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
