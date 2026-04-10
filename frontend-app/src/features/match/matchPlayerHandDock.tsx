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
      className="relative mx-auto w-full max-w-4xl px-1 pb-1"
      initial={false}
      animate={{ y: isInteractive ? 0 : 2, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
    >
      {/* Container Premium */}
      <div className="relative overflow-hidden rounded-[24px] border px-3 pb-2 pt-2.5 sm:px-4 sm:pb-3 sm:pt-3"
        style={{
          background: 'linear-gradient(180deg, rgba(10,15,22,0.85) 0%, rgba(6,9,14,0.95) 100%)',
          borderColor: isMyTurn ? 'rgba(201,168,76,0.25)' : 'rgba(255,255,255,0.06)',
          boxShadow: isMyTurn ? '0 -4px 20px rgba(201,168,76,0.08), inset 0 1px 0 rgba(255,255,255,0.05)' : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        {/* Glow no topo quando é seu turno */}
        {isMyTurn && (
          <div className="pointer-events-none absolute inset-x-0 top-0 h-12 rounded-b-full bg-amber-500/10 blur-xl" />
        )}

        {/* Header do Dock */}
        <div className="relative z-10 mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider border ${
              isMyTurn 
                ? 'bg-amber-500/15 text-amber-400 border-amber-400/30' 
                : 'bg-white/5 text-slate-500 border-white/10'
            }`}>
              {isMyTurn ? 'Sua Vez' : 'Sua Mão'}
            </span>
            <span className="text-[10px] text-slate-500">
              {isInteractive ? 'Escolha uma carta para jogar' : handCount > 0 ? 'Aguardando próxima ação' : 'Sua mão aparecerá aqui'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[8px] font-bold text-slate-500 border border-white/5">
              {handCount} carta{handCount !== 1 ? 's' : ''}
            </span>
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[8px] font-bold text-amber-400/80 border border-amber-400/20">
              Vira {viraRank}
            </span>
          </div>
        </div>

        {/* Área das Cartas */}
        <div className="relative z-10 rounded-[18px] border border-white/5 bg-[#050810]/60 px-2 py-2">
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
