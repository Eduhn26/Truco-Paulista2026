import unittest

from app.strategy.card_rules import (
    InvalidCardError,
    compare_cards,
    hand_strength_score,
    manilha_rank_from_vira,
    sort_cards,
)


class CardRulesTest(unittest.TestCase):
    def test_resolves_manilha_as_next_rank(self) -> None:
        self.assertEqual(manilha_rank_from_vira('7'), 'Q')
        self.assertEqual(manilha_rank_from_vira('3'), '4')

    def test_orders_regular_cards_using_domain_rank_order(self) -> None:
        self.assertEqual(sort_cards(['3O', '4O', 'AO'], '7'), ['4O', 'AO', '3O'])

    def test_places_all_manilhas_above_regular_cards(self) -> None:
        self.assertEqual(
            sort_cards(['QP', '3O', 'QO', '4O'], '7'),
            ['4O', '3O', 'QO', 'QP'],
        )

    def test_uses_p_c_e_o_as_manilha_strength_order(self) -> None:
        self.assertGreater(compare_cards('QP', 'QC', '7'), 0)
        self.assertGreater(compare_cards('QC', 'QE', '7'), 0)
        self.assertGreater(compare_cards('QE', 'QO', '7'), 0)

    def test_hand_strength_stays_normalized(self) -> None:
        score = hand_strength_score(['QP', '3O', 'AO'], '7')
        self.assertGreaterEqual(score, 0.0)
        self.assertLessEqual(score, 1.0)

    def test_rejects_invalid_cards(self) -> None:
        with self.assertRaises(InvalidCardError):
            compare_cards('10P', '4O', '7')


if __name__ == '__main__':
    unittest.main()
