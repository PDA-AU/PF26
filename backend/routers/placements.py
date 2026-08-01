import logging
from typing import Optional, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db, SessionLocal
from models import Placement, PdaUser, ExperienceType
from security import require_pda_user, require_pda_home_admin, require_superadmin
from utils import _generate_presigned_put_url, _extract_s3_key_from_url, S3_CLIENT, S3_BUCKET_NAME
from extractors import extract_text, DEPT_KEYWORDS, score_placements_by_query

logger = logging.getLogger(__name__)

router = APIRouter()
admin_router = APIRouter()

PLACEMENT_PAGE_SIZE_DEFAULT = 10
PLACEMENT_PAGE_SIZE_MAX = 100

ALLOWED_PLACEMENT_MIME_TYPES = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
]


# ─── Pydantic schemas ────────────────────────────────────────────────────────

class PlacementPresignRequest(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)


class PlacementCreate(BaseModel):
    s3_url: str = Field(..., min_length=1, max_length=800)
    content_type: str = Field(default="application/pdf")
    experience_type: str  # "intern" | "placement"
    company_name: Optional[str] = Field(default=None, max_length=255)
    experience_months: Optional[int] = Field(default=None, ge=0)
    alias_name: Optional[str] = Field(default=None, max_length=255)
    alias_regno: Optional[str] = Field(default=None, max_length=20)


class PlacementUpdate(BaseModel):
    experience_type: Optional[str] = None
    company_name: Optional[str] = Field(default=None, max_length=255)
    experience_months: Optional[int] = Field(default=None, ge=0)
    alias_name: Optional[str] = Field(default=None, max_length=255)
    alias_regno: Optional[str] = Field(default=None, max_length=20)


class AdminPlacementCreate(PlacementCreate):
    user_id: Optional[int] = None


class BatchPresignItem(BaseModel):
    filename: str = Field(..., min_length=1)
    content_type: str = Field(..., min_length=1)


class BatchPlacementItem(BaseModel):
    s3_url: str = Field(..., min_length=1, max_length=800)
    content_type: str = Field(default="application/pdf")
    experience_type: str
    company_name: Optional[str] = Field(default=None, max_length=255)
    experience_months: Optional[int] = Field(default=None, ge=0)
    alias_name: Optional[str] = Field(default=None, max_length=255)
    alias_regno: Optional[str] = Field(default=None, max_length=20)
    user_id: Optional[int] = None


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _resolve_default_user_id(db: Session) -> int:
    u = db.query(PdaUser).filter(PdaUser.regno == "0000000000").first()
    if not u:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Default user (0000000000) not found in system",
        )
    return u.id


def _parse_experience_type(value: str) -> ExperienceType:
    try:
        return ExperienceType(value)
    except (ValueError, KeyError):
        raise HTTPException(status_code=400, detail=f"Invalid experience_type '{value}'. Use 'intern' or 'placement'.")


def _build_placement_response(placement: Placement, user: Optional[PdaUser]) -> dict:
    content = placement.content or {}
    alias_name = content.get("alias_name") or None
    alias_regno = content.get("alias_regno") or None

    display_name = alias_name or (user.name if user else None)
    display_regno = alias_regno or (user.regno if user else None)

    batch = display_regno[:4] if display_regno and len(display_regno) >= 4 else None
    return {
        "id": placement.id,
        "user_id": placement.user_id,
        "s3_url": placement.s3_url,
        "experience_type": placement.experience_type.value if placement.experience_type else None,
        "company_name": placement.company_name,
        "experience_months": placement.experience_months,
        "created_at": placement.created_at,
        "updated_at": placement.updated_at,
        "uploader_name": display_name,
        "uploader_regno": display_regno,
        "uploader_dept": user.dept if user else None,
        "uploader_college": user.college if user else None,
        "uploader_batch": batch,
        "alias_name": alias_name,
        "alias_regno": alias_regno,
    }


def _placement_list_query(
    db: Session,
    dept: Optional[str] = None,
    batch: Optional[str] = None,
    experience_type: Optional[str] = None,
):
    q = db.query(Placement, PdaUser).outerjoin(PdaUser, Placement.user_id == PdaUser.id)
    if dept:
        q = q.filter(PdaUser.dept == dept)
    if batch:
        q = q.filter(PdaUser.regno.like(f"{batch}%"))
    if experience_type:
        et = _parse_experience_type(experience_type)
        q = q.filter(Placement.experience_type == et)
    return q


def _run_extraction(placement_id: int, s3_key: str, mime_type: str) -> None:
    if not S3_CLIENT or not S3_BUCKET_NAME:
        return
    try:
        obj = S3_CLIENT.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        file_bytes = obj["Body"].read()
        text = extract_text(file_bytes, mime_type)
        db = SessionLocal()
        try:
            row = db.query(Placement).filter(Placement.id == placement_id).first()
            if row:
                row.extracted_text = text or None
                db.commit()
        finally:
            db.close()
    except Exception:
        logger.exception("Text extraction failed for placement %s", placement_id)


def _schedule_extraction(background_tasks: BackgroundTasks, placement: Placement, content_type: str) -> None:
    s3_key = _extract_s3_key_from_url(placement.s3_url)
    if s3_key:
        background_tasks.add_task(_run_extraction, placement.id, s3_key, content_type)


# ─── User routes ─────────────────────────────────────────────────────────────

@router.get("/placements/keywords")
def get_placement_keywords():
    return {"keywords": DEPT_KEYWORDS}


@router.get("/placements/")
def list_placements(
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=PLACEMENT_PAGE_SIZE_DEFAULT, ge=1),
    dept: Optional[str] = Query(default=None),
    batch: Optional[str] = Query(default=None),
    experience_type: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    sort: Optional[str] = Query(default="newest"),
    db: Session = Depends(get_db),
):
    if page_size > PLACEMENT_PAGE_SIZE_MAX:
        raise HTTPException(status_code=400, detail=f"page_size must be <= {PLACEMENT_PAGE_SIZE_MAX}")

    base_q = _placement_list_query(db, dept=dept, batch=batch, experience_type=experience_type)

    if q and q.strip():
        all_rows = base_q.all()
        docs = [
            {
                "id": placement.id,
                "extracted_text": placement.extracted_text,
                "company_name": placement.company_name,
                "_row": (placement, user),
            }
            for placement, user in all_rows
        ]
        scored = score_placements_by_query(docs, q.strip())
        total = len(scored)
        start = (page - 1) * page_size
        paged = scored[start: start + page_size]
        rows = [d["_row"] for d in paged]
    else:
        total = int(base_q.count())
        if sort == "oldest":
            base_q = base_q.order_by(Placement.created_at.asc())
        elif sort == "company":
            base_q = base_q.order_by(Placement.company_name.asc().nullslast())
        else:
            base_q = base_q.order_by(Placement.created_at.desc())
        rows = base_q.offset((page - 1) * page_size).limit(page_size).all()

    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)
    return [_build_placement_response(p, u) for p, u in rows]


@router.post("/placements/presign")
def presign_placement_upload(
    payload: PlacementPresignRequest,
    current_user: PdaUser = Depends(require_pda_user),
):
    return _generate_presigned_put_url(
        "placements",
        payload.filename,
        payload.content_type,
        allowed_types=ALLOWED_PLACEMENT_MIME_TYPES,
    )


@router.post("/placements/", status_code=201)
def create_placement(
    payload: PlacementCreate,
    background_tasks: BackgroundTasks,
    current_user: PdaUser = Depends(require_pda_user),
    db: Session = Depends(get_db),
):
    et = _parse_experience_type(payload.experience_type)
    content = {}
    if payload.alias_name and payload.alias_name.strip():
        content["alias_name"] = payload.alias_name.strip()
    if payload.alias_regno and payload.alias_regno.strip():
        content["alias_regno"] = payload.alias_regno.strip()
    placement = Placement(
        user_id=current_user.id,
        s3_url=payload.s3_url,
        experience_type=et,
        company_name=payload.company_name or None,
        experience_months=payload.experience_months,
        content=content or None,
    )
    db.add(placement)
    db.commit()
    db.refresh(placement)
    _schedule_extraction(background_tasks, placement, payload.content_type)
    return _build_placement_response(placement, current_user)


# ─── Admin routes ─────────────────────────────────────────────────────────────

@admin_router.get("/pda-admin/placements/")
def admin_list_placements(
    response: Response,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=PLACEMENT_PAGE_SIZE_DEFAULT, ge=1),
    dept: Optional[str] = Query(default=None),
    batch: Optional[str] = Query(default=None),
    experience_type: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    sort: Optional[str] = Query(default="newest"),
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
):
    if page_size > PLACEMENT_PAGE_SIZE_MAX:
        raise HTTPException(status_code=400, detail=f"page_size must be <= {PLACEMENT_PAGE_SIZE_MAX}")

    base_q = _placement_list_query(db, dept=dept, batch=batch, experience_type=experience_type)

    if q and q.strip():
        all_rows = base_q.all()
        docs = [
            {
                "id": placement.id,
                "extracted_text": placement.extracted_text,
                "company_name": placement.company_name,
                "_row": (placement, user),
            }
            for placement, user in all_rows
        ]
        scored = score_placements_by_query(docs, q.strip())
        total = len(scored)
        start = (page - 1) * page_size
        paged = scored[start: start + page_size]
        rows = [d["_row"] for d in paged]
    else:
        total = int(base_q.count())
        if sort == "oldest":
            base_q = base_q.order_by(Placement.created_at.asc())
        elif sort == "company":
            base_q = base_q.order_by(Placement.company_name.asc().nullslast())
        else:
            base_q = base_q.order_by(Placement.created_at.desc())
        rows = base_q.offset((page - 1) * page_size).limit(page_size).all()

    response.headers["X-Total-Count"] = str(total)
    response.headers["X-Page"] = str(page)
    response.headers["X-Page-Size"] = str(page_size)

    results = []
    for p, u in rows:
        item = _build_placement_response(p, u)
        item["extracted_text_snippet"] = (p.extracted_text or "")[:300] if p.extracted_text else None
        results.append(item)
    return results


@admin_router.post("/pda-admin/placements/presign")
def admin_presign_placement(
    payload: PlacementPresignRequest,
    admin: PdaUser = Depends(require_pda_home_admin),
):
    return _generate_presigned_put_url(
        "placements",
        payload.filename,
        payload.content_type,
        allowed_types=ALLOWED_PLACEMENT_MIME_TYPES,
    )


@admin_router.post("/pda-admin/placements/batch-presign")
def admin_batch_presign_placements(
    items: List[BatchPresignItem],
    admin: PdaUser = Depends(require_superadmin),
):
    results = []
    for item in items:
        results.append(
            _generate_presigned_put_url(
                "placements",
                item.filename,
                item.content_type,
                allowed_types=ALLOWED_PLACEMENT_MIME_TYPES,
            )
        )
    return results


@admin_router.post("/pda-admin/placements/", status_code=201)
def admin_create_placement(
    payload: AdminPlacementCreate,
    background_tasks: BackgroundTasks,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
):
    et = _parse_experience_type(payload.experience_type)
    resolved_user_id = payload.user_id or _resolve_default_user_id(db)
    user = db.query(PdaUser).filter(PdaUser.id == resolved_user_id).first()
    content = {}
    if payload.alias_name and payload.alias_name.strip():
        content["alias_name"] = payload.alias_name.strip()
    if payload.alias_regno and payload.alias_regno.strip():
        content["alias_regno"] = payload.alias_regno.strip()
    placement = Placement(
        user_id=resolved_user_id,
        s3_url=payload.s3_url,
        experience_type=et,
        company_name=payload.company_name or None,
        experience_months=payload.experience_months,
        content=content or None,
    )
    db.add(placement)
    db.commit()
    db.refresh(placement)
    _schedule_extraction(background_tasks, placement, payload.content_type)
    return _build_placement_response(placement, user)


@admin_router.post("/pda-admin/placements/batch", status_code=201)
def admin_batch_create_placements(
    items: List[BatchPlacementItem],
    background_tasks: BackgroundTasks,
    admin: PdaUser = Depends(require_superadmin),
    db: Session = Depends(get_db),
):
    default_user_id: Optional[int] = None
    results = []

    for item in items:
        et = _parse_experience_type(item.experience_type)
        if item.user_id:
            resolved_user_id = item.user_id
        else:
            if default_user_id is None:
                default_user_id = _resolve_default_user_id(db)
            resolved_user_id = default_user_id

        user = db.query(PdaUser).filter(PdaUser.id == resolved_user_id).first()
        item_content = {}
        if item.alias_name and item.alias_name.strip():
            item_content["alias_name"] = item.alias_name.strip()
        if item.alias_regno and item.alias_regno.strip():
            item_content["alias_regno"] = item.alias_regno.strip()
        placement = Placement(
            user_id=resolved_user_id,
            s3_url=item.s3_url,
            experience_type=et,
            company_name=item.company_name or None,
            experience_months=item.experience_months,
            content=item_content or None,
        )
        db.add(placement)
        db.flush()
        results.append((placement, user, item.content_type))

    db.commit()
    for placement, user, ct in results:
        db.refresh(placement)
        _schedule_extraction(background_tasks, placement, ct)

    return [_build_placement_response(p, u) for p, u, _ in results]


@admin_router.put("/pda-admin/placements/{placement_id}")
def admin_update_placement(
    placement_id: int,
    payload: PlacementUpdate,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
):
    placement = db.query(Placement).filter(Placement.id == placement_id).first()
    if not placement:
        raise HTTPException(status_code=404, detail="Placement not found")

    if payload.experience_type is not None:
        placement.experience_type = _parse_experience_type(payload.experience_type)
    if payload.company_name is not None:
        placement.company_name = payload.company_name or None
    if payload.experience_months is not None:
        placement.experience_months = payload.experience_months

    # Merge alias updates into content JSONB
    if payload.alias_name is not None or payload.alias_regno is not None:
        content = dict(placement.content or {})
        if payload.alias_name is not None:
            if payload.alias_name.strip():
                content["alias_name"] = payload.alias_name.strip()
            else:
                content.pop("alias_name", None)
        if payload.alias_regno is not None:
            if payload.alias_regno.strip():
                content["alias_regno"] = payload.alias_regno.strip()
            else:
                content.pop("alias_regno", None)
        placement.content = content or None

    db.commit()
    db.refresh(placement)
    user = db.query(PdaUser).filter(PdaUser.id == placement.user_id).first() if placement.user_id else None
    return _build_placement_response(placement, user)


@admin_router.delete("/pda-admin/placements/{placement_id}", status_code=204)
def admin_delete_placement(
    placement_id: int,
    admin: PdaUser = Depends(require_pda_home_admin),
    db: Session = Depends(get_db),
):
    placement = db.query(Placement).filter(Placement.id == placement_id).first()
    if not placement:
        raise HTTPException(status_code=404, detail="Placement not found")
    db.delete(placement)
    db.commit()
