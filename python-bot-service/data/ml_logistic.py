import json
from pathlib import Path

import pandas as pd
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
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from data.ml_baseline import (
    DEFAULT_RANDOM_STATE,
    DEFAULT_TEST_SIZE,
    grouped_train_test_split,
    run_dummy_baseline,
)
from data.ml_dataset import (
    BOOLEAN_FEATURES,
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    SPLIT_GROUP_COLUMN,
    build_ml_ready_dataset_dir,
    feature_frame,
    split_groups,
    target_series,
)


def build_logistic_pipeline(
    *,
    include_profile=False,
    random_state=DEFAULT_RANDOM_STATE,
):
    categorical_columns = [
        *BOOLEAN_FEATURES,
        *CATEGORICAL_FEATURES,
    ]

    if include_profile:
        categorical_columns.append('profile')

    preprocessor = ColumnTransformer(
        transformers=[
            (
                'numeric',
                StandardScaler(),
                list(NUMERIC_FEATURES),
            ),
            (
                'categorical',
                OneHotEncoder(
                    handle_unknown='ignore',
                ),
                categorical_columns,
            ),
        ],
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


def run_logistic_regression(
    frame,
    *,
    test_size=DEFAULT_TEST_SIZE,
    random_state=DEFAULT_RANDOM_STATE,
    include_profile=False,
):
    train, test = grouped_train_test_split(
        frame,
        test_size=test_size,
        random_state=random_state,
    )

    x_train = _prepare_features(
        feature_frame(
            train,
            include_profile=include_profile,
        )
    )
    x_test = _prepare_features(
        feature_frame(
            test,
            include_profile=include_profile,
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

    if y_train.nunique() < 2:
        raise ValueError(
            'Logistic regression requires both target classes'
        )

    model = build_logistic_pipeline(
        include_profile=include_profile,
        random_state=random_state,
    )

    model.fit(
        x_train,
        y_train,
    )

    predictions = model.predict(
        x_test
    )
    probabilities = model.predict_proba(
        x_test
    )[:, 1]

    return {
        'model': 'LogisticRegression',
        'includeProfile': include_profile,
        'split': {
            'groupColumn': SPLIT_GROUP_COLUMN,
            'testSize': test_size,
            'randomState': random_state,
            'trainRows': len(train),
            'testRows': len(test),
            'trainMatches': int(
                split_groups(train).nunique()
            ),
            'testMatches': int(
                split_groups(test).nunique()
            ),
        },
        'metrics': _metrics(
            y_test,
            predictions,
            probabilities,
        ),
    }


def compare_logistic_to_dummy(
    frame,
    *,
    test_size=DEFAULT_TEST_SIZE,
    random_state=DEFAULT_RANDOM_STATE,
    include_profile=False,
):
    dummy = run_dummy_baseline(
        frame,
        test_size=test_size,
        random_state=random_state,
    )

    logistic = run_logistic_regression(
        frame,
        test_size=test_size,
        random_state=random_state,
        include_profile=include_profile,
    )

    return {
        'dummy': dummy,
        'logisticRegression': logistic,
        'delta': {
            metric: _delta(
                logistic['metrics'][metric],
                dummy['metrics'][metric],
            )
            for metric in (
                'accuracy',
                'balancedAccuracy',
                'rocAuc',
                'brierScore',
                'logLoss',
            )
        },
    }


def write_logistic_comparison_report(
    dataset_dir,
    output_path=None,
    *,
    test_size=DEFAULT_TEST_SIZE,
    random_state=DEFAULT_RANDOM_STATE,
    include_profile=False,
):
    directory = Path(dataset_dir)

    frame = build_ml_ready_dataset_dir(
        directory
    )

    report = compare_logistic_to_dummy(
        frame,
        test_size=test_size,
        random_state=random_state,
        include_profile=include_profile,
    )

    destination = (
        Path(output_path)
        if output_path is not None
        else directory / 'logistic-vs-dummy.json'
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


def _prepare_features(frame):
    prepared = frame.copy()

    for column in NUMERIC_FEATURES:
        prepared[column] = (
            pd.to_numeric(
                prepared[column],
                errors='coerce',
            )
            .astype('float64')
        )

        if prepared[column].isna().any():
            prepared[column] = (
                prepared[column]
                .fillna(
                    prepared[column].median()
                )
            )

    for column in (
        *BOOLEAN_FEATURES,
        *CATEGORICAL_FEATURES,
        'profile',
    ):
        if column in prepared.columns:
            prepared[column] = (
                prepared[column]
                .astype('string')
                .fillna('__missing__')
                .astype(str)
            )

    return prepared


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


def _delta(model_value, baseline_value):
    if model_value is None or baseline_value is None:
        return None

    return _round(
        model_value - baseline_value
    )


def _round(value):
    return round(
        float(value),
        6,
    )
