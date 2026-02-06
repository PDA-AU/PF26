from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List

from database import get_db
from models import PdaItem, PdaTeam, PdaGallery
from schemas import ProgramResponse, EventResponse, PdaTeamResponse, PdaGalleryResponse

router = APIRouter()


@router.get("/pda/programs", response_model=List[ProgramResponse])
async def get_pda_programs(
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
async def get_pda_events(
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
async def get_featured_event(db: Session = Depends(get_db)):
    event = db.query(PdaItem).filter(PdaItem.type == "event", PdaItem.is_featured == True).order_by(PdaItem.updated_at.desc()).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No featured event")
    return EventResponse.model_validate(event)


@router.get("/pda/team", response_model=List[PdaTeamResponse])
async def get_pda_team(db: Session = Depends(get_db)):
    team = db.query(PdaTeam).filter(
        or_(PdaTeam.designation.is_(None), PdaTeam.designation != "Root")
    ).order_by(
        PdaTeam.team.asc().nullslast(),
        PdaTeam.designation.asc().nullslast(),
        PdaTeam.name.asc()
    ).all()
    return [PdaTeamResponse.model_validate(member) for member in team]


@router.get("/pda/gallery", response_model=List[PdaGalleryResponse])
async def get_pda_gallery(
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
