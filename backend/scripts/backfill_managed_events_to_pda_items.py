#!/usr/bin/env python3
"""
One-time backfill script:
Insert missing historical managed events (pda_events) into pda_items.

Usage:
  python3 backend/scripts/backfill_managed_events_to_pda_items.py
  python3 backend/scripts/backfill_managed_events_to_pda_items.py --apply
"""

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

load_dotenv(ROOT / ".env")

from database import SessionLocal  # noqa: E402
from models import PdaEvent, PdaItem  # noqa: E402


def _managed_event_home_link(slug: str) -> str:
    return f"/events/{slug}"


def _build_missing_item(event: PdaEvent) -> PdaItem:
    return PdaItem(
        type="event",
        title=event.title,
        description=event.description,
        tag="managed-event",
        poster_url=event.poster_url,
        start_date=event.start_date,
        end_date=event.end_date,
        format=event.format.value if hasattr(event.format, "value") else str(event.format),
        hero_caption=event.description,
        hero_url=_managed_event_home_link(event.slug),
        featured_poster_url=None,
        is_featured=False,
        created_at=event.created_at,
    )


def run_backfill(apply: bool = False, verbose: bool = False) -> int:
    db = SessionLocal()
    inserted = 0
    scanned = 0
    try:
        managed_events = db.query(PdaEvent).order_by(PdaEvent.created_at.asc()).all()
        scanned = len(managed_events)

        for event in managed_events:
            link = _managed_event_home_link(event.slug)
            existing = (
                db.query(PdaItem)
                .filter(
                    PdaItem.type == "event",
                    PdaItem.hero_url == link,
                )
                .first()
            )
            if existing:
                if verbose:
                    print(f"[skip] already present: {event.slug} -> pda_items.id={existing.id}")
                continue

            inserted += 1
            if verbose or not apply:
                print(f"[add] {event.slug} ({event.title})")
            if apply:
                db.add(_build_missing_item(event))

        if apply:
            db.commit()
            print(f"Backfill complete. scanned={scanned} inserted={inserted} mode=apply")
        else:
            print(f"Dry run complete. scanned={scanned} would_insert={inserted} mode=dry-run")
        return 0
    except Exception as exc:
        db.rollback()
        print(f"Backfill failed: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Insert missing historical managed events from pda_events into pda_items."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write changes to database. Without this flag, runs in dry-run mode.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Print per-event decision logs.",
    )
    args = parser.parse_args()

    if not os.environ.get("DATABASE_URL"):
        print("DATABASE_URL is not configured in backend/.env", file=sys.stderr)
        return 1

    return run_backfill(apply=args.apply, verbose=args.verbose)


if __name__ == "__main__":
    raise SystemExit(main())
