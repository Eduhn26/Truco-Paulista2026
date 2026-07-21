from dataclasses import dataclass
from random import Random

RANKS = ('4', '5', '6', '7', 'Q', 'J', 'K', 'A', '2', '3')
SUITS = ('C', 'O', 'P', 'E')
FULL_DECK = tuple(f'{rank}{suit}' for rank in RANKS for suit in SUITS)


@dataclass(frozen=True)
class Deal:
    vira_card: str
    vira_rank: str
    player_one_hand: list[str]
    player_two_hand: list[str]


def deal(rng: Random) -> Deal:
    cards = list(FULL_DECK)
    rng.shuffle(cards)

    vira_card = cards.pop(0)
    player_one_hand = cards[:3]
    player_two_hand = cards[3:6]

    return Deal(
        vira_card=vira_card,
        vira_rank=vira_card[:-1],
        player_one_hand=player_one_hand,
        player_two_hand=player_two_hand,
    )
