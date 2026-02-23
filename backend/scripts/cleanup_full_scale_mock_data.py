#!/usr/bin/env python3
"""Cleanup full-scale mock data across PDA and Persohub."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.cleanup_pda_full_scale_mock_data import cleanup_db as cleanup_pda_db
from scripts.cleanup_persohub_mock_data import cleanup_db as cleanup_persohub_db


def main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup full-scale PDA + Persohub mock data")
    parser.add_argument("--dry-run", action="store_true", help="Report counts only; do not delete")
    parser.add_argument("--include-users", action="store_true", help="Also remove generated mock users")
    args = parser.parse_args()

    persohub_counts = cleanup_persohub_db(dry_run=args.dry_run, include_users=args.include_users)
    pda_counts = cleanup_pda_db(dry_run=args.dry_run, include_users=args.include_users)

    print("Full-scale mock cleanup summary")
    print("Persohub")
    for key, value in persohub_counts.items():
        print(f"- {key}: {value}")
    print("PDA")
    for key, value in pda_counts.items():
        print(f"- {key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
