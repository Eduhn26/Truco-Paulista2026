import json
from pathlib import Path

import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)
from sklearn.model_selection import GroupShuffleSplit

from data.ml_dataset import (
    SPLIT_GROUP_COLUMN,
    build_ml_ready_dataset_dir,
    split_groups,
    target_series,
    validate_group_split,
    validate_ml_ready_dataset,
)
from data.pipeline import DatasetValidationError


DEFAULT_TEST_SIZE = 0.2
DEFAULT_RANDOM_STATE = 42


def grouped_train_test_split(
    frame: pd.DataFrame,
    *,
    test_size: float = DEFAULT_TEST_SIZE,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    validate_ml_ready_dataset(frame)

    groups = split_groups(frame)

    if groups.nunique() < 2:
        raise DatasetValidationError(
            'Grouped split requires at least two match groups'
        )

    splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=test_size,
        random_state=random_state,
    )

    train_index, test_index = next(
        splitter.split(
            frame,
            target_series(frame),
            groups,
        )
    )

    train = (
        frame.iloc[train_index]
        .reset_index(drop=True)
    )
    test = (
        frame.iloc[test_index]
        .reset_index(drop=True)
    )

    validate_group_split(
        split_groups(train),
        split_groups(test),
    )

    return train, test


def run_dummy_baseline(
    frame: pd.DataFrame,
    *,
    test_size: float = DEFAULT_TEST_SIZE,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> dict:
    train, test = grouped_train_test_split(
        frame,
        test_size=test_size,
        random_state=random_state,
    )

    y_train = (
        target_series(train)
        .astype('int64')
    )
    y_test = (
        target_series(test)
        .astype('int64')
    )

    x_train = _constant_features(
        len(train)
    )
    x_test = _constant_features(
        len(test)
    )

    model = DummyClassifier(
        strategy='prior',
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
        _positive_probabilities(
            model,
            x_test,
        )
    )

    return {
        'model': 'DummyClassifier',
        'strategy': 'prior',
        'usesGameFeatures': False,
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
        'classBalance': {
            'trainPositiveRate': (
                _positive_rate(y_train)
            ),
            'testPositiveRate': (
                _positive_rate(y_test)
            ),
        },
        'metrics': {
            'accuracy': _metric(
                accuracy_score(
                    y_test,
                    predictions,
                )
            ),
            'balancedAccuracy': _metric(
                balanced_accuracy_score(
                    y_test,
                    predictions,
                )
            ),
            'rocAuc': _roc_auc(
                y_test,
                probabilities,
            ),
            'brierScore': _metric(
                brier_score_loss(
                    y_test,
                    probabilities,
                )
            ),
            'logLoss': _metric(
                log_loss(
                    y_test,
                    probabilities,
                    labels=[0, 1],
                )
            ),
        },
    }


def run_dummy_baseline_dir(
    dataset_dir: str | Path,
    *,
    test_size: float = DEFAULT_TEST_SIZE,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> dict:
    frame = build_ml_ready_dataset_dir(
        dataset_dir
    )

    return run_dummy_baseline(
        frame,
        test_size=test_size,
        random_state=random_state,
    )


def write_dummy_baseline_report(
    dataset_dir: str | Path,
    output_path: str | Path | None = None,
    *,
    test_size: float = DEFAULT_TEST_SIZE,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> Path:
    directory = Path(dataset_dir)

    report = run_dummy_baseline_dir(
        directory,
        test_size=test_size,
        random_state=random_state,
    )

    destination = (
        Path(output_path)
        if output_path is not None
        else directory / 'dummy-baseline.json'
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


def _constant_features(
    rows: int,
) -> pd.DataFrame:
    return pd.DataFrame(
        {
            'baseline': [0] * rows,
        }
    )


def _positive_probabilities(
    model: DummyClassifier,
    features: pd.DataFrame,
):
    probabilities = model.predict_proba(
        features
    )

    classes = list(
        model.classes_
    )

    if 1 not in classes:
        return [0.0] * len(features)

    return probabilities[
        :,
        classes.index(1),
    ]


def _positive_rate(
    target: pd.Series,
) -> float:
    if target.empty:
        return 0.0

    return _metric(
        target.mean()
    )


def _roc_auc(
    target: pd.Series,
    probabilities,
) -> float | None:
    if target.nunique() < 2:
        return None

    return _metric(
        roc_auc_score(
            target,
            probabilities,
        )
    )


def _metric(
    value,
) -> float:
    return round(
        float(value),
        6,
    )
