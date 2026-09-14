from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
from app.database import db

import hashlib

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
security_bearer = HTTPBearer(auto_error=False)

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    if not hashed_pin:
        return False
    if hashed_pin.startswith("$pbkdf2"):
        return pwd_context.verify(plain_pin, hashed_pin)
    elif hashed_pin.startswith("$2"):
        try:
            return pwd_context.verify(plain_pin, hashed_pin)
        except Exception:
            return False
    # Fallback comparison for plain or sha256 PINs
    sha = hashlib.sha256(plain_pin.encode("utf-8")).hexdigest()
    return plain_pin == hashed_pin or sha == hashed_pin

def get_pin_hash(pin: str) -> str:
    return pwd_context.hash(pin)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer)):
    if not credentials:
        # For prototype fallback / local dev authorization header optional
        user = await db.user.find_first(where={"username": "priya.k"})
        if user:
            return user
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user = await db.user.find_unique(where={"username": username})
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")
    return user

async def require_admin(current_user = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user
