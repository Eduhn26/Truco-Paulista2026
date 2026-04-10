import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, type ReactNode } from 'react';
import { MatchActionSurface } from './matchActionSurface';
import type { MatchAction } from './matchActionTypes';
import { MatchPlayerHandDock } from './matchPlayerHandDock';
import type { CardPayload, MatchStatePayload, Rank } from '../../services/socket/socketTypes';
import { useConfetti } from '../../hooks/useConfetti';
import { useGameSound } from '../../hooks/useGameSound';

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
  currentPrivateViraRank: Rank | null;
  currentPublicViraRank: Rank | null;
  viraRank: Rank;
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: MatchAction) => void;
  myCards: CardPayload[];
  canPlayCard: boolean;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
  playedRoundsCount: number;
  isMyTurn?: boolean;
};

const SUIT_SYMBOL_MAP: Record<string, string> = {
  C: '♣',
  O: '♦',
  P: '♥',
  E: '♠',
};

function publicMatchStateScoreT1(scoreLabel: string): string {
  const match = scoreLabel.match(/T1\s+(\d+)/);
  return match?.[1] ?? '0';
}

function publicMatchStateScoreT2(scoreLabel: string): string {
  const match = scoreLabel.match(/T2\s+(\d+)/);
  return match?.[1] ?? '0';
}

function PlayerHUD({
  seat,
  isOpponent,
}: {
  seat: TableSeatView;
  isOpponent: boolean;
}) {
  const isCurrentTurn = seat.isCurrentTurn;

  return (
    <motion.div
      animate={isCurrentTurn ? { scale: [1, 1.03, 1] } : {}}
      transition={{ duration: 1.5, repeat: isCurrentTurn ? Infinity : 0 }}
      className="relative flex min-w-[168px] items-center justify-center gap-3 overflow-hidden rounded-[18px] px-4 py-2 backdrop-blur-xl"
      style={{
        background: isCurrentTurn
          ? 'linear-gradient(135deg, rgba(255,255,255,0.14), rgba(255,255,255,0.06))'
          : 'linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))',
        border: isCurrentTurn
          ? '1px solid rgba(201,168,76,0.42)'
          : '1px solid rgba(255,255,255,0.12)',
        boxShadow: isCurrentTurn
          ? '0 0 22px rgba(201,168,76,0.16)'
          : '0 10px 20px rgba(0,0,0,0.18)',
      }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />

      <div
        className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-black"
        style={{
          background: seat.isMine
            ? 'linear-gradient(135deg, #7a5b1a, #d2b15c)'
            : 'linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.06))',
          color: seat.isMine ? '#090500' : 'rgba(255,255,255,0.82)',
          boxShadow: seat.isMine ? '0 0 18px rgba(201,168,76,0.2)' : 'none',
        }}
      >
        {seat.seatId}
      </div>

      <div className="relative z-10 flex flex-col">
        <span
          className="text-[11px] font-black uppercase tracking-[0.14em]"
          style={{ color: isCurrentTurn ? '#e8c66e' : 'rgba(255,255,255,0.86)' }}
        >
          {seat.isMine ? 'Você' : isOpponent ? 'Oponente' : seat.seatId}
        </span>

        <span className="text-[10px] font-medium text-slate-400">
          {isCurrentTurn ? 'Em turno' : seat.ready ? 'Pronto' : 'Aguardando'}
        </span>
      </div>

      {seat.isBot && (
        <span className="relative z-10 rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-slate-300">
          Bot
        </span>
      )}
    </motion.div>
  );
}

const TableCard = ({
  rank,
  suit,
  isWinner,
  isFlipping,
  isFading,
  revealKey,
  isHighlight,
  isLaunching,
}: {
  rank: string;
  suit: string;
  isWinner?: boolean;
  isFlipping?: boolean;
  isFading?: boolean;
  revealKey?: number;
  isHighlight?: boolean;
  isLaunching?: boolean;
}) => {
  const isRed = suit === 'P' || suit === 'O';
  const textColor = isRed ? 'text-red-700' : 'text-slate-900';
  const symbol = SUIT_SYMBOL_MAP[suit] ?? suit;

  return (
    <motion.div
      key={revealKey}
      initial={isFlipping ? { scale: 0.82, rotateY: 180, opacity: 0 } : { scale: 1, opacity: 1 }}
      animate={{
        scale: isFading ? 0.88 : isHighlight ? 1.05 : 1,
        rotateY: 0,
        opacity: isFading ? 0.38 : 1,
        y: isLaunching ? -44 : 0,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
        duration: isFlipping ? 0.6 : 0.26,
      }}
      className={`
        relative flex h-[120px] w-[84px] flex-col items-center justify-center rounded-[20px] border bg-[#fdfbf7]
        ${
          isWinner
            ? 'border-yellow-300 shadow-[0_0_30px_rgba(250,204,21,0.52),0_16px_34px_rgba(0,0,0,0.36)] ring-2 ring-yellow-400/45'
            : isHighlight
            ? 'border-amber-300/60 shadow-[0_0_22px_rgba(201,168,76,0.24),0_16px_34px_rgba(0,0,0,0.36)]'
            : 'border-white/18 shadow-[0_16px_34px_rgba(0,0,0,0.4)]'
        }
        transition-all duration-500
      `}
      style={{
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[20px]"
        style={{
          background:
            'linear-gradient(150deg, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0.2) 16%, rgba(255,255,255,0) 32%)',
        }}
      />

      <span className={`text-[44px] ${textColor}`}>{symbol}</span>
      <span className={`absolute bottom-3 left-3 text-[14px] font-black ${textColor}`}>{rank}</span>
      <span className={`absolute right-3 top-3 rotate-180 text-[14px] font-black ${textColor}`}>
        {rank}
      </span>

      {isWinner && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.2 }}
          className="absolute -right-3 -top-3 z-10 rounded-full bg-gradient-to-br from-yellow-300 to-amber-600 px-2.5 py-1 text-[10px] font-black text-black shadow-lg"
        >
          🏆
        </motion.div>
      )}
    </motion.div>
  );
};

function OpponentCardBack({ offset }: { offset: number }) {
  return (
    <motion.div
      style={{
        x: offset,
        rotate: offset * 0.16,
        zIndex: 20 + offset,
      }}
      className="absolute h-[82px] w-[58px] rounded-[14px] border border-slate-600/70 bg-[radial-gradient(circle_at_50%_35%,rgba(38,58,92,0.82),rgba(10,16,28,0.98))] shadow-[0_14px_24px_rgba(0,0,0,0.34)]"
    >
      <div className="absolute inset-[5px] rounded-[10px] border border-white/8" />
      <div className="absolute inset-[11px] rounded-[8px] border border-white/6" />
      <div className="absolute inset-0 flex items-center justify-center text-[20px] text-slate-500/70">
        TP
      </div>
    </motion.div>
  );
}

function SideInfoCard({
  title,
  children,
  align = 'left',
}: {
  title: string;
  children: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <div className="w-full max-w-[190px] rounded-[20px] border border-white/10 bg-black/22 px-4 py-4 shadow-[0_10px_24px_rgba(0,0,0,0.22)] backdrop-blur-md">
      <div
        className={`text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
      >
        {title}
      </div>
      <div className={`mt-3 ${align === 'right' ? 'text-right' : 'text-left'}`}>{children}</div>
    </div>
  );
}

export function MatchTableShell(props: MatchTableShellProps) {
  const {
    handStatusLabel,
    handStatusTone,
    betState,
    currentValue,
    pendingValue,
    specialState,
    latestRound,
    tablePhase,
    canStartHand,
    scoreLabel,
    opponentSeatView,
    mySeatView,
    currentTurnSeatId,
    displayedOpponentPlayedCard,
    displayedMyPlayedCard,
    opponentRevealKey,
    myRevealKey,
    myCardLaunching,
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
    isMyTurn = false,
  } = props;

  const { play } = useGameSound();
  const { fire } = useConfetti();
  const effectiveViraRank = currentPrivateViraRank ?? currentPublicViraRank ?? viraRank;
  const isAwaitingBet = betState === 'awaiting_response';
  const isMaoDeOnze = specialState === 'mao_de_onze';
  const isMatchFinished = tablePhase === 'match_finished';
  const isHandFinished = tablePhase === 'hand_finished';

  const scoreT1 = publicMatchStateScoreT1(scoreLabel);
  const scoreT2 = publicMatchStateScoreT2(scoreLabel);

  const shouldFadeMyCard = Boolean(latestRound?.finished && displayedMyPlayedCard);
  const shouldFadeOpponentCard = Boolean(latestRound?.finished && displayedOpponentPlayedCard);
  const myCardWon = Boolean(latestRound?.finished && latestRound.result === 'P1');
  const opponentCardWon = Boolean(latestRound?.finished && latestRound.result === 'P2');

  useEffect(() => {
    if (latestRound?.finished && latestRound.result === 'P1') {
      play('round-win', 0.6);

      if (isMatchFinished) {
        play('game-win', 0.8);
        fire();
      }
    }
  }, [latestRound?.finished, latestRound?.result, isMatchFinished, play, fire]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[34px] border border-amber-400/22 bg-[#07111a] px-4 py-4 shadow-[0_30px_90px_rgba(0,0,0,0.48)] md:px-5 md:py-5">
      {/* NOTE: This shell is compacted vertically so the full arena, action rail,
          and hand dock remain visible at 100% browser zoom on common notebook
          viewports. */}
      <div className="pointer-events-none absolute inset-[1px] rounded-[33px] border border-white/5" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_12%,rgba(255,255,255,0.04),transparent_30%),radial-gradient(circle_at_50%_58%,rgba(201,168,76,0.1),transparent_52%),linear-gradient(180deg,#07131f_0%,#07111a_26%,#09131d_54%,#08111a_100%)]" />
      <div className="pointer-events-none absolute inset-[22px] rounded-[30px] border border-white/6 opacity-70" />
      <div className="pointer-events-none absolute left-[7%] right-[7%] top-[9%] bottom-[12%] rounded-[110px] border border-white/10 opacity-65" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(201,168,76,0.13),rgba(201,168,76,0)_48%)] blur-[6px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_88%,rgba(201,168,76,0.1),rgba(201,168,76,0)_34%)]" />

      <div
        className="pointer-events-none absolute inset-0 transition-all duration-1000"
        style={{
          background:
            currentTurnSeatId === mySeatView?.seatId
              ? 'radial-gradient(circle at 50% 84%, rgba(201,168,76,0.12), transparent 44%)'
              : 'radial-gradient(circle at 50% 12%, rgba(201,168,76,0.09), transparent 38%)',
        }}
      />

      <div className="relative z-20 flex w-full items-start justify-between gap-3">
        <div className="rounded-[18px] border border-white/10 bg-black/34 px-4 py-2.5 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
                Você
              </div>
              <motion.div
                key={scoreT1}
                animate={{ scale: [1, 1.08, 1] }}
                className="text-[28px] font-black text-white"
              >
                {scoreT1}
              </motion.div>
            </div>

            <div className="h-8 w-px bg-white/10" />

            <div className="text-center">
              <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
                Opo
              </div>
              <motion.div
                key={scoreT2}
                animate={{ scale: [1, 1.08, 1] }}
                className="text-[28px] font-black text-amber-400"
              >
                {scoreT2}
              </motion.div>
            </div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={handStatusLabel}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] backdrop-blur-md"
            style={{
              background:
                handStatusTone === 'success'
                  ? 'rgba(45,106,79,0.2)'
                  : handStatusTone === 'warning'
                  ? 'rgba(201,168,76,0.18)'
                  : 'rgba(255,255,255,0.05)',
              borderColor:
                handStatusTone === 'success'
                  ? 'rgba(45,106,79,0.36)'
                  : handStatusTone === 'warning'
                  ? 'rgba(201,168,76,0.34)'
                  : 'rgba(255,255,255,0.1)',
              color:
                handStatusTone === 'success'
                  ? '#4ade80'
                  : handStatusTone === 'warning'
                  ? '#f2c86f'
                  : 'rgba(255,255,255,0.56)',
            }}
          >
            {handStatusLabel}
          </motion.div>
        </AnimatePresence>

        <div className="rounded-[18px] border border-amber-400/24 bg-black/28 px-4 py-2.5 text-right backdrop-blur-xl">
          <div className="text-[8px] font-black uppercase tracking-[0.2em] text-slate-500">
            Valor atual
          </div>
          <motion.div
            key={`value-${currentValue}-${betState}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-1 text-[26px] font-black text-amber-300"
          >
            {isAwaitingBet ? pendingValue : currentValue}
          </motion.div>
        </div>
      </div>

      <div className="relative z-10 mt-3 flex flex-1 min-h-0 flex-col items-center justify-start">
        {opponentSeatView && (
          <div className="flex flex-col items-center gap-2">
            <PlayerHUD seat={opponentSeatView} isOpponent={true} />

            <div className="relative h-[82px] w-[190px]">
              <OpponentCardBack offset={-28} />
              <OpponentCardBack offset={0} />
              <OpponentCardBack offset={28} />
            </div>
          </div>
        )}

        <div className="mt-2 grid w-full max-w-[980px] grid-cols-[190px_minmax(240px,1fr)_190px] items-center gap-4">
          <div className="flex justify-start">
            <SideInfoCard title="Estado">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-600">
                  Valor
                </div>
                <div className="mt-1 text-[24px] font-black text-amber-300">{currentValue}</div>
              </div>

              <div className="mt-3">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-600">
                  Fase
                </div>
                <div className="mt-1 text-[13px] font-bold text-white/90">{handStatusLabel}</div>
              </div>
            </SideInfoCard>
          </div>

          <div className="flex justify-center">
            <div className="flex items-center justify-center gap-4 md:gap-5">
              <div className="relative flex h-[120px] w-[84px] items-center justify-center">
                {!displayedOpponentPlayedCard && !isMatchFinished && !isHandFinished && (
                  <motion.div
                    key="waiting-opponent"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute text-[10px] font-black uppercase tracking-[0.16em] text-amber-400/45"
                  >
                    Aguardando
                  </motion.div>
                )}

                {displayedOpponentPlayedCard && (
                  <TableCard
                    rank={displayedOpponentPlayedCard.slice(0, -1)}
                    suit={displayedOpponentPlayedCard.slice(-1)}
                    revealKey={opponentRevealKey}
                    isWinner={opponentCardWon}
                    isFlipping
                    isFading={shouldFadeOpponentCard}
                    isHighlight={Boolean(opponentSeatView?.isCurrentTurn)}
                  />
                )}
              </div>

              <motion.div
                key={`vira-${effectiveViraRank}`}
                animate={{ rotate: [0, 3, -3, 0] }}
                transition={{ repeat: Infinity, duration: 4.5, ease: 'easeInOut' }}
                className="relative z-20"
              >
                <div className="absolute -inset-5 rounded-full bg-amber-400/24 blur-3xl" />
                <div className="absolute -inset-2 rounded-[24px] border border-amber-300/16" />

                <div className="relative flex h-[148px] w-[100px] flex-col items-center justify-center rounded-[24px] border-2 border-amber-300 bg-gradient-to-br from-[#fffdf6] via-[#f6edd8] to-[#ead8af] shadow-[0_0_34px_rgba(251,191,36,0.32),0_20px_40px_rgba(0,0,0,0.26)]">
                  <div className="absolute inset-0 rounded-[24px] bg-gradient-to-br from-white/45 via-transparent to-transparent" />
                  <span className="text-[42px] font-black text-slate-800">{effectiveViraRank}</span>
                  <span className="mt-1 text-[28px] text-amber-500">★</span>
                </div>

                <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-full border border-amber-300/24 bg-black/28 px-3 py-1 text-[8px] font-black uppercase tracking-[0.18em] text-amber-300 backdrop-blur-md">
                  Vira
                </div>
              </motion.div>

              <div className="relative flex h-[120px] w-[84px] items-center justify-center">
                {displayedMyPlayedCard ? (
                  <TableCard
                    rank={displayedMyPlayedCard.slice(0, -1)}
                    suit={displayedMyPlayedCard.slice(-1)}
                    revealKey={myRevealKey}
                    isWinner={myCardWon}
                    isFlipping
                    isFading={shouldFadeMyCard}
                    isHighlight={Boolean(mySeatView?.isCurrentTurn)}
                    isLaunching={myCardLaunching}
                  />
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <SideInfoCard title="Placar" align="right">
              <div className="text-[36px] font-black tracking-tight text-amber-200">
                {scoreT1}
                <span className="px-2 text-white/45">×</span>
                {scoreT2}
              </div>

              <div className="mt-2 flex justify-end gap-2">
                <div className="h-3.5 w-3.5 rounded-full border border-amber-300/30 bg-amber-300 shadow-[0_0_12px_rgba(251,191,36,0.42)]" />
                <div className="h-3.5 w-3.5 rounded-full border border-white/25 bg-white/10" />
                <div className="h-3.5 w-3.5 rounded-full border border-white/25 bg-white/10" />
              </div>
            </SideInfoCard>
          </div>
        </div>

        {mySeatView && (
          <div className="mt-3">
            <PlayerHUD seat={mySeatView} isOpponent={false} />
          </div>
        )}

        <div className="mt-3 w-full max-w-[700px]">
          <MatchActionSurface availableActions={availableActions} onAction={onAction} />
        </div>

        <div className="mt-2 w-full">
          <MatchPlayerHandDock
            myCards={myCards}
            canPlayCard={canPlayCard}
            tablePhase={tablePhase}
            launchingCardKey={launchingCardKey}
            currentPrivateHand={currentPrivateHand}
            currentPublicHand={currentPublicHand}
            onPlayCard={onPlayCard}
            isMyTurn={isMyTurn}
            viraRank={effectiveViraRank}
          />
        </div>

        <AnimatePresence>
          {latestRound?.finished && (
            <motion.div
              key={`result-${roundResolvedKey}`}
              initial={{ scale: 0.5, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="pointer-events-none absolute left-1/2 top-[42%] z-50 -translate-x-1/2 -translate-y-1/2"
            >
              <motion.div
                initial={{ boxShadow: '0 0 0px rgba(0,0,0,0)' }}
                animate={{
                  boxShadow:
                    latestRound.result === 'TIE'
                      ? '0 0 40px rgba(148,163,184,0.45)'
                      : latestRound.result === 'P1'
                      ? '0 0 54px rgba(251,191,36,0.56)'
                      : '0 0 54px rgba(220,38,38,0.56)',
                }}
                className={`
                  rounded-[22px] border-2 px-8 py-4 text-2xl font-black uppercase tracking-[0.16em] shadow-2xl backdrop-blur-md
                  ${
                    latestRound.result === 'TIE'
                      ? 'border-slate-500 bg-slate-800/92 text-white'
                      : latestRound.result === 'P1'
                      ? 'border-amber-300 bg-gradient-to-br from-amber-300 to-amber-600 text-black'
                      : 'border-red-500 bg-gradient-to-br from-red-600 to-red-900 text-white'
                  }
                `}
              >
                {latestRound.result === 'TIE'
                  ? 'Empate'
                  : latestRound.result === 'P1'
                  ? 'Você venceu'
                  : 'Derrota'}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {isMaoDeOnze && (
          <motion.div
            initial={{ y: -200, rotateZ: -10, opacity: 0 }}
            animate={{ y: 0, rotateZ: 0, opacity: 1 }}
            exit={{ y: 200, rotateZ: 10, opacity: 0 }}
            transition={{ type: 'spring', damping: 12 }}
            className="pointer-events-none fixed left-1/2 top-20 z-[100] -translate-x-1/2"
          >
            <div
              className="rounded-full border-2 px-8 py-4 text-2xl font-black uppercase tracking-[0.16em] text-black shadow-[0_0_60px_rgba(201,168,76,0.8)]"
              style={{
                background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
                borderColor: '#ffdf80',
              }}
            >
              ⚡ Mão de 11 ⚡
              <br />
              <span className="text-sm">Vale a partida</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isHandFinished || isMatchFinished) && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-24 z-40 mx-auto w-full max-w-md self-center"
          >
            <div
              className="rounded-[20px] border px-6 py-4 text-center shadow-2xl backdrop-blur-xl"
              style={{
                background: isMatchFinished ? 'rgba(201,168,76,0.1)' : 'rgba(45,106,79,0.1)',
                borderColor: isMatchFinished ? 'rgba(201,168,76,0.3)' : 'rgba(45,106,79,0.3)',
              }}
            >
              <div
                className="text-xs font-black uppercase tracking-[0.18em]"
                style={{ color: isMatchFinished ? '#c9a84c' : '#4ade80' }}
              >
                {isMatchFinished ? 'Partida encerrada' : 'Mão encerrada'}
              </div>

              <div className="mt-1 text-xl font-black text-white">
                {isMatchFinished
                  ? `Placar Final: ${scoreLabel}`
                  : canStartHand
                  ? 'Próxima mão disponível'
                  : 'Aguardando próxima mão...'}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
