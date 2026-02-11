from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import bcrypt
import hashlib
import os
from dotenv import load_dotenv
from pathlib import Path
from database import get_db
from models import PdaUser

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

def _load_jwt_secret() -> str:
    secret = os.environ.get('JWT_SECRET_KEY')
    if not secret:
        raise RuntimeError('JWT_SECRET_KEY is required and must be set in environment')
    weak_values = {
        'default_secret_key',
        'changeme',
        'change_me',
        'secret',
        'jwt_secret',
        'password',
        'admin123',
    }
    if len(secret) < 32 or secret.strip().lower() in weak_values:
        raise RuntimeError('JWT_SECRET_KEY is too weak; use a random secret with at least 32 characters')
    return secret


SECRET_KEY = _load_jwt_secret()
ALGORITHM = os.environ.get('JWT_ALGORITHM', 'HS256')
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get('ACCESS_TOKEN_EXPIRE_MINUTES', 30))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get('REFRESH_TOKEN_EXPIRE_DAYS', 7))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        pw_bytes = plain_password.encode('utf-8')
    except Exception:
        pw_bytes = str(plain_password).encode('utf-8')
    digest = hashlib.sha256(pw_bytes).digest()
    try:
        return bcrypt.checkpw(digest, hashed_password.encode('utf-8'))
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    # Always pre-hash password with SHA-256, then bcrypt the digest
    try:
        pw_bytes = password.encode('utf-8')
    except Exception:
        pw_bytes = str(password).encode('utf-8')
    digest = hashlib.sha256(pw_bytes).digest()
    hashed = bcrypt.hashpw(digest, bcrypt.gensalt())
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def create_refresh_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_pda_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> PdaUser:
    token = credentials.credentials
    payload = decode_token(token)

    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token type"
        )

    if payload.get("user_type") != "pda":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token user type"
        )

    regno: str = payload.get("sub")
    if regno is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials"
        )

    user = db.query(PdaUser).filter(PdaUser.regno == regno).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user


def generate_referral_code() -> str:
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=5))
