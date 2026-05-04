from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
from statistics import median, pstdev
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    PdaUser,
    PersohubEvent,
    PersohubEventAttendance,
    PersohubEventEntityType,
    PersohubEventParticipantMode,
    PersohubEventResultFinalist,
    PersohubEventResultTitle,
    PersohubEventRegistration,
    PersohubEventRound,
    PersohubEventScore,
    PersohubEventTeam,
    PersohubEventTeamMember,
)

PALETTE_KEYS = {
    "total": "blue",
    "present": "lime",
    "absent": "slate",
    "eliminated": "rose",
    "advanced": "gold",
    "average": "teal",
    "maximum": "coral",
    "minimum": "blue",
}


def _iso(value: Optional[datetime]) -> Optional[str]:
    if not value:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _entity_type_for_event(event: PersohubEvent):
    if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL:
        return PersohubEventEntityType.USER
    return PersohubEventEntityType.TEAM


def _registration_status_label(value) -> str:
    raw = value.value if hasattr(value, "value") else value
    return str(raw or "").strip().capitalize() or "Unknown"


def _batch_from_regno(regno: Optional[str]) -> Optional[str]:
    value = str(regno or "").strip()
    if len(value) < 4 or not value[:4].isdigit():
        return None
    return value[:4]


def _event_score_value(score_row: PersohubEventScore, event: PersohubEvent) -> float:
    if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL:
        return float(score_row.normalized_score or 0.0)
    return float(score_row.total_score or 0.0)


def _round_score_value(score_row: PersohubEventScore) -> float:
    return float(score_row.normalized_score or 0.0)


def _round_row_counts_as_present(score_row: Optional[PersohubEventScore]) -> bool:
    if not score_row or not bool(score_row.is_present):
        return False
    return float(score_row.total_score or 0.0) > 0.0


def _registration_entity_id(registration: PersohubEventRegistration) -> Optional[int]:
    if registration.entity_type == PersohubEventEntityType.USER and registration.user_id is not None:
        return int(registration.user_id)
    if registration.entity_type == PersohubEventEntityType.TEAM and registration.team_id is not None:
        return int(registration.team_id)
    return None


def _event_rounds(db: Session, event_id: int) -> List[PersohubEventRound]:
    return (
        db.query(PersohubEventRound)
        .filter(PersohubEventRound.event_id == event_id)
        .order_by(PersohubEventRound.round_no.asc(), PersohubEventRound.id.asc())
        .all()
    )


def _registered_entities(db: Session, event: PersohubEvent) -> List[dict]:
    if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL:
        rows = (
            db.query(PersohubEventRegistration, PdaUser)
            .join(PdaUser, PersohubEventRegistration.user_id == PdaUser.id)
            .filter(
                PersohubEventRegistration.event_id == event.id,
                PersohubEventRegistration.entity_type == PersohubEventEntityType.USER,
                PersohubEventRegistration.user_id.isnot(None),
            )
            .all()
        )
        payload = []
        for reg, user in rows:
            payload.append(
                {
                    "entity_type": "user",
                    "entity_id": int(user.id),
                    "name": user.name,
                    "regno_or_code": user.regno,
                    "leader": user.name,
                    "department": user.dept,
                    "gender": user.gender,
                    "batch": _batch_from_regno(user.regno),
                    "status": _registration_status_label(reg.status),
                    "is_wildcard": bool(getattr(reg, "wildcard_start_round_no", None) is not None),
                    "wildcard_seed_score": float(getattr(reg, "wildcard_seed_score", 0.0) or 0.0),
                    "wildcard_start_round_no": int(getattr(reg, "wildcard_start_round_no", 0) or 0) or None,
                    "eliminated_round_no": int(getattr(reg, "eliminated_round_no", 0) or 0) or None,
                }
            )
        return payload

    rows = (
        db.query(PersohubEventRegistration, PersohubEventTeam)
        .join(PersohubEventTeam, PersohubEventRegistration.team_id == PersohubEventTeam.id)
        .filter(
            PersohubEventRegistration.event_id == event.id,
            PersohubEventRegistration.entity_type == PersohubEventEntityType.TEAM,
            PersohubEventRegistration.team_id.isnot(None),
        )
        .all()
    )
    team_ids = [int(team.id) for _, team in rows]
    member_count_rows = (
        db.query(PersohubEventTeamMember.team_id, func.count(PersohubEventTeamMember.id))
        .filter(PersohubEventTeamMember.team_id.in_(team_ids))
        .group_by(PersohubEventTeamMember.team_id)
        .all()
        if team_ids
        else []
    )
    member_count_map = {int(team_id): int(count or 0) for team_id, count in member_count_rows}
    user_rows = (
        db.query(PdaUser.id, PdaUser.name)
        .filter(PdaUser.id.in_([int(team.team_lead_user_id) for _, team in rows if team.team_lead_user_id is not None]))
        .all()
        if rows
        else []
    )
    lead_name_map = {int(user_id): str(name or "").strip() or None for user_id, name in user_rows}
    payload = []
    for reg, team in rows:
        payload.append(
            {
                "entity_type": "team",
                "entity_id": int(team.id),
                "name": team.team_name,
                "regno_or_code": team.team_code,
                "leader": lead_name_map.get(int(team.team_lead_user_id), team.team_name),
                "members_count": int(member_count_map.get(int(team.id), 0)),
                "status": _registration_status_label(reg.status),
                "is_wildcard": bool(getattr(reg, "wildcard_start_round_no", None) is not None),
                "wildcard_seed_score": float(getattr(reg, "wildcard_seed_score", 0.0) or 0.0),
                "wildcard_start_round_no": int(getattr(reg, "wildcard_start_round_no", 0) or 0) or None,
                "eliminated_round_no": int(getattr(reg, "eliminated_round_no", 0) or 0) or None,
            }
        )
    return payload


def _round_ids_up_to(db: Session, event_id: int, boundary_round_no: int) -> List[int]:
    rows = (
        db.query(PersohubEventRound.id)
        .filter(
            PersohubEventRound.event_id == event_id,
            PersohubEventRound.round_no <= int(boundary_round_no),
        )
        .order_by(PersohubEventRound.round_no.asc(), PersohubEventRound.id.asc())
        .all()
    )
    return [int(row.id) for row in rows]


def _effective_score_metrics(
    db: Session,
    event: PersohubEvent,
    *,
    entity_ids: List[int],
    round_ids: Optional[List[int]] = None,
) -> Dict[int, Dict[str, float]]:
    if not entity_ids:
        return {}

    normalized_entity_ids = sorted({int(entity_id) for entity_id in entity_ids})
    entity_type = _entity_type_for_event(event)
    round_rows = (
        db.query(PersohubEventRound.id, PersohubEventRound.round_no)
        .filter(PersohubEventRound.event_id == event.id)
        .all()
    )
    round_no_map = {int(row.id): int(row.round_no) for row in round_rows}

    registration_query = db.query(PersohubEventRegistration).filter(
        PersohubEventRegistration.event_id == event.id,
        PersohubEventRegistration.entity_type == entity_type,
    )
    if entity_type == PersohubEventEntityType.USER:
        registration_query = registration_query.filter(PersohubEventRegistration.user_id.in_(normalized_entity_ids))
    else:
        registration_query = registration_query.filter(PersohubEventRegistration.team_id.in_(normalized_entity_ids))
    registrations = registration_query.all()
    registration_map = {}
    for registration in registrations:
        entity_id = _registration_entity_id(registration)
        if entity_id is not None:
            registration_map[entity_id] = registration

    metrics: Dict[int, Dict[str, float]] = {}
    for entity_id in normalized_entity_ids:
        registration = registration_map.get(entity_id)
        metrics[entity_id] = {
            "cumulative_score": float(getattr(registration, "wildcard_seed_score", 0.0) or 0.0),
            "rounds_participated": 0.0,
            "is_wildcard": bool(registration and getattr(registration, "wildcard_start_round_no", None) is not None),
            "wildcard_seed_score": float(getattr(registration, "wildcard_seed_score", 0.0) or 0.0),
            "wildcard_start_round_no": int(getattr(registration, "wildcard_start_round_no", 0) or 0) or None,
        }

    score_query = db.query(PersohubEventScore).filter(
        PersohubEventScore.event_id == event.id,
        PersohubEventScore.entity_type == entity_type,
    )
    if entity_type == PersohubEventEntityType.USER:
        score_query = score_query.filter(PersohubEventScore.user_id.in_(normalized_entity_ids))
    else:
        score_query = score_query.filter(PersohubEventScore.team_id.in_(normalized_entity_ids))
    if round_ids is not None:
        if round_ids:
            score_query = score_query.filter(PersohubEventScore.round_id.in_(round_ids))
        else:
            return metrics
    score_rows = score_query.all()

    participated_rounds: Dict[int, set[int]] = {entity_id: set() for entity_id in normalized_entity_ids}
    for score_row in score_rows:
        entity_id = int(score_row.user_id) if entity_type == PersohubEventEntityType.USER else int(score_row.team_id)
        round_no = round_no_map.get(int(score_row.round_id or 0))
        registration = registration_map.get(entity_id)
        wildcard_start_round_no = int(getattr(registration, "wildcard_start_round_no", 0) or 0) or None
        include_in_total = wildcard_start_round_no is None or (round_no is not None and int(round_no) >= wildcard_start_round_no)
        if include_in_total:
            metrics[entity_id]["cumulative_score"] += _event_score_value(score_row, event)
            if bool(score_row.is_present):
                participated_rounds[entity_id].add(int(score_row.round_id))

    for entity_id, round_set in participated_rounds.items():
        metrics[entity_id]["rounds_participated"] = int(len(round_set))
    return metrics


def _leaderboard_rows(db: Session, event: PersohubEvent, *, round_ids: List[int]) -> List[dict]:
    entities = _registered_entities(db, event)
    entity_ids = [int(item["entity_id"]) for item in entities]
    metrics_map = _effective_score_metrics(db, event, entity_ids=entity_ids, round_ids=round_ids)
    rows = []
    for entity in entities:
        entity_id = int(entity["entity_id"])
        score_info = metrics_map.get(entity_id, {"cumulative_score": 0.0, "rounds_participated": 0})
        rounds_participated = int(score_info.get("rounds_participated", 0) or 0)
        cumulative_score = float(score_info.get("cumulative_score", 0.0) or 0.0)
        if cumulative_score <= 0 and rounds_participated <= 0:
            continue
        rows.append(
            {
                **entity,
                "cumulative_score": cumulative_score,
                "attendance_count": rounds_participated,
                "rounds_participated": rounds_participated,
            }
        )

    rows.sort(
        key=lambda item: (
            0 if str(item.get("status") or "").strip().lower() == "active" else 1,
            -float(item.get("cumulative_score") or 0.0),
            str(item.get("name") or "").strip().lower(),
        )
    )
    active_rank = 0
    prev_score = None
    for row in rows:
        if str(row.get("status") or "").strip().lower() == "active":
            score = float(row.get("cumulative_score") or 0.0)
            if prev_score is None or score != prev_score:
                active_rank += 1
            row["rank"] = active_rank
            prev_score = score
        else:
            row["rank"] = None

    if rows:
        total = len(rows)
        for index, row in enumerate(rows, start=1):
            row["percentile"] = round(max(0.0, ((total - index) / total) * 100.0), 2)
    return rows


def _distribution_bands(scores: List[float]) -> Dict[str, int]:
    bands = {"0-20": 0, "21-40": 0, "41-60": 0, "61-80": 0, "81-100": 0}
    for score in scores:
        if score <= 20:
            bands["0-20"] += 1
        elif score <= 40:
            bands["21-40"] += 1
        elif score <= 60:
            bands["41-60"] += 1
        elif score <= 80:
            bands["61-80"] += 1
        else:
            bands["81-100"] += 1
    return bands


def _normalize_criteria(criteria: Any) -> List[dict]:
    if not isinstance(criteria, list) or not criteria:
        return [{"name": "Score", "max_marks": 100}]
    normalized: List[dict] = []
    for item in criteria:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "Score").strip() or "Score"
        try:
            max_marks = float(item.get("max_marks") or 100.0)
        except Exception:
            max_marks = 100.0
        normalized.append({"name": name, "max_marks": max(max_marks, 1.0)})
    return normalized or [{"name": "Score", "max_marks": 100}]


def _round_metric_cards(total_count: int, eliminated_count: int, advanced_count: int, elimination_rate: float, average_score: Optional[float], max_score: Optional[float], min_score: Optional[float]) -> List[dict]:
    return [
        {"key": "total", "label": "Total", "value": total_count, "tone": "info", "palette_key": PALETTE_KEYS["total"], "subtext": "Eligible this round"},
        {"key": "eliminated", "label": "Eliminated", "value": eliminated_count, "tone": "warning", "palette_key": PALETTE_KEYS["eliminated"]},
        {"key": "advanced", "label": "Advanced", "value": advanced_count, "tone": "highlight", "palette_key": PALETTE_KEYS["advanced"]},
        {"key": "elimination_rate", "label": "Elim Rate", "value": f"{round(float(elimination_rate or 0.0), 1)}%", "tone": "warning", "palette_key": PALETTE_KEYS["eliminated"]},
        {"key": "average", "label": "Average", "value": round(float(average_score or 0.0), 2) if average_score is not None else None, "tone": "info", "palette_key": PALETTE_KEYS["average"]},
        {"key": "maximum", "label": "Maximum", "value": round(float(max_score or 0.0), 2) if max_score is not None else None, "tone": "highlight", "palette_key": PALETTE_KEYS["maximum"]},
        {"key": "minimum", "label": "Minimum", "value": round(float(min_score or 0.0), 2) if min_score is not None else None, "tone": "info", "palette_key": PALETTE_KEYS["minimum"]},
    ]


def _entity_visible_for_round(entity: dict, round_no: int) -> bool:
    wildcard_start_round_no = int(entity.get("wildcard_start_round_no") or 0) or None
    eliminated_round_no = int(entity.get("eliminated_round_no") or 0) or None
    if wildcard_start_round_no is not None and wildcard_start_round_no > round_no:
        return False
    if eliminated_round_no is not None and eliminated_round_no <= round_no:
        return False
    return True


def _participant_summary(entity: dict, all_round_rows: List[PersohubEventRound], score_lookup: Dict[Tuple[str, int, int], PersohubEventScore], boundary_round_no: int, leaderboard_row: Optional[dict], round_rank_map_by_no: Dict[int, Dict[int, int]]) -> dict:
    visible_rounds = [round_row for round_row in all_round_rows if int(round_row.round_no) <= int(boundary_round_no)]
    score_series: List[float] = []
    rank_series: List[Optional[int]] = []
    best_round = None
    worst_round = None
    best_score = None
    worst_score = None

    for round_row in visible_rounds:
        row = score_lookup.get((str(entity["entity_type"]), int(entity["entity_id"]), int(round_row.id)))
        score_value = _round_score_value(row) if _round_row_counts_as_present(row) else 0.0
        score_series.append(score_value)
        rank_series.append(round_rank_map_by_no.get(int(round_row.round_no), {}).get(int(entity["entity_id"])))
        if best_score is None or score_value > best_score:
            best_score = score_value
            best_round = int(round_row.round_no)
        if worst_score is None or score_value < worst_score:
            worst_score = score_value
            worst_round = int(round_row.round_no)

    score_diffs = [score_series[index + 1] - score_series[index] for index in range(len(score_series) - 1)]
    largest_improvement = max(score_diffs) if score_diffs else 0.0
    largest_drop = min(score_diffs) if score_diffs else 0.0
    positive = sum(1 for value in score_diffs if value > 0)
    negative = sum(1 for value in score_diffs if value < 0)
    if positive > negative:
        trend = "IMPROVING"
    elif negative > positive:
        trend = "DECLINING"
    else:
        trend = "STABLE"

    valid_ranks = [int(rank) for rank in rank_series if rank is not None]
    average_rank = round(sum(valid_ranks) / len(valid_ranks), 2) if valid_ranks else None
    consistency_score = 100.0
    if score_series and max(score_series) > 0:
        consistency_score = round(max(0.0, 100.0 - ((pstdev(score_series) / max(score_series)) * 100.0)), 1)

    biggest_comeback_round = None
    biggest_collapse_round = None
    if len(valid_ranks) > 1:
        deltas = []
        for index in range(1, len(rank_series)):
            prev_rank = rank_series[index - 1]
            curr_rank = rank_series[index]
            if prev_rank is None or curr_rank is None:
                continue
            deltas.append((int(visible_rounds[index].round_no), int(curr_rank) - int(prev_rank)))
        if deltas:
            biggest_comeback_round = min(deltas, key=lambda item: item[1])[0]
            biggest_collapse_round = max(deltas, key=lambda item: item[1])[0]

    return {
        "entity_id": int(entity["entity_id"]),
        "entity_type": str(entity["entity_type"]),
        "name": entity.get("name"),
        "regno_or_code": entity.get("regno_or_code"),
        "status": entity.get("status"),
        "rank": leaderboard_row.get("rank") if leaderboard_row else None,
        "cumulative_score": float(leaderboard_row.get("cumulative_score") or 0.0) if leaderboard_row else 0.0,
        "rounds_participated": int(leaderboard_row.get("rounds_participated") or 0) if leaderboard_row else 0,
        "attendance_count": int(leaderboard_row.get("attendance_count") or 0) if leaderboard_row else 0,
        "is_wildcard": bool(entity.get("is_wildcard")),
        "wildcard_seed_score": float(entity.get("wildcard_seed_score") or 0.0),
        "wildcard_start_round_no": entity.get("wildcard_start_round_no"),
        "best_round": best_round,
        "worst_round": worst_round,
        "largest_improvement": round(float(largest_improvement), 2),
        "largest_drop": round(float(largest_drop), 2),
        "average_round_score": round(sum(score_series) / len(score_series), 2) if score_series else 0.0,
        "average_rank": average_rank,
        "best_rank": min(valid_ranks) if valid_ranks else None,
        "worst_rank": max(valid_ranks) if valid_ranks else None,
        "consistency_score": consistency_score,
        "rounds_survived": int(sum(1 for score in score_series if score > 0)),
        "biggest_comeback_round": biggest_comeback_round,
        "biggest_collapse_round": biggest_collapse_round,
        "performance_trend": trend,
        "eliminated_round": entity.get("eliminated_round_no"),
        "score_progression": score_series,
        "rank_progression": rank_series,
    }


def build_round_results_snapshot(db: Session, event: PersohubEvent, round_row: PersohubEventRound) -> dict:
    all_round_rows = _event_rounds(db, event.id)
    round_ids = _round_ids_up_to(db, event.id, int(round_row.round_no))
    leaderboard_rows = _leaderboard_rows(db, event, round_ids=round_ids)
    leaderboard_map = {int(row["entity_id"]): row for row in leaderboard_rows}
    entity_type = _entity_type_for_event(event)
    all_entities = _registered_entities(db, event)
    visible_entities = [entity for entity in all_entities if _entity_visible_for_round(entity, int(round_row.round_no))]

    score_rows = (
        db.query(PersohubEventScore)
        .filter(
            PersohubEventScore.event_id == event.id,
            PersohubEventScore.round_id == round_row.id,
            PersohubEventScore.entity_type == entity_type,
        )
        .all()
    )
    scored_entity_ids = {
        int(row.user_id) if entity_type == PersohubEventEntityType.USER else int(row.team_id)
        for row in score_rows
        if _round_row_counts_as_present(row)
    }
    entity_by_id = {int(entity["entity_id"]): entity for entity in all_entities}
    current_entity_ids_set = {int(entity["entity_id"]) for entity in visible_entities} | scored_entity_ids
    entity_rows = [entity_by_id[entity_id] for entity_id in sorted(current_entity_ids_set) if entity_id in entity_by_id]
    current_entity_ids = [int(entity["entity_id"]) for entity in entity_rows]
    score_lookup: Dict[Tuple[str, int, int], PersohubEventScore] = {}
    for row in score_rows:
        entity_id = int(row.user_id) if entity_type == PersohubEventEntityType.USER else int(row.team_id)
        score_lookup[(str(entity_type.value if hasattr(entity_type, "value") else entity_type), entity_id, int(round_row.id))] = row

    eligible_entity_ids = set(current_entity_ids)
    present_rows = [
        row
        for row in score_rows
        if _round_row_counts_as_present(row)
        and (
            (
                entity_type == PersohubEventEntityType.USER
                and int(row.user_id or 0) in eligible_entity_ids
            )
            or (
                entity_type == PersohubEventEntityType.TEAM
                and int(row.team_id or 0) in eligible_entity_ids
            )
        )
    ]
    present_scores = [_round_score_value(row) for row in present_rows]
    present_count = len(present_rows)
    total_count = len(current_entity_ids)
    absent_count = max(total_count - present_count, 0)

    next_round_no = int(round_row.round_no) + 1
    advanced_count = sum(
        1
        for entity in entity_rows
        if (
            entity.get("eliminated_round_no") is None
            or int(entity.get("eliminated_round_no")) > next_round_no
        )
    )
    eliminated_count = max(total_count - advanced_count, 0)
    elimination_rate = round((eliminated_count / total_count) * 100.0, 1) if total_count > 0 else 0.0

    score_sorted = sorted(
        present_rows,
        key=lambda item: (-_round_score_value(item), int(item.user_id or item.team_id or 0)),
    )
    round_rank_map: Dict[int, int] = {}
    prev_score = None
    dense_rank = 0
    for score_row in score_sorted:
        score_value = _round_score_value(score_row)
        if prev_score is None or score_value != prev_score:
            dense_rank += 1
            prev_score = score_value
        entity_id = int(score_row.user_id) if entity_type == PersohubEventEntityType.USER else int(score_row.team_id)
        round_rank_map[entity_id] = dense_rank

    top_scorer = None
    top_scorers: List[dict] = []
    top_performers: List[dict] = []
    top_ranked: List[dict] = []
    if score_sorted:
        best = score_sorted[0]
        best_id = int(best.user_id) if entity_type == PersohubEventEntityType.USER else int(best.team_id)
        best_entity = next((entity for entity in entity_rows if int(entity["entity_id"]) == best_id), None)
        top_scorer = {
            "entity_id": best_id,
            "name": best_entity.get("name") if best_entity else f"Entity {best_id}",
            "regno_or_code": best_entity.get("regno_or_code") if best_entity else None,
            "score": round(_round_score_value(best), 2),
        }
        for score_row in score_sorted[:3]:
            entity_id = int(score_row.user_id) if entity_type == PersohubEventEntityType.USER else int(score_row.team_id)
            entity = next((item for item in entity_rows if int(item["entity_id"]) == entity_id), None)
            top_scorers.append(
                {
                    "entity_id": entity_id,
                    "name": entity.get("name") if entity else f"Entity {entity_id}",
                    "regno_or_code": entity.get("regno_or_code") if entity else None,
                    "score": round(_round_score_value(score_row), 2),
                    "rank": int(round_rank_map.get(entity_id) or 0),
                }
            )
        for score_row in score_sorted[:3]:
            entity_id = int(score_row.user_id) if entity_type == PersohubEventEntityType.USER else int(score_row.team_id)
            rank_value = int(round_rank_map.get(entity_id) or 0)
            entity = next((item for item in entity_rows if int(item["entity_id"]) == entity_id), None)
            top_ranked.append(
                {
                    "entity_id": entity_id,
                    "name": entity.get("name") if entity else f"Entity {entity_id}",
                    "regno_or_code": entity.get("regno_or_code") if entity else None,
                    "score": round(_round_score_value(score_row), 2),
                    "rank": rank_value,
                    "is_wildcard": bool(entity.get("is_wildcard")) if entity else False,
                    "wildcard_score_considered": bool(entity and entity.get("is_wildcard") and entity.get("wildcard_start_round_no") is not None and int(round_row.round_no) >= int(entity.get("wildcard_start_round_no"))),
                }
            )
        for score_row in score_sorted[:10]:
            entity_id = int(score_row.user_id) if entity_type == PersohubEventEntityType.USER else int(score_row.team_id)
            entity = next((item for item in entity_rows if int(item["entity_id"]) == entity_id), None)
            top_performers.append(
                {
                    "entity_id": entity_id,
                    "name": entity.get("name") if entity else f"Entity {entity_id}",
                    "regno_or_code": entity.get("regno_or_code") if entity else None,
                    "score": round(_round_score_value(score_row), 2),
                    "rank": int(round_rank_map.get(entity_id) or 0),
                    "is_wildcard": bool(entity.get("is_wildcard")) if entity else False,
                    "wildcard_score_considered": bool(entity and entity.get("is_wildcard") and entity.get("wildcard_start_round_no") is not None and int(round_row.round_no) >= int(entity.get("wildcard_start_round_no"))),
                }
            )

    graph_labels = ["0-20", "21-40", "41-60", "61-80", "81-100"]
    distribution = _distribution_bands(present_scores)
    criteria = _normalize_criteria(round_row.evaluation_criteria)
    entity_name_map = {int(entity["entity_id"]): str(entity.get("name") or f"Entity {int(entity['entity_id'])}") for entity in entity_rows}
    criteria_summary = []
    for criterion in criteria:
        criterion_name = str(criterion.get("name") or "Score")
        max_marks = float(criterion.get("max_marks") or 100.0)
        raw_values: List[float] = []
        for score_row in present_rows:
            raw_scores = score_row.criteria_scores if isinstance(score_row.criteria_scores, dict) else {}
            try:
                raw_values.append(float(raw_scores.get(criterion_name, 0.0) or 0.0))
            except Exception:
                raw_values.append(0.0)
        average_raw = (sum(raw_values) / len(raw_values)) if raw_values else 0.0
        normalized_average = (average_raw / max_marks * 100.0) if max_marks > 0 else 0.0
        criteria_summary.append(
            {
                "name": criterion_name,
                "max_marks": round(max_marks, 2),
                "average_score": round(average_raw, 2),
                "normalized_average": round(normalized_average, 2),
            }
        )

    top_heatmap_rows = score_sorted[: min(6, len(score_sorted))]
    heatmap_y_labels: List[str] = []
    heatmap_matrix: List[List[float]] = []
    for score_row in top_heatmap_rows:
        entity_id = int(score_row.user_id) if entity_type == PersohubEventEntityType.USER else int(score_row.team_id)
        heatmap_y_labels.append(entity_name_map.get(entity_id, f"Entity {entity_id}"))
        raw_scores = score_row.criteria_scores if isinstance(score_row.criteria_scores, dict) else {}
        criteria_cells: List[float] = []
        for criterion in criteria:
            criterion_name = str(criterion.get("name") or "Score")
            max_marks = float(criterion.get("max_marks") or 100.0)
            try:
                raw_value = float(raw_scores.get(criterion_name, 0.0) or 0.0)
            except Exception:
                raw_value = 0.0
            criteria_cells.append(round((raw_value / max_marks * 100.0) if max_marks > 0 else 0.0, 2))
        heatmap_matrix.append(criteria_cells)

    chart_payloads = {
        "distribution": {
            "type": "line",
            "labels": graph_labels,
            "series": [
                {
                    "key": "participants",
                    "label": "Participants",
                    "data": [float(distribution[label]) for label in graph_labels],
                    "palette_key": "coral",
                }
            ],
        },
        "criteria": {
            "type": "radar",
            "labels": [str(item["name"]) for item in criteria_summary],
            "series": [
                {
                    "key": "criteria_average",
                    "label": "Criteria Average",
                    "data": [float(item["normalized_average"]) for item in criteria_summary],
                    "palette_key": "teal",
                }
            ],
            "meta": {
                "max_value": 100,
            },
        },
        "heatmap": {
            "type": "heatmap",
            "x_labels": [str(item["name"]) for item in criteria_summary],
            "y_labels": heatmap_y_labels,
            "matrix": heatmap_matrix,
            "palette_key": "rose",
            "meta": {
                "value_suffix": "%",
                "max_value": 100,
            },
        },
    }

    round_rank_map_by_no = {int(round_row.round_no): round_rank_map}
    participant_rows = []
    entity_type_key = str(entity_type.value if hasattr(entity_type, "value") else entity_type)
    full_score_lookup: Dict[Tuple[str, int, int], PersohubEventScore] = {}
    all_scores = (
        db.query(PersohubEventScore)
        .filter(
            PersohubEventScore.event_id == event.id,
            PersohubEventScore.entity_type == entity_type,
            PersohubEventScore.round_id.in_(round_ids),
        )
        .all()
        if round_ids
        else []
    )
    for score_row in all_scores:
        entity_id = int(score_row.user_id) if entity_type == PersohubEventEntityType.USER else int(score_row.team_id)
        full_score_lookup[(entity_type_key, entity_id, int(score_row.round_id))] = score_row

    for entity in entity_rows:
        entity_id = int(entity["entity_id"])
        leaderboard_row = leaderboard_map.get(entity_id)
        participant_row = _participant_summary(
            entity,
            all_round_rows,
            full_score_lookup,
            int(round_row.round_no),
            leaderboard_row,
            round_rank_map_by_no,
        )
        score_row = score_lookup.get((entity_type_key, entity_id, int(round_row.id)))
        participant_row["round_score"] = round(float(_round_score_value(score_row)), 2) if score_row else 0.0
        participant_row["round_rank"] = round_rank_map.get(entity_id)
        participant_rows.append(participant_row)

    participant_rows.sort(
        key=lambda item: (
            int(item.get("round_rank")) if item.get("round_rank") is not None else 10**9,
            -float(item.get("cumulative_score") or 0.0),
            str(item.get("name") or "").lower(),
        )
    )

    score_stats = {
        "average": round(sum(present_scores) / len(present_scores), 2) if present_scores else None,
        "maximum": round(max(present_scores), 2) if present_scores else None,
        "minimum": round(min(present_scores), 2) if present_scores else None,
        "median": round(float(median(present_scores)), 2) if present_scores else None,
        "std_dev": round(float(pstdev(present_scores)), 2) if len(present_scores) > 1 else 0.0 if present_scores else None,
        "range": round(float(max(present_scores) - min(present_scores)), 2) if present_scores else None,
    }

    return {
        "round_id": int(round_row.id),
        "round_no": int(round_row.round_no),
        "round_name": round_row.name,
        "round_state": str(round_row.state.value if hasattr(round_row.state, "value") else round_row.state),
        "published_at": _iso(getattr(round_row, "results_published_at", None)),
        "card_status": "published",
        "metric_cards": _round_metric_cards(
            total_count,
            eliminated_count,
            advanced_count,
            elimination_rate,
            score_stats["average"],
            score_stats["maximum"],
            score_stats["minimum"],
        ),
        "participation": {
            "total": total_count,
            "present": present_count,
            "absent": absent_count,
            "eliminated": eliminated_count,
            "advanced": advanced_count,
            "elimination_rate": elimination_rate,
        },
        "score_analytics": score_stats,
        "top_scorer": top_scorer,
        "top_scorers": top_scorers,
        "top_ranked": top_ranked,
        "top_performers": top_performers,
        "criteria_tags": [str(item.get("name") or "Score") for item in criteria],
        "criteria_summary": criteria_summary,
        "charts": chart_payloads,
        "default_graph": "criteria" if criteria_summary else "distribution",
        "participant_rows": participant_rows,
    }


def _build_highlights(round_snapshots: List[dict], leaderboard_rows: List[dict]) -> List[dict]:
    if not leaderboard_rows:
        return []
    highlights: List[dict] = []
    score_progressions = {row["name"]: row.get("score_progression", []) for row in leaderboard_rows}
    if leaderboard_rows:
        winner = leaderboard_rows[0]
        highlights.append(
            {
                "key": "leader",
                "title": "Current Leader",
                "stat": f"#{winner.get('rank') or 1}",
                "description": f"{winner.get('name')} leads with {round(float(winner.get('cumulative_score') or 0.0), 2)} points.",
                "palette_key": "gold",
                "highlight_level": "highlight",
            }
        )

    most_consistent = None
    lowest_std = None
    for row in leaderboard_rows:
        series = [float(value or 0.0) for value in row.get("score_progression", [])]
        if not series or max(series) <= 0:
            continue
        current_std = pstdev(series) if len(series) > 1 else 0.0
        if lowest_std is None or current_std < lowest_std:
            lowest_std = current_std
            most_consistent = row
    if most_consistent:
        highlights.append(
            {
                "key": "consistent",
                "title": "Most Consistent",
                "stat": f"Std {round(float(lowest_std or 0.0), 2)}",
                "description": f"{most_consistent.get('name')} maintained the steadiest score pattern.",
                "palette_key": "teal",
                "highlight_level": "info",
            }
        )

    biggest_jump = None
    for row in leaderboard_rows:
        rank_series = [rank for rank in row.get("rank_progression", []) if rank is not None]
        for index in range(1, len(rank_series)):
            jump = int(rank_series[index - 1]) - int(rank_series[index])
            if biggest_jump is None or jump > biggest_jump["delta"]:
                biggest_jump = {
                    "name": row.get("name"),
                    "delta": jump,
                    "round": index + 1,
                }
    if biggest_jump:
        highlights.append(
            {
                "key": "comeback",
                "title": "Biggest Comeback",
                "stat": f"+{int(biggest_jump['delta'])} places",
                "description": f"{biggest_jump['name']} made the sharpest climb by round {int(biggest_jump['round'])}.",
                "palette_key": "coral",
                "highlight_level": "highlight",
            }
        )

    highest_single = None
    for row in leaderboard_rows:
        series = [float(value or 0.0) for value in row.get("score_progression", [])]
        for index, value in enumerate(series, start=1):
            if highest_single is None or value > highest_single["score"]:
                highest_single = {"name": row.get("name"), "round": index, "score": value}
    if highest_single:
        highlights.append(
            {
                "key": "single_round_peak",
                "title": "Highest Single-Round Score",
                "stat": f"{round(float(highest_single['score']), 2)}",
                "description": f"{highest_single['name']} posted the top individual round score in round {int(highest_single['round'])}.",
                "palette_key": "lime",
                "highlight_level": "success",
            }
        )

    if round_snapshots:
        toughest = max(round_snapshots, key=lambda item: float(item.get("participation", {}).get("elimination_rate") or 0.0))
        highlights.append(
            {
                "key": "toughest_round",
                "title": "Steepest Elimination",
                "stat": f"{round(float(toughest.get('participation', {}).get('elimination_rate') or 0.0), 1)}%",
                "description": f"Round {int(toughest.get('round_no') or 0)} cut the field the hardest.",
                "palette_key": "rose",
                "highlight_level": "warning",
            }
        )
    return highlights


def build_event_results_snapshot(db: Session, event: PersohubEvent, published_round_rows: List[PersohubEventRound]) -> dict:
    round_ids = [int(round_row.id) for round_row in published_round_rows]
    leaderboard_rows = _leaderboard_rows(db, event, round_ids=round_ids)
    all_round_rows = _event_rounds(db, event.id)
    entity_type_key = "user" if event.participant_mode == PersohubEventParticipantMode.INDIVIDUAL else "team"
    all_scores = (
        db.query(PersohubEventScore)
        .filter(
            PersohubEventScore.event_id == event.id,
            PersohubEventScore.entity_type == _entity_type_for_event(event),
            PersohubEventScore.round_id.in_(round_ids),
        )
        .all()
        if round_ids
        else []
    )
    score_lookup: Dict[Tuple[str, int, int], PersohubEventScore] = {}
    for score_row in all_scores:
        entity_id = int(score_row.user_id) if entity_type_key == "user" else int(score_row.team_id)
        score_lookup[(entity_type_key, entity_id, int(score_row.round_id))] = score_row

    leaderboard_with_series = []
    round_average_scores = []
    elimination_funnel = []
    round_snapshots = [build_round_results_snapshot(db, event, round_row) for round_row in published_round_rows]
    round_rank_map_by_no: Dict[int, Dict[int, int]] = {}
    for round_row in published_round_rows:
        rows = (
            db.query(PersohubEventScore)
            .filter(
                PersohubEventScore.event_id == event.id,
                PersohubEventScore.round_id == round_row.id,
                PersohubEventScore.entity_type == _entity_type_for_event(event),
                PersohubEventScore.is_present == True,  # noqa: E712
            )
            .all()
        )
        sorted_rows = sorted(
            rows,
            key=lambda item: (-_round_score_value(item), int(item.user_id or item.team_id or 0)),
        )
        rank_map: Dict[int, int] = {}
        prev_score = None
        dense_rank = 0
        for score_row in sorted_rows:
            score_value = _round_score_value(score_row)
            if prev_score is None or score_value != prev_score:
                dense_rank += 1
                prev_score = score_value
            entity_id = int(score_row.user_id) if entity_type_key == "user" else int(score_row.team_id)
            rank_map[entity_id] = dense_rank
        round_rank_map_by_no[int(round_row.round_no)] = rank_map

    entities = _registered_entities(db, event)
    leaderboard_map = {int(row["entity_id"]): row for row in leaderboard_rows}
    for row in leaderboard_rows:
        entity = next((item for item in entities if int(item["entity_id"]) == int(row["entity_id"])), None)
        if not entity:
            continue
        participant_row = _participant_summary(
            entity,
            [round_row for round_row in all_round_rows if int(round_row.id) in round_ids],
            score_lookup,
            max([int(round_row.round_no) for round_row in published_round_rows], default=0),
            row,
            round_rank_map_by_no,
        )
        leaderboard_with_series.append({**row, **participant_row})

    for round_snapshot in round_snapshots:
        round_average_scores.append(float(round_snapshot.get("score_analytics", {}).get("average") or 0.0))
        elimination_funnel.append(int(round_snapshot.get("participation", {}).get("advanced") or 0))

    latest_round_snapshot = round_snapshots[-1] if round_snapshots else {}
    participated_entity_ids = {
        int(score_row.user_id) if entity_type_key == "user" else int(score_row.team_id)
        for score_row in all_scores
        if _round_row_counts_as_present(score_row)
    }
    participating_entities = [
        entity for entity in entities
        if int(entity.get("entity_id") or 0) in participated_entity_ids
    ]
    registered_count = len(participating_entities)
    active_count = sum(
        1 for entity in participating_entities
        if str(entity.get("status") or "").strip().lower() == "active"
    )
    finalists_count = int(
        db.query(func.count(PersohubEventResultFinalist.id))
        .filter(PersohubEventResultFinalist.event_id == event.id)
        .scalar()
        or 0
    )
    winners_count = int(
        db.query(func.count(PersohubEventResultTitle.id))
        .filter(PersohubEventResultTitle.event_id == event.id)
        .scalar()
        or 0
    )
    entity_map = {(str(entity.get("entity_type")), int(entity.get("entity_id") or 0)): entity for entity in entities}
    finalist_rows = (
        db.query(PersohubEventResultFinalist)
        .filter(PersohubEventResultFinalist.event_id == event.id)
        .all()
    )
    title_rows = (
        db.query(PersohubEventResultTitle)
        .filter(PersohubEventResultTitle.event_id == event.id)
        .all()
    )

    top_rows = leaderboard_with_series[:8]
    criteria_order: List[str] = []
    for round_row in published_round_rows:
        for criterion in _normalize_criteria(round_row.evaluation_criteria):
            name = str(criterion.get("name") or "Score")
            if name not in criteria_order:
                criteria_order.append(name)

    criteria_chart_series: List[dict] = []
    for index, row in enumerate(leaderboard_with_series[:3]):
        aggregates: Dict[str, Dict[str, float]] = {
            name: {"score": 0.0, "max": 0.0}
            for name in criteria_order
        }
        entity_id = int(row["entity_id"])
        for round_row in published_round_rows:
            score_row = score_lookup.get((entity_type_key, entity_id, int(round_row.id)))
            if not _round_row_counts_as_present(score_row):
                continue
            raw_scores = score_row.criteria_scores if isinstance(score_row.criteria_scores, dict) else {}
            for criterion in _normalize_criteria(round_row.evaluation_criteria):
                name = str(criterion.get("name") or "Score")
                max_marks = float(criterion.get("max_marks") or 100.0)
                try:
                    raw_value = float(raw_scores.get(name, 0.0) or 0.0)
                except Exception:
                    raw_value = 0.0
                aggregates[name]["score"] += raw_value
                aggregates[name]["max"] += max_marks

        criteria_chart_series.append(
            {
                "key": str(row["entity_id"]),
                "label": str(row.get("name") or f"Entity {row['entity_id']}"),
                "data": [
                    round((aggregates[name]["score"] / aggregates[name]["max"]) * 100.0, 2)
                    if aggregates[name]["max"] > 0
                    else 0.0
                    for name in criteria_order
                ],
                "palette_key": ["gold", "teal", "coral"][index % 3],
            }
        )

    elimination_trend = [
        float(round_snapshot.get("participation", {}).get("eliminated") or 0)
        for round_snapshot in round_snapshots
    ]
    distribution_buckets = ["0-20", "21-40", "41-60", "61-80", "81-100"]
    distribution_matrix: List[List[float]] = []
    for bucket_index in range(len(distribution_buckets)):
        bucket_row: List[float] = []
        for round_snapshot in round_snapshots:
            distribution_chart = (round_snapshot.get("charts") or {}).get("distribution") or {}
            distribution_series = distribution_chart.get("series") if isinstance(distribution_chart.get("series"), list) else []
            distribution_data = distribution_series[0].get("data", []) if distribution_series else []
            bucket_row.append(float(distribution_data[bucket_index] or 0.0) if bucket_index < len(distribution_data) else 0.0)
        distribution_matrix.append(bucket_row)

    wildcard_registered = sum(1 for entity in entities if bool(entity.get("is_wildcard")))
    wildcard_active = sum(
        1 for entity in entities
        if bool(entity.get("is_wildcard")) and str(entity.get("status") or "").strip().lower() == "active"
    )
    latest_participant_rows = latest_round_snapshot.get("participant_rows") if isinstance(latest_round_snapshot.get("participant_rows"), list) else []
    wildcard_present = sum(
        1 for row in latest_participant_rows
        if bool(row.get("is_wildcard")) and float(row.get("round_score") or 0.0) > 0.0
    )
    wildcard_finalists = 0
    wildcard_winners = 0
    for finalist in finalist_rows:
        entity_type = "user" if finalist.entity_type == PersohubEventEntityType.USER else "team"
        entity_id = int(finalist.user_id if entity_type == "user" else finalist.team_id or 0)
        if entity_id > 0 and bool(entity_map.get((entity_type, entity_id), {}).get("is_wildcard")):
            wildcard_finalists += 1
    for winner in title_rows:
        entity_type = "user" if winner.entity_type == PersohubEventEntityType.USER else "team"
        entity_id = int(winner.user_id if entity_type == "user" else winner.team_id or 0)
        if entity_id > 0 and bool(entity_map.get((entity_type, entity_id), {}).get("is_wildcard")):
            wildcard_winners += 1

    department_counter: Counter[str] = Counter()
    batch_counter: Counter[str] = Counter()
    for entity in participating_entities:
        if event.participant_mode == PersohubEventParticipantMode.TEAM:
            department_counter["Teams"] += 1
            batch_counter["Teams"] += 1
            continue
        department = str(entity.get("department") or "").strip() or "Unknown"
        batch = str(entity.get("batch") or "").strip() or "Unknown"
        department_counter[department] += 1
        batch_counter[batch] += 1
    department_labels = list(department_counter.keys())
    department_values = [float(department_counter[label]) for label in department_labels]
    batch_labels = list(batch_counter.keys())
    batch_values = [float(batch_counter[label]) for label in batch_labels]

    charts = {
        "round_average_scores": {
            "type": "line",
            "labels": [f"R{int(round_snapshot['round_no'])}" for round_snapshot in round_snapshots],
            "series": [
                {
                    "key": "average_score",
                    "label": "Average Score",
                    "data": round_average_scores,
                    "palette_key": "teal",
                }
            ],
        },
        "elimination_funnel": {
            "type": "bar",
            "labels": [f"R{int(round_snapshot['round_no'])}" for round_snapshot in round_snapshots],
            "series": [
                {
                    "key": "advanced",
                    "label": "Advanced",
                    "data": [float(value) for value in elimination_funnel],
                    "palette_key": "gold",
                }
            ],
        },
        "department_distribution": {
            "type": "pie",
            "labels": department_labels,
            "series": [
                {
                    "key": "departments",
                    "label": "Participants",
                    "data": department_values,
                    "palette_key": "blue",
                }
            ],
        },
        "batch_distribution": {
            "type": "pie",
            "labels": batch_labels,
            "series": [
                {
                    "key": "batches",
                    "label": "Participants",
                    "data": batch_values,
                    "palette_key": "teal",
                }
            ],
        },
        "round_elimination_trend": {
            "type": "bar",
            "labels": [f"R{int(round_snapshot['round_no'])}" for round_snapshot in round_snapshots],
            "series": [
                {
                    "key": "eliminated",
                    "label": "Eliminated",
                    "data": elimination_trend,
                    "palette_key": "coral",
                }
            ],
        },
        "score_progression": {
            "type": "line",
            "labels": [f"R{int(round_row.round_no)}" for round_row in published_round_rows],
            "series": [
                {
                    "key": str(row["entity_id"]),
                    "label": str(row.get("name") or f"Entity {row['entity_id']}"),
                    "data": [float(value or 0.0) for value in row.get("score_progression", [])],
                    "palette_key": ["gold", "teal", "coral", "blue", "lime", "rose"][index % 6],
                }
                for index, row in enumerate(top_rows)
            ],
            "meta": {
                "y_min": 50,
                "y_max": 100,
            },
        },
        "round_distribution_heatmap": {
            "type": "heatmap",
            "x_labels": [f"R{int(round_snapshot['round_no'])}" for round_snapshot in round_snapshots],
            "y_labels": distribution_buckets,
            "matrix": distribution_matrix,
            "palette_key": "rose",
            "meta": {
                "max_value": max((max(row) for row in distribution_matrix), default=0),
            },
        },
        "rank_movement": {
            "type": "line",
            "labels": [f"R{int(round_row.round_no)}" for round_row in published_round_rows],
            "series": [
                {
                    "key": str(row["entity_id"]),
                    "label": str(row.get("name") or f"Entity {row['entity_id']}"),
                    "data": [float(value or 0.0) for value in row.get("rank_progression", [])],
                    "palette_key": ["gold", "teal", "coral", "blue", "lime", "rose"][index % 6],
                }
                for index, row in enumerate(top_rows)
            ],
        },
        "criteria_strength_radar": {
            "type": "radar",
            "labels": criteria_order,
            "series": criteria_chart_series,
            "meta": {
                "max_value": 100,
            },
        },
        "leaderboard_scores": {
            "type": "bar",
            "labels": [str(row.get("name") or f"Entity {row['entity_id']}") for row in top_rows],
            "series": [
                {
                    "key": "leaderboard",
                    "label": "Overall Score",
                    "data": [float(row.get("cumulative_score") or 0.0) for row in top_rows],
                    "palette_key": "coral",
                }
            ],
        },
    }
    if wildcard_registered > 0:
        charts["wildcard_impact"] = {
            "type": "bar",
            "labels": ["Registered", "Active", "Present", "Finalists", "Winners"],
            "series": [
                {
                    "key": "wildcard",
                    "label": "Wildcard",
                    "data": [
                        float(wildcard_registered),
                        float(wildcard_active),
                        float(wildcard_present),
                        float(wildcard_finalists),
                        float(wildcard_winners),
                    ],
                    "palette_key": "gold",
                },
                {
                    "key": "non_wildcard",
                    "label": "Non-wildcard",
                    "data": [
                        float(max(registered_count - wildcard_registered, 0)),
                        float(max(active_count - wildcard_active, 0)),
                        float(max((latest_round_snapshot.get("participation", {}).get("present") or 0) - wildcard_present, 0)),
                        float(max(finalists_count - wildcard_finalists, 0)),
                        float(max(winners_count - wildcard_winners, 0)),
                    ],
                    "palette_key": "teal",
                },
            ],
        }

    summary = {
        "total_entities": registered_count,
        "active_entities": active_count,
        "eliminated_entities": sum(
            1 for entity in participating_entities
            if str(entity.get("status") or "").strip().lower() == "eliminated"
        ),
        "rounds_published": len(published_round_rows),
        "highest_score": round(float(leaderboard_rows[0].get("cumulative_score") or 0.0), 2) if leaderboard_rows else 0.0,
        "average_score": round(sum(float(row.get("cumulative_score") or 0.0) for row in leaderboard_rows) / len(leaderboard_rows), 2) if leaderboard_rows else 0.0,
        "finalists_count": finalists_count,
        "winners_count": winners_count,
    }
    winner = leaderboard_with_series[0] if leaderboard_with_series else None
    podium = leaderboard_with_series[:3]

    return {
        "generated_at": _iso(datetime.now(timezone.utc)),
        "summary": summary,
        "winner": winner,
        "podium": podium,
        "leaderboard": leaderboard_with_series,
        "highlights": _build_highlights(round_snapshots, leaderboard_with_series),
        "charts": charts,
    }


def build_public_round_card(round_row: PersohubEventRound) -> dict:
    snapshot = round_row.results_snapshot if isinstance(round_row.results_snapshot, dict) else None
    public_snapshot = None
    if snapshot:
        top_performers = snapshot.get("top_performers", [])
        top_ranked = snapshot.get("top_ranked", [])
        participant_rows = snapshot.get("participant_rows") if isinstance(snapshot.get("participant_rows"), list) else []
        sorted_rows = sorted(
            [
                row for row in participant_rows
                if row.get("round_rank") is not None
            ],
            key=lambda item: (
                int(item.get("round_rank") or 10**9),
                -float(item.get("round_score") or 0.0),
                str(item.get("name") or "").lower(),
            ),
        )
        if not isinstance(top_performers, list) or not top_performers:
            top_performers = [
                {
                    "entity_id": int(row.get("entity_id") or 0),
                    "name": row.get("name") or f"Entity {int(row.get('entity_id') or 0)}",
                    "regno_or_code": row.get("regno_or_code"),
                    "score": round(float(row.get("round_score") or 0.0), 2),
                    "rank": int(row.get("round_rank") or 0),
                    "is_wildcard": bool(row.get("is_wildcard")),
                    "wildcard_score_considered": bool(row.get("is_wildcard") and row.get("wildcard_start_round_no") is not None and int(snapshot.get("round_no") or 0) >= int(row.get("wildcard_start_round_no") or 0)),
                }
                for row in sorted_rows[:10]
            ]
        if not isinstance(top_ranked, list) or not top_ranked:
            top_ranked = [
                {
                    "entity_id": int(row.get("entity_id") or 0),
                    "name": row.get("name") or f"Entity {int(row.get('entity_id') or 0)}",
                    "regno_or_code": row.get("regno_or_code"),
                    "score": round(float(row.get("round_score") or 0.0), 2),
                    "rank": int(row.get("round_rank") or 0),
                    "is_wildcard": bool(row.get("is_wildcard")),
                    "wildcard_score_considered": bool(row.get("is_wildcard") and row.get("wildcard_start_round_no") is not None and int(snapshot.get("round_no") or 0) >= int(row.get("wildcard_start_round_no") or 0)),
                }
                for row in sorted_rows[:3]
            ]
        participation = snapshot.get("participation", {}) if isinstance(snapshot.get("participation"), dict) else {}
        total_count = int(participation.get("total") or 0)
        present_count = int(participation.get("present") or 0)
        eliminated_count = int(participation.get("eliminated") or 0)
        advanced_count = int(participation.get("advanced") or 0)
        if participant_rows:
            total_count = len(participant_rows)
            present_count = sum(1 for row in participant_rows if float(row.get("round_score") or 0.0) > 0.0)
        normalized_total = max(total_count, present_count, eliminated_count + advanced_count)
        normalized_absent = max(normalized_total - present_count, 0)
        normalized_rate = round((eliminated_count / normalized_total) * 100.0, 1) if normalized_total > 0 else 0.0
        metric_cards = snapshot.get("metric_cards", [])
        if isinstance(metric_cards, list) and metric_cards:
            normalized_cards = []
            for card in metric_cards:
                if not isinstance(card, dict):
                    continue
                key = str(card.get("key") or "")
                if key == "total":
                    normalized_cards.append({**card, "value": normalized_total})
                elif key == "eliminated":
                    normalized_cards.append({**card, "value": eliminated_count})
                elif key == "advanced":
                    normalized_cards.append({**card, "value": advanced_count})
                elif key == "elimination_rate":
                    normalized_cards.append({**card, "value": f"{normalized_rate}%"})
                else:
                    normalized_cards.append(card)
            metric_cards = normalized_cards
        public_snapshot = {
            "round_id": snapshot.get("round_id"),
            "round_no": snapshot.get("round_no"),
            "round_name": snapshot.get("round_name"),
            "card_status": snapshot.get("card_status", "published"),
            "metric_cards": metric_cards,
            "participation": {
                **participation,
                "total": normalized_total,
                "present": present_count,
                "absent": normalized_absent,
                "eliminated": eliminated_count,
                "advanced": advanced_count,
                "elimination_rate": normalized_rate,
            },
            "score_analytics": snapshot.get("score_analytics", {}),
            "top_scorer": snapshot.get("top_scorer"),
            "top_scorers": snapshot.get("top_scorers", []),
            "top_ranked": top_ranked if isinstance(top_ranked, list) else [],
            "top_performers": top_performers,
            "criteria_tags": snapshot.get("criteria_tags", []),
            "criteria_summary": snapshot.get("criteria_summary", []),
            "charts": snapshot.get("charts", {}),
            "published_at": snapshot.get("published_at"),
            "default_graph": snapshot.get("default_graph", "distribution"),
        }
    return {
        "id": int(round_row.id),
        "round_no": int(round_row.round_no),
        "name": round_row.name,
        "state": str(round_row.state.value if hasattr(round_row.state, "value") else round_row.state),
        "results_published": bool(getattr(round_row, "results_published", False)),
        "results_published_at": _iso(getattr(round_row, "results_published_at", None)),
        "is_locked": not bool(getattr(round_row, "results_published", False)),
        "snapshot": public_snapshot,
    }


def build_participant_results_payload(db: Session, event: PersohubEvent, *, entity_type: str, entity_id: int) -> dict:
    round_rows = _event_rounds(db, event.id)
    rounds = []
    for round_row in round_rows:
        if not bool(getattr(round_row, "results_published", False)):
            continue
        snapshot = round_row.results_snapshot if isinstance(round_row.results_snapshot, dict) else {}
        participant_rows = snapshot.get("participant_rows") if isinstance(snapshot.get("participant_rows"), list) else []
        participant_row = next(
            (
                row
                for row in participant_rows
                if str(row.get("entity_type")) == str(entity_type) and int(row.get("entity_id") or 0) == int(entity_id)
            ),
            None,
        )
        rounds.append(
            {
                "round_id": int(round_row.id),
                "round_no": int(round_row.round_no),
                "round_name": round_row.name,
                "published_at": _iso(getattr(round_row, "results_published_at", None)),
                "standing": participant_row,
            }
        )

    wrapped_summary = None
    if bool(getattr(event, "results_published", False)) and isinstance(getattr(event, "event_results_snapshot", None), dict):
        leaderboard = event.event_results_snapshot.get("leaderboard") if isinstance(event.event_results_snapshot.get("leaderboard"), list) else []
        wrapped_summary = next(
            (
                row
                for row in leaderboard
                if str(row.get("entity_type")) == str(entity_type) and int(row.get("entity_id") or 0) == int(entity_id)
            ),
            None,
        )
    participant_cards = []
    if isinstance(wrapped_summary, dict) and wrapped_summary:
        def _round_label(round_no: Any) -> Optional[str]:
            try:
                parsed = int(round_no)
            except Exception:
                return None
            return f"Round {parsed}"

        participant_cards = [
            {
                "key": "final_rank",
                "label": "Final Rank",
                "value": f"#{int(wrapped_summary['rank'])}" if wrapped_summary.get("rank") is not None else "--",
                "subtext": "Overall standing",
                "description": "Your final position after all published result rounds were combined.",
                "tone": "gold",
            },
            {
                "key": "total_score",
                "label": "Total Score",
                "value": round(float(wrapped_summary.get("cumulative_score") or 0.0), 2),
                "subtext": f"{int(wrapped_summary.get('rounds_participated') or 0)} scored rounds",
                "description": "The cumulative score currently visible to you from published round snapshots.",
                "tone": "blue",
            },
            {
                "key": "average_round_score",
                "label": "Average Score",
                "value": round(float(wrapped_summary.get("average_round_score") or 0.0), 2),
                "subtext": "Published rounds",
                "description": "Average round score across the rounds that are visible in the results reveal.",
                "tone": "teal",
            },
            {
                "key": "best_rank",
                "label": "Best Rank",
                "value": f"#{int(wrapped_summary['best_rank'])}" if wrapped_summary.get("best_rank") is not None else "--",
                "subtext": f"Avg rank {wrapped_summary.get('average_rank') or '--'}",
                "description": "Your strongest rank in any published round, compared with your average rank.",
                "tone": "lime",
            },
            {
                "key": "best_round",
                "label": "Best Round",
                "value": _round_label(wrapped_summary.get("best_round")) or "--",
                "subtext": "Highest round score",
                "description": "The round where your score peaked in the published result timeline.",
                "tone": "coral",
            },
            {
                "key": "consistency",
                "label": "Consistency",
                "value": f"{round(float(wrapped_summary.get('consistency_score') or 0.0), 1)}%",
                "subtext": str(wrapped_summary.get("performance_trend") or "STABLE").replace("_", " ").title(),
                "description": "A stability indicator based on variation across your published round scores.",
                "tone": "rose",
            },
        ]
        comeback_round = _round_label(wrapped_summary.get("biggest_comeback_round"))
        if comeback_round:
            participant_cards.append(
                {
                    "key": "biggest_comeback",
                    "label": "Biggest Comeback",
                    "value": comeback_round,
                    "subtext": "Strongest rank gain",
                    "description": "The round where your rank improved the most compared with the previous published round.",
                    "tone": "gold",
                }
            )
        eliminated_round = _round_label(wrapped_summary.get("eliminated_round"))
        if eliminated_round:
            participant_cards.append(
                {
                    "key": "eliminated_round",
                    "label": "Eliminated",
                    "value": eliminated_round,
                    "subtext": "Final active round",
                    "description": "The round where your event status moved out of active contention.",
                    "tone": "slate",
                }
            )
    return {
        "slug": event.slug,
        "title": event.title,
        "rounds": rounds,
        "wrapped_summary": wrapped_summary,
        "participant_cards": participant_cards,
    }
