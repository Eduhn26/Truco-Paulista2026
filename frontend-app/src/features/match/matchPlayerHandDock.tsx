import type { ReactNode } from 'react';
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
  isOneVsOne: boolean;
  viraRank: Rank;
  isSubdued?: boolean;
  actionSurface?: ReactNode;
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
  isOneVsOne,
  viraRank,
  isSubdued = false,
  actionSurface = null,
}: Props) {
  const isInteractive = tablePhase === 'playing' && myCards.length > 0;
  const handCount = myCards.length;

  return (
    <motion.div
      layout
      className="relative mx-auto w-full max-w-4xl px-2 pb-0"
      initial={false}
      // CHANGE: subdued state is now aggressive. Before: opacity 0.72, scale
      // 0.985. After: opacity 0.44, scale 0.96, slight slide down. This is
      // the fix for "the dock competes with the event overlay". When anything
      // important is happening on the mesa, the dock visibly yields.
      animate={{
        y: isSubdued ? 8 : isInteractive ? -1 : 0,
        opacity: isSubdued ? 0.44 : 1,
        scale: isSubdued ? 0.96 : 1,
      }}
      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
    >
      <div
        className="pointer-events-none absolute inset-x-[14%] -top-4 h-12 rounded-full"
        style={{
          background: isSubdued
            ? 'radial-gradient(circle, rgba(255,255,255,0.01) 0%, transparent 78%)'
            : isMyTurn
              ? 'radial-gradient(circle, rgba(201,168,76,0.14) 0%, rgba(201,168,76,0.04) 42%, transparent 78%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.035) 0%, transparent 78%)',
          filter: 'blur(16px)',
        }}
      />

      <div
        className="relative"
        style={{
          borderRadius: 24,
          padding: '10px 10px 8px',
          background: isSubdued
            ? 'linear-gradient(180deg, rgba(5,10,18,0.48) 0%, rgba(3,6,12,0.62) 100%)'
            : isMyTurn
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
        <div
          className="pointer-events-none absolute inset-x-10 top-0 h-6 rounded-b-full"
          style={{
            background: isMyTurn
              ? 'linear-gradient(180deg, rgba(201,168,76,0.1), transparent)'
              : 'linear-gradient(180deg, rgba(255,255,255,0.035), transparent)',
            filter: 'blur(8px)',
          }}
        />

        {/* CHANGE: the duplicate "V Você" avatar block was removed. The
            bottom player identity is now owned by the BottomPlayerAnchor
            above the dock (rendered by matchTableShell). The dock focuses
            on card count + vira badge + action surface + cards. One avatar
            per player, not two.

            Before: avatar + name + "Em turno" subtext + card count + vira.
            After: just the context chips row + action surface + cards. */}
        <div className="relative z-10 mb-2 flex flex-col gap-2 px-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: 'rgba(255,255,255,0.42)',
                }}
              >
                Sua mão
              </span>
              {isMyTurn ? (
                <span
                  className="rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.14em]"
                  style={{
                    background: 'rgba(201,168,76,0.14)',
                    border: '1px solid rgba(201,168,76,0.28)',
                    color: '#e8c76a',
                  }}
                >
                  Em turno
                </span>
              ) : null}
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

          {actionSurface ? <div className="w-full">{actionSurface}</div> : null}
        </div>

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
