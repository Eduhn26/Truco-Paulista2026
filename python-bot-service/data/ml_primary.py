import json
from pathlib import Path
from statistics import mean, pstdev

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    OneHotEncoder,
    StandardScaler,
)
from sklearn.tree import DecisionTreeClassifier

from data.ml_baseline import (
    DEFAULT_RANDOM_STATE,
    DEFAULT_TEST_SIZE,
    grouped_train_test_split,
)
from data.ml_benchmark import (
    DEFAULT_BENCHMARK_RANDOM_STATES,
)
from data.ml_card_features import (
    RAW_CARD_FEATURES,
    derive_raw_card_features,
)
from data.ml_dataset import (
    BOOLEAN_FEATURES,
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    feature_frame,
    split_groups,
    target_series,
    validate_ml_ready_dataset,
)
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)


PRIMARY_NUMERIC_FEATURES = (
    *RAW_CARD_FEATURES,
    *tuple(
        feature
        for feature in NUMERIC_FEATURES
        if feature != 'hand_strength'
    ),
)

PRIMARY_BOOLEAN_FEATURES = (
    BOOLEAN_FEATURES
)

PRIMARY_CATEGORICAL_FEATURES = (
    CATEGORICAL_FEATURES
)

PRIMARY_TRAINING_FEATURES = (
    *PRIMARY_NUMERIC_FEATURES,
    *PRIMARY_BOOLEAN_FEATURES,
    *PRIMARY_CATEGORICAL_FEATURES,
)

METRIC_NAMES = (
    'accuracy',
    'balancedAccuracy',
    'rocAuc',
    'brierScore',
    'logLoss',
)


def build_primary_feature_frame(
    frame,
):
    validate_ml_ready_dataset(
        frame
    )

    context = (
        feature_frame(frame)
        .drop(
            columns=[
                'hand_strength',
            ]
        )
    )

    raw_cards = (
        derive_raw_card_features(
            frame
        )
    )

    combined = pd.concat(
        [
            raw_cards,
            context,
        ],
        axis=1,
    )

    return combined.loc[
        :,
        PRIMARY_TRAINING_FEATURES,
    ].copy()


def run_primary_model_benchmark(
    frame,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
):
    validate_ml_ready_dataset(
        frame
    )

    states = tuple(
        int(state)
        for state in random_states
    )

    if not states:
        raise ValueError(
            'Primary benchmark requires at least one random state'
        )

    dataset = (
        first_decision_per_player_hand(
            frame
        )
        if first_decision_only
        else frame.copy()
    )

    runs = []

    for random_state in states:
        train, test = (
            grouped_train_test_split(
                dataset,
                test_size=test_size,
                random_state=random_state,
            )
        )

        x_train = (
            build_primary_feature_frame(
                train
            )
        )

        x_test = (
            build_primary_feature_frame(
                test
            )
        )

        x_train, x_test = (
            _prepare_train_test_features(
                x_train,
                x_test,
            )
        )

        y_train = (
            target_series(train)
            .astype('int64')
        )

        y_test = (
            target_series(test)
            .astype('int64')
        )

        models = {
            'dummy': _evaluate_dummy(
                x_train,
                x_test,
                y_train,
                y_test,
            ),
            'logisticRegression': (
                _evaluate_model(
                    _build_logistic_pipeline(
                        random_state
                    ),
                    x_train,
                    x_test,
                    y_train,
                    y_test,
                )
            ),
            'decisionTree': (
                _evaluate_model(
                    _build_tree_pipeline(
                        random_state
                    ),
                    x_train,
                    x_test,
                    y_train,
                    y_test,
                )
            ),
        }

        runs.append(
            {
                'randomState': (
                    random_state
                ),
                'split': {
                    'trainRows': len(
                        train
                    ),
                    'testRows': len(
                        test
                    ),
                    'trainMatches': int(
                        split_groups(
                            train
                        ).nunique()
                    ),
                    'testMatches': int(
                        split_groups(
                            test
                        ).nunique()
                    ),
                },
                'models': models,
            }
        )

    summary = {
        model_name: (
            _summarize_model(
                runs,
                model_name,
            )
        )
        for model_name in (
            'dummy',
            'logisticRegression',
            'decisionTree',
        )
    }

    return {
        'configuration': {
            'randomStates': list(
                states
            ),
            'testSize': test_size,
            'firstDecisionOnly': (
                first_decision_only
            ),
            'handStrengthIncluded': False,
            'trainingFeatures': list(
                PRIMARY_TRAINING_FEATURES
            ),
        },
        'dataset': {
            'sourceRows': len(frame),
            'evaluationRows': len(
                dataset
            ),
            'matches': int(
                dataset[
                    'match_id'
                ].nunique()
            ),
            'hands': int(
                dataset[
                    'hand_id'
                ].nunique()
            ),
        },
        'runs': runs,
        'summary': summary,
        'bestByBalancedAccuracy': (
            _best_model(
                summary,
                'balancedAccuracy',
                higher_is_better=True,
            )
        ),
        'bestByBrierScore': (
            _best_model(
                summary,
                'brierScore',
                higher_is_better=False,
            )
        ),
    }


def write_primary_model_benchmark(
    frame,
    output_path,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
):
    report = (
        run_primary_model_benchmark(
            frame,
            random_states=random_states,
            test_size=test_size,
            first_decision_only=(
                first_decision_only
            ),
        )
    )

    destination = Path(
        output_path
    )

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    destination.write_text(
        json.dumps(
            report,
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return destination


def _prepare_train_test_features(
    train,
    test,
):
    prepared_train = train.copy()
    prepared_test = test.copy()

    for column in PRIMARY_NUMERIC_FEATURES:
        prepared_train[column] = (
            pd.to_numeric(
                prepared_train[column],
                errors='coerce',
            )
        )

        prepared_test[column] = (
            pd.to_numeric(
                prepared_test[column],
                errors='coerce',
            )
        )

        valid = (
            prepared_train[
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

        prepared_train[column] = (
            prepared_train[column]
            .fillna(fill_value)
        )

        prepared_test[column] = (
            prepared_test[column]
            .fillna(fill_value)
        )

    for column in PRIMARY_BOOLEAN_FEATURES:
        prepared_train[column] = (
            prepared_train[column]
            .astype('boolean')
            .fillna(False)
        )

        prepared_test[column] = (
            prepared_test[column]
            .astype('boolean')
            .fillna(False)
        )

    for column in PRIMARY_CATEGORICAL_FEATURES:
        prepared_train[column] = (
            prepared_train[column]
            .astype('string')
            .fillna('unknown')
        )

        prepared_test[column] = (
            prepared_test[column]
            .astype('string')
            .fillna('unknown')
        )

    return (
        prepared_train,
        prepared_test,
    )


def _build_logistic_pipeline(
    random_state,
):
    return Pipeline(
        steps=[
            (
                'preprocessor',
                _build_preprocessor(
                    scale_numeric=True
                ),
            ),
            (
                'model',
                LogisticRegression(
                    max_iter=1000,
                    random_state=(
                        random_state
                    ),
                ),
            ),
        ]
    )


def _build_tree_pipeline(
    random_state,
):
    return Pipeline(
        steps=[
            (
                'preprocessor',
                _build_preprocessor(
                    scale_numeric=False
                ),
            ),
            (
                'model',
                DecisionTreeClassifier(
                    max_depth=6,
                    min_samples_leaf=10,
                    random_state=(
                        random_state
                    ),
                ),
            ),
        ]
    )


def _build_preprocessor(
    *,
    scale_numeric,
):
    numeric_transformer = (
        StandardScaler()
        if scale_numeric
        else 'passthrough'
    )

    return ColumnTransformer(
        transformers=[
            (
                'numeric',
                numeric_transformer,
                list(
                    PRIMARY_NUMERIC_FEATURES
                ),
            ),
            (
                'categorical',
                OneHotEncoder(
                    handle_unknown='ignore',
                ),
                [
                    *PRIMARY_BOOLEAN_FEATURES,
                    *PRIMARY_CATEGORICAL_FEATURES,
                ],
            ),
        ]
    )


def _evaluate_dummy(
    x_train,
    x_test,
    y_train,
    y_test,
):
    model = DummyClassifier(
        strategy='prior'
    )

    column = (
        'raw_card_count'
    )

    model.fit(
        x_train[
            [column]
        ],
        y_train,
    )

    predictions = model.predict(
        x_test[
            [column]
        ]
    )

    probabilities = (
        model.predict_proba(
            x_test[
                [column]
            ]
        )[:, 1]
    )

    return {
        'metrics': _metrics(
            y_test,
            predictions,
            probabilities,
        ),
    }


def _evaluate_model(
    model,
    x_train,
    x_test,
    y_train,
    y_test,
):
    model.fit(
        x_train,
        y_train,
    )

    predictions = model.predict(
        x_test
    )

    probabilities = (
        model.predict_proba(
            x_test
        )[:, 1]
    )

    return {
        'metrics': _metrics(
            y_test,
            predictions,
            probabilities,
        ),
    }


def _metrics(
    target,
    predictions,
    probabilities,
):
    roc_auc = None

    if target.nunique() > 1:
        roc_auc = _round(
            roc_auc_score(
                target,
                probabilities,
            )
        )

    return {
        'accuracy': _round(
            accuracy_score(
                target,
                predictions,
            )
        ),
        'balancedAccuracy': _round(
            balanced_accuracy_score(
                target,
                predictions,
            )
        ),
        'rocAuc': roc_auc,
        'brierScore': _round(
            brier_score_loss(
                target,
                probabilities,
            )
        ),
        'logLoss': _round(
            log_loss(
                target,
                probabilities,
                labels=[
                    0,
                    1,
                ],
            )
        ),
    }


def _summarize_model(
    runs,
    model_name,
):
    return {
        'metrics': {
            metric: (
                _summarize_values(
                    [
                        run[
                            'models'
                        ][
                            model_name
                        ][
                            'metrics'
                        ][
                            metric
                        ]
                        for run in runs
                    ]
                )
            )
            for metric in METRIC_NAMES
        },
    }


def _summarize_values(
    values,
):
    valid = [
        float(value)
        for value in values
        if value is not None
    ]

    if not valid:
        return {
            'count': 0,
            'mean': None,
            'standardDeviation': None,
            'minimum': None,
            'maximum': None,
        }

    return {
        'count': len(valid),
        'mean': _round(
            mean(valid)
        ),
        'standardDeviation': _round(
            pstdev(valid)
        ),
        'minimum': _round(
            min(valid)
        ),
        'maximum': _round(
            max(valid)
        ),
    }


def _best_model(
    summary,
    metric,
    *,
    higher_is_better,
):
    candidates = {
        model_name: (
            model_summary[
                'metrics'
            ][
                metric
            ][
                'mean'
            ]
        )
        for model_name, model_summary
        in summary.items()
    }

    candidates = {
        model_name: value
        for model_name, value
        in candidates.items()
        if value is not None
    }

    selector = (
        max
        if higher_is_better
        else min
    )

    model_name = selector(
        candidates,
        key=candidates.get,
    )

    return {
        'model': model_name,
        'metric': metric,
        'value': candidates[
            model_name
        ],
    }


def _round(value):
    return round(
        float(value),
        6,
    )
