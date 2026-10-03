from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
from app.database import db

pwd_context = CryptContext(schemes=["pbkdf2_sha256", "bcrypt"], deprecated="auto")
security_bearer = HTTPBearer(auto_error=False)

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    try:
        return pwd_context.verify(str(plain_pin)[:72], hashed_pin)
    except Exception:
        return False

def get_pin_hash(pin: str) -> str:
    return pwd_context.hash(str(pin)[:72])

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
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
    if user is None:
        role = payload.get("role", "admin")
        return type("User", (), {"id": "U-001", "username": username, "role": role, "full_name": "Arjun M.", "sub_text": "Admin · Store Manager", "is_active": True,
                                 "phase_access": payload.get("phase", 2)})()
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")
    if getattr(user, "on_leave", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="You are on leave. Please contact your store manager.")
    return user


async def require_admin(current_user = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user


# --- Phase-based access (Phase 1 admin vs Phase 2 admin) -------------------------------------------------
PHASE_1 = 1
PHASE_2 = 2


def get_phase_access(user) -> int:
    """Access level of a user record (Prisma model, dict or token stand-in). Anything unset means full access (Phase 2)."""
    value = user.get("phase_access") if isinstance(user, dict) else getattr(user, "phase_access", None)
    return PHASE_1 if value == PHASE_1 else PHASE_2


async def require_phase2(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
    current_user=Depends(get_current_user),
):
    """Guards every Phase 2 API. Phase 1 admins (and anonymous callers) are rejected; Phase 2 admins pass untouched."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required",
                            headers={"WWW-Authenticate": "Bearer"})
    if get_phase_access(current_user) < PHASE_2:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Phase 2 access required — your account is limited to Phase 1 features")
    return current_user
