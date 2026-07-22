import argparse
import json
from pathlib import Path
from random import Random

from app.schemas import BotProfile
from simulation.analytics import analyze_series
from simulation.exporter import export_round_robin, export_series
from simulation.match_simulator import HeadlessMatchSimulator
from simulation.results import SeriesResult
from simulation.strategies import PROFILES, round_robin_pairs


def run_series(
    profile_one: BotProfile,
    profile_two: BotProfile,
    *,
    games: int = 100,
    seed: int = 1,
    simulation_run_id: str | None = None,
) -> SeriesResult:
    if games < 1:
        raise ValueError('games must be at least 1')

    run_id = simulation_run_id or (
        f'series-{profile_one}-vs-{profile_two}-games-{games}-seed-{seed}'
    )

    result = SeriesResult(
        simulation_run_id=run_id,
        profile_one=profile_one,
        profile_two=profile_two,
        games=games,
        seed=seed,
    )
    seed_rng = Random(seed)

    for game_index in range(games):
        if game_index % 2 == 0:
            player_one_profile = profile_one
            player_two_profile = profile_two
        else:
            player_one_profile = profile_two
            player_two_profile = profile_one

        match_id = (
            f'{run_id}-{profile_one}-vs-{profile_two}-match-{game_index:06d}'
        )
        simulator = HeadlessMatchSimulator(
            player_one_profile,
            player_two_profile,
            seed=seed_rng.randrange(1, 2**31),
            match_index=game_index,
            simulation_run_id=run_id,
            match_id=match_id,
        )
        match = simulator.simulate()
        result.add_match(
            match,
            player_one_profile=player_one_profile,
            player_two_profile=player_two_profile,
        )

    return result


def run_round_robin(
    *,
    games: int,
    seed: int,
) -> list[SeriesResult]:
    run_id = f'round-robin-games-{games}-seed-{seed}'

    return [
        run_series(
            pair.first,
            pair.second,
            games=games,
            seed=seed + index,
            simulation_run_id=run_id,
        )
        for index, pair in enumerate(round_robin_pairs())
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--games', type=int, default=100)
    parser.add_argument('--seed', type=int, default=1)
    parser.add_argument('--p1', choices=PROFILES, default='aggressive')
    parser.add_argument('--p2', choices=PROFILES, default='balanced')
    parser.add_argument('--round-robin', action='store_true')
    parser.add_argument('--output', type=Path)
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if args.round_robin:
        results = run_round_robin(
            games=args.games,
            seed=args.seed,
        )
        payload = []

        for result in results:
            summary = result.to_dict()
            summary['analysis'] = analyze_series(result)
            payload.append(summary)

        if args.output is not None:
            export_round_robin(results, args.output)
    else:
        result = run_series(
            args.p1,
            args.p2,
            games=args.games,
            seed=args.seed,
        )
        payload = result.to_dict()
        payload['analysis'] = analyze_series(result)

        if args.output is not None:
            export_series(result, args.output)

    print(json.dumps(payload, indent=2, sort_keys=True))


if __name__ == '__main__':
    main()
