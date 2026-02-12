import os
from datetime import datetime, timedelta
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from email_tokens import generate_token, hash_token, VERIFY_TOKEN_TTL_SECONDS, RESET_TOKEN_TTL_SECONDS
from email_templates import build_verification_email, build_reset_email, build_recruitment_review_email
from emailer import send_email
from time_utils import now_tz, ensure_timezone

FRONTEND_BASE_URL = os.environ.get("FRONTEND_BASE_URL", "")
RESEND_COOLDOWN_SECONDS = int(os.environ.get("EMAIL_RESEND_COOLDOWN_SECONDS", "300"))


def _now() -> datetime:
    return now_tz()


def _build_url(path: str, token: str) -> str:
    base = FRONTEND_BASE_URL.rstrip("/")
    return f"{base}{path}?token={token}"


def _send_verification_email(to_email: str, user_kind: str, token: str) -> None:
    path = "/verify-email"
    url = _build_url(path, token)
    subject, html, text = build_verification_email(url, validity_hours=24)
    send_email(to_email, subject, html, text)


def _send_reset_email(to_email: str, user_kind: str, token: str) -> None:
    path = "/reset-password"
    url = _build_url(path, token)
    subject, html, text = build_reset_email(url, validity_minutes=30)
    send_email(to_email, subject, html, text)


def send_recruitment_review_email(to_email: str, name: str, whatsapp_url: str) -> None:
    if not to_email or not whatsapp_url:
        return
    subject, html, text = build_recruitment_review_email(name=name, whatsapp_url=whatsapp_url)
    send_email(to_email, subject, html, text)


def issue_verification(db: Session, user, user_kind: str) -> Tuple[bool, str]:
    if not user.email:
        return False, "missing_email"

    if user.email_verification_sent_at:
        sent_at = ensure_timezone(user.email_verification_sent_at)
        delta = (now_tz() - sent_at).total_seconds()
        if delta < RESEND_COOLDOWN_SECONDS:
            return False, "cooldown"

    token = generate_token()
    user.email_verification_token_hash = hash_token(token)
    user.email_verification_expires_at = _now() + timedelta(seconds=VERIFY_TOKEN_TTL_SECONDS)
    user.email_verification_sent_at = _now()
    db.commit()

    _send_verification_email(user.email, user_kind, token)
    return True, "sent"


def verify_email_token(db: Session, model_cls, token: str) -> Optional[object]:
    if not token:
        return None
    token_hash = hash_token(token)
    now = _now()
    user = db.query(model_cls).filter(
        model_cls.email_verification_token_hash == token_hash,
        model_cls.email_verification_expires_at.isnot(None),
        model_cls.email_verification_expires_at > now
    ).first()
    if not user:
        return None

    user.email_verified_at = now
    user.email_verification_token_hash = None
    user.email_verification_expires_at = None
    db.commit()
    return user


def issue_password_reset(db: Session, user, user_kind: str) -> Tuple[bool, str]:
    if not user or not user.email:
        return False, "missing_email"

    token = generate_token()
    user.password_reset_token_hash = hash_token(token)
    user.password_reset_expires_at = _now() + timedelta(seconds=RESET_TOKEN_TTL_SECONDS)
    user.password_reset_sent_at = _now()
    db.commit()

    _send_reset_email(user.email, user_kind, token)
    return True, "sent"


def reset_password_with_token(db: Session, model_cls, token: str) -> Optional[object]:
    if not token:
        return None
    token_hash = hash_token(token)
    now = _now()
    user = db.query(model_cls).filter(
        model_cls.password_reset_token_hash == token_hash,
        model_cls.password_reset_expires_at.isnot(None),
        model_cls.password_reset_expires_at > now
    ).first()
    if not user:
        return None

    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    db.commit()
    return user
