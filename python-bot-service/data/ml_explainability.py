import json
from pathlib import Path

from data.ml_baseline import (
    DEFAULT_RANDOM_STATE,
    DEFAULT_TEST_SIZE,
    grouped_train_test_split,
)
from data.ml_dataset import (
    feature_frame,
    target_series,
)
from data.ml_logistic import (
    _prepare_features,
    build_logistic_pipeline,
)
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)


def explain_logistic_regression(
    frame,
    *,
    first_decision_only=False,
    include_profile=False,
    test_size=DEFAULT_TEST_SIZE,
    random_state=DEFAULT_RANDOM_STATE,
    top_n=20,
):
    dataset = (
        first_decision_per_player_hand(frame)
        if first_decision_only
        else frame
    )

    train, test = grouped_train_test_split(
        dataset,
        test_size=test_size,
        random_state=random_state,
    )

    x_train = _prepare_features(
        feature_frame(
            train,
            include_profile=include_profile,
        )
    )

    y_train = (
        target_series(train)
        .astype('int64')
    )

    model = build_logistic_pipeline(
        include_profile=include_profile,
        random_state=random_state,
    )

    model.fit(
        x_train,
        y_train,
    )

    feature_names = (
        model.named_steps[
            'preprocessor'
        ]
        .get_feature_names_out()
    )

    coefficients = (
        model.named_steps[
            'model'
        ]
        .coef_[0]
    )

    features = [
        {
            'feature': _clean_feature_name(
                feature_name
            ),
            'coefficient': round(
                float(coefficient),
                6,
            ),
            'absoluteCoefficient': round(
                abs(float(coefficient)),
                6,
            ),
            'direction': (
                'increases_win_probability'
                if coefficient > 0
                else (
                    'decreases_win_probability'
                    if coefficient < 0
                    else 'neutral'
                )
            ),
        }
        for feature_name, coefficient
        in zip(
            feature_names,
            coefficients,
            strict=True,
        )
    ]

    ranked = sorted(
        features,
        key=lambda item: (
            item[
                'absoluteCoefficient'
            ]
        ),
        reverse=True,
    )

    positive = sorted(
        (
            item
            for item in features
            if item['coefficient'] > 0
        ),
        key=lambda item: (
            item['coefficient']
        ),
        reverse=True,
    )

    negative = sorted(
        (
            item
            for item in features
            if item['coefficient'] < 0
        ),
        key=lambda item: (
            item['coefficient']
        ),
    )

    return {
        'model': 'LogisticRegression',
        'firstDecisionOnly': (
            first_decision_only
        ),
        'includeProfile': include_profile,
        'trainingRows': len(train),
        'testRows': len(test),
        'transformedFeatureCount': (
            len(features)
        ),
        'topByAbsoluteCoefficient': (
            ranked[:top_n]
        ),
        'topPositive': (
            positive[:top_n]
        ),
        'topNegative': (
            negative[:top_n]
        ),
        'allFeatures': ranked,
    }


def compare_logistic_explanations(
    frame,
    *,
    include_profile=False,
    test_size=DEFAULT_TEST_SIZE,
    random_state=DEFAULT_RANDOM_STATE,
    top_n=20,
):
    return {
        'allDecisions': (
            explain_logistic_regression(
                frame,
                first_decision_only=False,
                include_profile=include_profile,
                test_size=test_size,
                random_state=random_state,
                top_n=top_n,
            )
        ),
        'firstDecisionPerPlayerHand': (
            explain_logistic_regression(
                frame,
                first_decision_only=True,
                include_profile=include_profile,
                test_size=test_size,
                random_state=random_state,
                top_n=top_n,
            )
        ),
    }


def write_logistic_explainability_report(
    frame,
    output_path,
    *,
    include_profile=False,
    test_size=DEFAULT_TEST_SIZE,
    random_state=DEFAULT_RANDOM_STATE,
    top_n=20,
):
    report = compare_logistic_explanations(
        frame,
        include_profile=include_profile,
        test_size=test_size,
        random_state=random_state,
        top_n=top_n,
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


def _clean_feature_name(name):
    prefixes = (
        'numeric__',
        'categorical__',
    )

    cleaned = str(name)

    for prefix in prefixes:
        if cleaned.startswith(prefix):
            return cleaned[
                len(prefix):
            ]

    return cleaned
