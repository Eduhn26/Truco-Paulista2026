import { Card } from '../../../src/domain/value-objects/card';
import { compareCards, manilhaRankFromVira } from '../../../src/domain/services/truco-rules';

describe('TrucoRules', () => {
  it('computes manilha rank from vira', () => {
    expect(manilhaRankFromVira('7')).toBe('Q');
    expect(manilhaRankFromVira('3')).toBe('4');
  });

  it('manilha beats non-manilha', () => {
    // vira 7 => manilha Q
    const a = Card.from('QC');
    const b = Card.from('3D');
    expect(compareCards(a, b, '7')).toBe('A');
  });

  it('between manilhas, suit decides', () => {
    const qClubs = Card.from('QC');
    const qDiamonds = Card.from('QD');
    expect(compareCards(qDiamonds, qClubs, '7')).toBe('A');
  });

  it('without manilha, base rank decides', () => {
    const a = Card.from('AD');
    const b = Card.from('KD');
    expect(compareCards(a, b, '7')).toBe('A');
  });
});
