import { AnimatePresence, motion } from 'framer-motion';

import { MatchActionSurface } from './matchActionSurface';
import { MatchPlayerHandPanel } from './matchPlayerHandPanel';
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
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
};

const seatPulseAnimation = {
  scale: [1, 1.03, 1],
  opacity: [0.92, 1, 0.92],
  transition: {
    duration: 1.6,
    repeat: Infinity,
    ease: [0.42, 0, 0.58, 1] as const,
  },
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
    currentPrivateHand,
    currentPublicHand,
    onPlayCard,
  } = props;

  return (
    <motion.section
      layout
      className="relative overflow-hidden rounded-[30px] border border-emerald-500/15 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.16),transparent_48%),linear-gradient(180deg,rgba(13,64,40,0.96),rgba(8,25,21,0.99))] px-3 py-3 sm:px-4 sm:py-4"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_34%)]" />
      <div className="pointer-events-none absolute bottom-4 left-1/2 h-10 w-[78%] -translate-x-1/2 rounded-full bg-black/20 blur-xl" />

      <div className="relative grid gap-3">
        <header className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,25,35,0.72),rgba(8,12,16,0.54))]">
          <div className="grid gap-3 border-b border-white/10 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300/85">
                Table HUD
              </div>
              <div className="mt-1.5 text-lg font-black tracking-tight text-slate-100">
                Match pressure, card flow and next decision in one dominant surface
              </div>
              <p className="mt-1.5 max-w-3xl text-sm leading-6 text-emerald-50/75">
                A mesa agora concentra leitura crítica e deixa o resto realmente secundário.
              </p>
            </div>

            <motion.div
              key={handStatusLabel}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-[20px] border px-4 py-3 ${statusToneClass(handStatusTone)}`}
            >
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/55">
                Hand status
              </div>
              <div className="mt-1.5 text-sm font-bold text-slate-100">{handStatusLabel}</div>
            </motion.div>
          </div>

          <div className="grid gap-3 px-4 py-3 md:grid-cols-4">
            <HudMetricCard label="Score" value={scoreLabel} highlight="gold" />
            <HudMetricCard label="Turn" value={currentTurnSeatId ?? '-'} highlight="emerald" />
            <HudMetricCard label="Current value" value={String(currentValue)} />
            <HudMetricCard label="Mode" value={roomMode ?? (isOneVsOne ? '1v1' : '-')} />
          </div>
        </header>

        <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.08fr)_minmax(320px,0.92fr)]">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <StatusPanel
                title="Bet state"
                value={formatBetStatus({ betState, currentValue, pendingValue, requestedBy })}
                detail={formatBetDetail({ betState, pendingValue, requestedBy })}
                tone={betState === 'awaiting_response' ? 'warning' : 'neutral'}
              />
              <StatusPanel
                title="Special hand"
                value={formatSpecialState(specialState)}
                detail={formatSpecialDetail({
                  specialState,
                  specialDecisionPending,
                  specialDecisionBy,
                  winner,
                  awardedPoints,
                })}
                tone={
                  specialState !== 'normal' || specialDecisionPending
                    ? 'warning'
                    : winner || awardedPoints
                      ? 'success'
                      : 'neutral'
                }
              />
            </div>

            <div className="relative overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(8,12,16,0.16),rgba(8,12,16,0.34))] px-4 py-4">
              <AnimatePresence>
                {roundIntroKey > 0 && tablePhase === 'playing' ? (
                  <motion.div
                    key={`hand-intro-${roundIntroKey}`}
                    initial={{ opacity: 0, y: -18, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -12, scale: 0.96 }}
                    transition={{ duration: 0.45 }}
                    className="absolute left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border border-emerald-400/20 bg-slate-950/88 px-4 py-1.5 text-sm font-bold text-emerald-300 shadow-[0_12px_30px_rgba(2,6,23,0.35)]"
                  >
                    Nova mão iniciada · vira{' '}
                    {currentPrivateViraRank ?? currentPublicViraRank ?? viraRank}
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
                    className="absolute left-1/2 top-16 z-20 -translate-x-1/2 rounded-full border border-amber-400/20 bg-slate-950/88 px-4 py-1.5 text-sm font-bold text-amber-200 shadow-[0_12px_30px_rgba(2,6,23,0.35)]"
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

              <div className="grid gap-3">
                <div className="grid justify-center">
                  {opponentSeatView ? (
                    <SeatBadge
                      seat={opponentSeatView}
                      label={isOneVsOne ? 'Opponent' : opponentSeatView.seatId}
                    />
                  ) : null}
                </div>

                <div className="relative grid gap-3 md:grid-cols-2">
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 hidden h-px -translate-y-1/2 bg-white/5 md:block" />

                  <PlayedCardZone
                    title={isOneVsOne ? 'Opponent card' : 'Upper side card'}
                    value={displayedOpponentPlayedCard}
                    perspective="top"
                    highlight={Boolean(opponentSeatView?.isCurrentTurn)}
                    revealKey={opponentRevealKey}
                    isRevealed
                  />

                  <PlayedCardZone
                    title={isOneVsOne ? 'Your card' : 'Lower side card'}
                    value={displayedMyPlayedCard}
                    perspective="bottom"
                    highlight={Boolean(mySeatView?.isCurrentTurn)}
                    revealKey={myRevealKey}
                    isRevealed={Boolean(displayedMyPlayedCard)}
                    isLaunching={myCardLaunching}
                  />
                </div>

                <div className="grid justify-center">
                  {mySeatView ? (
                    <SeatBadge seat={mySeatView} label={isOneVsOne ? 'You' : mySeatView.seatId} />
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
              <CompactContextCard
                label="Last round"
                value={formatRoundResult(latestRound?.result ?? null)}
              />
              <CompactContextCard label="Bet state" value={betState} />
              <CompactContextCard
                label="Vira"
                value={currentPrivateViraRank ?? currentPublicViraRank ?? viraRank}
              />
            </div>

            <MatchActionSurface availableActions={availableActions} onAction={onAction} />

            <MatchPlayerHandPanel
              myCards={myCards}
              canPlayCard={canPlayCard}
              tablePhase={tablePhase}
              launchingCardKey={launchingCardKey}
              currentPrivateHand={currentPrivateHand}
              currentPublicHand={currentPublicHand}
              onPlayCard={onPlayCard}
            />
          </div>
        </div>
      </div>
    </motion.section>
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
      className={`mb-4 rounded-[22px] border p-4 ${
        isMatchFinished
          ? 'border-emerald-400/25 bg-emerald-500/10'
          : 'border-amber-400/20 bg-amber-500/10'
      }`}
    >
      <div
        className={`text-[10px] font-bold uppercase tracking-[0.18em] ${
          isMatchFinished ? 'text-emerald-300' : 'text-amber-200'
        }`}
      >
        {isMatchFinished ? 'Match summary' : 'Hand summary'}
      </div>

      <div className="mt-2 text-lg font-black text-slate-100">
        {isMatchFinished ? 'Partida encerrada' : 'Mão encerrada'}
      </div>

      <p className="mt-2 text-sm leading-6 text-slate-300">
        {isMatchFinished
          ? `Placar final: ${scoreLabel}.`
          : canStartHand
            ? 'A próxima mão já pode ser iniciada.'
            : 'Aguardando o backend liberar a próxima mão.'}
      </p>
    </motion.div>
  );
}

function SeatBadge({ seat, label }: { seat: TableSeatView; label: string }) {
  return (
    <motion.div
      animate={seat.isCurrentTurn ? seatPulseAnimation : {}}
      transition={{ repeat: seat.isCurrentTurn ? Number.POSITIVE_INFINITY : 0, duration: 1.5 }}
      className={`w-full max-w-sm rounded-[24px] border px-4 py-3 shadow-[0_18px_40px_rgba(2,6,23,0.22)] ${
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
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-500">
            {seat.seatId}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {seat.isMine ? (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">
              You
            </span>
          ) : null}

          {seat.isBot ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200">
              Bot
            </span>
          ) : null}

          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
              seat.isCurrentTurn
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-white/5 text-slate-300'
            }`}
          >
            {seat.isCurrentTurn ? 'Turn' : 'Idle'}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <SeatMetric label="Ready" value={seat.ready ? 'Yes' : 'No'} />
        <SeatMetric label="Type" value={seat.isBot ? 'Bot' : 'Human'} />
      </div>
    </motion.div>
  );
}

function SeatMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-black/10 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold text-slate-200">{value}</div>
    </div>
  );
}

function HudMetricCard({
  label,
  value,
  mono = false,
  highlight = 'default',
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: 'default' | 'emerald' | 'gold';
}) {
  const toneClass =
    highlight === 'emerald'
      ? 'border-emerald-400/18 bg-emerald-500/10'
      : highlight === 'gold'
        ? 'border-amber-400/18 bg-amber-500/10'
        : 'border-white/10 bg-white/[0.03]';

  return (
    <div className={`rounded-[20px] border px-4 py-3 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-1.5 text-sm font-black text-slate-100 ${mono ? 'font-mono' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function CompactContextCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,25,35,0.7),rgba(8,12,16,0.62))] px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-slate-100">{value}</div>
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
    <div className={`rounded-[22px] border px-4 py-4 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-sm font-black text-slate-100">{value}</div>
      <p className="mt-1.5 text-sm leading-6 text-slate-300">{detail}</p>
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
    <div className={`rounded-[22px] border p-4 transition-colors duration-300 ${borderClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
        {title}
      </div>

      <div className="relative mt-3 flex min-h-32 items-center justify-center rounded-[20px] border border-white/10 bg-slate-950/50 p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]">
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
              className="flex h-24 w-18 items-center justify-center rounded-[18px] border border-dashed border-white/10 bg-slate-900/70 text-3xl font-black text-slate-500"
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
      className={`flex h-24 w-18 flex-col justify-between rounded-[18px] border border-white/15 bg-[linear-gradient(180deg,#fffdf7,#ece7d8)] px-2.5 py-3 text-slate-950 shadow-[0_20px_44px_rgba(2,6,23,0.35)] ${
        isRevealed ? '' : 'opacity-80'
      }`}
    >
      <div className="text-sm font-black">{rank}</div>
      <div className={`self-center text-3xl ${colorClass}`}>{suitSymbol(suit)}</div>
      <div className="self-end text-sm font-black">{rank}</div>
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
  pendingValue: number | null;
  requestedBy: string | null;
}): string {
  if (props.betState === 'awaiting_response') {
    return props.requestedBy
      ? `Solicitado por ${props.requestedBy} para ${props.pendingValue ?? '-'}.`
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
