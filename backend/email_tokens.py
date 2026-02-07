import hashlib
import secrets

VERIFY_TOKEN_TTL_SECONDS = 24 * 60 * 60
RESET_TOKEN_TTL_SECONDS = 30 * 60


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
