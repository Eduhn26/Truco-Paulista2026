import { AnimatePresence, motion } from 'framer-motion';

import { MatchActionSurface } from './matchActionSurface';
import type { CardPayload, MatchStatePayload, Rank } from '../../services/socket/socketTypes';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';
type HandStatusVariant = 'neutral' | 'success' | 'warning';

type TableSeatView = {
  seatId: string;
  ready: boolean;
  isBot: boolean;
  isCurrentTurn: boolean;
  isMine: boolean;
};

type RoundView = NonNullable<MatchStatePayload['currentHand']>['rounds'][number] | null;

type MatchTableShellProps = {
  handStatusLabel: string;
  handStatusTone: HandStatusVariant;
  betState: string;
  currentValue: number;
  pendingValue: number | null;
  requestedBy: string | null;
  specialState: string;
  specialDecisionPending: boolean;
  specialDecisionBy: string | null;
  winner: string | null;
  awardedPoints: number | null;
  latestRound: RoundView;
  tablePhase: TablePhase;
  canStartHand: boolean;
  scoreLabel: string;
  opponentSeatView: TableSeatView | null;
  mySeatView: TableSeatView | null;
  isOneVsOne: boolean;
  roomMode: string | null;
  currentTurnSeatId: string | null;
  displayedOpponentPlayedCard: string | null;
  displayedMyPlayedCard: string | null;
  opponentRevealKey: number;
  myRevealKey: number;
  myCardLaunching: boolean;
  roundIntroKey: number;
  roundResolvedKey: number;
  currentPrivateViraRank: string | null;
  currentPublicViraRank: string | null;
  viraRank: Rank;
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
  myCards: CardPayload[];
  canPlayCard: boolean;
  launchingCardKey: string | null;
  onPlayCard: (card: CardPayload) => void;
};

const roundResolvedAnimation = {
  boxShadow: [
    '0 0 0 rgba(250,204,21,0)',
    '0 0 26px rgba(250,204,21,0.24)',
    '0 0 0 rgba(250,204,21,0)',
  ],
};

export function MatchTableShell(props: MatchTableShellProps) {
  const {
    handStatusLabel,
    handStatusTone,
    betState,
    currentValue,
    pendingValue,
    requestedBy,
    specialState,
    specialDecisionPending,
    specialDecisionBy,
    winner,
    awardedPoints,
    latestRound,
    tablePhase,
    canStartHand,
    scoreLabel,
    opponentSeatView,
    mySeatView,
    isOneVsOne,
    roomMode,
    currentTurnSeatId,
    displayedOpponentPlayedCard,
    displayedMyPlayedCard,
    opponentRevealKey,
    myRevealKey,
    myCardLaunching,
    roundIntroKey,
    roundResolvedKey,
    currentPrivateViraRank,
    currentPublicViraRank,
    viraRank,
    availableActions,
    onAction,
    myCards,
    canPlayCard,
    launchingCardKey,
    onPlayCard,
  } = props;

  return (
    <motion.div
      layout
      className="relative overflow-hidden rounded-[32px] border border-emerald-500/15 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.22),transparent_48%),linear-gradient(180deg,rgba(13,64,40,0.94),rgba(8,25,21,0.98))] px-5 py-6 sm:px-8 sm:py-8"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,rgba(255,255,255,0.04),transparent_45%)]" />
      <div className="pointer-events-none absolute bottom-3 left-1/2 h-12 w-[78%] -translate-x-1/2 rounded-full bg-black/20 blur-xl" />

      <div className="relative grid gap-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-lg font-black tracking-tight text-slate-100">Table state</div>
            <p className="mt-2 text-sm leading-6 text-emerald-50/75">
              Mesa centrada na verdade do payload: oponente em cima, você embaixo, slots centrais e
              próxima ação guiada pelo backend.
            </p>
          </div>

          <motion.div
            key={handStatusLabel}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-3xl border px-4 py-3 text-sm font-bold ${statusToneClass(handStatusTone)}`}
          >
            {handStatusLabel}
          </motion.div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <StatusPanel
            title="Bet state"
            value={formatBetStatus({ betState, currentValue, pendingValue, requestedBy })}
            detail={formatBetDetail({ betState, currentValue, pendingValue, requestedBy })}
            tone={betState === 'awaiting_response' ? 'warning' : 'neutral'}
          />
          <StatusPanel
            title="Special hand"
            value={formatSpecialState(specialState)}
            detail={formatSpecialDetail({ specialState, specialDecisionPending, specialDecisionBy, winner, awardedPoints })}
            tone={
              specialState !== 'normal' || specialDecisionPending
                ? 'warning'
                : winner || awardedPoints
                  ? 'success'
                  : 'neutral'
            }
          />
        </div>

        <AnimatePresence>
          {roundIntroKey > 0 && tablePhase === 'playing' ? (
            <motion.div
              key={`hand-intro-${roundIntroKey}`}
              initial={{ opacity: 0, y: -18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.96 }}
              transition={{ duration: 0.45 }}
              className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border border-emerald-400/20 bg-slate-950/85 px-5 py-2 text-sm font-bold text-emerald-300 shadow-[0_12px_30px_rgba(2,6,23,0.35)]"
            >
              Nova mão iniciada · vira {currentPrivateViraRank ?? currentPublicViraRank ?? viraRank}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {roundResolvedKey > 0 && latestRound?.finished ? (
            <motion.div
              key={`round-resolved-${roundResolvedKey}`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.35 }}
              className="absolute left-1/2 top-32 z-20 -translate-x-1/2 rounded-full border border-amber-400/20 bg-slate-950/85 px-5 py-2 text-sm font-bold text-amber-200 shadow-[0_12px_30px_rgba(2,6,23,0.35)]"
            >
              Round fechado · {formatRoundResult(latestRound.result)}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {(tablePhase === 'hand_finished' || tablePhase === 'match_finished') && (
          <HandCompletionBanner
            tablePhase={tablePhase}
            canStartHand={canStartHand}
            scoreLabel={scoreLabel}
          />
        )}

        <div className="grid gap-7">
          <div className="grid justify-center">
            {opponentSeatView ? (
              <SeatBadge
                seat={opponentSeatView}
                label={isOneVsOne ? 'Opponent' : opponentSeatView.seatId}
              />
            ) : null}
          </div>

          <div className="relative grid gap-5 md:grid-cols-2">
            <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-white/5 md:block" />

            <motion.div layout className="grid gap-3">
              <PlayedCardZone
                title={isOneVsOne ? 'Opponent card' : 'Upper side card'}
                value={displayedOpponentPlayedCard}
                perspective="top"
                highlight={Boolean(opponentSeatView?.isCurrentTurn)}
                revealKey={opponentRevealKey}
                isRevealed
              />
            </motion.div>

            <motion.div layout className="grid gap-3">
              <PlayedCardZone
                title={isOneVsOne ? 'Your card' : 'Lower side card'}
                value={displayedMyPlayedCard}
                perspective="bottom"
                highlight={Boolean(mySeatView?.isCurrentTurn)}
                revealKey={myRevealKey}
                isRevealed={Boolean(displayedMyPlayedCard)}
                isLaunching={myCardLaunching}
              />
            </motion.div>
          </div>

          <div className="grid justify-center">
            {mySeatView ? (
              <SeatBadge seat={mySeatView} label={isOneVsOne ? 'You' : mySeatView.seatId} />
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
            <MetricCard label="Mode" value={roomMode ?? '-'} />
            <MetricCard label="Turn" value={currentTurnSeatId ?? '-'} />
            <MetricCard label="Last round" value={formatRoundResult(latestRound?.result ?? null)} />
            <MetricCard label="Score" value={scoreLabel} />
            <MetricCard label="Current value" value={String(currentValue)} />
            <MetricCard label="Special state" value={formatSpecialState(specialState)} />
          </div>

          <MatchActionSurface availableActions={availableActions} onAction={onAction} />

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <div className="rounded-[30px] border border-white/10 bg-slate-950/38 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-base font-black tracking-tight text-slate-100">
                    Minha mão
                  </div>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    A mão visível vem exclusivamente do payload privado da partida.
                  </p>
                </div>

                <span
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] ${
                    canPlayCard ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-slate-300'
                  }`}
                >
                  {canPlayCard ? 'Your turn' : 'Waiting'}
                </span>
              </div>

              <div className="mt-6 flex min-h-48 flex-wrap items-end gap-4">
                {myCards.length === 0 ? (
                  <HandEmptyState tablePhase={tablePhase} />
                ) : (
                  myCards.map((card, index) => {
                    const cardKey = `${card.rank}|${card.suit}`;
                    const isLaunching = launchingCardKey === cardKey;
                    const hoverAnimation =
                      canPlayCard && !isLaunching
                        ? { y: -22, scale: 1.06, rotate: index % 2 === 0 ? -2 : 2 }
                        : {};
                    const tapAnimation = canPlayCard && !isLaunching ? { scale: 0.96 } : {};
                    const animateState = isLaunching
                      ? {
                          opacity: 0,
                          y: -220,
                          x: 34,
                          rotate: 14,
                          scale: 0.72,
                          filter: 'blur(2px)',
                        }
                      : {
                          opacity: 1,
                          y: 0,
                          rotate: 0,
                          scale: 1,
                          filter: 'blur(0px)',
                        };

                    return (
                      <motion.button
                        key={cardKey}
                        type="button"
                        onClick={() => onPlayCard(card)}
                        disabled={!canPlayCard || isLaunching}
                        initial={{
                          opacity: 0,
                          y: 34,
                          rotate: index % 2 === 0 ? -7 : 7,
                        }}
                        animate={animateState}
                        transition={{
                          delay: isLaunching ? 0 : index * 0.08,
                          type: 'spring',
                          stiffness: 240,
                          damping: 17,
                        }}
                        whileHover={hoverAnimation}
                        whileTap={tapAnimation}
                        className="flex h-44 w-28 flex-col items-center justify-between rounded-[24px] border border-white/15 bg-[linear-gradient(180deg,#ffffff,#eef2ff)] px-3 py-4 text-slate-950 shadow-[0_20px_42px_rgba(2,6,23,0.38)] transition disabled:cursor-not-allowed disabled:opacity-60"
                        title={`Play ${card.rank}${suitSymbol(card.suit)}`}
                      >
                        <span className="self-start text-lg font-black">{card.rank}</span>
                        <span className={`text-4xl ${suitColorClass(card.suit)}`}>
                          {suitSymbol(card.suit)}
                        </span>
                        <span className="self-end text-lg font-black">{card.rank}</span>
                      </motion.button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <MetricCard label="Vira" value={currentPrivateViraRank ?? currentPublicViraRank ?? '-'} mono />
              <MetricCard label="Hand finished" value={String(tablePhase === 'hand_finished')} mono />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function HandCompletionBanner({
  tablePhase,
  canStartHand,
  scoreLabel,
}: {
  tablePhase: TablePhase;
  canStartHand: boolean;
  scoreLabel: string;
}) {
  const isMatchFinished = tablePhase === 'match_finished';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`rounded-[28px] border p-6 ${
        isMatchFinished
          ? 'border-emerald-400/25 bg-emerald-500/10'
          : 'border-amber-400/20 bg-amber-500/10'
      }`}
    >
      <div
        className={`text-[11px] font-bold uppercase tracking-[0.22em] ${
          isMatchFinished ? 'text-emerald-300' : 'text-amber-200'
        }`}
      >
        {isMatchFinished ? 'Match summary' : 'Hand summary'}
      </div>

      <div className="mt-4 text-2xl font-black text-slate-100">
        {isMatchFinished ? 'Partida encerrada' : 'Mão encerrada'}
      </div>

      <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
        {isMatchFinished
          ? `Placar final: ${scoreLabel}.`
          : canStartHand
            ? 'A próxima mão já pode ser iniciada.'
            : 'Aguardando o backend liberar a próxima mão.'}
      </p>
    </motion.div>
  );
}

const seatPulseAnimation = {
  idle: {
    scale: 1,
    opacity: 1,
  },
  active: {
    scale: [1, 1.03, 1],
    opacity: [0.92, 1, 0.92],
    transition: {
      duration: 1.6,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
};

function SeatBadge({ seat, label }: { seat: TableSeatView; label: string }) {
  return (
    <motion.div
      animate={seat.isCurrentTurn ? seatPulseAnimation : {}}
      transition={{ repeat: seat.isCurrentTurn ? Number.POSITIVE_INFINITY : 0, duration: 1.5 }}
      className={`w-full max-w-xs rounded-[30px] border px-5 py-4 shadow-[0_18px_40px_rgba(2,6,23,0.22)] ${
        seat.isMine
          ? 'border-emerald-400/30 bg-emerald-500/10'
          : seat.isBot
            ? 'border-amber-400/20 bg-amber-500/10'
            : 'border-white/10 bg-white/[0.03]'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-black tracking-tight text-slate-100">{label}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
            {seat.seatId}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {seat.isMine ? (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">
              You
            </span>
          ) : null}

          {seat.isBot ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-amber-200">
              Bot
            </span>
          ) : null}

          <span
            className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] ${
              seat.isCurrentTurn
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-white/5 text-slate-300'
            }`}
          >
            {seat.isCurrentTurn ? 'Turn' : 'Idle'}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-1.5 text-sm text-slate-300">
        <div>ready: {String(seat.ready)}</div>
        <div className="text-slate-400">bot: {String(seat.isBot)}</div>
      </div>
    </motion.div>
  );
}

function MetricCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {label}
      </div>
      <div className={`mt-3 break-all text-sm font-bold text-slate-100 ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function StatusPanel({
  title,
  value,
  detail,
  tone,
}: {
  title: string;
  value: string;
  detail: string;
  tone: HandStatusVariant;
}) {
  const toneClass = statusToneClass(tone);

  return (
    <div className={`rounded-[28px] border p-5 ${toneClass}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {title}
      </div>
      <div className="mt-3 text-base font-black text-slate-100">{value}</div>
      <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
    </div>
  );
}

function PlayedCardZone({
  title,
  value,
  perspective,
  highlight,
  revealKey,
  isRevealed,
  isLaunching = false,
}: {
  title: string;
  value: string | null;
  perspective: 'top' | 'bottom';
  highlight: boolean;
  revealKey: number;
  isRevealed: boolean;
  isLaunching?: boolean;
}) {
  const borderClass = highlight
    ? 'border-emerald-400/25 bg-emerald-500/8'
    : 'border-white/10 bg-slate-950/35';

  return (
    <div className={`rounded-[30px] border p-5 transition-colors duration-300 ${borderClass}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
        {title}
      </div>

      <div className="relative mt-4 flex min-h-44 items-center justify-center rounded-[26px] border border-white/10 bg-slate-950/50 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
        <AnimatePresence mode="popLayout">
          {value ? (
            <motion.div
              key={`${value}-${revealKey}`}
              initial={{
                opacity: 0,
                y: perspective === 'top' ? -90 : 90,
                rotateX: perspective === 'top' ? -82 : 82,
                scale: 0.68,
                filter: 'blur(6px)',
              }}
              animate={{
                opacity: 1,
                y: 0,
                rotateX: 0,
                scale: 1,
                filter: 'blur(0px)',
              }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 240, damping: 18 }}
              className={isLaunching ? 'drop-shadow-[0_18px_42px_rgba(255,255,255,0.1)]' : ''}
            >
              <TableCardFace card={value} isRevealed={isRevealed} />
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0.35 }}
              animate={{ opacity: 1 }}
              className="flex h-32 w-24 items-center justify-center rounded-[22px] border border-dashed border-white/10 bg-slate-900/70 text-3xl font-black text-slate-500"
            >
              —
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function TableCardFace({ card, isRevealed }: { card: string; isRevealed: boolean }) {
  const rank = card.slice(0, -1);
  const suit = card.slice(-1);
  const colorClass = suitColorClass(suit);

  return (
    <div
      className={`flex h-32 w-24 flex-col justify-between rounded-[22px] border border-white/15 bg-[linear-gradient(180deg,#ffffff,#eef2ff)] px-3 py-4 text-slate-950 shadow-[0_20px_44px_rgba(2,6,23,0.35)] ${
        isRevealed ? '' : 'opacity-80'
      }`}
    >
      <div className="text-lg font-black">{rank}</div>
      <div className={`self-center text-4xl ${colorClass}`}>{suitSymbol(suit)}</div>
      <div className="self-end text-lg font-black">{rank}</div>
    </div>
  );
}

function HandEmptyState({ tablePhase }: { tablePhase: TablePhase }) {
  return (
    <div className="flex min-h-48 w-full items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] p-6 text-center text-sm leading-7 text-slate-400">
      {tablePhase === 'waiting'
        ? 'Aguardando início da próxima mão para receber cartas.'
        : 'Nenhuma carta visível na mão privada neste momento.'}
    </div>
  );
}

function statusToneClass(tone: HandStatusVariant): string {
  if (tone === 'success') {
    return 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200';
  }

  if (tone === 'warning') {
    return 'border-amber-400/20 bg-amber-500/10 text-amber-100';
  }

  return 'border-white/10 bg-white/[0.03] text-slate-200';
}

function formatBetStatus(props: {
  betState: string;
  currentValue: number;
  pendingValue: number | null;
  requestedBy: string | null;
}): string {
  if (props.betState === 'awaiting_response' && props.pendingValue) {
    return `Aguardando resposta para ${props.pendingValue}`;
  }

  return `Valor atual: ${props.currentValue}`;
}

function formatBetDetail(props: {
  betState: string;
  currentValue: number;
  pendingValue: number | null;
  requestedBy: string | null;
}): string {
  if (props.betState === 'awaiting_response') {
    return props.requestedBy
      ? `Solicitado por ${props.requestedBy}.`
      : 'O backend aguarda uma decisão sobre a aposta.';
  }

  return `Bet state atual: ${props.betState}.`;
}

function formatSpecialState(state: string): string {
  return state === 'mao_de_onze' ? 'Mão de 11' : 'Normal';
}

function formatSpecialDetail(props: {
  specialState: string;
  specialDecisionPending: boolean;
  specialDecisionBy: string | null;
  winner: string | null;
  awardedPoints: number | null;
}): string {
  if (props.specialDecisionPending) {
    return props.specialDecisionBy
      ? `Decisão pendente para ${props.specialDecisionBy}.`
      : 'Há uma decisão especial pendente.';
  }

  if (props.winner && props.awardedPoints) {
    return `${props.winner} recebeu ${props.awardedPoints} ponto(s).`;
  }

  return props.specialState === 'mao_de_onze'
    ? 'A mão está em estado especial de 11.'
    : 'Nenhum estado especial ativo.';
}

function formatRoundResult(result: string | null): string {
  if (!result) {
    return 'Pending';
  }

  if (result === 'TIE') {
    return 'Tie';
  }

  return result;
}

function suitSymbol(suit: string): string {
  if (suit === 'C') return '♥';
  if (suit === 'O') return '♦';
  if (suit === 'P') return '♣';
  if (suit === 'E') return '♠';

  return suit;
}

function suitColorClass(suit: string): string {
  if (suit === 'C' || suit === 'O') {
    return 'text-rose-600';
  }

  return 'text-slate-900';
}
