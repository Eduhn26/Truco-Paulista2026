import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from simulation.exporter import DECISION_COLUMNS, HAND_COLUMNS, MATCH_COLUMNS


class DatasetValidationError(ValueError):
    pass


@dataclass(frozen=True)
class RawDataset:
    matches: pd.DataFrame
    hands: pd.DataFrame
    decisions: pd.DataFrame


MATCH_DTYPES = {
    'simulation_run_id': 'string',
    'match_id': 'string',
    'match_index': 'Int64',
    'seed': 'Int64',
    'player_one_profile': 'string',
    'player_two_profile': 'string',
    'winner_player': 'string',
    'winner_profile': 'string',
    'player_one_score': 'Int64',
    'player_two_score': 'Int64',
    'hands_played': 'Int64',
}

HAND_DTYPES = {
    'simulation_run_id': 'string',
    'match_id': 'string',
    'hand_id': 'string',
    'match_index': 'Int64',
    'match_seed': 'Int64',
    'hand_index': 'Int64',
    'starter_player': 'string',
    'player_one_score_before': 'Int64',
    'player_two_score_before': 'Int64',
    'vira_rank': 'string',
    'special_state': 'string',
    'winner_player': 'string',
    'points_awarded': 'Int64',
    'final_hand_value': 'Int64',
    'rounds_played': 'Int64',
}

DECISION_DTYPES = {
    'simulation_run_id': 'string',
    'match_id': 'string',
    'hand_id': 'string',
    'decision_id': 'string',
    'decision_index': 'Int64',
    'match_index': 'Int64',
    'match_seed': 'Int64',
    'hand_index': 'Int64',
    'round_index': 'Int64',
    'player_id': 'string',
    'profile': 'string',
    'vira_rank': 'string',
    'player_hand_before': 'string',
    'player_one_round_card': 'string',
    'player_two_round_card': 'string',
    'rounds_won_by_me': 'Int64',
    'rounds_won_by_opponent': 'Int64',
    'rounds_tied': 'Int64',
    'points_to_win': 'Int64',
    'current_value': 'Int64',
    'pending_value': 'Int64',
    'bet_state': 'string',
    'requested_by': 'string',
    'special_state': 'string',
    'special_decision_pending': 'boolean',
    'action': 'string',
    'selected_card': 'string',
    'strategy': 'string',
    'hand_strength': 'Float64',
    'player_one_score': 'Int64',
    'player_two_score': 'Int64',
}


def load_raw_dataset(dataset_dir: str | Path) -> RawDataset:
    directory = Path(dataset_dir)

    dataset = RawDataset(
        matches=_read_csv(directory / 'matches.csv', MATCH_DTYPES),
        hands=_read_csv(directory / 'hands.csv', HAND_DTYPES),
        decisions=_read_csv(directory / 'decisions.csv', DECISION_DTYPES),
    )
    validate_raw_dataset(dataset)
    return dataset


def validate_raw_dataset(dataset: RawDataset) -> None:
    _validate_columns(dataset.matches, MATCH_COLUMNS, 'matches')
    _validate_columns(dataset.hands, HAND_COLUMNS, 'hands')
    _validate_columns(dataset.decisions, DECISION_COLUMNS, 'decisions')

    _validate_required_values(
        dataset.matches,
        ('simulation_run_id', 'match_id'),
        'matches',
    )
    _validate_required_values(
        dataset.hands,
        ('simulation_run_id', 'match_id', 'hand_id'),
        'hands',
    )
    _validate_required_values(
        dataset.decisions,
        ('simulation_run_id', 'match_id', 'hand_id', 'decision_id'),
        'decisions',
    )

    _validate_unique(dataset.matches, 'match_id', 'matches')
    _validate_unique(dataset.hands, 'hand_id', 'hands')
    _validate_unique(dataset.decisions, 'decision_id', 'decisions')

    match_ids = set(dataset.matches['match_id'].dropna())
    hand_ids = set(dataset.hands['hand_id'].dropna())

    _validate_foreign_key(
        dataset.hands,
        'match_id',
        match_ids,
        'hands',
        'matches',
    )
    _validate_foreign_key(
        dataset.decisions,
        'match_id',
        match_ids,
        'decisions',
        'matches',
    )
    _validate_foreign_key(
        dataset.decisions,
        'hand_id',
        hand_ids,
        'decisions',
        'hands',
    )

    _validate_match_links(dataset)
    _validate_hand_links(dataset)


def build_decision_dataset(dataset: RawDataset) -> pd.DataFrame:
    validate_raw_dataset(dataset)

    decisions = dataset.decisions.copy()
    if decisions.empty:
        return _add_empty_decision_columns(decisions)

    is_player_one = decisions['player_id'].eq('P1')

    decisions['own_score'] = decisions['player_one_score'].where(
        is_player_one,
        decisions['player_two_score'],
    )
    decisions['opponent_score'] = decisions['player_two_score'].where(
        is_player_one,
        decisions['player_one_score'],
    )
    decisions['score_difference'] = (
        decisions['own_score'] - decisions['opponent_score']
    )
    decisions['own_points_to_win'] = (
        decisions['points_to_win'] - decisions['own_score']
    )
    decisions['opponent_points_to_win'] = (
        decisions['points_to_win'] - decisions['opponent_score']
    )
    decisions['own_round_card'] = decisions['player_one_round_card'].where(
        is_player_one,
        decisions['player_two_round_card'],
    )
    decisions['opponent_round_card'] = decisions['player_two_round_card'].where(
        is_player_one,
        decisions['player_one_round_card'],
    )

    decisions['hand_size'] = decisions['player_hand_before'].map(
        _parse_hand_size
    ).astype('Int64')

    hand_winners = dataset.hands.set_index('hand_id')['winner_player']
    decisions['hand_won'] = decisions['hand_id'].map(hand_winners).eq(
        decisions['player_id']
    )
    decisions['hand_won'] = decisions['hand_won'].astype('boolean')

    return decisions


def _validate_match_links(dataset: RawDataset) -> None:
    if dataset.hands.empty:
        return

    matches = dataset.matches.set_index('match_id')
    expected_run_ids = dataset.hands['match_id'].map(matches['simulation_run_id'])
    expected_indexes = dataset.hands['match_id'].map(matches['match_index'])
    expected_seeds = dataset.hands['match_id'].map(matches['seed'])

    if not dataset.hands['simulation_run_id'].eq(expected_run_ids).all():
        raise DatasetValidationError('hands contains inconsistent simulation_run_id values')
    if not dataset.hands['match_index'].eq(expected_indexes).all():
        raise DatasetValidationError('hands contains inconsistent match_index values')
    if not dataset.hands['match_seed'].eq(expected_seeds).all():
        raise DatasetValidationError('hands contains inconsistent match_seed values')


def _validate_hand_links(dataset: RawDataset) -> None:
    if dataset.decisions.empty:
        return

    hands = dataset.hands.set_index('hand_id')

    for column in (
        'simulation_run_id',
        'match_id',
        'match_index',
        'match_seed',
        'hand_index',
    ):
        expected = dataset.decisions['hand_id'].map(hands[column])
        if not dataset.decisions[column].eq(expected).all():
            raise DatasetValidationError(
                f'decisions contains inconsistent {column} values for hand_id'
            )


def _parse_hand_size(value: str) -> int:
    try:
        hand = json.loads(value)
    except (TypeError, json.JSONDecodeError) as exc:
        raise DatasetValidationError(
            'decisions.player_hand_before contains invalid JSON'
        ) from exc

    if not isinstance(hand, list) or not all(isinstance(card, str) for card in hand):
        raise DatasetValidationError(
            'decisions.player_hand_before must be a JSON array of cards'
        )

    return len(hand)


def _read_csv(path: Path, dtypes: dict[str, str]) -> pd.DataFrame:
    if not path.exists():
        raise DatasetValidationError(f'Missing dataset file: {path.name}')

    return pd.read_csv(
        path,
        dtype=dtypes,
        keep_default_na=True,
    )


def _validate_columns(
    frame: pd.DataFrame,
    expected: tuple[str, ...],
    name: str,
) -> None:
    actual = tuple(frame.columns)
    if actual != expected:
        raise DatasetValidationError(
            f'{name} schema mismatch: expected {list(expected)}, got {list(actual)}'
        )


def _validate_required_values(
    frame: pd.DataFrame,
    columns: tuple[str, ...],
    name: str,
) -> None:
    missing = [column for column in columns if frame[column].isna().any()]
    if missing:
        raise DatasetValidationError(
            f'{name} contains null required values in: {", ".join(missing)}'
        )


def _validate_unique(
    frame: pd.DataFrame,
    column: str,
    name: str,
) -> None:
    if frame[column].duplicated().any():
        raise DatasetValidationError(
            f'{name} contains duplicate values in {column}'
        )


def _validate_foreign_key(
    frame: pd.DataFrame,
    column: str,
    valid_values: set,
    source_name: str,
    target_name: str,
) -> None:
    invalid = frame.loc[~frame[column].isin(valid_values), column]
    if not invalid.empty:
        raise DatasetValidationError(
            f'{source_name}.{column} contains values missing from {target_name}'
        )


def _add_empty_decision_columns(decisions: pd.DataFrame) -> pd.DataFrame:
    for column, dtype in {
        'own_score': 'Int64',
        'opponent_score': 'Int64',
        'score_difference': 'Int64',
        'own_points_to_win': 'Int64',
        'opponent_points_to_win': 'Int64',
        'own_round_card': 'string',
        'opponent_round_card': 'string',
        'hand_size': 'Int64',
        'hand_won': 'boolean',
    }.items():
        decisions[column] = pd.Series(dtype=dtype)

    return decisions
