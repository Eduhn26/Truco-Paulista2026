import { motion, AnimatePresence } from 'framer-motion';
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
  currentPrivateViraRank: Rank | null;
  currentPublicViraRank: Rank | null;
  viraRank: Rank;
  availableActions: NonNullable<MatchStatePayload['currentHand']>['availableActions'];
  onAction: (action: string) => void;
  myCards: CardPayload[];
  canPlayCard: boolean;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
  playedRoundsCount: number;
};

// ── Helpers visuais originais ──
function publicMatchStateScoreT1(scoreLabel: string): string {
  const match = scoreLabel.match(/T1\s+(\d+)/);
  return match?.[1] ?? '0';
}

function publicMatchStateScoreT2(scoreLabel: string): string {
  const match = scoreLabel.match(/T2\s+(\d+)/);
  return match?.[1] ?? '0';
}

// ── Componente Rich HUD (Original) ──
function PlayerHUD({ seat, isOpponent }: { seat: TableSeatView; isOpponent: boolean }) {
  return (
    <motion.div
      animate={seat.isCurrentTurn ? { scale: [1, 1.03, 1] } : {}}
      transition={{ duration: 1.6, repeat: seat.isCurrentTurn ? Infinity : 0 }}
      className="flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{
        background: seat.isCurrentTurn ? 'rgba(201,168,76,0.12)' : 'rgba(0,0,0,0.45)',
        border: seat.isCurrentTurn
          ? '1px solid rgba(201,168,76,0.35)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: seat.isCurrentTurn ? '0 0 16px rgba(201,168,76,0.12)' : 'none',
      }}
    >
      <div
        className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-black"
        style={{
          background: seat.isMine
            ? 'linear-gradient(135deg, #8a6a28, #c9a84c)'
            : 'rgba(255,255,255,0.1)',
          color: seat.isMine ? '#0a0600' : 'rgba(255,255,255,0.5)',
        }}
      >
        {seat.seatId.slice(0, 2)}
      </div>
      <span
        className="text-xs font-bold"
        style={{ color: seat.isCurrentTurn ? '#c9a84c' : 'rgba(255,255,255,0.5)' }}
      >
        {seat.isMine ? 'Você' : isOpponent ? 'Adversário' : seat.seatId}
      </span>
      {seat.isBot && (
        <span
          className="text-[9px] font-bold uppercase tracking-wide"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          (BOT)
        </span>
      )}
    </motion.div>
  );
}

// ── Componente Rich TableCard (Original com correções de animação) ──
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
  const symbolMap: any = { C: '♣', O: '♦', P: '♥', E: '♠' };
  const symbol = symbolMap[suit] || suit;

  return (
    <motion.div
      key={revealKey}
      initial={isFlipping ? { scale: 0, rotateY: 180, opacity: 0 } : { scale: 1, opacity: 1 }}
      animate={{
        scale: isFading ? 0.85 : isHighlight ? 1.05 : 1,
        rotateY: 0,
        opacity: isFading ? 0.4 : 1,
        y: isLaunching ? -40 : 0,
      }}
      transition={{
        type: 'spring',
        stiffness: 300,
        damping: 20,
        duration: isFlipping ? 0.6 : 0.3,
      }}
      className={`
        relative flex h-24 w-16 flex-col items-center justify-center rounded-lg border
        ${
          isWinner
            ? 'border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.9)] ring-2 ring-yellow-400/60'
            : isHighlight
              ? 'border-amber-400/60 shadow-[0_0_20px_rgba(201,168,76,0.4)]'
              : 'border-white/20 shadow-xl'
        }
        bg-[#fdfbf7] transition-all duration-500
      `}
      style={{
        transformStyle: 'preserve-3d',
        backfaceVisibility: 'hidden',
      }}
    >
      <span className={`text-3xl font-black ${textColor}`}>{symbol}</span>
      <span className={`absolute bottom-1 left-1 text-[10px] font-bold ${textColor}`}>{rank}</span>
      <span className={`absolute top-1 right-1 text-[10px] font-bold ${textColor}`}>{rank}</span>

      {isWinner && (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.2 }}
          className="absolute -top-3 -right-3 bg-gradient-to-br from-yellow-400 to-amber-600 text-black text-[10px] font-black px-2 py-1 rounded-full z-10 shadow-lg"
        >
          🏆
        </motion.div>
      )}
    </motion.div>
  );
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
    playedRoundsCount,
  } = props;

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

  return (
    <div className="relative flex min-h-[calc(100vh-180px)] w-full flex-col overflow-hidden rounded-[20px] bg-transparent p-4 md:p-6">
      <div className="absolute inset-0 z-0 felt-board" />

      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: '72%',
          height: '68%',
          borderRadius: '999px',
          border: '1px solid rgba(201,168,76,0.09)',
          boxShadow: '0 0 80px rgba(201,168,76,0.04)',
        }}
      />

      <div
        className="relative z-10 flex items-center justify-between gap-4 border-b px-5 py-3"
        style={{ borderColor: 'rgba(201,168,76,0.12)', background: 'rgba(0,0,0,0.35)' }}
      >
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div
              className="text-[10px] font-bold uppercase tracking-[2px]"
              style={{ color: '#c9a84c' }}
            >
              VOCÊ
            </div>
            <div className="text-2xl font-black text-white">{scoreT1}</div>
          </div>
          <div className="h-8 w-px bg-white/20" />
          <div className="text-center">
            <div
              className="text-[10px] font-bold uppercase tracking-[2px]"
              style={{ color: '#e74c3c' }}
            >
              OPO
            </div>
            <div className="text-2xl font-black text-white">{scoreT2}</div>
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={handStatusLabel}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="rounded-full px-3 py-1 text-[10px] font-bold"
            style={{
              background:
                handStatusTone === 'warning'
                  ? 'rgba(201,168,76,0.12)'
                  : handStatusTone === 'success'
                    ? 'rgba(45,106,79,0.15)'
                    : 'rgba(255,255,255,0.05)',
              border:
                handStatusTone === 'warning'
                  ? '1px solid rgba(201,168,76,0.3)'
                  : handStatusTone === 'success'
                    ? '1px solid rgba(45,106,79,0.4)'
                    : '1px solid rgba(255,255,255,0.1)',
              color:
                handStatusTone === 'warning'
                  ? '#c9a84c'
                  : handStatusTone === 'success'
                    ? '#3d8a6a'
                    : 'rgba(255,255,255,0.45)',
              maxWidth: '220px',
              textAlign: 'center',
            }}
          >
            {handStatusLabel}
          </motion.div>
        </AnimatePresence>

        <motion.div
          key={`value-${currentValue}-${betState}`}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5"
          style={{
            background: isAwaitingBet ? 'rgba(192,57,43,0.15)' : 'rgba(201,168,76,0.1)',
            border: isAwaitingBet
              ? '1px solid rgba(192,57,43,0.4)'
              : '1px solid rgba(201,168,76,0.25)',
          }}
        >
          <span
            className="text-[10px] font-bold uppercase tracking-[1.5px]"
            style={{ color: isAwaitingBet ? '#e74c3c' : 'rgba(201,168,76,0.7)' }}
          >
            {isAwaitingBet ? `→ ${pendingValue ?? currentValue}` : currentValue}
          </span>
        </motion.div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 py-6">
        <div className="flex flex-col items-center gap-2">
          {opponentSeatView && <PlayerHUD seat={opponentSeatView} isOpponent={true} />}
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 w-12 rounded-lg bg-slate-800 border border-slate-600 shadow-md flex items-center justify-center"
              >
                <span className="text-slate-500 font-black text-xs">TP</span>
              </div>
            ))}
          </div>
          <div className="text-xs font-bold text-slate-400 tracking-widest uppercase">
            Adversário
          </div>
        </div>

        <div className="relative flex w-full items-center justify-center gap-8 py-8">
          <div className="flex h-28 w-20 items-center justify-center relative">
            {!displayedOpponentPlayedCard && !isMatchFinished && !isHandFinished && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="absolute text-[10px] font-bold text-amber-400/60 uppercase tracking-wider animate-pulse"
              >
                Aguardando...
              </motion.div>
            )}
            {displayedOpponentPlayedCard ? (
              <TableCard
                rank={displayedOpponentPlayedCard.slice(0, -1)}
                suit={displayedOpponentPlayedCard.slice(-1)}
                revealKey={opponentRevealKey}
                isWinner={opponentCardWon}
                isFlipping={true}
                isFading={shouldFadeOpponentCard}
                isHighlight={Boolean(opponentSeatView?.isCurrentTurn)}
              />
            ) : (
              <div className="h-24 w-16 rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center">
                <span className="text-white/10 text-2xl">—</span>
              </div>
            )}
          </div>

          <motion.div
            key={`vira-${effectiveViraRank}`}
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
            className="relative z-20"
          >
            <div className="absolute -inset-6 rounded-full bg-amber-500/30 blur-2xl animate-pulse" />
            <div className="relative flex h-24 w-16 flex-col items-center justify-center rounded-xl bg-gradient-to-br from-[#fdfbf7] to-[#f5edd8] border-2 border-amber-400 shadow-[0_0_40px_rgba(251,191,36,0.6)]">
              <span className="text-lg font-black text-slate-800">{effectiveViraRank}</span>
              <span className="text-amber-500 text-2xl">★</span>
            </div>
            <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-bold tracking-widest text-amber-400 uppercase">
              Vira
            </div>
          </motion.div>

          <div className="flex h-28 w-20 items-center justify-center relative">
            {displayedMyPlayedCard ? (
              <TableCard
                rank={displayedMyPlayedCard.slice(0, -1)}
                suit={displayedMyPlayedCard.slice(-1)}
                revealKey={myRevealKey}
                isWinner={myCardWon}
                isFlipping={true}
                isFading={shouldFadeMyCard}
                isHighlight={Boolean(mySeatView?.isCurrentTurn)}
                isLaunching={myCardLaunching}
              />
            ) : (
              <div className="h-24 w-16 rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center">
                <span className="text-white/10 text-2xl">—</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-center pt-2 pb-4">
          {mySeatView ? (
            <PlayerHUD seat={mySeatView} isOpponent={false} />
          ) : (
            <div className="h-7" />
          )}
        </div>

        {/* Round intro overlay */}
        <AnimatePresence>
          {roundIntroKey > 0 && tablePhase === 'playing' && (
            <motion.div
              key={`intro-${roundIntroKey}`}
              initial={{ opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none"
            >
              <div
                className="rounded-full px-6 py-2 text-sm font-black uppercase tracking-[0.25em]"
                style={{
                  background: 'rgba(201,168,76,0.15)',
                  border: '1px solid rgba(201,168,76,0.4)',
                  color: '#c9a84c',
                  boxShadow: '0 0 30px rgba(201,168,76,0.3)',
                }}
              >
                Nova mão - vira {effectiveViraRank}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Round result overlay */}
        <AnimatePresence>
          {latestRound?.finished && (
            <motion.div
              key={`result-${roundResolvedKey}`}
              initial={{ scale: 0.5, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 pointer-events-none"
            >
              <motion.div
                initial={{ boxShadow: '0 0 0px rgba(0,0,0,0)' }}
                animate={{
                  boxShadow:
                    latestRound.result === 'TIE'
                      ? '0 0 40px rgba(148,163,184,0.6)'
                      : latestRound.result === 'P1'
                        ? '0 0 50px rgba(251,191,36,0.9)'
                        : '0 0 50px rgba(220,38,38,0.9)',
                }}
                className={`
          px-10 py-5 rounded-2xl font-black text-3xl shadow-[0_0_40px_rgba(0,0,0,0.8)]
          uppercase tracking-widest border-2 backdrop-blur-sm
          ${
            latestRound.result === 'TIE'
              ? 'bg-slate-800/95 text-white border-slate-500'
              : latestRound.result === 'P1'
                ? 'bg-gradient-to-br from-amber-400 to-amber-600 text-black border-amber-300'
                : 'bg-gradient-to-br from-red-600 to-red-800 text-white border-red-500'
          }
        `}
              >
                {latestRound.result === 'TIE'
                  ? '🤝 Empate'
                  : latestRound.result === 'P1'
                    ? '🏆 Você Venceu!'
                    : '💀 Adversário Venceu'}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {latestRound?.finished && playedRoundsCount < 3 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 2.5 }}
              className="absolute top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-30"
            >
              <div className="text-xs font-bold text-amber-400/70 uppercase tracking-wider animate-pulse">
                Próxima rodada...
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative z-20 w-full max-w-4xl flex flex-col items-center gap-2 pb-2">
        <MatchActionSurface availableActions={availableActions} onAction={onAction} />
      </div>

      <div className="relative z-20 w-full mt-2">
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

      <AnimatePresence>
        {(isHandFinished || isMatchFinished) && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="relative z-20 mx-4 mt-3 rounded-2xl px-4 py-3"
            style={{
              background: isMatchFinished ? 'rgba(201,168,76,0.08)' : 'rgba(45,106,79,0.08)',
              border: isMatchFinished
                ? '1px solid rgba(201,168,76,0.25)'
                : '1px solid rgba(45,106,79,0.25)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div
                  className="text-[10px] font-bold uppercase tracking-[2px]"
                  style={{ color: isMatchFinished ? '#c9a84c' : '#3d8a6a' }}
                >
                  {isMatchFinished ? 'Partida encerrada' : 'Mão encerrada'}
                </div>
                <div className="mt-0.5 text-sm font-bold text-white">
                  {isMatchFinished
                    ? `Placar final: ${scoreLabel}`
                    : canStartHand
                      ? 'Próxima mão disponível'
                      : 'Aguardando backend liberar próxima mão'}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMaoDeOnze && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="relative z-20 mx-4 mt-3 rounded-2xl px-4 py-3 text-center"
            style={{
              background: 'rgba(201,168,76,0.12)',
              border: '1px solid rgba(201,168,76,0.35)',
              boxShadow: '0 0 30px rgba(201,168,76,0.2)',
            }}
          >
            <div
              className="text-sm font-black uppercase tracking-[0.2em]"
              style={{ color: '#c9a84c' }}
            >
              ⚡ Mão de 11
            </div>
            <div className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Decisão especial disponível - esta mão vale a partida!
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
