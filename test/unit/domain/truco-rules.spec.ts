import { Card } from '../../../src/domain/value-objects/card';
import { compareCards, manilhaRankFromVira } from '../../../src/domain/services/truco-rules';

describe('TrucoRules', () => {
  it('derives the manilha rank from the vira rank', () => {
    expect(manilhaRankFromVira('7')).toBe('Q');
    expect(manilhaRankFromVira('Q')).toBe('J');
    expect(manilhaRankFromVira('3')).toBe('4');
  });

  it('makes manilha beat a non-manilha card', () => {
    const vira = '2';
    const manilha = manilhaRankFromVira(vira);

    const manilhaCard = Card.from(`${manilha}O`);
    const normalCard = Card.from('2C');

    expect(compareCards(manilhaCard, normalCard, vira)).toBe('A');
  });

  it('orders manilhas as Zap, Copas, Espadas, and Ouros', () => {
    const vira = '7';
    const manilha = manilhaRankFromVira(vira);

    const zap = Card.from(`${manilha}P`);
    const copas = Card.from(`${manilha}C`);
    const espadas = Card.from(`${manilha}E`);
    const ouros = Card.from(`${manilha}O`);

    expect(compareCards(zap, copas, vira)).toBe('A');
    expect(compareCards(copas, espadas, vira)).toBe('A');
    expect(compareCards(espadas, ouros, vira)).toBe('A');
    expect(compareCards(ouros, zap, vira)).toBe('B');
  });

  it('uses the base rank order when neither card is manilha', () => {
    const vira = '4';
    const manilha = manilhaRankFromVira(vira);

    const strongerCard = Card.from('3O');
    const weakerCard = Card.from('KO');

    expect(strongerCard.getRank()).not.toBe(manilha);
    expect(weakerCard.getRank()).not.toBe(manilha);

    expect(compareCards(strongerCard, weakerCard, vira)).toBe('A');
  });
});
