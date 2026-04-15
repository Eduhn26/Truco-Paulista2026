import { motion } from 'framer-motion';
import { MatchPlayerHandPanel } from './matchPlayerHandPanel';
import type { CardPayload, MatchStatePayload, Rank } from '../../services/socket/socketTypes';

type TablePhase = 'missing_context' | 'waiting' | 'playing' | 'hand_finished' | 'match_finished';

type Props = {
  myCards: CardPayload[];
  canPlayCard: boolean;
  tablePhase: TablePhase;
  launchingCardKey: string | null;
  currentPrivateHand: MatchStatePayload['currentHand'] | null;
  currentPublicHand: MatchStatePayload['currentHand'] | null;
  onPlayCard: (card: CardPayload) => void;
  isMyTurn: boolean;
  viraRank: Rank;
};

export function MatchPlayerHandDock({
  myCards,
  canPlayCard,
  tablePhase,
  launchingCardKey,
  currentPrivateHand,
  currentPublicHand,
  onPlayCard,
  isMyTurn,
  viraRank,
}: Props) {
  const isInteractive = tablePhase === 'playing' && myCards.length > 0;
  const handCount = myCards.length;

  return (
    <motion.div
      layout
      className="relative mx-auto w-full max-w-4xl px-2 pb-0"
      initial={false}
      animate={{
        y: isInteractive ? -1 : 0,
        opacity: 1,
        scale: 1,
      }}
      transition={{ type: 'spring', stiffness: 180, damping: 24 }}
    >
      {/* NOTE: This ambient glow ties the hand to the table floor instead of creating a separate widget aura. */}
      <div
        className="pointer-events-none absolute inset-x-[14%] -top-4 h-12 rounded-full"
        style={{
          background: isMyTurn
            ? 'radial-gradient(circle, rgba(201,168,76,0.12) 0%, rgba(201,168,76,0.04) 42%, transparent 78%)'
            : 'radial-gradient(circle, rgba(255,255,255,0.035) 0%, transparent 78%)',
          filter: 'blur(16px)',
        }}
      />

      {/* NOTE: The dock remains visually quiet, but must not clip hovered cards. */}
      <div
        className="relative"
        style={{
          borderRadius: 24,
          padding: '10px 10px 8px',
          background: isMyTurn
            ? 'linear-gradient(180deg, rgba(201,168,76,0.06) 0%, rgba(7,12,20,0.52) 22%, rgba(4,8,14,0.72) 100%)'
            : 'linear-gradient(180deg, rgba(10,16,24,0.54) 0%, rgba(5,9,15,0.72) 100%)',
          border: isMyTurn
            ? '1px solid rgba(201,168,76,0.14)'
            : '1px solid rgba(255,255,255,0.035)',
          boxShadow: isMyTurn
            ? '0 10px 24px rgba(0,0,0,0.18), 0 -6px 18px rgba(201,168,76,0.05), inset 0 1px 0 rgba(255,255,255,0.04)'
            : '0 10px 24px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.03)',
          backdropFilter: 'blur(10px)',
          overflow: 'visible',
        }}
      >
        {/* NOTE: This top sheen suggests the cards are emerging from the table edge, not from a standalone panel. */}
        <div
          className="pointer-events-none absolute inset-x-10 top-0 h-6 rounded-b-full"
          style={{
            background: isMyTurn
              ? 'linear-gradient(180deg, rgba(201,168,76,0.1), transparent)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.035), transparent)',
            filter: 'blur(8px)',
          }}
        />

        <div className="relative z-10 mb-1.5 flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="shrink-0 rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-[0.18em]"
              style={{
                background: isMyTurn ? 'rgba(201,168,76,0.14)' : 'rgba(255,255,255,0.045)',
                border: isMyTurn
                  ? '1px solid rgba(201,168,76,0.22)'
                  : '1px solid rgba(255,255,255,0.06)',
                color: isMyTurn ? '#c9a84c' : 'rgba(255,255,255,0.38)',
              }}
            >
              {isMyTurn ? 'Sua Vez' : 'Sua Mão'}
            </span>

            <span className="truncate text-[9px]" style={{ color: 'rgba(255,255,255,0.26)' }}>
              {isInteractive
                ? 'Escolha uma carta para jogar'
                : handCount > 0
                  ? 'Aguardando próxima ação'
                  : 'Sua mão aparecerá aqui'}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <span
              className="rounded-full px-2 py-0.5 text-[8px] font-bold"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.32)',
              }}
            >
              {handCount} carta{handCount !== 1 ? 's' : ''}
            </span>

            <span
              className="rounded-full px-2 py-0.5 text-[8px] font-bold"
              style={{
                background: 'rgba(201,168,76,0.08)',
                border: '1px solid rgba(201,168,76,0.14)',
                color: 'rgba(201,168,76,0.72)',
              }}
            >
              Vira {viraRank}
            </span>
          </div>
        </div>

        {/* NOTE: This inner stage must stay overflow-visible so hovered cards can rise above the panel. */}
        <div
          className="relative z-10"
          style={{
            borderRadius: 20,
            border: '1px solid rgba(255,255,255,0.025)',
            background:
              'radial-gradient(circle at 50% 58%, rgba(201,168,76,0.045), rgba(255,255,255,0.01) 24%, rgba(0,0,0,0.22) 54%, rgba(0,0,0,0.3) 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.025)',
            padding: '8px 8px 2px',
            overflow: 'visible',
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-[20%] bottom-0 h-12 rounded-full"
            style={{
              background: isMyTurn
                ? 'radial-gradient(circle, rgba(201,168,76,0.08) 0%, rgba(201,168,76,0.03) 38%, transparent 76%)'
                : 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 76%)',
              filter: 'blur(10px)',
            }}
          />

          <MatchPlayerHandPanel
            myCards={myCards}
            canPlayCard={canPlayCard}
            tablePhase={tablePhase}
            launchingCardKey={launchingCardKey}
            currentPrivateHand={currentPrivateHand}
            currentPublicHand={currentPublicHand}
            onPlayCard={onPlayCard}
            isMyTurn={isMyTurn}
            viraRank={viraRank}
          />
        </div>
      </div>
    </motion.div>
  );
}
