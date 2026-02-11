from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from database import get_db
from models import (
    SystemConfig,
    PdaEvent,
    PdaEventStatus,
    PdaEventRound,
    PdaEventRoundState,
    PdaEventRegistration,
    PdaEventEntityType,
    PdaUser,
)
from schemas import RoundPublicResponse, TopReferrer
from datetime import datetime

router = APIRouter()
PERSOFEST_EVENT_SLUG = "persofest-2026"


@router.get("/")
def root():
    return {"message": "Persofest'26 API is running"}


@router.get("/health")
def health_check():
    return {"status": "healthy"}


@router.get("/registration-status")
def get_registration_status(db: Session = Depends(get_db)):
    event = db.query(PdaEvent).filter(PdaEvent.slug == PERSOFEST_EVENT_SLUG).first()
    if event:
        registration_open = event.status == PdaEventStatus.OPEN
    else:
        reg_config = db.query(SystemConfig).filter(SystemConfig.key == "registration_open").first()
        registration_open = reg_config.value == "true" if reg_config else True
    return {"registration_open": registration_open}


@router.get("/pda/recruitment-status")
def get_pda_recruitment_status(db: Session = Depends(get_db)):
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
    recruitment_open = reg_config.value == "true" if reg_config else True
    return {"recruitment_open": recruitment_open}


@router.get("/rounds/public", response_model=List[RoundPublicResponse])
def get_public_rounds(db: Session = Depends(get_db)):
    event = db.query(PdaEvent).filter(PdaEvent.slug == PERSOFEST_EVENT_SLUG).first()
    if not event:
        return []
    rounds = (
        db.query(PdaEventRound)
        .filter(
            PdaEventRound.event_id == event.id,
            PdaEventRound.state != PdaEventRoundState.DRAFT,
        )
        .order_by(PdaEventRound.round_no.asc())
        .all()
    )
    payload = []
    for row in rounds:
        payload.append(
            RoundPublicResponse(
                id=row.id,
                round_no=f"PF{int(row.round_no):02d}",
                name=row.name,
                description=row.description,
                date=row.date,
                mode=row.mode.value if hasattr(row.mode, "value") else str(row.mode),
                description_pdf=None,
            )
        )
    return payload


@router.get("/top-referrers", response_model=List[TopReferrer])
def get_top_referrers(db: Session = Depends(get_db)):
    event = db.query(PdaEvent).filter(PdaEvent.slug == PERSOFEST_EVENT_SLUG).first()
    if not event:
        return []
    top_referrers = (
        db.query(
            PdaUser.name,
            PdaUser.regno,
            PdaEventRegistration.referral_count,
        )
        .join(PdaUser, PdaUser.id == PdaEventRegistration.user_id)
        .filter(
            PdaEventRegistration.event_id == event.id,
            PdaEventRegistration.entity_type == PdaEventEntityType.USER,
            PdaEventRegistration.referral_count > 0,
        )
        .order_by(PdaEventRegistration.referral_count.desc(), PdaUser.name.asc())
        .limit(10)
        .all()
    )
    return [TopReferrer(name=name, register_number=regno, referral_count=count) for name, regno, count in top_referrers]


@router.get("/routes")
def list_routes():
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "routes": [
            {"method": "GET", "path": "/"},
            {"method": "GET", "path": "/health"},
            {"method": "GET", "path": "/registration-status"},
            {"method": "GET", "path": "/pda/recruitment-status"},
            {"method": "GET", "path": "/rounds/public"},
            {"method": "GET", "path": "/top-referrers"},
            {"method": "GET", "path": "/routes"},
            {"method": "POST", "path": "/auth/register"},
            {"method": "POST", "path": "/auth/login"},
            {"method": "POST", "path": "/auth/refresh"},
            {"method": "POST", "path": "/pda/recruitment/apply"},
            {"method": "GET", "path": "/me"},
            {"method": "PUT", "path": "/me"},
            {"method": "POST", "path": "/me/change-password"},
            {"method": "POST", "path": "/me/profile-picture"},
            {"method": "POST", "path": "/me/profile-picture/presign"},
            {"method": "POST", "path": "/me/profile-picture/confirm"},
            {"method": "GET", "path": "/pda/programs"},
            {"method": "GET", "path": "/pda/events"},
            {"method": "GET", "path": "/pda/events/ongoing"},
            {"method": "GET", "path": "/pda/events/{slug}"},
            {"method": "GET", "path": "/pda/events/{slug}/dashboard"},
            {"method": "GET", "path": "/pda/events/{slug}/me"},
            {"method": "GET", "path": "/pda/events/{slug}/my-rounds"},
            {"method": "POST", "path": "/pda/events/{slug}/register"},
            {"method": "POST", "path": "/pda/events/{slug}/teams/create"},
            {"method": "POST", "path": "/pda/events/{slug}/teams/join"},
            {"method": "GET", "path": "/pda/events/{slug}/team"},
            {"method": "POST", "path": "/pda/events/{slug}/team/invite"},
            {"method": "GET", "path": "/pda/events/{slug}/qr"},
            {"method": "GET", "path": "/pda/me/events"},
            {"method": "GET", "path": "/pda/me/achievements"},
            {"method": "GET", "path": "/pda/me/certificates/{event_slug}"},
            {"method": "GET", "path": "/pda/featured-event"},
            {"method": "GET", "path": "/pda/team"},
            {"method": "GET", "path": "/pda/gallery"},
            {"method": "POST", "path": "/pda-admin/programs"},
            {"method": "PUT", "path": "/pda-admin/programs/{program_id}"},
            {"method": "DELETE", "path": "/pda-admin/programs/{program_id}"},
            {"method": "POST", "path": "/pda-admin/home-events"},
            {"method": "PUT", "path": "/pda-admin/home-events/{event_id}"},
            {"method": "POST", "path": "/pda-admin/home-events/{event_id}/feature"},
            {"method": "DELETE", "path": "/pda-admin/home-events/{event_id}"},
            {"method": "GET", "path": "/pda-admin/events"},
            {"method": "POST", "path": "/pda-admin/events"},
            {"method": "PUT", "path": "/pda-admin/events/{slug}"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/dashboard"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/participants"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/attendance"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/attendance/mark"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/attendance/scan"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/rounds"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/rounds"},
            {"method": "PUT", "path": "/pda-admin/events/{slug}/rounds/{round_id}"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/participants/{user_id}/rounds"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/participants/{user_id}/summary"},
            {"method": "PUT", "path": "/pda-admin/events/{slug}/participants/{user_id}/status"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/teams/{team_id}"},
            {"method": "DELETE", "path": "/pda-admin/events/{slug}/teams/{team_id}"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/rounds/{round_id}/participants"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/rounds/{round_id}/scores"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/rounds/{round_id}/import-scores"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/rounds/{round_id}/score-template"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/rounds/{round_id}/freeze"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/rounds/{round_id}/unfreeze"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/leaderboard"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/export/participants"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/export/leaderboard"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/export/round/{round_id}"},
            {"method": "POST", "path": "/pda-admin/events/{slug}/badges"},
            {"method": "GET", "path": "/pda-admin/events/{slug}/badges"},
            {"method": "GET", "path": "/pda-admin/team"},
            {"method": "POST", "path": "/pda-admin/team"},
            {"method": "PUT", "path": "/pda-admin/team/{member_id}"},
            {"method": "DELETE", "path": "/pda-admin/team/{member_id}"},
            {"method": "GET", "path": "/pda-admin/team/export"},
            {"method": "POST", "path": "/pda-admin/gallery"},
            {"method": "PUT", "path": "/pda-admin/gallery/{item_id}"},
            {"method": "DELETE", "path": "/pda-admin/gallery/{item_id}"},
            {"method": "POST", "path": "/pda-admin/posters"},
            {"method": "POST", "path": "/pda-admin/gallery-uploads"},
            {"method": "POST", "path": "/pda-admin/team-uploads"},
            {"method": "POST", "path": "/pda-admin/posters/presign"},
            {"method": "POST", "path": "/pda-admin/gallery-uploads/presign"},
            {"method": "POST", "path": "/pda-admin/team-uploads/presign"},
            {"method": "GET", "path": "/pda-admin/superadmin/admins"},
            {"method": "POST", "path": "/pda-admin/superadmin/admins"},
            {"method": "DELETE", "path": "/pda-admin/superadmin/admins/{user_id}"},
            {"method": "PUT", "path": "/pda-admin/superadmin/admins/{user_id}/policy"},
            {"method": "GET", "path": "/pda-admin/superadmin/logs"},
            {"method": "POST", "path": "/pda-admin/superadmin/db-snapshot"},
            {"method": "GET", "path": "/pda-admin/superadmin/db-snapshot/latest"},
            {"method": "POST", "path": "/pda-admin/superadmin/db-snapshot/restore"},
            {"method": "GET", "path": "/pda-admin/superadmin/recruitment-status"},
            {"method": "POST", "path": "/pda-admin/superadmin/recruitment-toggle"},
            {"method": "GET", "path": "/pda-admin/recruitments"},
            {"method": "GET", "path": "/pda-admin/recruitments/export"},
            {"method": "POST", "path": "/pda-admin/recruitments/approve"}
        ]
    }
