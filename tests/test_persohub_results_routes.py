from pathlib import Path
from types import SimpleNamespace
import sys

import pytest
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from models import PersohubEventParticipantMode, PersohubEventRoundState
from routers.persohub_events import get_event_results
from routers.persohub_events_admin import update_managed_event_results
from schemas import PersohubManagedEventResultsUpdate


class FakeQuery:
    def __init__(self, rows):
        self._rows = list(rows)

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return list(self._rows)


class FakeDb:
    def __init__(self, rounds):
        self._rounds = list(rounds)

    def query(self, *args):
        if len(args) == 1 and getattr(args[0], "__name__", None) == "PersohubEventRound":
            return FakeQuery(self._rounds)
        raise AssertionError(f"Unexpected query args: {args}")


def _make_round(round_id, round_no, *, published=False, snapshot=None):
    return SimpleNamespace(
        id=round_id,
        event_id=99,
        round_no=round_no,
        name=f"Round {round_no}",
        state=PersohubEventRoundState.COMPLETED,
        is_frozen=False,
        results_published=published,
        results_published_at=None,
        results_snapshot=snapshot,
    )


def test_final_results_publish_is_blocked_until_all_publishable_rounds_are_published(monkeypatch):
    event = SimpleNamespace(
        id=99,
        slug="demo",
        results_published=False,
        results_caption=None,
        results_model_url=None,
        event_results_snapshot=None,
    )
    rounds = [
        _make_round(1, 1, published=True, snapshot={"round_id": 1}),
        _make_round(2, 2, published=False, snapshot=None),
    ]
    db = FakeDb(rounds)

    monkeypatch.setattr("routers.persohub_events_admin._get_event_or_404", lambda db, slug: event)

    with pytest.raises(HTTPException) as exc_info:
        update_managed_event_results(
            slug="demo",
            payload=PersohubManagedEventResultsUpdate(results_published=True, results_caption=None, results_model_url=None),
            admin=SimpleNamespace(id=1),
            db=db,
        )

    assert exc_info.value.status_code == 400
    assert "Publish all completed rounds first" in str(exc_info.value.detail)


def test_public_results_payload_exposes_locked_and_unlocked_round_cards(monkeypatch):
    event = SimpleNamespace(
        id=99,
        slug="demo",
        title="Demo Event",
        results_published=False,
        results_caption="Custom caption",
        results_model_url="https://example.com/model.glb",
        event_results_snapshot={"summary": {"total_entities": 10}},
        is_visible=True,
    )
    rounds = [
        _make_round(
            1,
            1,
            published=True,
            snapshot={
                "round_id": 1,
                "round_no": 1,
                "round_name": "Round 1",
                "card_status": "published",
                "metric_cards": [{"key": "total", "label": "Total", "value": 12}],
                "participation": {"total": 12},
                "score_analytics": {"average": 83},
                "top_scorer": {"name": "Team Alpha", "score": 95},
                "criteria_tags": ["Score"],
                "charts": {},
                "published_at": None,
            },
        ),
        _make_round(2, 2, published=False, snapshot=None),
    ]
    db = FakeDb(rounds)

    monkeypatch.setattr("routers.persohub_events._get_event_or_404", lambda db, slug: event)
    monkeypatch.setattr("routers.persohub_events._ensure_event_visible_for_public_access", lambda event: None)

    payload = get_event_results(slug="demo", db=db)

    assert payload["title"] == "Demo Event"
    assert payload["final_event_snapshot"] is None
    assert len(payload["rounds"]) == 2
    assert payload["rounds"][0]["is_locked"] is False
    assert payload["rounds"][0]["snapshot"]["top_scorer"]["name"] == "Team Alpha"
    assert payload["rounds"][1]["is_locked"] is True
    assert payload["rounds"][1]["snapshot"] is None
