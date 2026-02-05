import type { Card } from '../value-objects/card';
import { nextRank, rankStrength, type Rank } from '../value-objects/rank';
import type { Suit } from '../value-objects/suit';

export type CompareResult = 'A' | 'B' | 'TIE';

const MANILHA_SUIT_STRENGTH: Record<Suit, number> = {
  P: 3, // Paus - MAIS FORTE
  C: 2, // Copas
  E: 1, // Espadas
  O: 0, // Ouros - MAIS FRACO
};

export function manilhaRankFromVira(vira: Rank): Rank {
  return nextRank(vira);
}

export function compareCards(a: Card, b: Card, vira: Rank): CompareResult {
  const manilha = manilhaRankFromVira(vira);

  const aIsManilha = a.getRank() === manilha;
  const bIsManilha = b.getRank() === manilha;

  if (aIsManilha && !bIsManilha) return 'A';
  if (!aIsManilha && bIsManilha) return 'B';

  if (aIsManilha && bIsManilha) {
    const sa = MANILHA_SUIT_STRENGTH[a.getSuit()];
    const sb = MANILHA_SUIT_STRENGTH[b.getSuit()];
    if (sa > sb) return 'A';
    if (sb > sa) return 'B';
    return 'TIE';
  }

  const ra = rankStrength(a.getRank());
  const rb = rankStrength(b.getRank());
  if (ra > rb) return 'A';
  if (rb > ra) return 'B';
  return 'TIE';
}
