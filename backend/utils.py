import os
import uuid
from pathlib import Path
from typing import Optional, List, Dict
from urllib.parse import unquote, urlparse
from fastapi import HTTPException, status, UploadFile
from sqlalchemy.orm import Session
from models import AdminLog, PdaUser
import boto3
from botocore.config import Config

AWS_REGION = os.environ.get("AWS_REGION")
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME")
S3_ACCESS_KEY = os.environ.get("S3_ACCESS_KEY") or os.environ.get("AWS_ACCESS_KEY_ID")
S3_SECRET_KEY = os.environ.get("S3_SECRET_KEY") or os.environ.get("AWS_SECRET_ACCESS_KEY")

S3_CLIENT = None
if AWS_REGION and S3_BUCKET_NAME and S3_ACCESS_KEY and S3_SECRET_KEY:
    s3_config = Config(signature_version="s3v4", s3={"addressing_style": "virtual"})
    S3_CLIENT = boto3.client(
        "s3",
        region_name=AWS_REGION,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com",
        config=s3_config,
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


def _extract_s3_key_from_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    try:
        parsed = urlparse(url)
        host = (parsed.netloc or "").lower()
        path = (parsed.path or "").lstrip("/")
        if not host or not path:
            return None
        if not S3_BUCKET_NAME:
            return None

        bucket = S3_BUCKET_NAME.lower()
        if host == f"{bucket}.s3.amazonaws.com" or host.startswith(f"{bucket}.s3."):
            return unquote(path)
        return None
    except Exception:
        return None


def _generate_presigned_get_url_for_key(key: str, expires_in: int = 3600) -> str:
    if not S3_CLIENT or not S3_BUCKET_NAME:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")
    try:
        return S3_CLIENT.generate_presigned_url(
            "get_object",
            Params={"Bucket": S3_BUCKET_NAME, "Key": key},
            ExpiresIn=expires_in,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create download URL") from exc


def _generate_presigned_get_url_from_s3_url(url: Optional[str], expires_in: int = 3600) -> Optional[str]:
    key = _extract_s3_key_from_url(url)
    if not key:
        return url
    return _generate_presigned_get_url_for_key(key, expires_in=expires_in)


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


def _generate_presigned_put_url(
    key_prefix: str,
    filename: str,
    content_type: str,
    allowed_types: Optional[List[str]] = None,
    expires_in: int = 600
) -> Dict[str, str]:
    if not S3_CLIENT or not S3_BUCKET_NAME or not AWS_REGION:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="S3 not configured")
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing filename")
    if not content_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing content type")
    if allowed_types and content_type not in allowed_types:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid file type")

    extension = Path(filename).suffix.lower()
    unique_name = f"{uuid.uuid4().hex}{extension}"
    key = f"{key_prefix.rstrip('/')}/{unique_name}"

    try:
        upload_url = S3_CLIENT.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": S3_BUCKET_NAME,
                "Key": key,
                "ContentType": content_type
            },
            ExpiresIn=expires_in
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create presigned URL") from exc

    return {
        "upload_url": upload_url,
        "public_url": _build_s3_url(key),
        "key": key,
        "content_type": content_type
    }
