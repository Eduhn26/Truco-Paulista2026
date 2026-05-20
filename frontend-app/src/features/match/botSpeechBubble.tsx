import { AnimatePresence, motion } from 'framer-motion';

import type { BotDialogueEvent, BotDialogueRelationship } from './botDialogueCatalog';

type BotSpeechBubblePlacement =
  | 'top'
  | 'left'
  | 'right'
  | 'card-above'
  | 'card-left'
  | 'card-right'
  | 'partner-right';

type BotSpeechBubbleTail = {
  className: string;
  borders: { top?: string; bottom?: string; left?: string; right?: string };
};

type BotSpeechBubbleVisuals = {
  accent: string;
  accentSoft: string;
  glow: string;
  title: string;
  titleColor: string;
  textColor: string;
};

function resolvePlacementClassName(placement: BotSpeechBubblePlacement): string {
  if (placement === 'top') {
    return 'left-[58%] top-[42px] hidden md:block';
  }

  if (placement === 'left') {
    return '-left-3 top-[52px] hidden -translate-x-full lg:block';
  }

  if (placement === 'right') {
    return '-right-3 top-[52px] hidden translate-x-full lg:block';
  }

  if (placement === 'card-left') {
    return 'right-full top-1/2 mr-2 -translate-y-1/2';
  }

  if (placement === 'card-right') {
    return 'left-full top-1/2 ml-2 -translate-y-1/2';
  }

  return '';
}

function isTableAnchoredPlacement(placement: BotSpeechBubblePlacement): boolean {
  return placement === 'partner-right' || placement === 'card-above';
}

function resolveTailPlacement(placement: BotSpeechBubblePlacement): BotSpeechBubbleTail {
  if (placement === 'top') {
    return {
      className: '-left-1 top-3',
      borders: { bottom: 'border' },
    };
  }

  if (placement === 'left') {
    return {
      className: '-right-[5px] top-4',
      borders: { top: 'border', right: 'border' },
    };
  }

  if (placement === 'right' || placement === 'partner-right') {
    return {
      className: '-left-[5px] top-1/2 -translate-y-1/2',
      borders: { bottom: 'border', left: 'border' },
    };
  }

  if (placement === 'card-above') {
    return {
      className: 'left-1/2 -bottom-[5px] -translate-x-1/2',
      borders: { bottom: 'border', right: 'border' },
    };
  }

  if (placement === 'card-left') {
    return {
      className: '-right-[5px] top-1/2 -translate-y-1/2',
      borders: { top: 'border', right: 'border' },
    };
  }

  return {
    className: '-left-[5px] top-1/2 -translate-y-1/2',
    borders: { bottom: 'border', left: 'border' },
  };
}

function resolveEventTitle(event: BotDialogueEvent | null, relationship: BotDialogueRelationship): string {
  if (event === 'bot-thinking') {
    return 'Lendo a mesa';
  }

  if (event === 'bot-played-card') {
    return relationship === 'partner' ? 'Parceiro' : 'Na mesa';
  }

  if (
    event === 'bot-requested-truco' ||
    event === 'bot-raised-bet' ||
    event === 'bot-accepted-truco'
  ) {
    return 'Pressão';
  }

  if (event === 'bot-declined-truco') {
    return 'Recuou';
  }

  if (
    event === 'bot-won-round' ||
    event === 'partner-won-round' ||
    event === 'bot-lost-round' ||
    event === 'partner-lost-round'
  ) {
    return 'Vaza';
  }

  if (event === 'mao-de-onze-pressure') {
    return 'Mão de onze';
  }

  if (event === 'mao-de-ferro-pressure') {
    return 'Mão de ferro';
  }

  if (event === 'match-point-pressure') {
    return 'Ponto decisivo';
  }

  return relationship === 'partner' ? 'Parceiro' : 'Rival';
}

function resolveVisuals({
  event,
  relationship,
}: {
  event: BotDialogueEvent | null;
  relationship: BotDialogueRelationship;
}): BotSpeechBubbleVisuals {
  const isPartner = relationship === 'partner';
  const isPressure =
    event === 'bot-requested-truco' ||
    event === 'bot-raised-bet' ||
    event === 'bot-accepted-truco' ||
    event === 'mao-de-onze-pressure' ||
    event === 'mao-de-ferro-pressure' ||
    event === 'match-point-pressure';

  if (isPartner) {
    return {
      accent: isPressure ? 'rgba(255,241,184,0.72)' : 'rgba(134,239,172,0.58)',
      accentSoft: isPressure ? 'rgba(201,168,76,0.16)' : 'rgba(34,197,94,0.14)',
      glow: isPressure ? 'rgba(201,168,76,0.22)' : 'rgba(34,197,94,0.18)',
      title: resolveEventTitle(event, relationship),
      titleColor: isPressure ? '#fff1b8' : '#bbf7d0',
      textColor: isPressure ? '#fff7d6' : '#ecfdf5',
    };
  }

  return {
    accent: isPressure ? 'rgba(248,113,113,0.58)' : 'rgba(251,191,36,0.58)',
    accentSoft: isPressure ? 'rgba(127,29,29,0.18)' : 'rgba(245,158,11,0.14)',
    glow: isPressure ? 'rgba(220,38,38,0.18)' : 'rgba(245,158,11,0.18)',
    title: resolveEventTitle(event, relationship),
    titleColor: isPressure ? '#fecaca' : '#fde68a',
    textColor: isPressure ? '#fff1f2' : '#fff7ed',
  };
}

export function BotSpeechBubble({
  text,
  relationship,
  placement,
  event = null,
}: {
  text: string | null;
  relationship: BotDialogueRelationship;
  placement: BotSpeechBubblePlacement;
  event?: BotDialogueEvent | null;
}) {
  const visuals = resolveVisuals({ event, relationship });
  const tail = resolveTailPlacement(placement);

  const wrapperClassName = isTableAnchoredPlacement(placement)
    ? 'pointer-events-none relative z-[46]'
    : `pointer-events-none absolute z-[46] ${resolvePlacementClassName(placement)}`;

  return (
    <div className={wrapperClassName} aria-live="polite">
      <AnimatePresence mode="popLayout">
        {text ? (
          <motion.div
            key={`${event ?? 'speech'}-${text}`}
            initial={{ opacity: 0, y: 5, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.2, 0.9, 0.24, 1] }}
            className="relative min-w-[132px] max-w-[196px] rounded-[18px] px-3.5 py-2 text-left backdrop-blur-xl"
            style={{
              background:
                'radial-gradient(circle at 18% 0%, rgba(255,241,184,0.10), transparent 38%), linear-gradient(180deg, rgba(13,18,15,0.97), rgba(5,8,7,0.94))',
              border: `1px solid ${visuals.accent}`,
              boxShadow: `0 16px 28px rgba(0,0,0,0.44), 0 0 18px ${visuals.glow}, inset 0 1px 0 rgba(255,255,255,0.09)`,
            }}
          >
            <span
              aria-hidden
              className={`absolute h-2.5 w-2.5 rotate-45 ${tail.className}`}
              style={{
                background: 'rgba(8,12,10,0.97)',
                borderTop: tail.borders.top ? `1px solid ${visuals.accent}` : undefined,
                borderBottom: tail.borders.bottom ? `1px solid ${visuals.accent}` : undefined,
                borderLeft: tail.borders.left ? `1px solid ${visuals.accent}` : undefined,
                borderRight: tail.borders.right ? `1px solid ${visuals.accent}` : undefined,
              }}
            />

            <div
              aria-hidden
              className="absolute inset-x-4 top-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${visuals.accent}, transparent)`,
              }}
            />

            <div className="relative z-10 flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  background: visuals.accent,
                  boxShadow: `0 0 8px ${visuals.glow}`,
                }}
              />
              <span
                className="truncate text-[6.5px] font-black uppercase leading-none tracking-[0.18em]"
                style={{
                  color: visuals.titleColor,
                  fontFamily: 'Georgia, serif',
                  textShadow: '0 1px 5px rgba(0,0,0,0.58)',
                }}
              >
                {visuals.title}
              </span>
            </div>

            <span
              className="relative z-10 mt-1.5 block text-[10px] font-black uppercase leading-tight tracking-[0.08em]"
              style={{
                color: visuals.textColor,
                fontFamily: 'Georgia, serif',
                textShadow: '0 2px 6px rgba(0,0,0,0.64)',
              }}
            >
              “{text}”
            </span>

            <div
              aria-hidden
              className="absolute inset-x-3 bottom-0 h-5 rounded-b-[18px]"
              style={{
                background: `linear-gradient(180deg, transparent, ${visuals.accentSoft})`,
              }}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
