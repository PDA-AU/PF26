import os
from io import BytesIO
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import PersohubCommunity, PersohubPost
from persohub_schemas import (
    PersohubMultipartAbortRequest,
    PersohubMultipartCompleteRequest,
    PersohubMultipartCompleteResponse,
    PersohubMultipartInitRequest,
    PersohubMultipartInitResponse,
    PersohubMultipartPartUrlRequest,
    PersohubMultipartPartUrlResponse,
    PersohubPdfPreviewGenerateRequest,
    PersohubPdfPreviewGenerateResponse,
    PersohubPostCreateRequest,
    PersohubPostResponse,
    PersohubPostUpdateRequest,
    PersohubUploadPresignRequest,
    PersohubUploadPresignResponse,
)
from persohub_service import generate_unique_post_slug
from routers.persohub_shared import (
    build_post_response,
    replace_post_attachments,
    sync_post_tags_and_mentions,
)
from security import require_persohub_community
from utils import (
    S3_BUCKET_NAME,
    S3_CLIENT,
    _build_s3_url,
    _extract_s3_key_from_url,
    _generate_presigned_put_url,
)

try:
    import pypdfium2 as pdfium
except Exception:  # pragma: no cover
    pdfium = None

router = APIRouter()

MAX_SINGLE_UPLOAD_BYTES = 100 * 1024 * 1024
PART_SIZE = 10 * 1024 * 1024
PDF_PREVIEW_MAX_PAGES = 20
PDF_PREVIEW_RENDER_SCALE = 1.5


def _validate_content_type(content_type: str) -> None:
    allowed_exact = {
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/json",
        "application/xml",
    }
    if (
        content_type in allowed_exact
        or content_type.startswith("image/")
        or content_type.startswith("video/")
        or content_type.startswith("audio/")
        or content_type.startswith("text/")
    ):
        return
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported content type")


def _render_pdf_preview_images(pdf_bytes: bytes, max_pages: int) -> List[bytes]:
    if not pdfium:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="PDF preview dependency missing (install pypdfium2)",
        )
    try:
        doc = pdfium.PdfDocument(pdf_bytes)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid PDF file") from exc

    page_count = len(doc)
    target_pages = min(max_pages, PDF_PREVIEW_MAX_PAGES, page_count)
    images: List[bytes] = []

    for idx in range(target_pages):
        page = doc[idx]
        bitmap = None
        pil_image = None
        output = BytesIO()
        try:
            bitmap = page.render(scale=PDF_PREVIEW_RENDER_SCALE)
            pil_image = bitmap.to_pil()
            pil_image.save(output, format="WEBP", quality=84, method=6)
            images.append(output.getvalue())
        finally:
            output.close()
            if pil_image is not None:
                try:
                    pil_image.close()
                except Exception:
                    pass
            if bitmap is not None and hasattr(bitmap, "close"):
                try:
                    bitmap.close()
                except Exception:
                    pass
            if hasattr(page, "close"):
                try:
                    page.close()
                except Exception:
                    pass
    if hasattr(doc, "close"):
        doc.close()
    return images


@router.post("/persohub/community/posts", response_model=PersohubPostResponse)
def create_community_post(
    payload: PersohubPostCreateRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    post = PersohubPost(
        community_id=community.id,
        admin_id=community.admin_id,
        slug_token=generate_unique_post_slug(db),
        description=payload.description,
    )
    db.add(post)
    db.flush()

    replace_post_attachments(db, post.id, payload.attachments)
    sync_post_tags_and_mentions(db, post, payload.mentions)

    db.commit()
    db.refresh(post)
    return build_post_response(db, post, current_user_id=community.admin_id)


@router.put("/persohub/community/posts/{slug_token}", response_model=PersohubPostResponse)
def update_community_post(
    slug_token: str,
    payload: PersohubPostUpdateRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    post = db.query(PersohubPost).filter(PersohubPost.slug_token == slug_token).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.community_id != community.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit other community posts")

    if payload.description is not None:
        post.description = payload.description
    if payload.attachments is not None:
        replace_post_attachments(db, post.id, payload.attachments)
    sync_post_tags_and_mentions(db, post, payload.mentions)

    db.commit()
    db.refresh(post)
    return build_post_response(db, post, current_user_id=community.admin_id)


@router.delete("/persohub/community/posts/{slug_token}")
def delete_community_post(
    slug_token: str,
    community: PersohubCommunity = Depends(require_persohub_community),
    db: Session = Depends(get_db),
):
    post = db.query(PersohubPost).filter(PersohubPost.slug_token == slug_token).first()
    if not post:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Post not found")
    if post.community_id != community.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete other community posts")

    db.delete(post)
    db.commit()
    return {"status": "ok"}


@router.post("/persohub/community/uploads/presign", response_model=PersohubUploadPresignResponse)
def presign_single_upload(
    payload: PersohubUploadPresignRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
):
    if payload.size_bytes > MAX_SINGLE_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File exceeds 100MB. Use multipart upload endpoints.",
        )
    _validate_content_type(payload.content_type)

    ext = Path(payload.filename).suffix.lower()
    filename = f"{community.profile_id}_{os.urandom(8).hex()}{ext}"
    presign = _generate_presigned_put_url(
        key_prefix=f"persohub/community/{community.profile_id}",
        filename=filename,
        content_type=payload.content_type,
    )
    return PersohubUploadPresignResponse(
        upload_mode="single",
        upload_url=presign["upload_url"],
        public_url=presign["public_url"],
        key=presign["key"],
        content_type=payload.content_type,
    )


@router.post("/persohub/community/uploads/multipart/init", response_model=PersohubMultipartInitResponse)
def multipart_init(
    payload: PersohubMultipartInitRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
):
    if not S3_CLIENT or not S3_BUCKET_NAME:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")
    _validate_content_type(payload.content_type)

    ext = Path(payload.filename).suffix.lower()
    key = f"persohub/community/{community.profile_id}/{community.profile_id}_{os.urandom(8).hex()}{ext}"

    try:
        response = S3_CLIENT.create_multipart_upload(
            Bucket=S3_BUCKET_NAME,
            Key=key,
            ContentType=payload.content_type,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to initialize multipart upload") from exc

    return PersohubMultipartInitResponse(
        upload_mode="multipart",
        key=key,
        upload_id=response["UploadId"],
        public_url=_build_s3_url(key),
        part_size=PART_SIZE,
    )


@router.post("/persohub/community/uploads/multipart/part-url", response_model=PersohubMultipartPartUrlResponse)
def multipart_part_url(
    payload: PersohubMultipartPartUrlRequest,
    _: PersohubCommunity = Depends(require_persohub_community),
):
    if not S3_CLIENT or not S3_BUCKET_NAME:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")

    try:
        upload_url = S3_CLIENT.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": S3_BUCKET_NAME,
                "Key": payload.key,
                "UploadId": payload.upload_id,
                "PartNumber": payload.part_number,
            },
            ExpiresIn=900,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate part URL") from exc

    return PersohubMultipartPartUrlResponse(upload_url=upload_url, part_number=payload.part_number)


@router.post("/persohub/community/uploads/multipart/complete", response_model=PersohubMultipartCompleteResponse)
def multipart_complete(
    payload: PersohubMultipartCompleteRequest,
    _: PersohubCommunity = Depends(require_persohub_community),
):
    if not S3_CLIENT or not S3_BUCKET_NAME:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")
    if not payload.parts:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Multipart parts required")

    parts: List[dict] = [
        {"ETag": item.etag, "PartNumber": item.part_number}
        for item in sorted(payload.parts, key=lambda x: x.part_number)
    ]

    try:
        S3_CLIENT.complete_multipart_upload(
            Bucket=S3_BUCKET_NAME,
            Key=payload.key,
            UploadId=payload.upload_id,
            MultipartUpload={"Parts": parts},
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to complete multipart upload") from exc

    return PersohubMultipartCompleteResponse(public_url=_build_s3_url(payload.key), key=payload.key)


@router.post("/persohub/community/uploads/multipart/abort")
def multipart_abort(
    payload: PersohubMultipartAbortRequest,
    _: PersohubCommunity = Depends(require_persohub_community),
):
    if not S3_CLIENT or not S3_BUCKET_NAME:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")
    try:
        S3_CLIENT.abort_multipart_upload(
            Bucket=S3_BUCKET_NAME,
            Key=payload.key,
            UploadId=payload.upload_id,
        )
    except Exception:
        pass
    return {"status": "aborted"}


@router.post("/persohub/community/uploads/pdf-preview", response_model=PersohubPdfPreviewGenerateResponse)
def generate_pdf_preview_images(
    payload: PersohubPdfPreviewGenerateRequest,
    community: PersohubCommunity = Depends(require_persohub_community),
):
    if not S3_CLIENT or not S3_BUCKET_NAME:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")

    source_key = _extract_s3_key_from_url(payload.s3_url)
    if not source_key:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid S3 URL")
    expected_prefix = f"persohub/community/{community.profile_id}/"
    if not source_key.startswith(expected_prefix):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="File does not belong to this community")
    if not source_key.lower().endswith(".pdf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only PDF attachments are supported")

    try:
        source_obj = S3_CLIENT.get_object(Bucket=S3_BUCKET_NAME, Key=source_key)
        pdf_bytes = source_obj["Body"].read()
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to read source PDF") from exc

    preview_bytes = _render_pdf_preview_images(pdf_bytes, max_pages=payload.max_pages)
    if not preview_bytes:
        return PersohubPdfPreviewGenerateResponse(preview_image_urls=[], pages_generated=0)

    source_stem = Path(source_key).stem
    preview_urls: List[str] = []
    for idx, image_bytes in enumerate(preview_bytes, start=1):
        preview_key = f"persohub/community/{community.profile_id}/previews/{source_stem}/page_{idx:03d}.webp"
        try:
            S3_CLIENT.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=preview_key,
                Body=image_bytes,
                ContentType="image/webp",
                CacheControl="public, max-age=31536000, immutable",
            )
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to upload preview image") from exc
        preview_urls.append(_build_s3_url(preview_key))

    return PersohubPdfPreviewGenerateResponse(
        preview_image_urls=preview_urls,
        pages_generated=len(preview_urls),
    )
