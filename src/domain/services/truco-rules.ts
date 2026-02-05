import type { Card } from '../value-objects/card';
import type { Rank } from '../value-objects/rank';
import type { Suit } from '../value-objects/suit';
import { nextRank, rankStrength } from '../value-objects/rank';

export type CompareResult = 'A' | 'B' | 'TIE';

const MANILHA_SUIT_STRENGTH: Record<Suit, number> = {
  C: 0, // paus
  H: 1, // copas
  S: 2, // espadas
  D: 3, // ouros
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

  // ambos manilha: naipe decide
  if (aIsManilha && bIsManilha) {
    const sa = MANILHA_SUIT_STRENGTH[a.getSuit()];
    const sb = MANILHA_SUIT_STRENGTH[b.getSuit()];
    if (sa > sb) return 'A';
    if (sb > sa) return 'B';
    return 'TIE';
  }

  // nenhum manilha: ranking base
  const ra = rankStrength(a.getRank());
  const rb = rankStrength(b.getRank());

  if (ra > rb) return 'A';
  if (rb > ra) return 'B';
  return 'TIE';
}
