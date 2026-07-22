import json
from pathlib import Path
from statistics import mean, pstdev

from sklearn.compose import ColumnTransformer
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

from data.ml_baseline import (
    DEFAULT_RANDOM_STATE,
    DEFAULT_TEST_SIZE,
    grouped_train_test_split,
)
from data.ml_benchmark import (
    DEFAULT_BENCHMARK_RANDOM_STATES,
)
from data.ml_dataset import (
    BOOLEAN_FEATURES,
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    TRAINING_FEATURES,
    feature_frame,
    split_groups,
    target_series,
    validate_ml_ready_dataset,
)
from data.ml_logistic import _prepare_features
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)


METRIC_NAMES = (
    'accuracy',
    'balancedAccuracy',
    'rocAuc',
    'brierScore',
    'logLoss',
)


FEATURE_SETS = {
    'full': TRAINING_FEATURES,
    'handStrengthOnly': (
        'hand_strength',
    ),
    'withoutHandStrength': tuple(
        feature
        for feature in TRAINING_FEATURES
        if feature != 'hand_strength'
    ),
    'withoutSpecialContext': tuple(
        feature
        for feature in TRAINING_FEATURES
        if feature not in (
            'special_decision_pending',
            'special_state',
        )
    ),
    'scoreContextOnly': (
        'score_difference',
        'own_points_to_win',
        'opponent_points_to_win',
    ),
}


def run_feature_ablation(
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
            'Feature ablation requires at least one random state'
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
        train, test = grouped_train_test_split(
            dataset,
            test_size=test_size,
            random_state=random_state,
        )

        prepared_train = _prepare_features(
            feature_frame(train)
        )

        prepared_test = _prepare_features(
            feature_frame(test)
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
            feature_set_name: (
                _evaluate_feature_set(
                    prepared_train,
                    prepared_test,
                    y_train,
                    y_test,
                    feature_columns,
                    random_state=random_state,
                )
            )
            for (
                feature_set_name,
                feature_columns,
            ) in FEATURE_SETS.items()
        }

        runs.append(
            {
                'randomState': random_state,
                'split': {
                    'trainRows': len(train),
                    'testRows': len(test),
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
        feature_set_name: (
            _summarize_feature_set(
                runs,
                feature_set_name,
            )
        )
        for feature_set_name
        in FEATURE_SETS
    }

    return {
        'configuration': {
            'randomStates': list(states),
            'testSize': test_size,
            'firstDecisionOnly': (
                first_decision_only
            ),
            'featureSets': {
                name: list(columns)
                for name, columns
                in FEATURE_SETS.items()
            },
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
        'changeVsFull': (
            _changes_vs_full(
                summary
            )
        ),
    }


def write_feature_ablation_report(
    frame,
    output_path,
    *,
    random_states=DEFAULT_BENCHMARK_RANDOM_STATES,
    test_size=DEFAULT_TEST_SIZE,
    first_decision_only=True,
):
    report = run_feature_ablation(
        frame,
        random_states=random_states,
        test_size=test_size,
        first_decision_only=first_decision_only,
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


def _evaluate_feature_set(
    prepared_train,
    prepared_test,
    y_train,
    y_test,
    feature_columns,
    *,
    random_state=DEFAULT_RANDOM_STATE,
):
    if y_train.nunique() < 2:
        raise ValueError(
            'Feature ablation requires both target classes'
        )

    columns = list(
        feature_columns
    )

    x_train = prepared_train.loc[
        :,
        columns,
    ]

    x_test = prepared_test.loc[
        :,
        columns,
    ]

    model = _build_pipeline(
        feature_columns,
        random_state=random_state,
    )

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
        'features': columns,
        'featureCount': len(
            columns
        ),
        'metrics': _metrics(
            y_test,
            predictions,
            probabilities,
        ),
    }


def _build_pipeline(
    feature_columns,
    *,
    random_state,
):
    numeric_columns = [
        feature
        for feature in feature_columns
        if feature in NUMERIC_FEATURES
    ]

    categorical_columns = [
        feature
        for feature in feature_columns
        if feature in (
            *BOOLEAN_FEATURES,
            *CATEGORICAL_FEATURES,
        )
    ]

    transformers = []

    if numeric_columns:
        transformers.append(
            (
                'numeric',
                StandardScaler(),
                numeric_columns,
            )
        )

    if categorical_columns:
        transformers.append(
            (
                'categorical',
                OneHotEncoder(
                    handle_unknown='ignore',
                ),
                categorical_columns,
            )
        )

    preprocessor = ColumnTransformer(
        transformers=transformers
    )

    return Pipeline(
        steps=[
            (
                'preprocessor',
                preprocessor,
            ),
            (
                'model',
                LogisticRegression(
                    max_iter=1000,
                    random_state=random_state,
                ),
            ),
        ]
    )


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
                labels=[0, 1],
            )
        ),
    }


def _summarize_feature_set(
    runs,
    feature_set_name,
):
    return {
        'metrics': {
            metric: _summarize_values(
                [
                    run[
                        'models'
                    ][
                        feature_set_name
                    ][
                        'metrics'
                    ][metric]
                    for run in runs
                ]
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


def _changes_vs_full(
    summary,
):
    full_metrics = (
        summary['full']
        ['metrics']
    )

    changes = {}

    for feature_set_name in FEATURE_SETS:
        if feature_set_name == 'full':
            continue

        changes[
            feature_set_name
        ] = {
            metric: _difference(
                summary[
                    feature_set_name
                ][
                    'metrics'
                ][metric]['mean'],
                full_metrics[
                    metric
                ]['mean'],
            )
            for metric in METRIC_NAMES
        }

    return changes


def _difference(
    candidate,
    reference,
):
    if (
        candidate is None
        or reference is None
    ):
        return None

    return _round(
        candidate
        - reference
    )


def _round(
    value,
):
    return round(
        float(value),
        6,
    )
