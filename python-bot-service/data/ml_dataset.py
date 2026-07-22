import json
from pathlib import Path

import pandas as pd

from data.pipeline import (
    DatasetValidationError,
    RawDataset,
    build_decision_dataset,
    load_raw_dataset,
)


TARGET_COLUMN = 'hand_won'
SPLIT_GROUP_COLUMN = 'match_id'

IDENTIFIER_COLUMNS = (
    'simulation_run_id',
    'match_id',
    'hand_id',
    'decision_id',
)

NUMERIC_FEATURES = (
    'hand_strength',
    'score_difference',
    'own_points_to_win',
    'opponent_points_to_win',
    'round_index',
    'rounds_won_by_me',
    'rounds_won_by_opponent',
    'rounds_tied',
    'current_value',
    'pending_value',
    'hand_size',
)

BOOLEAN_FEATURES = (
    'special_decision_pending',
)

CATEGORICAL_FEATURES = (
    'bet_state',
    'special_state',
)

TRAINING_FEATURES = (
    *NUMERIC_FEATURES,
    *BOOLEAN_FEATURES,
    *CATEGORICAL_FEATURES,
)

OPTIONAL_EXPERIMENT_FEATURES = (
    'profile',
)

ANALYSIS_ONLY_COLUMNS = (
    'action',
    'strategy',
    'selected_card',
    'vira_rank',
    'player_hand_before',
    'own_round_card',
    'opponent_round_card',
    'requested_by',
)

FORBIDDEN_FEATURES = (
    *IDENTIFIER_COLUMNS,
    'decision_index',
    'match_index',
    'match_seed',
    'hand_index',
    'player_id',
    'action',
    'strategy',
    'selected_card',
    'winner_player',
    'winner_profile',
    'points_awarded',
    'final_hand_value',
    'player_one_score',
    'player_two_score',
)

ML_READY_COLUMNS = (
    *IDENTIFIER_COLUMNS,
    'decision_index',
    'player_id',
    'profile',
    *TRAINING_FEATURES,
    *ANALYSIS_ONLY_COLUMNS,
    TARGET_COLUMN,
)


def ml_dataset_contract() -> dict:
    return {
        'trainingFeatures': list(TRAINING_FEATURES),
        'optionalExperimentFeatures': list(
            OPTIONAL_EXPERIMENT_FEATURES
        ),
        'analysisOnlyColumns': list(
            ANALYSIS_ONLY_COLUMNS
        ),
        'forbiddenFeatures': list(
            FORBIDDEN_FEATURES
        ),
        'target': TARGET_COLUMN,
        'splitGroup': SPLIT_GROUP_COLUMN,
    }


def build_ml_ready_dataset(
    dataset: RawDataset,
) -> pd.DataFrame:
    decisions = build_decision_dataset(dataset)

    missing = [
        column
        for column in ML_READY_COLUMNS
        if column not in decisions.columns
    ]

    if missing:
        raise DatasetValidationError(
            'ML-ready dataset is missing columns: '
            + ', '.join(missing)
        )

    frame = decisions.loc[
        :,
        list(ML_READY_COLUMNS),
    ].copy()

    frame = frame.sort_values(
        [
            'simulation_run_id',
            'match_id',
            'decision_index',
        ],
        kind='stable',
    ).reset_index(drop=True)

    frame[TARGET_COLUMN] = (
        frame[TARGET_COLUMN]
        .astype('boolean')
    )

    validate_ml_ready_dataset(frame)

    return frame


def build_ml_ready_dataset_dir(
    dataset_dir: str | Path,
) -> pd.DataFrame:
    return build_ml_ready_dataset(
        load_raw_dataset(dataset_dir)
    )


def validate_ml_ready_dataset(
    frame: pd.DataFrame,
) -> None:
    if tuple(frame.columns) != ML_READY_COLUMNS:
        raise DatasetValidationError(
            'ML-ready schema mismatch'
        )

    if frame['decision_id'].duplicated().any():
        raise DatasetValidationError(
            'ML-ready dataset contains duplicate decision_id values'
        )

    if frame[TARGET_COLUMN].isna().any():
        raise DatasetValidationError(
            'ML-ready target contains null values'
        )

    if set(TRAINING_FEATURES).intersection(
        FORBIDDEN_FEATURES
    ):
        raise DatasetValidationError(
            'Training features contain forbidden columns'
        )

    if frame.empty:
        return

    target_counts = (
        frame.groupby(
            ['hand_id', 'player_id']
        )[TARGET_COLUMN]
        .nunique(dropna=False)
    )

    if target_counts.gt(1).any():
        raise DatasetValidationError(
            'A player has conflicting targets in the same hand'
        )


def feature_frame(
    frame: pd.DataFrame,
    *,
    include_profile: bool = False,
) -> pd.DataFrame:
    validate_ml_ready_dataset(frame)

    columns = list(TRAINING_FEATURES)

    if include_profile:
        columns.extend(
            OPTIONAL_EXPERIMENT_FEATURES
        )

    return frame.loc[:, columns].copy()


def target_series(
    frame: pd.DataFrame,
) -> pd.Series:
    validate_ml_ready_dataset(frame)

    return frame[TARGET_COLUMN].copy()


def split_groups(
    frame: pd.DataFrame,
) -> pd.Series:
    validate_ml_ready_dataset(frame)

    return frame[SPLIT_GROUP_COLUMN].copy()


def validate_group_split(
    train_groups: pd.Series,
    test_groups: pd.Series,
) -> None:
    train = set(
        train_groups.dropna().astype(str)
    )
    test = set(
        test_groups.dropna().astype(str)
    )

    if train.intersection(test):
        raise DatasetValidationError(
            'Train and test sets contain overlapping match groups'
        )


def export_ml_ready_bundle(
    dataset_dir: str | Path,
    output_dir: str | Path | None = None,
) -> dict[str, Path]:
    source = Path(dataset_dir)

    destination = (
        Path(output_dir)
        if output_dir is not None
        else source
    )

    destination.mkdir(
        parents=True,
        exist_ok=True,
    )

    dataset_path = (
        destination
        / 'decision_states_ml.csv'
    )
    contract_path = (
        destination
        / 'decision_states_ml.contract.json'
    )

    frame = build_ml_ready_dataset_dir(
        source
    )

    frame.to_csv(
        dataset_path,
        index=False,
    )

    contract_path.write_text(
        json.dumps(
            ml_dataset_contract(),
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return {
        'dataset': dataset_path,
        'contract': contract_path,
    }
