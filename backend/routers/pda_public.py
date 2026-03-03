from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from datetime import datetime, timedelta, timezone

from database import get_db
from models import PdaItem, PdaTeam, PdaGallery, PdaUser
from schemas import ProgramResponse, EventResponse, PdaTeamResponse, PdaGalleryResponse, PdaBirthdayWishResponse

router = APIRouter()


def _build_team_response(member: PdaTeam, user: Optional[PdaUser]) -> PdaTeamResponse:
    return PdaTeamResponse(
        id=member.id,
        user_id=member.user_id,
        name=user.name if user else None,
        regno=user.regno if user else None,
        dept=user.dept if user else None,
        email=user.email if user else None,
        phno=user.phno if user else None,
        dob=user.dob if user else None,
        team=member.team,
        designation=member.designation,
        photo_url=user.image_url if user else None,
        instagram_url=user.instagram_url if user else None,
        linkedin_url=user.linkedin_url if user else None,
        github_url=user.github_url if user else None,
        created_at=member.created_at
    )


@router.get("/pda/programs", response_model=List[ProgramResponse])
def get_pda_programs(
    db: Session = Depends(get_db),
    limit: int = Query(default=200, ge=1, le=500)
):
    programs = (
        db.query(PdaItem)
        .filter(PdaItem.type == "program")
        .order_by(PdaItem.start_date.desc().nullslast(), PdaItem.created_at.desc())
        .limit(limit)
        .all()
    )
    return [ProgramResponse.model_validate(p) for p in programs]


@router.get("/pda/events", response_model=List[EventResponse])
def get_pda_events(
    db: Session = Depends(get_db),
    limit: int = Query(default=200, ge=1, le=500)
):
    events = (
        db.query(PdaItem)
        .filter(PdaItem.type == "event")
        .order_by(PdaItem.start_date.desc().nullslast(), PdaItem.created_at.desc())
        .limit(limit)
        .all()
    )
    return [EventResponse.model_validate(e) for e in events]


@router.get("/pda/featured-event", response_model=EventResponse)
def get_featured_event(db: Session = Depends(get_db)):
    event = db.query(PdaItem).filter(PdaItem.type == "event", PdaItem.is_featured == True).order_by(PdaItem.updated_at.desc()).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No featured event")
    return EventResponse.model_validate(event)


@router.get("/pda/team", response_model=List[PdaTeamResponse])
def get_pda_team(db: Session = Depends(get_db)):
    rows = (
        db.query(PdaTeam, PdaUser)
        .join(PdaUser, PdaTeam.user_id == PdaUser.id, isouter=True)
        .filter(or_(PdaTeam.designation.is_(None), PdaTeam.designation != "Root"))
        .order_by(
            PdaTeam.team.asc().nullslast(),
            PdaTeam.designation.asc().nullslast(),
            PdaUser.name.asc().nullslast()
        )
        .all()
    )
    return [_build_team_response(member, user) for member, user in rows]


@router.get("/pda/gallery", response_model=List[PdaGalleryResponse])
def get_pda_gallery(
    db: Session = Depends(get_db),
    limit: int = Query(default=200, ge=1, le=500)
):
    gallery = (
        db.query(PdaGallery)
        .order_by(PdaGallery.order.asc(), PdaGallery.created_at.desc())
        .limit(limit)
        .all()
    )
    return [PdaGalleryResponse.model_validate(item) for item in gallery]


@router.get("/pda/birthdays/today", response_model=List[PdaBirthdayWishResponse])
def get_pda_birthdays_today(db: Session = Depends(get_db)):
    ist_now = datetime.now(timezone(timedelta(hours=5, minutes=30)))
    month = ist_now.month
    day = ist_now.day

    rows = (
        db.query(PdaUser.name, PdaUser.regno)
        .filter(
            PdaUser.dob.isnot(None),
            PdaUser.name.isnot(None),
            func.upper(func.coalesce(PdaUser.college, "MIT")) == "MIT",
            func.extract("month", PdaUser.dob) == month,
            func.extract("day", PdaUser.dob) == day,
        )
        .order_by(PdaUser.name.asc().nullslast(), PdaUser.regno.asc().nullslast())
        .all()
    )

    wishes: List[PdaBirthdayWishResponse] = []
    for name, regno in rows:
        if not name:
            continue
        if str(regno or "").strip() == "0000000000":
            continue
        wishes.append(
            PdaBirthdayWishResponse(
                name=str(name).strip(),
                regno=(str(regno).strip() if regno else None),
            )
        )

    return wishes
