from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from sqlalchemy.orm import Session
from typing import List, Optional
import io
import csv
from fastapi.responses import StreamingResponse
from openpyxl import Workbook

from database import get_db
from models import PdaItem, PdaTeam, PdaGallery, PdaUser
from schemas import (
    ProgramCreate, ProgramUpdate, ProgramResponse,
    EventCreate, EventUpdate, EventResponse,
    PdaTeamCreate, PdaTeamUpdate, PdaTeamResponse,
    PdaGalleryCreate, PdaGalleryUpdate, PdaGalleryResponse,
    PresignRequest, PresignResponse
)
from security import require_pda_home_admin, require_superadmin
from utils import log_admin_action, _upload_to_s3, _generate_presigned_put_url

router = APIRouter()


@router.post("/pda-admin/programs", response_model=ProgramResponse)
async def create_pda_program(
    program_data: ProgramCreate,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    new_program = PdaItem(
        type="program",
        title=program_data.title,
        description=program_data.description,
        tag=program_data.tag,
        poster_url=program_data.poster_url,
        start_date=program_data.start_date,
        end_date=program_data.end_date,
        format=program_data.format,
        hero_caption=program_data.hero_caption,
        hero_url=program_data.hero_url,
        featured_poster_url=program_data.featured_poster_url,
        is_featured=program_data.is_featured
    )
    db.add(new_program)
    db.commit()
    db.refresh(new_program)
    log_admin_action(db, admin, "Create PDA program", request.method if request else None, request.url.path if request else None, {"program_id": new_program.id})
    return ProgramResponse.model_validate(new_program)


@router.put("/pda-admin/programs/{program_id}", response_model=ProgramResponse)
async def update_pda_program(
    program_id: int,
    program_data: ProgramUpdate,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    program = db.query(PdaItem).filter(PdaItem.id == program_id, PdaItem.type == "program").first()
    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")

    if program_data.title is not None:
        program.title = program_data.title
    if program_data.description is not None:
        program.description = program_data.description
    if program_data.tag is not None:
        program.tag = program_data.tag
    if program_data.poster_url is not None:
        program.poster_url = program_data.poster_url
    if program_data.start_date is not None:
        program.start_date = program_data.start_date
    if program_data.end_date is not None:
        program.end_date = program_data.end_date
    if program_data.format is not None:
        program.format = program_data.format
    if program_data.hero_caption is not None:
        program.hero_caption = program_data.hero_caption
    if program_data.hero_url is not None:
        program.hero_url = program_data.hero_url
    if program_data.featured_poster_url is not None:
        program.featured_poster_url = program_data.featured_poster_url
    if program_data.is_featured is not None:
        program.is_featured = program_data.is_featured

    db.commit()
    db.refresh(program)
    log_admin_action(db, admin, "Update PDA program", request.method if request else None, request.url.path if request else None, {"program_id": program_id})
    return ProgramResponse.model_validate(program)


@router.delete("/pda-admin/programs/{program_id}")
async def delete_pda_program(
    program_id: int,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    program = db.query(PdaItem).filter(PdaItem.id == program_id, PdaItem.type == "program").first()
    if not program:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Program not found")
    db.delete(program)
    db.commit()
    log_admin_action(db, admin, "Delete PDA program", request.method if request else None, request.url.path if request else None, {"program_id": program_id})
    return {"message": "Program deleted successfully"}


@router.post("/pda-admin/events", response_model=EventResponse)
async def create_pda_event(
    event_data: EventCreate,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    new_event = PdaItem(
        type="event",
        title=event_data.title,
        start_date=event_data.start_date,
        end_date=event_data.end_date,
        format=event_data.format,
        description=event_data.description,
        poster_url=event_data.poster_url,
        hero_caption=event_data.hero_caption,
        hero_url=event_data.hero_url,
        featured_poster_url=event_data.featured_poster_url,
        is_featured=event_data.is_featured
    )
    db.add(new_event)
    db.commit()
    db.refresh(new_event)
    log_admin_action(db, admin, "Create PDA event", request.method if request else None, request.url.path if request else None, {"event_id": new_event.id})
    return EventResponse.model_validate(new_event)


@router.put("/pda-admin/events/{event_id}", response_model=EventResponse)
async def update_pda_event(
    event_id: int,
    event_data: EventUpdate,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    event = db.query(PdaItem).filter(PdaItem.id == event_id, PdaItem.type == "event").first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    if event_data.title is not None:
        event.title = event_data.title
    if event_data.start_date is not None:
        event.start_date = event_data.start_date
    if event_data.end_date is not None:
        event.end_date = event_data.end_date
    if event_data.format is not None:
        event.format = event_data.format
    if event_data.description is not None:
        event.description = event_data.description
    if event_data.poster_url is not None:
        event.poster_url = event_data.poster_url
    if event_data.hero_caption is not None:
        event.hero_caption = event_data.hero_caption
    if event_data.hero_url is not None:
        event.hero_url = event_data.hero_url
    if event_data.featured_poster_url is not None:
        event.featured_poster_url = event_data.featured_poster_url
    if event_data.is_featured is not None:
        event.is_featured = event_data.is_featured

    db.commit()
    db.refresh(event)
    log_admin_action(db, admin, "Update PDA event", request.method if request else None, request.url.path if request else None, {"event_id": event_id})
    return EventResponse.model_validate(event)


@router.post("/pda-admin/events/{event_id}/feature", response_model=EventResponse)
async def feature_pda_event(
    event_id: int,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    event = db.query(PdaItem).filter(PdaItem.id == event_id, PdaItem.type == "event").first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")

    event.is_featured = True
    db.commit()
    db.refresh(event)
    log_admin_action(db, admin, "Feature PDA event", request.method if request else None, request.url.path if request else None, {"event_id": event_id})
    return EventResponse.model_validate(event)


@router.delete("/pda-admin/events/{event_id}")
async def delete_pda_event(
    event_id: int,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    event = db.query(PdaItem).filter(PdaItem.id == event_id, PdaItem.type == "event").first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    db.delete(event)
    db.commit()
    log_admin_action(db, admin, "Delete PDA event", request.method if request else None, request.url.path if request else None, {"event_id": event_id})
    return {"message": "Event deleted successfully"}


@router.get("/pda-admin/team", response_model=List[PdaTeamResponse])
async def list_team_members(
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    members = db.query(PdaTeam).order_by(PdaTeam.team.asc().nullslast(), PdaTeam.name.asc()).all()
    return [PdaTeamResponse.model_validate(m) for m in members]


@router.post("/pda-admin/team", response_model=PdaTeamResponse)
async def create_team_member(
    member_data: PdaTeamCreate,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    new_member = PdaTeam(**member_data.model_dump())
    db.add(new_member)
    db.commit()
    db.refresh(new_member)
    log_admin_action(db, admin, "Create team member", request.method if request else None, request.url.path if request else None, {"member_id": new_member.id})
    return PdaTeamResponse.model_validate(new_member)


@router.put("/pda-admin/team/{member_id}", response_model=PdaTeamResponse)
async def update_team_member(
    member_id: int,
    member_data: PdaTeamUpdate,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    member = db.query(PdaTeam).filter(PdaTeam.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")

    for field, value in member_data.model_dump(exclude_unset=True).items():
        setattr(member, field, value)

    db.commit()
    db.refresh(member)
    log_admin_action(db, admin, "Update team member", request.method if request else None, request.url.path if request else None, {"member_id": member_id})
    return PdaTeamResponse.model_validate(member)


@router.delete("/pda-admin/team/{member_id}")
async def delete_team_member(
    member_id: int,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    member = db.query(PdaTeam).filter(PdaTeam.id == member_id).first()
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team member not found")
    db.delete(member)
    db.commit()
    log_admin_action(db, admin, "Delete team member", request.method if request else None, request.url.path if request else None, {"member_id": member_id})
    return {"message": "Team member deleted successfully"}


@router.get("/pda-admin/team/export")
async def export_team_members(
    format: str = "csv",
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db)
):
    members = db.query(PdaTeam).order_by(PdaTeam.team.asc().nullslast(), PdaTeam.name.asc()).all()
    if format == "xlsx":
        wb = Workbook()
        ws = wb.active
        ws.append(["Name", "Regno", "Team", "Designation", "Email", "Phone"])
        for m in members:
            ws.append([m.name, m.regno, m.team, m.designation, m.email, m.phno])
        stream = io.BytesIO()
        wb.save(stream)
        stream.seek(0)
        headers = {"Content-Disposition": "attachment; filename=team.xlsx"}
        return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers)

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Regno", "Team", "Designation", "Email", "Phone"])
    for m in members:
        writer.writerow([m.name, m.regno, m.team, m.designation, m.email, m.phno])
    headers = {"Content-Disposition": "attachment; filename=team.csv"}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.post("/pda-admin/gallery", response_model=PdaGalleryResponse)
async def create_gallery_item(
    gallery_data: PdaGalleryCreate,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    new_item = PdaGallery(**gallery_data.model_dump())
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    log_admin_action(db, admin, "Create gallery item", request.method if request else None, request.url.path if request else None, {"gallery_id": new_item.id})
    return PdaGalleryResponse.model_validate(new_item)


@router.put("/pda-admin/gallery/{item_id}", response_model=PdaGalleryResponse)
async def update_gallery_item(
    item_id: int,
    gallery_data: PdaGalleryUpdate,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    item = db.query(PdaGallery).filter(PdaGallery.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery item not found")

    for field, value in gallery_data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    db.commit()
    db.refresh(item)
    log_admin_action(db, admin, "Update gallery item", request.method if request else None, request.url.path if request else None, {"gallery_id": item_id})
    return PdaGalleryResponse.model_validate(item)


@router.delete("/pda-admin/gallery/{item_id}")
async def delete_gallery_item(
    item_id: int,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    item = db.query(PdaGallery).filter(PdaGallery.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gallery item not found")
    db.delete(item)
    db.commit()
    log_admin_action(db, admin, "Delete gallery item", request.method if request else None, request.url.path if request else None, {"gallery_id": item_id})
    return {"message": "Gallery item deleted successfully"}


@router.post("/pda-admin/posters")
async def upload_pda_poster(
    file: UploadFile = File(...),
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    allowed_types = ["image/png", "image/jpeg", "image/webp"]
    url = _upload_to_s3(file, "posters", allowed_types=allowed_types)
    log_admin_action(db, admin, "Upload PDA poster", request.method if request else None, request.url.path if request else None, {"file": file.filename})
    return {"url": url}


@router.post("/pda-admin/posters/presign", response_model=PresignResponse)
async def presign_pda_poster(
    payload: PresignRequest,
    admin: PdaUser = Depends(require_pda_home_admin)
):
    return _generate_presigned_put_url(
        "posters",
        payload.filename,
        payload.content_type,
        allowed_types=["image/png", "image/jpeg", "image/webp"]
    )


@router.post("/pda-admin/gallery-uploads")
async def upload_pda_gallery_image(
    file: UploadFile = File(...),
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
    request: Request = None
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    allowed_types = ["image/png", "image/jpeg", "image/webp"]
    url = _upload_to_s3(file, "gallery", allowed_types=allowed_types)
    log_admin_action(db, admin, "Upload gallery image", request.method if request else None, request.url.path if request else None, {"file": file.filename})
    return {"url": url}


@router.post("/pda-admin/gallery-uploads/presign", response_model=PresignResponse)
async def presign_pda_gallery_image(
    payload: PresignRequest,
    admin: PdaUser = Depends(require_pda_home_admin)
):
    return _generate_presigned_put_url(
        "gallery",
        payload.filename,
        payload.content_type,
        allowed_types=["image/png", "image/jpeg", "image/webp"]
    )


@router.post("/pda-admin/team-uploads")
async def upload_pda_team_image(
    file: UploadFile = File(...),
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
    request: Request = None
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    allowed_types = ["image/png", "image/jpeg", "image/webp"]
    url = _upload_to_s3(file, "team", allowed_types=allowed_types)
    log_admin_action(db, admin, "Upload team image", request.method if request else None, request.url.path if request else None, {"file": file.filename})
    return {"url": url}


@router.post("/pda-admin/team-uploads/presign", response_model=PresignResponse)
async def presign_pda_team_image(
    payload: PresignRequest,
    admin: PdaUser = Depends(require_superadmin)
):
    return _generate_presigned_put_url(
        "team",
        payload.filename,
        payload.content_type,
        allowed_types=["image/png", "image/jpeg", "image/webp"]
    )
