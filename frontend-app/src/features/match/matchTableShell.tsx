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

function parseSuitColor(suit: string): boolean {
  return suit === 'P' || suit === 'O';
}

function publicMatchStateScoreT1(scoreLabel: string): string {
  const match = scoreLabel.match(/T1\s+(\d+)/);
  return match?.[1] ?? '0';
}

function publicMatchStateScoreT2(scoreLabel: string): string {
  const match = scoreLabel.match(/T2\s+(\d+)/);
  return match?.[1] ?? '0';
}

function PokerChip({ filled, small = false }: { filled: boolean; small?: boolean }) {
  const size = small ? 'h-3.5 w-3.5' : 'h-5 w-5';

  return (
    <div
      className={`${size} flex items-center justify-center rounded-full`}
      style={
        filled
          ? {
              background:
                'conic-gradient(from 0deg, #c9a84c, #8a6a28, #e8c76a, #8a6a28, #c9a84c)',
              boxShadow: '0 0 10px rgba(201,168,76,0.45), 0 2px 6px rgba(0,0,0,0.28)',
              border: '2px solid rgba(255,220,100,0.42)',
            }
          : {
              background:
                'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015))',
              border: '2px solid rgba(255,255,255,0.08)',
            }
      }
    >
      {filled ? <div className="h-1.5 w-1.5 rounded-full bg-amber-200/60" /> : null}
    </div>
  );
}

function TopPlayerPlate({
  seat,
  isOpponent,
}: {
  seat: TableSeatView;
  isOpponent: boolean;
}) {
  const isCurrentTurn = seat.isCurrentTurn;

  return (
    <motion.div
      animate={isCurrentTurn ? { scale: [1, 1.015, 1] } : {}}
      transition={{ duration: 1.8, repeat: isCurrentTurn ? Infinity : 0 }}
      className="relative flex items-center gap-3 rounded-[20px] px-4 py-2.5 backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, rgba(4,10,18,0.66), rgba(5,12,20,0.48))',
        border: isCurrentTurn
          ? '1px solid rgba(201,168,76,0.24)'
          : '1px solid rgba(255,255,255,0.08)',
        boxShadow: isCurrentTurn
          ? '0 0 22px rgba(201,168,76,0.1), 0 14px 30px rgba(0,0,0,0.24)'
          : '0 14px 30px rgba(0,0,0,0.2)',
      }}
    >
      {isCurrentTurn ? (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-[20px]"
          animate={{ opacity: [0.16, 0.28, 0.16] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          style={{
            background:
              'radial-gradient(circle at 50% 50%, rgba(201,168,76,0.16), transparent 72%)',
          }}
        />
      ) : null}

      <div
        className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: seat.isMine
            ? 'linear-gradient(135deg, #7a5b1a, #d2b15c)'
            : 'linear-gradient(135deg, rgba(47,69,96,0.95), rgba(13,27,42,0.98))',
          border: '1px solid rgba(201,168,76,0.22)',
          boxShadow: '0 8px 18px rgba(0,0,0,0.24)',
        }}
      >
        <svg viewBox="0 0 24 24" className="h-5.5 w-5.5" fill="rgba(255,255,255,0.82)">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </svg>
      </div>

      <div className="relative z-10 flex min-w-0 items-center gap-2">
        <span
          className="truncate text-[18px] font-black leading-none md:text-[20px]"
          style={{ color: '#e6c364', fontFamily: 'Georgia, serif' }}
        >
          {seat.isMine ? 'Você' : isOpponent ? 'Oponente' : seat.seatId}
        </span>
        {seat.isBot ? (
          <span
            className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.58)',
            }}
          >
            Bot
          </span>
        ) : null}
      </div>

      <div
        className="relative z-10 flex h-6.5 w-6.5 items-center justify-center rounded-full"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          color: 'rgba(255,255,255,0.38)',
        }}
      >
        <span className="text-[10px]">⚙</span>
      </div>
    </motion.div>
  );
}

function BottomPlayerAnchor({
  seat,
}: {
  seat: TableSeatView;
}) {
  const isCurrentTurn = seat.isCurrentTurn;

  return (
    <motion.div
      animate={isCurrentTurn ? { scale: [1, 1.015, 1] } : {}}
      transition={{ duration: 1.8, repeat: isCurrentTurn ? Infinity : 0 }}
      className="relative flex flex-col items-center gap-0.5"
    >
      {isCurrentTurn ? (
        <motion.div
          className="absolute -inset-3 rounded-full"
          animate={{ opacity: [0.24, 0.5, 0.24] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          style={{
            background: 'radial-gradient(circle, rgba(201,168,76,0.2) 0%, transparent 74%)',
          }}
        />
      ) : null}

      <div
        className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full"
        style={{
          background: 'linear-gradient(135deg, #7a5b1a, #d2b15c)',
          border: '1px solid rgba(201,168,76,0.38)',
          boxShadow: '0 10px 22px rgba(0,0,0,0.22)',
        }}
      >
        <svg viewBox="0 0 24 24" className="h-5.5 w-5.5" fill="rgba(255,255,255,0.88)">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
        </svg>

        <div
          className="absolute -bottom-1 -right-1 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide text-black"
          style={{ background: 'linear-gradient(135deg, #c9a84c, #e8c76a)' }}
        >
          Você
        </div>
      </div>

      <div
        className="relative z-10 rounded-full px-2.5 py-1 text-[9px] font-bold"
        style={{
          background: 'rgba(0,0,0,0.3)',
          border: isCurrentTurn
            ? '1px solid rgba(201,168,76,0.22)'
            : '1px solid rgba(255,255,255,0.08)',
          color: isCurrentTurn ? '#e8c76a' : 'rgba(255,255,255,0.82)',
        }}
      >
        Você
      </div>

      <div
        className="text-[7px] font-medium tracking-wider"
        style={{ color: 'rgba(255,255,255,0.4)' }}
      >
        {isCurrentTurn ? '— Em turno —' : seat.ready ? 'Pronto' : 'Aguardando'}
      </div>
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
  rotation = 0,
  isLaunching,
}: {
  rank: string;
  suit: string;
  isWinner?: boolean;
  isFlipping?: boolean;
  isFading?: boolean;
  revealKey?: number;
  rotation?: number;
  isLaunching?: boolean;
}) => {
  const isRed = parseSuitColor(suit);
  const textColor = isRed ? '#c0392b' : '#1a1a2e';
  const symbol = SUIT_SYMBOL_MAP[suit] ?? suit;

  return (
    <motion.div
      key={revealKey}
      initial={
        isFlipping ? { scale: 0.86, rotateY: 180, opacity: 0, rotate: rotation } : { scale: 1 }
      }
      animate={{
        scale: isFading ? 0.92 : 1,
        rotateY: 0,
        opacity: isFading ? 0.34 : 1,
        y: isLaunching ? -32 : 0,
        rotate: rotation,
      }}
      transition={{
        type: 'spring',
        stiffness: 280,
        damping: 22,
        duration: isFlipping ? 0.55 : 0.24,
      }}
      className="relative rounded-[16px]"
      style={{
        width: 92,
        height: 126,
        background: 'linear-gradient(145deg, #fefdf8 0%, #f8f5ec 60%, #f2edd8 100%)',
        boxShadow: isWinner
          ? '0 0 26px rgba(250,204,21,0.42), 0 12px 24px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.9)'
          : '0 10px 22px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.9)',
        border: isWinner
          ? '2px solid rgba(250,204,21,0.68)'
          : '1px solid rgba(0,0,0,0.08)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 rounded-[16px]"
        style={{
          background:
            'linear-gradient(150deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.15) 18%, transparent 35%)',
        }}
      />

      <div className="absolute left-2 top-2 flex flex-col items-center leading-none">
        <span className="text-[16px] font-black" style={{ color: textColor }}>
          {rank}
        </span>
        <span className="text-[12px]" style={{ color: textColor }}>
          {symbol}
        </span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[48px] leading-none" style={{ color: textColor }}>
          {symbol}
        </span>
      </div>

      <div className="absolute bottom-2 right-2 flex rotate-180 flex-col items-center leading-none">
        <span className="text-[16px] font-black" style={{ color: textColor }}>
          {rank}
        </span>
        <span className="text-[12px]" style={{ color: textColor }}>
          {symbol}
        </span>
      </div>

      {isWinner ? (
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 14, delay: 0.2 }}
          className="absolute -right-3 -top-3 z-20 rounded-full px-2 py-1 text-[10px] font-black text-black shadow-lg"
          style={{ background: 'linear-gradient(135deg, #fde047, #f59e0b)' }}
        >
          🏆
        </motion.div>
      ) : null}
    </motion.div>
  );
};

function OpponentBackCards() {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          initial={{ rotate: 0 }}
          animate={{ rotate: index === 0 ? -7 : index === 1 ? 0 : 7 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          style={{
            width: 56,
            height: 80,
            borderRadius: 12,
            background: 'linear-gradient(145deg, #1a1f29 0%, #171d27 50%, #232934 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 7px 16px rgba(0,0,0,0.34)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 8,
              borderRadius: 9,
              border: '1px solid rgba(230,195,100,0.12)',
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(230,195,100,0.14) 0, rgba(230,195,100,0.14) 1px, transparent 1px, transparent 5px)',
            }}
          />
        </motion.div>
      ))}
    </div>
  );
}

function ViraCard({ rank, suit }: { rank: string; suit?: string }) {
  const displaySuit = suit ?? 'C';
  const isRed = parseSuitColor(displaySuit);
  const textColor = isRed ? '#c0392b' : '#1a1a2e';
  const symbol = SUIT_SYMBOL_MAP[displaySuit] ?? '♣';

  return (
    <div className="relative flex flex-col items-center gap-1.5 opacity-90">
      <div
        className="text-[8px] font-black uppercase tracking-[0.2em]"
        style={{ color: 'rgba(230,195,100,0.76)' }}
      >
        Vira
      </div>

      <motion.div
        initial={{ rotateY: 180, scale: 0.92 }}
        animate={{ rotateY: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 220, damping: 20 }}
        className="relative rounded-[16px]"
        style={{
          width: 84,
          height: 114,
          background: 'linear-gradient(145deg, #fefdf8, #f5f0e4)',
          border: '1px solid rgba(201,168,76,0.26)',
          boxShadow:
            '0 0 12px rgba(201,168,76,0.12), 0 7px 16px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.92)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(150deg, rgba(255,255,255,0.84) 0%, transparent 30%)',
            borderRadius: 'inherit',
          }}
        />

        <div className="absolute left-2 top-2 flex flex-col items-center leading-none">
          <span className="text-[15px] font-black" style={{ color: textColor }}>
            {rank}
          </span>
          <span className="text-[10px]" style={{ color: textColor }}>
            {symbol}
          </span>
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[40px]" style={{ color: textColor }}>
            {symbol}
          </span>
        </div>

        <div className="absolute bottom-2 right-2 flex rotate-180 flex-col items-center leading-none">
          <span className="text-[15px] font-black" style={{ color: textColor }}>
            {rank}
          </span>
          <span className="text-[10px]" style={{ color: textColor }}>
            {symbol}
          </span>
        </div>
      </motion.div>
    </div>
  );
}

function ScoreBoard({
  scoreT1,
  scoreT2,
  playedRoundsCount,
}: {
  scoreT1: string;
  scoreT2: string;
  playedRoundsCount: number;
}) {
  return (
    <div
      className="min-w-[170px] rounded-[20px] px-5 py-5 backdrop-blur-xl"
      style={{
        background: 'linear-gradient(180deg, rgba(4,10,18,0.62), rgba(3,8,14,0.46))',
        border: '1px solid rgba(230,195,100,0.12)',
        boxShadow: '0 14px 28px rgba(0,0,0,0.2)',
      }}
    >
      <div className="flex items-center justify-center gap-2.5">
        <span
          className="text-[40px] font-black leading-none"
          style={{ color: '#e6c364', fontFamily: 'Georgia, serif' }}
        >
          {scoreT1}
        </span>
        <span
          className="text-[17px] font-light leading-none"
          style={{ color: 'rgba(255,255,255,0.24)' }}
        >
          ×
        </span>
        <span
          className="text-[40px] font-black leading-none"
          style={{ color: '#e6c364', fontFamily: 'Georgia, serif' }}
        >
          {scoreT2}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-center gap-2.5">
        {[0, 1, 2].map((index) => (
          <PokerChip key={index} filled={index < playedRoundsCount} />
        ))}
      </div>

      <div
        className="mt-3 text-center text-[8px] font-black uppercase tracking-[0.2em]"
        style={{ color: 'rgba(255,255,255,0.24)' }}
      >
        {playedRoundsCount} / 3 Rodadas
      </div>
    </div>
  );
}

function SideInfoBlock({
  title,
  value,
  status,
}: {
  title: string;
  value: string | number;
  status: string;
}) {
  return (
    <div className="flex max-w-[116px] flex-col gap-3 text-left">
      <div
        className="space-y-1 pb-3"
        style={{ borderBottom: '1px solid rgba(230,195,100,0.14)' }}
      >
        <div
          className="text-[8px] font-black uppercase tracking-[0.2em]"
          style={{ color: 'rgba(255,255,255,0.38)' }}
        >
          {title}
        </div>
        <div
          className="text-[40px] font-black leading-none"
          style={{ color: '#f0e6d3', fontFamily: 'Georgia, serif' }}
        >
          {value}
        </div>
      </div>

      <div>
        <div
          className="text-[8px] font-black uppercase tracking-[0.2em]"
          style={{ color: 'rgba(255,255,255,0.3)' }}
        >
          Estado
        </div>
        <div className="mt-1 text-[12px] font-bold leading-snug text-white/90">{status}</div>
      </div>
    </div>
  );
}

function PlayedSlot({
  label,
  card,
  revealKey,
  isWinner,
  isFading,
  rotation,
  isLaunching = false,
}: {
  label: string;
  card: { rank: string; suit: string } | null;
  revealKey: number;
  isWinner: boolean;
  isFading: boolean;
  rotation: number;
  isLaunching?: boolean;
}) {
  return (
    <div className="flex min-h-[140px] min-w-[100px] flex-col items-center gap-1.5">
      <div
        className="text-[8px] font-black uppercase tracking-[0.18em]"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        {label}
      </div>

      <AnimatePresence mode="wait">
        {card ? (
          <motion.div
            key={`${label}-${revealKey}`}
            initial={{ opacity: 0, y: label === 'Oponente' ? -20 : 20, rotate: rotation }}
            animate={{ opacity: 1, y: 0, rotate: rotation }}
            exit={{ opacity: 0 }}
          >
            <TableCard
              rank={card.rank}
              suit={card.suit}
              isWinner={isWinner}
              isFlipping
              isFading={isFading}
              revealKey={revealKey}
              rotation={rotation}
              isLaunching={isLaunching}
            />
          </motion.div>
        ) : (
          <div
            className="flex items-center justify-center rounded-[16px]"
            style={{
              width: 92,
              height: 126,
              border: '2px dashed rgba(255,255,255,0.1)',
              background: 'rgba(0,0,0,0.08)',
            }}
          >
            <span
              className="text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{ color: 'rgba(255,255,255,0.18)' }}
            >
              {label === 'Oponente' ? 'Aguarde' : 'Sua jogada'}
            </span>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MatchTableShell(props: MatchTableShellProps) {
  const {
    handStatusLabel,
    betState,
    currentValue,
    specialState,
    latestRound,
    tablePhase,
    canStartHand,
    scoreLabel,
    opponentSeatView,
    mySeatView,
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
    playedRoundsCount,
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

  const parseCard = (cardStr: string | null) => {
    if (!cardStr || cardStr.length < 2) {
      return null;
    }

    return {
      rank: cardStr.slice(0, -1),
      suit: cardStr.slice(-1),
    };
  };

  const myCard = parseCard(displayedMyPlayedCard);
  const opponentCard = parseCard(displayedOpponentPlayedCard);

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
    <div
      className="felt-table relative flex h-full min-h-0 w-full flex-col overflow-hidden"
      style={{
        borderRadius: 34,
        border: '1px solid rgba(230,195,100,0.16)',
        background:
          'radial-gradient(circle at 50% 48%, rgba(32,64,98,0.42) 0%, rgba(15,31,47,0.7) 42%, rgba(7,14,24,0.96) 100%)',
        boxShadow: '0 0 0 6px rgba(0,0,0,0.22), 0 34px 84px rgba(0,0,0,0.5)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-[1px]"
        style={{ borderRadius: 32, border: '1px solid rgba(255,255,255,0.03)' }}
      />
      <div
        className="pointer-events-none absolute inset-[12px]"
        style={{ borderRadius: 30, border: '1px solid rgba(230,195,100,0.08)' }}
      />
      <div
        className="pointer-events-none absolute bottom-[17%] left-[5.5%] right-[5.5%] top-[10%]"
        style={{ borderRadius: 9999, border: '1px solid rgba(230,195,100,0.1)' }}
      />
      <div
        className="pointer-events-none absolute bottom-[24%] left-[10.5%] right-[10.5%] top-[18%]"
        style={{ borderRadius: 9999, border: '1px solid rgba(255,255,255,0.03)' }}
      />

      <div className="relative flex min-h-0 flex-1 flex-col px-6 pb-2 pt-5">
        <div className="pointer-events-none absolute inset-0">
          <div
            className="absolute inset-x-[24%] top-[14%] h-[190px] rounded-full"
            style={{
              background:
                'radial-gradient(circle, rgba(255,255,255,0.035) 0%, rgba(230,195,100,0.03) 28%, transparent 74%)',
              filter: 'blur(18px)',
            }}
          />
          <div
            className="absolute inset-x-[22%] bottom-[11%] h-[95px] rounded-full"
            style={{
              background: 'radial-gradient(circle, rgba(230,195,100,0.05) 0%, transparent 76%)',
              filter: 'blur(18px)',
            }}
          />
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 self-center">
            {opponentSeatView ? <TopPlayerPlate seat={opponentSeatView} isOpponent /> : null}
          </div>

          <div className="mt-4 shrink-0 self-center">
            <OpponentBackCards />
          </div>

          {/* NOTE: Center stage now privileges the duel. Vira becomes support, not lead actor. */}
          <div className="relative mt-2 flex min-h-0 flex-1 items-center justify-center">
            <div className="absolute left-[4%] top-[42%] hidden -translate-y-1/2 xl:block">
              <SideInfoBlock
                title="Valor Atual"
                value={currentValue}
                status={isAwaitingBet ? 'Aguardando Truco' : handStatusLabel}
              />
            </div>

            <div className="absolute right-[5%] top-[42%] hidden -translate-y-1/2 xl:block">
              <ScoreBoard
                scoreT1={scoreT1}
                scoreT2={scoreT2}
                playedRoundsCount={playedRoundsCount}
              />
            </div>

            <div className="flex w-full max-w-[700px] items-center justify-center gap-5">
              <div className="shrink-0">
                <ViraCard rank={effectiveViraRank} suit="C" />
              </div>

              <div className="relative flex min-w-[250px] flex-col items-center gap-2">
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 h-[138px] w-[226px] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(255,255,255,0.035), rgba(230,195,100,0.02) 38%, transparent 74%)',
                    filter: 'blur(14px)',
                  }}
                />

                <div className="relative z-10 flex items-start justify-center gap-2">
                  <PlayedSlot
                    label="Oponente"
                    card={opponentCard}
                    revealKey={opponentRevealKey}
                    isWinner={opponentCardWon}
                    isFading={shouldFadeOpponentCard}
                    rotation={-5}
                  />

                  <PlayedSlot
                    label="Você"
                    card={myCard}
                    revealKey={myRevealKey}
                    isWinner={myCardWon}
                    isFading={shouldFadeMyCard}
                    rotation={6}
                    isLaunching={myCardLaunching}
                  />
                </div>

                <div className="relative z-10 flex w-full max-w-[206px] items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span
                    className="text-[8px] font-black uppercase tracking-[0.18em]"
                    style={{ color: 'rgba(255,255,255,0.24)' }}
                  >
                    duelo
                  </span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>
              </div>
            </div>
          </div>

          {/* NOTE: Player anchor sits at the start of the lower stage, not inside the duel area. */}
          <div className="relative z-10 -mt-2 shrink-0 self-center">
            {mySeatView ? <BottomPlayerAnchor seat={mySeatView} /> : null}
          </div>

          {/* NOTE: Rail and hand are intentionally merged by spacing and width, reducing the “two separate modules” feeling. */}
          <div className="mt-1 flex shrink-0 flex-col items-center gap-0.5">
            <div className="w-full max-w-[560px]">
              <MatchActionSurface availableActions={availableActions} onAction={onAction} />
            </div>

            <div className="w-full max-w-[610px]">
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
          </div>
        </div>
      </div>

      <AnimatePresence>
        {latestRound?.finished ? (
          <motion.div
            key={`result-${roundResolvedKey}`}
            initial={{ scale: 0.5, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26 }}
            className="pointer-events-none absolute left-1/2 top-[46%] z-50 -translate-x-1/2 -translate-y-1/2"
          >
            <motion.div
              animate={{
                boxShadow:
                  latestRound.result === 'TIE'
                    ? '0 0 40px rgba(148,163,184,0.45)'
                    : latestRound.result === 'P1'
                      ? '0 0 60px rgba(201,168,76,0.65)'
                      : '0 0 60px rgba(220,38,38,0.55)',
              }}
              className={`
                rounded-[22px] border-2 px-8 py-4 text-[22px] font-black uppercase tracking-[0.12em] shadow-2xl backdrop-blur-xl
                ${
                  latestRound.result === 'TIE'
                    ? 'border-slate-500 bg-slate-900/90 text-white'
                    : latestRound.result === 'P1'
                      ? 'border-amber-300 text-black'
                      : 'border-red-500 bg-red-950/90 text-white'
                }
              `}
              style={
                latestRound.result === 'P1'
                  ? { background: 'linear-gradient(135deg, #c9a84c, #e8c76a)' }
                  : {}
              }
            >
              {latestRound.result === 'TIE'
                ? '🤝 Empate'
                : latestRound.result === 'P1'
                  ? '🏆 Você venceu!'
                  : '❌ Derrota'}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isMaoDeOnze ? (
          <motion.div
            initial={{ y: -200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 200, opacity: 0 }}
            transition={{ type: 'spring', damping: 14 }}
            className="pointer-events-none fixed left-1/2 top-16 z-[100] -translate-x-1/2"
          >
            <div
              className="rounded-full px-10 py-4 text-2xl font-black uppercase tracking-widest text-black shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, #c9a84c, #8a6a28)',
                border: '2px solid #ffdf80',
                boxShadow: '0 0 60px rgba(201,168,76,0.8)',
              }}
            >
              ⚡ Mão de 11 ⚡
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isHandFinished || isMatchFinished ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-x-4 top-16 z-40 mx-auto max-w-sm"
          >
            <div
              className="rounded-2xl px-6 py-4 text-center shadow-2xl backdrop-blur-xl"
              style={{
                background: isMatchFinished
                  ? 'rgba(201,168,76,0.12)'
                  : 'rgba(22,101,52,0.12)',
                border: isMatchFinished
                  ? '1px solid rgba(201,168,76,0.35)'
                  : '1px solid rgba(74,222,128,0.3)',
              }}
            >
              <div
                className="text-xs font-black uppercase tracking-[0.2em]"
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
        ) : null}
      </AnimatePresence>
    </div>
  );
}
