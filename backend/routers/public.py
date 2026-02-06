from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from database import get_db
from models import SystemConfig, Round, RoundState, Participant
from schemas import RoundPublicResponse, TopReferrer
from datetime import datetime

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Persofest'26 API is running"}


@router.get("/health")
async def health_check():
    return {"status": "healthy"}


@router.get("/registration-status")
async def get_registration_status(db: Session = Depends(get_db)):
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "registration_open").first()
    registration_open = reg_config.value == "true" if reg_config else True
    return {"registration_open": registration_open}


@router.get("/rounds/public", response_model=List[RoundPublicResponse])
async def get_public_rounds(db: Session = Depends(get_db)):
    rounds = db.query(Round).filter(Round.state != RoundState.DRAFT).order_by(Round.id).all()
    return [RoundPublicResponse.model_validate(r) for r in rounds]


@router.get("/top-referrers", response_model=List[TopReferrer])
async def get_top_referrers(db: Session = Depends(get_db)):
    top_referrers = db.query(
        Participant.name,
        Participant.register_number,
        Participant.referral_count
    ).filter(Participant.referral_count > 0).order_by(Participant.referral_count.desc()).limit(10).all()

    return [TopReferrer(name=name, register_number=regno, referral_count=count) for name, regno, count in top_referrers]


@router.get("/routes")
async def list_routes():
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "routes": [
            {"method": "GET", "path": "/"},
            {"method": "GET", "path": "/health"},
            {"method": "GET", "path": "/registration-status"},
            {"method": "GET", "path": "/rounds/public"},
            {"method": "GET", "path": "/top-referrers"},
            {"method": "GET", "path": "/routes"},
            {"method": "POST", "path": "/auth/register"},
            {"method": "POST", "path": "/auth/login"},
            {"method": "POST", "path": "/auth/refresh"},
            {"method": "GET", "path": "/me"},
            {"method": "PUT", "path": "/me"},
            {"method": "POST", "path": "/me/profile-picture"},
            {"method": "POST", "path": "/participant-auth/register"},
            {"method": "POST", "path": "/participant-auth/login"},
            {"method": "POST", "path": "/participant-auth/refresh"},
            {"method": "GET", "path": "/participant/me"},
            {"method": "PUT", "path": "/participant/me"},
            {"method": "POST", "path": "/participant/me/profile-picture"},
            {"method": "GET", "path": "/participant/me/rounds"},
            {"method": "GET", "path": "/pda/programs"},
            {"method": "GET", "path": "/pda/events"},
            {"method": "GET", "path": "/pda/featured-event"},
            {"method": "GET", "path": "/pda/team"},
            {"method": "GET", "path": "/pda/gallery"},
            {"method": "POST", "path": "/pda-admin/programs"},
            {"method": "PUT", "path": "/pda-admin/programs/{program_id}"},
            {"method": "DELETE", "path": "/pda-admin/programs/{program_id}"},
            {"method": "POST", "path": "/pda-admin/events"},
            {"method": "PUT", "path": "/pda-admin/events/{event_id}"},
            {"method": "POST", "path": "/pda-admin/events/{event_id}/feature"},
            {"method": "DELETE", "path": "/pda-admin/events/{event_id}"},
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
            {"method": "GET", "path": "/pda-admin/superadmin/admins"},
            {"method": "POST", "path": "/pda-admin/superadmin/admins"},
            {"method": "DELETE", "path": "/pda-admin/superadmin/admins/{user_id}"},
            {"method": "PUT", "path": "/pda-admin/superadmin/admins/{user_id}/policy"},
            {"method": "GET", "path": "/pda-admin/superadmin/logs"},
            {"method": "POST", "path": "/pda-admin/superadmin/db-snapshot"},
            {"method": "GET", "path": "/pda-admin/recruitments"},
            {"method": "POST", "path": "/pda-admin/recruitments/approve"},
            {"method": "GET", "path": "/persofest/admin/dashboard"},
            {"method": "POST", "path": "/persofest/admin/toggle-registration"},
            {"method": "GET", "path": "/persofest/admin/participants"},
            {"method": "PUT", "path": "/persofest/admin/participants/{participant_id}/status"},
            {"method": "GET", "path": "/persofest/admin/participants/{participant_id}/rounds"},
            {"method": "GET", "path": "/persofest/admin/participants/{participant_id}/summary"},
            {"method": "GET", "path": "/persofest/admin/rounds"},
            {"method": "POST", "path": "/persofest/admin/rounds"},
            {"method": "PUT", "path": "/persofest/admin/rounds/{round_id}"},
            {"method": "POST", "path": "/persofest/admin/rounds/{round_id}/description-pdf"},
            {"method": "DELETE", "path": "/persofest/admin/rounds/{round_id}"},
            {"method": "GET", "path": "/persofest/admin/rounds/{round_id}/stats"},
            {"method": "POST", "path": "/persofest/admin/rounds/{round_id}/scores"},
            {"method": "GET", "path": "/persofest/admin/rounds/{round_id}/participants"},
            {"method": "GET", "path": "/persofest/admin/rounds/{round_id}/score-template"},
            {"method": "POST", "path": "/persofest/admin/rounds/{round_id}/import-scores"},
            {"method": "POST", "path": "/persofest/admin/rounds/{round_id}/freeze"},
            {"method": "POST", "path": "/persofest/admin/rounds/{round_id}/unfreeze"},
            {"method": "GET", "path": "/persofest/admin/leaderboard"},
            {"method": "GET", "path": "/persofest/admin/export/participants"},
            {"method": "GET", "path": "/persofest/admin/export/leaderboard"},
            {"method": "GET", "path": "/persofest/admin/export/round/{round_id}"},
            {"method": "GET", "path": "/persofest/admin/logs"}
        ]
    }
