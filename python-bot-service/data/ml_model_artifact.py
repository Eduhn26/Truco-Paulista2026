import json
import platform
from pathlib import Path

import joblib
import pandas as pd
import sklearn

from data.ml_dataset import (
    split_groups,
    target_series,
    validate_ml_ready_dataset,
)
from data.ml_primary import (
    PRIMARY_BOOLEAN_FEATURES,
    PRIMARY_CATEGORICAL_FEATURES,
    PRIMARY_NUMERIC_FEATURES,
    PRIMARY_TRAINING_FEATURES,
    build_primary_feature_frame,
)
from data.ml_random_forest import (
    DEFAULT_MAX_DEPTH,
    DEFAULT_MIN_SAMPLES_LEAF,
    DEFAULT_N_ESTIMATORS,
    _build_random_forest_pipeline,
)
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)


MODEL_ARTIFACT_VERSION = '1.0'
DEFAULT_MODEL_FILENAME = (
    'truco-hand-win-random-forest.joblib'
)
DEFAULT_METADATA_FILENAME = (
    'truco-hand-win-random-forest.metadata.json'
)
DEFAULT_PREDICTION_THRESHOLD = 0.5


def train_candidate_model(
    frame,
    *,
    first_decision_only=True,
    random_state=42,
    n_estimators=DEFAULT_N_ESTIMATORS,
    max_depth=DEFAULT_MAX_DEPTH,
    min_samples_leaf=DEFAULT_MIN_SAMPLES_LEAF,
):
    validate_ml_ready_dataset(
        frame
    )

    dataset = (
        first_decision_per_player_hand(
            frame
        )
        if first_decision_only
        else frame.copy()
    )

    features = (
        build_primary_feature_frame(
            dataset
        )
    )

    prepared_features, fill_values = (
        _prepare_features(
            features
        )
    )

    target = (
        target_series(
            dataset
        )
        .astype('int64')
    )

    if target.nunique() < 2:
        raise ValueError(
            'Candidate model training requires both target classes'
        )

    model = (
        _build_random_forest_pipeline(
            random_state,
            n_estimators=n_estimators,
            max_depth=max_depth,
            min_samples_leaf=(
                min_samples_leaf
            ),
        )
    )

    model.fit(
        prepared_features,
        target,
    )

    return {
        'artifactVersion': (
            MODEL_ARTIFACT_VERSION
        ),
        'modelType': (
            'RandomForestClassifier'
        ),
        'target': 'hand_won',
        'predictionThreshold': (
            DEFAULT_PREDICTION_THRESHOLD
        ),
        'trainingFeatures': list(
            PRIMARY_TRAINING_FEATURES
        ),
        'handStrengthIncluded': False,
        'numericFillValues': (
            fill_values
        ),
        'configuration': {
            'randomState': (
                random_state
            ),
            'nEstimators': (
                n_estimators
            ),
            'maxDepth': (
                max_depth
            ),
            'minSamplesLeaf': (
                min_samples_leaf
            ),
            'maxFeatures': 'sqrt',
            'firstDecisionOnly': (
                first_decision_only
            ),
        },
        'trainingDataset': {
            'sourceRows': len(
                frame
            ),
            'trainingRows': len(
                dataset
            ),
            'matches': int(
                split_groups(
                    dataset
                ).nunique()
            ),
            'hands': int(
                dataset[
                    'hand_id'
                ].nunique()
            ),
            'positiveRate': round(
                float(
                    target.mean()
                ),
                6,
            ),
        },
        'runtime': {
            'pythonVersion': (
                platform.python_version()
            ),
            'pandasVersion': (
                pd.__version__
            ),
            'scikitLearnVersion': (
                sklearn.__version__
            ),
        },
        'model': model,
    }


def save_candidate_model(
    frame,
    output_dir,
    *,
    first_decision_only=True,
    random_state=42,
    n_estimators=DEFAULT_N_ESTIMATORS,
    max_depth=DEFAULT_MAX_DEPTH,
    min_samples_leaf=DEFAULT_MIN_SAMPLES_LEAF,
):
    bundle = train_candidate_model(
        frame,
        first_decision_only=(
            first_decision_only
        ),
        random_state=random_state,
        n_estimators=n_estimators,
        max_depth=max_depth,
        min_samples_leaf=(
            min_samples_leaf
        ),
    )

    destination = Path(
        output_dir
    )

    destination.mkdir(
        parents=True,
        exist_ok=True,
    )

    model_path = (
        destination
        / DEFAULT_MODEL_FILENAME
    )

    metadata_path = (
        destination
        / DEFAULT_METADATA_FILENAME
    )

    joblib.dump(
        bundle,
        model_path,
    )

    metadata = (
        build_candidate_metadata(
            bundle
        )
    )

    metadata_path.write_text(
        json.dumps(
            metadata,
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return {
        'model': model_path,
        'metadata': metadata_path,
    }


def load_candidate_model(
    model_path,
):
    bundle = joblib.load(
        model_path
    )

    _validate_artifact_bundle(
        bundle
    )

    return bundle


def predict_candidate_probabilities(
    bundle,
    frame,
):
    _validate_artifact_bundle(
        bundle
    )

    validate_ml_ready_dataset(
        frame
    )

    features = (
        build_primary_feature_frame(
            frame
        )
    )

    prepared_features, _ = (
        _prepare_features(
            features,
            fill_values=(
                bundle[
                    'numericFillValues'
                ]
            ),
        )
    )

    probabilities = (
        bundle[
            'model'
        ]
        .predict_proba(
            prepared_features
        )[:, 1]
    )

    threshold = float(
        bundle[
            'predictionThreshold'
        ]
    )

    predictions = (
        probabilities
        >= threshold
    ).astype(
        'int64'
    )

    result = pd.DataFrame(
        {
            'winProbability': (
                probabilities
            ),
            'predictedHandWin': (
                predictions
            ),
        },
        index=frame.index,
    )

    identifier_columns = [
        column
        for column in (
            'simulation_run_id',
            'match_id',
            'hand_id',
            'decision_id',
            'player_id',
        )
        if column in frame.columns
    ]

    if identifier_columns:
        result = pd.concat(
            [
                frame[
                    identifier_columns
                ].copy(),
                result,
            ],
            axis=1,
        )

    return result.reset_index(
        drop=True
    )


def build_candidate_metadata(
    bundle,
):
    _validate_artifact_bundle(
        bundle
    )

    return {
        key: value
        for key, value
        in bundle.items()
        if key != 'model'
    }


def _prepare_features(
    features,
    *,
    fill_values=None,
):
    prepared = features.copy()

    numeric_fill_values = {}

    for column in PRIMARY_NUMERIC_FEATURES:
        prepared[column] = (
            pd.to_numeric(
                prepared[column],
                errors='coerce',
            )
        )

        if fill_values is None:
            valid = (
                prepared[
                    column
                ]
                .dropna()
            )

            fill_value = (
                float(
                    valid.median()
                )
                if not valid.empty
                else 0.0
            )
        else:
            fill_value = float(
                fill_values.get(
                    column,
                    0.0,
                )
            )

        numeric_fill_values[
            column
        ] = fill_value

        prepared[column] = (
            prepared[column]
            .fillna(
                fill_value
            )
        )

    for column in PRIMARY_BOOLEAN_FEATURES:
        prepared[column] = (
            prepared[column]
            .astype('boolean')
            .fillna(False)
        )

    for column in PRIMARY_CATEGORICAL_FEATURES:
        prepared[column] = (
            prepared[column]
            .astype('string')
            .fillna('unknown')
        )

    return (
        prepared,
        numeric_fill_values,
    )


def _validate_artifact_bundle(
    bundle,
):
    if not isinstance(
        bundle,
        dict,
    ):
        raise ValueError(
            'Model artifact must contain a dictionary bundle'
        )

    required = (
        'artifactVersion',
        'modelType',
        'target',
        'predictionThreshold',
        'trainingFeatures',
        'numericFillValues',
        'configuration',
        'trainingDataset',
        'runtime',
        'model',
    )

    missing = [
        field
        for field in required
        if field not in bundle
    ]

    if missing:
        raise ValueError(
            'Model artifact missing fields: '
            + ', '.join(
                missing
            )
        )

    if (
        bundle[
            'artifactVersion'
        ]
        != MODEL_ARTIFACT_VERSION
    ):
        raise ValueError(
            'Unsupported model artifact version: '
            + str(
                bundle[
                    'artifactVersion'
                ]
            )
        )

    if (
        bundle[
            'trainingFeatures'
        ]
        != list(
            PRIMARY_TRAINING_FEATURES
        )
    ):
        raise ValueError(
            'Model artifact feature contract does not match runtime'
        )
