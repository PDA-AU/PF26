import os
import uuid
from pathlib import Path
from typing import Optional, List
from fastapi import HTTPException, status, UploadFile
from sqlalchemy.orm import Session
from models import AdminLog, PdaUser
import boto3

AWS_REGION = os.environ.get("AWS_REGION")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME")
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY") or os.environ.get("AWS_ACCESS_KEY_ID")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY")

S3_CLIENT = None
if AWS_REGION and S3_BUCKET_NAME and S3_ACCESS_KEY and S3_SECRET_KEY:
    S3_CLIENT = boto3.client(
        "s3",
        region_name=AWS_REGION,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY
    )


def log_admin_action(db: Session, admin: PdaUser, action: str, method: Optional[str] = None, path: Optional[str] = None, meta: Optional[dict] = None):
    db.add(AdminLog(
        admin_id=admin.id if admin else None,
        admin_register_number=admin.regno if admin else "",
        admin_name=admin.name if admin else "",
        action=action,
        method=method,
        path=path,
        meta=meta
    ))
    db.commit()


def _build_s3_url(key: str) -> str:
    if not S3_BUCKET_NAME or not AWS_REGION:
        raise RuntimeError("S3 configuration missing")
    return f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{key}"


def _upload_to_s3(file: UploadFile, key_prefix: str, allowed_types: Optional[List[str]] = None) -> str:
    if not S3_CLIENT or not S3_BUCKET_NAME or not AWS_REGION:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")
    if not file.content_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing file content type")
    if allowed_types and file.content_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")

    extension = Path(file.filename or "").suffix.lower()
    unique_name = f"{uuid.uuid4().hex}{extension}"
    key = f"{key_prefix.rstrip('/')}/{unique_name}"

    try:
        S3_CLIENT.upload_fileobj(
            file.file,
            S3_BUCKET_NAME,
            key,
            ExtraArgs={"ContentType": file.content_type}
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed") from exc

    return _build_s3_url(key)


def _upload_bytes_to_s3(data: bytes, key_prefix: str, filename: str, content_type: str = "application/octet-stream") -> str:
    if not S3_CLIENT or not S3_BUCKET_NAME or not AWS_REGION:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")

    extension = Path(filename).suffix.lower()
    unique_name = f"{uuid.uuid4().hex}{extension}"
    key = f"{key_prefix.rstrip('/')}/{unique_name}"

    try:
        S3_CLIENT.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=key,
            Body=data,
            ContentType=content_type
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Upload failed") from exc

    return _build_s3_url(key)
