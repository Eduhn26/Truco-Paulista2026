import json
from pathlib import Path

import pandas as pd

from data.pipeline import (
    RawDataset,
    build_decision_dataset,
    load_raw_dataset,
    validate_raw_dataset,
)

BET_ACTIONS = (
    'request-truco',
    'raise-to-six',
    'raise-to-nine',
    'raise-to-twelve',
    'accept-bet',
    'decline-bet',
)

RAISE_ACTIONS = (
    'raise-to-six',
    'raise-to-nine',
    'raise-to-twelve',
)


def analyze_dataset(dataset: RawDataset) -> dict:
    validate_raw_dataset(dataset)
    decisions = build_decision_dataset(dataset)

    return {
        'rowCounts': {
            'matches': len(dataset.matches),
            'hands': len(dataset.hands),
            'decisions': len(dataset.decisions),
        },
        'dataQuality': _build_data_quality(dataset, decisions),
        'targetBalance': _build_target_balance(decisions),
        'seatBalance': _build_seat_balance(dataset.matches),
        'handOutcomes': _build_hand_outcomes(dataset.hands),
        'profiles': _build_profile_analysis(
            dataset.matches,
            decisions,
        ),
        'betting': _build_betting_analysis(decisions),
        'contexts': _build_context_analysis(decisions),
    }


def analyze_dataset_dir(dataset_dir: str | Path) -> dict:
    return analyze_dataset(load_raw_dataset(dataset_dir))


def write_analysis_report(
    dataset_dir: str | Path,
    output_path: str | Path | None = None,
) -> Path:
    directory = Path(dataset_dir)
    report = analyze_dataset_dir(directory)

    destination = (
        Path(output_path)
        if output_path is not None
        else directory / 'data-quality.json'
    )
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(report, indent=2, sort_keys=True),
        encoding='utf-8',
    )

    return destination


def _build_data_quality(
    dataset: RawDataset,
    decisions: pd.DataFrame,
) -> dict:
    return {
        'nullCounts': {
            'matches': _null_counts(dataset.matches),
            'hands': _null_counts(dataset.hands),
            'decisions': _null_counts(dataset.decisions),
        },
        'duplicateRows': {
            'matches': int(dataset.matches.duplicated().sum()),
            'hands': int(dataset.hands.duplicated().sum()),
            'decisions': int(dataset.decisions.duplicated().sum()),
        },
        'duplicateIds': {
            'matches': int(dataset.matches['match_id'].duplicated().sum()),
            'hands': int(dataset.hands['hand_id'].duplicated().sum()),
            'decisions': int(
                dataset.decisions['decision_id'].duplicated().sum()
            ),
        },
        'targetNulls': int(decisions['hand_won'].isna().sum()),
        'decisionRowsPerHand': _group_size_stats(
            dataset.decisions,
            'hand_id',
        ),
        'decisionRowsPerMatch': _group_size_stats(
            dataset.decisions,
            'match_id',
        ),
    }


def _build_target_balance(decisions: pd.DataFrame) -> dict:
    target = decisions['hand_won'].dropna()

    won = int(target.eq(True).sum())
    lost = int(target.eq(False).sum())
    total = won + lost

    majority = max(won, lost)
    minority = min(won, lost)

    return {
        'rows': total,
        'won': won,
        'lost': lost,
        'winRate': _rate(won, total),
        'majorityRate': _rate(majority, total),
        'imbalanceRatio': (
            round(majority / minority, 4)
            if minority > 0
            else None
        ),
    }


def _build_seat_balance(matches: pd.DataFrame) -> dict:
    player_one_wins = int(matches['winner_player'].eq('P1').sum())
    player_two_wins = int(matches['winner_player'].eq('P2').sum())
    total = len(matches)

    return {
        'playerOneWins': player_one_wins,
        'playerTwoWins': player_two_wins,
        'playerOneWinRate': _rate(player_one_wins, total),
        'playerTwoWinRate': _rate(player_two_wins, total),
    }


def _build_hand_outcomes(hands: pd.DataFrame) -> dict:
    player_one_wins = int(hands['winner_player'].eq('P1').sum())
    player_two_wins = int(hands['winner_player'].eq('P2').sum())
    total = len(hands)

    return {
        'hands': total,
        'playerOneWins': player_one_wins,
        'playerTwoWins': player_two_wins,
        'playerOneWinRate': _rate(player_one_wins, total),
        'playerTwoWinRate': _rate(player_two_wins, total),
        'pointsAwarded': _value_counts(hands['points_awarded']),
        'finalHandValue': _value_counts(hands['final_hand_value']),
        'specialStates': _value_counts(hands['special_state']),
    }


def _build_profile_analysis(
    matches: pd.DataFrame,
    decisions: pd.DataFrame,
) -> dict:
    profiles = sorted(
        set(matches['player_one_profile'].dropna().astype(str))
        | set(matches['player_two_profile'].dropna().astype(str))
        | set(decisions['profile'].dropna().astype(str))
    )

    result = {}

    for profile in profiles:
        as_player_one = matches['player_one_profile'].eq(profile)
        as_player_two = matches['player_two_profile'].eq(profile)

        player_one_games = int(as_player_one.sum())
        player_two_games = int(as_player_two.sum())

        player_one_wins = int(
            (
                as_player_one
                & matches['winner_player'].eq('P1')
            ).sum()
        )
        player_two_wins = int(
            (
                as_player_two
                & matches['winner_player'].eq('P2')
            ).sum()
        )

        games = player_one_games + player_two_games
        wins = player_one_wins + player_two_wins

        profile_decisions = decisions.loc[
            decisions['profile'].eq(profile)
        ]
        actions = _value_counts(profile_decisions['action'])

        bet_decisions = int(
            profile_decisions['action'].isin(BET_ACTIONS).sum()
        )

        result[profile] = {
            'games': games,
            'wins': wins,
            'winRate': _rate(wins, games),
            'asPlayerOne': {
                'games': player_one_games,
                'wins': player_one_wins,
                'winRate': _rate(
                    player_one_wins,
                    player_one_games,
                ),
            },
            'asPlayerTwo': {
                'games': player_two_games,
                'wins': player_two_wins,
                'winRate': _rate(
                    player_two_wins,
                    player_two_games,
                ),
            },
            'decisionRows': len(profile_decisions),
            'decisionShare': _rate(
                len(profile_decisions),
                len(decisions),
            ),
            'decisionHandWinRate': _boolean_rate(
                profile_decisions['hand_won']
            ),
            'handStrength': _strength_stats(
                profile_decisions['hand_strength']
            ),
            'actions': actions,
            'strategies': _value_counts(
                profile_decisions['strategy']
            ),
            'betting': {
                'decisions': bet_decisions,
                'decisionRate': _rate(
                    bet_decisions,
                    len(profile_decisions),
                ),
                'requests': actions.get('request-truco', 0),
                'raises': sum(
                    actions.get(action, 0)
                    for action in RAISE_ACTIONS
                ),
                'accepts': actions.get('accept-bet', 0),
                'declines': actions.get('decline-bet', 0),
            },
        }

    return result


def _build_betting_analysis(decisions: pd.DataFrame) -> dict:
    bet_rows = decisions.loc[
        decisions['action'].isin(BET_ACTIONS)
    ]
    requests = decisions.loc[
        decisions['action'].eq('request-truco')
    ]

    profiles = sorted(
        decisions['profile'].dropna().astype(str).unique()
    )

    by_profile = {}
    requests_by_profile = {}

    for profile in profiles:
        profile_rows = decisions.loc[
            decisions['profile'].eq(profile)
        ]
        profile_bets = profile_rows.loc[
            profile_rows['action'].isin(BET_ACTIONS)
        ]
        profile_requests = profile_rows.loc[
            profile_rows['action'].eq('request-truco')
        ]

        by_profile[profile] = {
            'decisions': len(profile_bets),
            'decisionRate': _rate(
                len(profile_bets),
                len(profile_rows),
            ),
            'actions': _value_counts(profile_bets['action']),
            'handWinRate': _boolean_rate(
                profile_bets['hand_won']
            ),
            'handStrength': _strength_stats(
                profile_bets['hand_strength']
            ),
        }

        requests_by_profile[profile] = _request_stats(
            profile_requests
        )

    actions = _value_counts(bet_rows['action'])

    return {
        'decisions': len(bet_rows),
        'decisionRate': _rate(
            len(bet_rows),
            len(decisions),
        ),
        'actions': actions,
        'requests': actions.get('request-truco', 0),
        'raises': sum(
            actions.get(action, 0)
            for action in RAISE_ACTIONS
        ),
        'accepts': actions.get('accept-bet', 0),
        'declines': actions.get('decline-bet', 0),
        'byProfile': by_profile,
        'trucoRequests': {
            **_request_stats(requests),
            'byProfile': requests_by_profile,
        },
    }


def _build_context_analysis(decisions: pd.DataFrame) -> dict:
    score_states = decisions[
        ['profile', 'score_difference']
    ].copy()

    score_states['score_state'] = 'tied'
    score_states.loc[
        score_states['score_difference'].gt(0),
        'score_state',
    ] = 'ahead'
    score_states.loc[
        score_states['score_difference'].lt(0),
        'score_state',
    ] = 'behind'

    actions = sorted(
        decisions['action'].dropna().astype(str).unique()
    )

    return {
        'scoreStateByProfile': _counts_by_profile(
            score_states,
            'score_state',
        ),
        'currentValueByProfile': _counts_by_profile(
            decisions,
            'current_value',
        ),
        'specialStateByProfile': _counts_by_profile(
            decisions,
            'special_state',
        ),
        'actionHandStrength': {
            action: _strength_stats(
                decisions.loc[
                    decisions['action'].eq(action),
                    'hand_strength',
                ]
            )
            for action in actions
        },
    }


def _request_stats(rows: pd.DataFrame) -> dict:
    return {
        'count': len(rows),
        'averageHandStrength': _average(
            rows['hand_strength']
        ),
        'handWinRateAfterRequest': _boolean_rate(
            rows['hand_won']
        ),
    }


def _counts_by_profile(
    frame: pd.DataFrame,
    column: str,
) -> dict:
    profiles = sorted(
        frame['profile'].dropna().astype(str).unique()
    )

    return {
        profile: _value_counts(
            frame.loc[
                frame['profile'].eq(profile),
                column,
            ]
        )
        for profile in profiles
    }


def _strength_stats(series: pd.Series) -> dict:
    values = pd.to_numeric(
        series,
        errors='coerce',
    ).dropna()

    if values.empty:
        return {
            'samples': 0,
            'average': None,
            'median': None,
            'p25': None,
            'p75': None,
            'minimum': None,
            'maximum': None,
        }

    return {
        'samples': len(values),
        'average': round(float(values.mean()), 4),
        'median': round(float(values.median()), 4),
        'p25': round(float(values.quantile(0.25)), 4),
        'p75': round(float(values.quantile(0.75)), 4),
        'minimum': round(float(values.min()), 4),
        'maximum': round(float(values.max()), 4),
    }


def _group_size_stats(
    frame: pd.DataFrame,
    column: str,
) -> dict:
    if frame.empty:
        return {
            'groups': 0,
            'rows': 0,
            'minimum': 0,
            'maximum': 0,
            'average': 0.0,
        }

    sizes = frame.groupby(
        column,
        dropna=True,
    ).size()

    if sizes.empty:
        return {
            'groups': 0,
            'rows': 0,
            'minimum': 0,
            'maximum': 0,
            'average': 0.0,
        }

    return {
        'groups': len(sizes),
        'rows': int(sizes.sum()),
        'minimum': int(sizes.min()),
        'maximum': int(sizes.max()),
        'average': round(float(sizes.mean()), 4),
    }


def _null_counts(frame: pd.DataFrame) -> dict:
    counts = frame.isna().sum()

    return {
        str(column): int(count)
        for column, count in counts.items()
        if count > 0
    }


def _value_counts(series: pd.Series) -> dict:
    counts = series.dropna().value_counts()

    return {
        str(value): int(count)
        for value, count in counts.items()
    }


def _boolean_rate(series: pd.Series) -> float | None:
    values = series.dropna()

    if values.empty:
        return None

    return round(
        float(values.astype('boolean').mean()),
        4,
    )


def _average(series: pd.Series) -> float | None:
    values = pd.to_numeric(
        series,
        errors='coerce',
    ).dropna()

    if values.empty:
        return None

    return round(float(values.mean()), 4)


def _rate(
    numerator: int,
    denominator: int,
) -> float:
    if denominator == 0:
        return 0.0

    return round(numerator / denominator, 4)