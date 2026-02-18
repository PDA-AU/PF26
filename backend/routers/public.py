from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import SystemConfig
from datetime import datetime

router = APIRouter()
DEFAULT_PDA_RECRUIT_URL = "https://chat.whatsapp.com/ErThvhBS77kGJEApiABP2z"


@router.get("/")
def root():
    return {"message": "PDA API is running"}


@router.get("/health")
def health_check():
    return {"status": "healthy"}


@router.get("/pda/recruitment-status")
def get_pda_recruitment_status(db: Session = Depends(get_db)):
    reg_config = db.query(SystemConfig).filter(SystemConfig.key == "pda_recruitment_open").first()
    recruitment_open = reg_config.value == "true" if reg_config else True
    recruit_url = str((reg_config.recruit_url if reg_config else "") or "").strip() or DEFAULT_PDA_RECRUIT_URL
    return {"recruitment_open": recruitment_open, "recruit_url": recruit_url}


@router.get("/routes")
def list_routes():
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "routes": [
            {"method": "GET", "path": "/"},
            {"method": "GET", "path": "/health"},
            {"method": "GET", "path": "/pda/recruitment-status"},
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
            {"method": "GET", "path": "/pda/events/{slug}/rounds"},
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
            {"method": "GET", "path": "/persohub/chakravyuha-26"},
            {"method": "GET", "path": "/persohub/chakravyuha-26/events"},
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
            {"method": "GET", "path": "/pda-admin/events/{slug}/unregistered-users"},
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
            {"method": "POST", "path": "/pda-admin/events/{slug}/email/bulk"},
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
            {"method": "GET", "path": "/pda-admin/cc/clubs"},
            {"method": "POST", "path": "/pda-admin/cc/clubs"},
            {"method": "PUT", "path": "/pda-admin/cc/clubs/{club_id}"},
            {"method": "DELETE", "path": "/pda-admin/cc/clubs/{club_id}"},
            {"method": "GET", "path": "/pda-admin/cc/communities"},
            {"method": "POST", "path": "/pda-admin/cc/communities"},
            {"method": "PUT", "path": "/pda-admin/cc/communities/{community_id}"},
            {"method": "POST", "path": "/pda-admin/cc/communities/{community_id}/reset-password"},
            {"method": "DELETE", "path": "/pda-admin/cc/communities/{community_id}"},
            {"method": "GET", "path": "/pda-admin/cc/sympos"},
            {"method": "POST", "path": "/pda-admin/cc/sympos"},
            {"method": "PUT", "path": "/pda-admin/cc/sympos/{sympo_id}"},
            {"method": "DELETE", "path": "/pda-admin/cc/sympos/{sympo_id}"},
            {"method": "GET", "path": "/pda-admin/cc/options/community-events"},
            {"method": "GET", "path": "/pda-admin/cc/options/admin-users"},
            {"method": "POST", "path": "/pda-admin/cc/logos/presign"},
            {"method": "POST", "path": "/pda-admin/email/bulk"},
            {"method": "POST", "path": "/pda-admin/gallery"},
            {"method": "PUT", "path": "/pda-admin/gallery/{item_id}"},
            {"method": "DELETE", "path": "/pda-admin/gallery/{item_id}"},
            {"method": "POST", "path": "/pda-admin/posters"},
            {"method": "POST", "path": "/pda-admin/posters/pdf-preview"},
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
            {"method": "POST", "path": "/pda-admin/recruitments/approve"},
            {"method": "POST", "path": "/pda-admin/recruitments/reject"},
            {"method": "GET", "path": "/persohub/admin/events"},
            {"method": "POST", "path": "/persohub/admin/events"},
            {"method": "PUT", "path": "/persohub/admin/events/{slug}"},
            {"method": "DELETE", "path": "/persohub/admin/events/{slug}"}
        ]
    }
