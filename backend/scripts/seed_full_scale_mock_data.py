#!/usr/bin/env python3
"""Seed full-scale mock data across PDA and Persohub."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.seed_pda_full_scale_mock_data import seed_mock_data as seed_pda_mock_data
from scripts.seed_persohub_mock_data import seed_mock_data as seed_persohub_mock_data


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed full-scale PDA + Persohub mock data")
    parser.add_argument("--users", type=int, default=120, help="Users to create for PDA and Persohub each")
    parser.add_argument("--pda-events", type=int, default=12, help="PDA mock events")
    parser.add_argument("--persohub-communities", type=int, default=6, help="Persohub mock communities")
    parser.add_argument("--persohub-events-per-community", type=int, default=4, help="Persohub events per community")
    parser.add_argument("--persohub-posts-per-community", type=int, default=5, help="Persohub posts per community")
    parser.add_argument("--seed", type=int, default=26, help="Random seed for PDA distribution")
    args = parser.parse_args()

    pda_counts = seed_pda_mock_data(
        users=max(1, min(500, args.users)),
        events=max(1, min(100, args.pda_events)),
        participants_per_event=36,
        teams_per_event=12,
        rounds_per_event=3,
        seed=args.seed,
    )

    persohub_counts = seed_persohub_mock_data(
        communities=max(1, min(50, args.persohub_communities)),
        posts_per_community=max(1, min(5000, args.persohub_posts_per_community)),
        events_per_community=max(0, min(100, args.persohub_events_per_community)),
        users_limit=max(1, min(200, args.users)),
        participants_per_event=16,
        create_users=max(1, min(500, args.users)),
    )

    print("Full-scale mock seed summary")
    print("PDA")
    for key, value in pda_counts.items():
        print(f"- {key}: {value}")
    print("Persohub")
    for key, value in persohub_counts.items():
        print(f"- {key}: {value}")
    print("All generated passwords: password")
    print("Cleanup command: python backend/scripts/cleanup_full_scale_mock_data.py --include-users")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
