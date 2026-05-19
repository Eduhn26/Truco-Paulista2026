/**
 * useViraReveal — detecta quando uma nova carta Vira é revelada e expõe
 * estado para renderizar o <ViraRevealAnimation />.
 *
 * Uso no matchTableShell:
 *
 *   const viraReveal = useViraReveal({
 *     viraRank,
 *     viraSuit,
 *     isViraPublic: Boolean(currentPublicViraRank),
 *     manilhaLabel: resolvedManilhaLabel,
 *   });
 *
 *   // No JSX, antes de fechar o container da mesa:
 *   {viraReveal.isShowing ? (
 *     <ViraRevealAnimation
 *       rank={viraReveal.rank}
 *       suit={viraReveal.suit}
 *       isRed={viraReveal.isRed}
 *       manilhaLabel={viraReveal.manilhaLabel}
 *       onComplete={viraReveal.dismiss}
 *     />
 *   ) : null}
 *
 * Comportamento:
 *   • Detecta mudança de viraRank (compara com ref anterior).
 *   • Só dispara quando isViraPublic === true (a carta já foi revelada pelo servidor).
 *   • Não dispara na primeira render (mounting) para evitar animação ao reconectar.
 *   • Expõe dismiss() para o onComplete do componente.
 *   • Salva o último rank revelado em sessionStorage — não repete na mesma sessão
 *     (útil em reconexões). Pode ser desativado com skipSessionCache: true.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Rank } from '../services/socket/socketTypes';

const SUIT_RED = new Set(['C', 'O']); // Copas e Ouros são vermelhos

// Mapa de Rank → naipe padrão para a manilha (Truco Paulista: manilha = acima da vira)
const MANILHA_ABOVE: Record<string, string> = {
  '4': '5', '5': '6', '6': '7', '7': 'Q', 'Q': 'J', 'J': 'K', 'K': 'A', 'A': '2', '2': '3', '3': '4',
};

function calcManilhaRank(viraRank: Rank): string {
  return MANILHA_ABOVE[viraRank] ?? '?';
}

type ViraRevealState = {
  isShowing: boolean;
  rank: Rank;
  suit: string;
  isRed: boolean;
  manilhaLabel: string;
  dismiss: () => void;
};

type Options = {
  viraRank: Rank;
  viraSuit: string;
  isViraPublic: boolean;
  manilhaLabel?: string;
  skipSessionCache?: boolean;
};

const SESSION_KEY = 'tp:lastRevealedVira';

export function useViraReveal({
  viraRank,
  viraSuit,
  isViraPublic,
  manilhaLabel,
  skipSessionCache = false,
}: Options): ViraRevealState {
  const [isShowing, setIsShowing] = useState(false);
  const prevRankRef = useRef<Rank | null>(null);
  const mountedRef = useRef(false);

  const manilhaText = manilhaLabel ?? `Manilha: ${calcManilhaRank(viraRank)}`;

  const dismiss = useCallback(() => {
    setIsShowing(false);
  }, []);

  useEffect(() => {
    // Skip first mount — avoids replay on reconnection
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevRankRef.current = viraRank;
      return;
    }

    if (!isViraPublic) return;

    const rankChanged = prevRankRef.current !== viraRank;
    if (!rankChanged) return;

    prevRankRef.current = viraRank;

    // Session cache — skip if same vira was already shown this session
    if (!skipSessionCache) {
      const lastRevealed = sessionStorage.getItem(SESSION_KEY);
      const cacheKey = `${viraRank}:${viraSuit}`;
      if (lastRevealed === cacheKey) return;
      sessionStorage.setItem(SESSION_KEY, cacheKey);
    }

    setIsShowing(true);
  }, [viraRank, viraSuit, isViraPublic, skipSessionCache]);

  return {
    isShowing,
    rank: viraRank,
    suit: viraSuit,
    isRed: SUIT_RED.has(viraSuit),
    manilhaLabel: manilhaText,
    dismiss,
  };
}
