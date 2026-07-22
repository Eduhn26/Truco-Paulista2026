import argparse
import hashlib
import json
from pathlib import Path

import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    brier_score_loss,
    log_loss,
    roc_auc_score,
)

from data.ml_dataset import (
    build_ml_ready_dataset,
)
from data.ml_model_artifact import (
    load_candidate_model,
    predict_candidate_probabilities,
)
from data.ml_stage_evaluation import (
    first_decision_per_player_hand,
)
from data.pipeline import (
    load_raw_dataset,
)
from simulation.exporter import (
    export_series,
)
from simulation.runner import (
    run_series,
)


HOLDOUT_MATCHUPS = (
    (
        'aggressive',
        'balanced',
    ),
    (
        'balanced',
        'aggressive',
    ),
    (
        'aggressive',
        'cautious',
    ),
    (
        'cautious',
        'aggressive',
    ),
    (
        'balanced',
        'cautious',
    ),
    (
        'cautious',
        'balanced',
    ),
)


def build_holdout_plan(
    *,
    games_per_matchup,
    seed_base,
):
    if games_per_matchup < 1:
        raise ValueError(
            'games_per_matchup must be at least 1'
        )

    return [
        {
            'profileOne': (
                profile_one
            ),
            'profileTwo': (
                profile_two
            ),
            'matchup': (
                f'{profile_one}'
                f'-vs-'
                f'{profile_two}'
            ),
            'games': (
                games_per_matchup
            ),
            'seed': (
                seed_base
                + index
            ),
        }
        for index, (
            profile_one,
            profile_two,
        )
        in enumerate(
            HOLDOUT_MATCHUPS
        )
    ]


def compute_binary_metrics(
    frame,
):
    required = {
        'hand_won',
        'winProbability',
        'predictedHandWin',
    }

    missing = (
        required
        - set(
            frame.columns
        )
    )

    if missing:
        raise ValueError(
            'Missing prediction columns: '
            + ', '.join(
                sorted(
                    missing
                )
            )
        )

    if frame.empty:
        raise ValueError(
            'Cannot evaluate empty predictions'
        )

    target = (
        frame[
            'hand_won'
        ]
        .astype(
            'boolean'
        )
        .astype(
            int
        )
    )

    probability = (
        frame[
            'winProbability'
        ]
        .astype(
            float
        )
    )

    prediction = (
        frame[
            'predictedHandWin'
        ]
        .astype(
            int
        )
    )

    high_confidence = (
        (
            probability
            >= 0.70
        )
        |
        (
            probability
            <= 0.30
        )
    )

    if high_confidence.any():
        high_confidence_accuracy = (
            accuracy_score(
                target[
                    high_confidence
                ],
                prediction[
                    high_confidence
                ],
            )
        )
    else:
        high_confidence_accuracy = None

    try:
        roc_auc = roc_auc_score(
            target,
            probability,
        )
    except ValueError:
        roc_auc = None

    return {
        'rows': int(
            len(
                frame
            )
        ),
        'positiveRate': round(
            float(
                target.mean()
            ),
            6,
        ),
        'averagePredictedProbability': round(
            float(
                probability.mean()
            ),
            6,
        ),
        'accuracy': round(
            float(
                accuracy_score(
                    target,
                    prediction,
                )
            ),
            6,
        ),
        'balancedAccuracy': round(
            float(
                balanced_accuracy_score(
                    target,
                    prediction,
                )
            ),
            6,
        ),
        'rocAuc': (
            round(
                float(
                    roc_auc
                ),
                6,
            )
            if roc_auc
            is not None
            else None
        ),
        'brierScore': round(
            float(
                brier_score_loss(
                    target,
                    probability,
                )
            ),
            6,
        ),
        'logLoss': round(
            float(
                log_loss(
                    target,
                    probability,
                    labels=[
                        0,
                        1,
                    ],
                )
            ),
            6,
        ),
        'highConfidenceCoverage': round(
            float(
                high_confidence.mean()
            ),
            6,
        ),
        'highConfidenceAccuracy': (
            round(
                float(
                    high_confidence_accuracy
                ),
                6,
            )
            if high_confidence_accuracy
            is not None
            else None
        ),
    }


def probability_calibration(
    frame,
):
    target = (
        frame[
            'hand_won'
        ]
        .astype(
            'boolean'
        )
        .astype(
            int
        )
    )

    probability = (
        frame[
            'winProbability'
        ]
        .astype(
            float
        )
    )

    bins = []

    for lower_index in range(
        10
    ):
        lower = (
            lower_index
            / 10
        )

        upper = (
            lower
            + 0.1
        )

        if lower_index == 9:
            mask = (
                (
                    probability
                    >= lower
                )
                &
                (
                    probability
                    <= upper
                )
            )
        else:
            mask = (
                (
                    probability
                    >= lower
                )
                &
                (
                    probability
                    < upper
                )
            )

        count = int(
            mask.sum()
        )

        if count == 0:
            continue

        bins.append(
            {
                'range': (
                    f'{lower:.1f}'
                    f'-'
                    f'{upper:.1f}'
                ),
                'rows': (
                    count
                ),
                'averagePrediction': round(
                    float(
                        probability[
                            mask
                        ]
                        .mean()
                    ),
                    6,
                ),
                'actualWinRate': round(
                    float(
                        target[
                            mask
                        ]
                        .mean()
                    ),
                    6,
                ),
            }
        )

    return bins


def evaluate_holdout(
    *,
    model_path,
    output_dir,
    games_per_matchup=500,
    seed_base=9101,
):
    model_path = Path(
        model_path
    )

    output_dir = Path(
        output_dir
    )

    output_dir.mkdir(
        parents=True,
        exist_ok=True,
    )

    bundle = load_candidate_model(
        model_path
    )

    plan = build_holdout_plan(
        games_per_matchup=(
            games_per_matchup
        ),
        seed_base=(
            seed_base
        ),
    )

    scored_runs = []
    run_reports = []

    for run_index, run in enumerate(
        plan
    ):
        print()
        print(
            '=== HOLDOUT RUN '
            f'{run_index + 1}'
            f'/'
            f'{len(plan)}'
            ' ==='
        )

        print(
            run[
                'matchup'
            ]
        )

        print(
            'Games: '
            f'{run["games"]:,}'
        )

        print(
            'Seed: '
            f'{run["seed"]}'
        )

        result = run_series(
            run[
                'profileOne'
            ],
            run[
                'profileTwo'
            ],
            games=(
                run[
                    'games'
                ]
            ),
            seed=(
                run[
                    'seed'
                ]
            ),
        )

        raw_directory = (
            output_dir
            / 'raw'
            / (
                f'{run_index + 1:02d}'
                f'-'
                f'{run["matchup"]}'
            )
        )

        export_series(
            result,
            raw_directory,
        )

        raw_dataset = (
            load_raw_dataset(
                raw_directory
            )
        )

        ml_frame = (
            build_ml_ready_dataset(
                raw_dataset
            )
        )

        evaluation_frame = (
            first_decision_per_player_hand(
                ml_frame
            )
            .reset_index(
                drop=True
            )
        )

        predictions = (
            predict_candidate_probabilities(
                bundle,
                evaluation_frame,
            )
            .reset_index(
                drop=True
            )
        )

        scored = pd.DataFrame(
            {
                'simulation_run_id': (
                    evaluation_frame[
                        'simulation_run_id'
                    ]
                ),
                'match_id': (
                    evaluation_frame[
                        'match_id'
                    ]
                ),
                'hand_id': (
                    evaluation_frame[
                        'hand_id'
                    ]
                ),
                'decision_id': (
                    evaluation_frame[
                        'decision_id'
                    ]
                ),
                'player_id': (
                    evaluation_frame[
                        'player_id'
                    ]
                ),
                'profile': (
                    evaluation_frame[
                        'profile'
                    ]
                ),
                'hand_won': (
                    evaluation_frame[
                        'hand_won'
                    ]
                ),
                'winProbability': (
                    predictions[
                        'winProbability'
                    ]
                ),
                'predictedHandWin': (
                    predictions[
                        'predictedHandWin'
                    ]
                ),
            }
        )

        scored[
            'matchup'
        ] = run[
            'matchup'
        ]

        scored[
            'seed'
        ] = run[
            'seed'
        ]

        metrics = (
            compute_binary_metrics(
                scored
            )
        )

        run_report = {
            **run,
            'sourceRows': int(
                len(
                    ml_frame
                )
            ),
            'evaluationRows': int(
                len(
                    scored
                )
            ),
            'matches': int(
                scored[
                    'match_id'
                ]
                .nunique()
            ),
            'hands': int(
                scored[
                    'hand_id'
                ]
                .nunique()
            ),
            'metrics': (
                metrics
            ),
        }

        run_reports.append(
            run_report
        )

        scored_runs.append(
            scored
        )

        print(
            'Evaluation rows: '
            f'{len(scored):,}'
        )

        print(
            'Balanced Accuracy: '
            f'{metrics["balancedAccuracy"]:.4f}'
        )

        print(
            'ROC AUC: '
            f'{metrics["rocAuc"]:.4f}'
        )

        print(
            'Brier Score: '
            f'{metrics["brierScore"]:.4f}'
        )

    combined = pd.concat(
        scored_runs,
        ignore_index=True,
    )

    overall_metrics = (
        compute_binary_metrics(
            combined
        )
    )

    by_matchup = {}

    for matchup, group in combined.groupby(
        'matchup',
        sort=True,
    ):
        by_matchup[
            matchup
        ] = (
            compute_binary_metrics(
                group
            )
        )

    model_sha256 = hashlib.sha256(
        model_path.read_bytes()
    ).hexdigest()

    report = {
        'evaluationType': (
            'fresh-seed-final-holdout'
        ),
        'scientificScope': (
            'Unseen matches and random seeds generated '
            'after final model training. '
            'The evaluation still uses the same simulator '
            'and bot profile family and does not establish '
            'human-player or backend-domain generalization.'
        ),
        'model': {
            'path': str(
                model_path
            ),
            'sha256': (
                model_sha256
            ),
            'artifactVersion': (
                bundle[
                    'artifactVersion'
                ]
            ),
            'modelType': (
                bundle[
                    'modelType'
                ]
            ),
            'handStrengthIncluded': (
                bundle[
                    'handStrengthIncluded'
                ]
            ),
            'trainingRows': (
                bundle[
                    'trainingDataset'
                ][
                    'trainingRows'
                ]
            ),
        },
        'holdout': {
            'gamesPerMatchup': (
                games_per_matchup
            ),
            'matchupRuns': (
                len(
                    plan
                )
            ),
            'totalGames': (
                games_per_matchup
                * len(
                    plan
                )
            ),
            'seedBase': (
                seed_base
            ),
            'evaluationRows': int(
                len(
                    combined
                )
            ),
            'matches': int(
                combined[
                    'match_id'
                ]
                .nunique()
            ),
            'hands': int(
                combined[
                    'hand_id'
                ]
                .nunique()
            ),
        },
        'overall': (
            overall_metrics
        ),
        'byMatchup': (
            by_matchup
        ),
        'runs': (
            run_reports
        ),
        'calibration': (
            probability_calibration(
                combined
            )
        ),
    }

    predictions_path = (
        output_dir
        / 'holdout-predictions.csv'
    )

    report_path = (
        output_dir
        / 'holdout-evaluation.json'
    )

    combined.to_csv(
        predictions_path,
        index=False,
    )

    report_path.write_text(
        json.dumps(
            report,
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return {
        'predictions': (
            predictions_path
        ),
        'report': (
            report_path
        ),
        'metrics': (
            overall_metrics
        ),
        'reportPayload': (
            report
        ),
    }


def parse_args():
    parser = argparse.ArgumentParser()

    parser.add_argument(
        '--model-path',
        type=Path,
        default=Path(
            'ml-artifacts/'
            'candidate-v1/'
            'truco-hand-win-random-forest.joblib'
        ),
    )

    parser.add_argument(
        '--output-dir',
        type=Path,
        default=Path(
            'ml-artifacts/'
            'final-holdout'
        ),
    )

    parser.add_argument(
        '--games-per-matchup',
        type=int,
        default=500,
    )

    parser.add_argument(
        '--seed-base',
        type=int,
        default=9101,
    )

    return parser.parse_args()


def main():
    args = parse_args()

    print(
        'Loading final candidate model...'
    )

    result = evaluate_holdout(
        model_path=(
            args.model_path
        ),
        output_dir=(
            args.output_dir
        ),
        games_per_matchup=(
            args.games_per_matchup
        ),
        seed_base=(
            args.seed_base
        ),
    )

    metrics = result[
        'metrics'
    ]

    print()
    print(
        '=== FINAL HOLDOUT ==='
    )

    print(
        'Balanced Accuracy: '
        f'{metrics["balancedAccuracy"]:.6f}'
    )

    print(
        'ROC AUC: '
        f'{metrics["rocAuc"]:.6f}'
    )

    print(
        'Brier Score: '
        f'{metrics["brierScore"]:.6f}'
    )

    print(
        'Log Loss: '
        f'{metrics["logLoss"]:.6f}'
    )

    print(
        'Accuracy: '
        f'{metrics["accuracy"]:.6f}'
    )

    print(
        'High-confidence coverage: '
        f'{metrics["highConfidenceCoverage"]:.6f}'
    )

    print(
        'High-confidence accuracy: '
        f'{metrics["highConfidenceAccuracy"]:.6f}'
    )

    print()
    print(
        'Predictions: '
        f'{result["predictions"]}'
    )

    print(
        'Report: '
        f'{result["report"]}'
    )


if __name__ == '__main__':
    main()
