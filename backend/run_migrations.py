from __future__ import annotations

import argparse
import logging
import sys

from bootstrap import (
    MIGRATION_MARKER_KEY,
    clear_bootstrap_marker,
    has_bootstrap_marker,
    run_bootstrap_migrations,
    set_bootstrap_marker,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run one-time backend bootstrap migrations.")
    parser.add_argument(
        "--force",
        action="store_true",
        help="Run migrations even if the one-time marker already exists.",
    )
    parser.add_argument(
        "--clear-marker",
        action="store_true",
        help=f"Clear migration marker key `{MIGRATION_MARKER_KEY}` before running.",
    )
    parser.add_argument(
        "--clear-only",
        action="store_true",
        help="Clear marker and exit without running migrations.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if args.clear_marker or args.clear_only:
        removed = clear_bootstrap_marker()
        if removed:
            logger.info("Cleared migration marker `%s`.", MIGRATION_MARKER_KEY)
        else:
            logger.info("Marker `%s` was already absent.", MIGRATION_MARKER_KEY)
        if args.clear_only:
            return 0

    if has_bootstrap_marker() and not args.force:
        logger.info(
            "One-time migration marker `%s` already exists. Nothing to do. Use --force to rerun.",
            MIGRATION_MARKER_KEY,
        )
        return 0

    logger.info("Running one-time backend bootstrap migrations...")
    run_bootstrap_migrations()
    set_bootstrap_marker()
    logger.info("Migrations completed and marker `%s` updated.", MIGRATION_MARKER_KEY)
    return 0


if __name__ == "__main__":
    sys.exit(main())
