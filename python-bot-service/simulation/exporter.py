import csv
import json
from dataclasses import asdict
from pathlib import Path

from simulation.analytics import analyze_round_robin, analyze_series
from simulation.results import SeriesResult

DATASET_SCHEMA_VERSION = '1.0'

MATCH_COLUMNS = (
    'simulation_run_id',
    'match_id',
    'match_index',
    'seed',
    'player_one_profile',
    'player_two_profile',
    'winner_player',
    'winner_profile',
    'player_one_score',
    'player_two_score',
    'hands_played',
)

HAND_COLUMNS = (
    'simulation_run_id',
    'match_id',
    'hand_id',
    'match_index',
    'match_seed',
    'hand_index',
    'starter_player',
    'player_one_score_before',
    'player_two_score_before',
    'vira_rank',
    'special_state',
    'winner_player',
    'points_awarded',
    'final_hand_value',
    'rounds_played',
)

DECISION_COLUMNS = (
    'simulation_run_id',
    'match_id',
    'hand_id',
    'decision_id',
    'decision_index',
    'match_index',
    'match_seed',
    'hand_index',
    'round_index',
    'player_id',
    'profile',
    'vira_rank',
    'player_hand_before',
    'player_one_round_card',
    'player_two_round_card',
    'rounds_won_by_me',
    'rounds_won_by_opponent',
    'rounds_tied',
    'points_to_win',
    'current_value',
    'pending_value',
    'bet_state',
    'requested_by',
    'special_state',
    'special_decision_pending',
    'action',
    'selected_card',
    'strategy',
    'hand_strength',
    'player_one_score',
    'player_two_score',
)


def export_series(
    result: SeriesResult,
    output_dir: str | Path,
) -> dict[str, Path]:
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)

    matches_path = directory / 'matches.csv'
    hands_path = directory / 'hands.csv'
    decisions_path = directory / 'decisions.csv'
    summary_path = directory / 'summary.json'

    _write_csv(
        matches_path,
        [asdict(match) for match in result.matches],
        MATCH_COLUMNS,
    )
    _write_csv(
        hands_path,
        [asdict(hand) for hand in result.hands],
        HAND_COLUMNS,
    )
    _write_csv(
        decisions_path,
        [asdict(decision) for decision in result.decisions],
        DECISION_COLUMNS,
    )

    summary = _series_summary(result)
    summary_path.write_text(
        json.dumps(summary, indent=2, sort_keys=True),
        encoding='utf-8',
    )

    return {
        'matches': matches_path,
        'hands': hands_path,
        'decisions': decisions_path,
        'summary': summary_path,
    }


def export_round_robin(
    results: list[SeriesResult],
    output_dir: str | Path,
) -> Path:
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True)

    series_payload: list[dict] = []

    for result in results:
        pair_name = f'{result.profile_one}-vs-{result.profile_two}'
        pair_dir = directory / pair_name
        export_series(result, pair_dir)
        series_payload.append(_series_summary(result))

    summary_path = directory / 'round-robin-summary.json'
    summary_path.write_text(
        json.dumps(
            {
                'schemaVersion': DATASET_SCHEMA_VERSION,
                'rowCounts': {
                    'series': len(results),
                    'matches': sum(len(result.matches) for result in results),
                    'hands': sum(len(result.hands) for result in results),
                    'decisions': sum(len(result.decisions) for result in results),
                },
                'series': series_payload,
                'analysis': analyze_round_robin(results),
            },
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return summary_path


def _series_summary(result: SeriesResult) -> dict:
    summary = result.to_dict()
    summary['schemaVersion'] = DATASET_SCHEMA_VERSION
    summary['rowCounts'] = {
        'matches': len(result.matches),
        'hands': len(result.hands),
        'decisions': len(result.decisions),
    }
    summary['simulationConfig'] = {
        'simulationRunId': result.simulation_run_id,
        'profileOne': result.profile_one,
        'profileTwo': result.profile_two,
        'games': result.games,
        'seed': result.seed,
    }
    summary['analysis'] = analyze_series(result)
    return summary


def _write_csv(
    path: Path,
    rows: list[dict],
    columns: tuple[str, ...],
) -> None:
    with path.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(
            file,
            fieldnames=columns,
        )
        writer.writeheader()
        writer.writerows(rows)
