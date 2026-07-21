import csv
import json
from dataclasses import asdict
from pathlib import Path

from simulation.analytics import analyze_round_robin, analyze_series
from simulation.results import SeriesResult


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
    )
    _write_csv(
        hands_path,
        [asdict(hand) for hand in result.hands],
    )
    _write_csv(
        decisions_path,
        [asdict(decision) for decision in result.decisions],
    )

    summary = result.to_dict()
    summary['analysis'] = analyze_series(result)
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

        payload = result.to_dict()
        payload['analysis'] = analyze_series(result)
        series_payload.append(payload)

    summary_path = directory / 'round-robin-summary.json'
    summary_path.write_text(
        json.dumps(
            {
                'series': series_payload,
                'analysis': analyze_round_robin(results),
            },
            indent=2,
            sort_keys=True,
        ),
        encoding='utf-8',
    )

    return summary_path


def _write_csv(
    path: Path,
    rows: list[dict],
) -> None:
    if not rows:
        path.write_text('', encoding='utf-8')
        return

    with path.open('w', newline='', encoding='utf-8') as file:
        writer = csv.DictWriter(
            file,
            fieldnames=list(rows[0].keys()),
        )
        writer.writeheader()
        writer.writerows(rows)
