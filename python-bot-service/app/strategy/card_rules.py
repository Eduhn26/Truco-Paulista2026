from collections.abc import Iterable

RANKS = ('4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3')
MANILHA_SUIT_STRENGTH = {
    'O': 0,
    'E': 1,
    'C': 2,
    'P': 3,
}


class InvalidCardError(ValueError):
    pass


def next_rank(rank: str) -> str:
    if rank not in RANKS:
        raise InvalidCardError(f'Invalid rank: {rank}')

    index = RANKS.index(rank)
    return RANKS[(index + 1) % len(RANKS)]


def manilha_rank_from_vira(vira_rank: str) -> str:
    return next_rank(vira_rank)


def split_card(card: str) -> tuple[str, str]:
    if len(card) < 2:
        raise InvalidCardError(f'Invalid card: {card}')

    rank = card[:-1]
    suit = card[-1]

    if rank not in RANKS or suit not in MANILHA_SUIT_STRENGTH:
        raise InvalidCardError(f'Invalid card: {card}')

    return rank, suit


def card_strength_key(card: str, vira_rank: str) -> tuple[int, int]:
    rank, suit = split_card(card)
    manilha_rank = manilha_rank_from_vira(vira_rank)

    if rank == manilha_rank:
        return 1, MANILHA_SUIT_STRENGTH[suit]

    return 0, RANKS.index(rank)


def compare_cards(left: str, right: str, vira_rank: str) -> int:
    left_strength = card_strength_key(left, vira_rank)
    right_strength = card_strength_key(right, vira_rank)

    if left_strength > right_strength:
        return 1
    if left_strength < right_strength:
        return -1
    return 0


def sort_cards(cards: Iterable[str], vira_rank: str) -> list[str]:
    return sorted(cards, key=lambda card: card_strength_key(card, vira_rank))


def card_strength_score(card: str, vira_rank: str) -> float:
    rank, suit = split_card(card)
    manilha_rank = manilha_rank_from_vira(vira_rank)

    if rank == manilha_rank:
        return round(0.76 + MANILHA_SUIT_STRENGTH[suit] * 0.08, 4)

    return round((RANKS.index(rank) / (len(RANKS) - 1)) * 0.72, 4)


def hand_strength_score(cards: Iterable[str], vira_rank: str) -> float:
    ordered_scores = sorted(
        (card_strength_score(card, vira_rank) for card in cards),
        reverse=True,
    )

    if not ordered_scores:
        return 0.0

    weights = (0.5, 0.3, 0.2)
    weighted_total = sum(
        score * weights[index]
        for index, score in enumerate(ordered_scores[: len(weights)])
    )
    used_weight = sum(weights[: min(len(ordered_scores), len(weights))])

    return round(weighted_total / used_weight, 4)
