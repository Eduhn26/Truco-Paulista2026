import { Card } from '../../../src/domain/value-objects/card';
import { compareCards, manilhaRankFromVira } from '../../../src/domain/services/truco-rules';

describe('TrucoRules', () => {
  it('manilha beats non-manilha', () => {
    const vira = '2';
    const manilha = manilhaRankFromVira(vira);

    // CORRIGIDO: 'QO' em vez de 'QS' (Ouros em vez de S)
    const manilhaCard = Card.from(`${manilha}O`);
    const normalCard = Card.from('2C');

    expect(compareCards(manilhaCard, normalCard, vira)).toBe('A');
  });

  it('between manilhas, suit decides', () => {
    const vira = '7';
    const manilha = manilhaRankFromVira(vira);

    // CORRIGIDO: 'QC' em vez de 'QS', 'QD' em vez de 'QD' (mas 'D' não é válido)
    // Vamos usar 'QC' (Copas) e 'QO' (Ouros) - Copas é mais forte que Ouros
    const strongerSuit = Card.from(`${manilha}C`);
    const weakerSuit = Card.from(`${manilha}O`);

    expect(compareCards(strongerSuit, weakerSuit, vira)).toBe('A');
  });

  it('without manilha, base rank decides', () => {
    const vira = '4';
    const manilha = manilhaRankFromVira(vira);

    const a = Card.from('3O');
    const b = Card.from('KO');

    expect(a.getRank()).not.toBe(manilha);
    expect(b.getRank()).not.toBe(manilha);

    expect(compareCards(a, b, vira)).toBe('A');
  });
});
