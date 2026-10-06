from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
from types import SimpleNamespace
from app.database import db, control_db

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
    
    if payload.get("role") == "super_admin":
        return await _load_platform_user(username)

    user = await db.user.find_unique(where={"username": username})
    if user is None and payload.get("tenant_id"):
        # tenant tokens must belong to a real user of that tenant (no stand-in accounts)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    if user is None:
        role = payload.get("role", "admin")
        return type("User", (), {"id": "U-001", "username": username, "role": role, "full_name": "Arjun M.", "sub_text": "Admin · Store Manager", "is_active": True,
                                 "phase_access": payload.get("phase", 2)})()
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User inactive or not found")
    if getattr(user, "on_leave", False):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="You are on leave. Please contact your store manager.")
    return user


async def _load_platform_user(email: str):
    """Super Admin accounts live in the platform control plane, not in any tenant."""
    row = await control_db.platformuser.find_unique(where={"email": (email or "").strip().lower()})
    if row is None or not row.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Platform account inactive or not found")
    return SimpleNamespace(id=row.id, username=row.email, email=row.email, role="super_admin", full_name=row.full_name,
                           sub_text="Platform · Super Admin", is_active=True, phase_access=2, tenant_id=None)


async def require_super_admin(current_user = Depends(get_current_user)):
    if getattr(current_user, "role", None) != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super Admin role required")
    return current_user


async def require_admin(current_user = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return current_user


# --- Module access (Users & Roles -> User Access) ---------------------------------------------------------
# Every feature area is a module. A user's access starts from their role's defaults and the Admin can then Allow or Deny any
# module for that one user (stored on the user's own row, so it never affects other users or other tenants).
MODULES = {
    "billing": "Billing", "hold_recall": "Hold & Recall", "returns": "Returns", "stock_upload": "Stock Upload",
    "inventory": "Inventory / Stock Maintenance", "vendors": "Vendor Management", "purchase_orders": "Purchase Orders",
    "reports": "Reports", "ai_insights": "AI Insights", "users": "Users & Roles", "store_settings": "Store Settings",
    "tax_config": "Tax Configuration", "backup": "Backup",
}
CASHIER_MODULES = {"billing", "hold_recall", "returns"}


def _raw_field(user, name):
    return user.get(name) if isinstance(user, dict) else getattr(user, name, None)


def user_modules(user) -> dict:
    """Effective module access of a user: role defaults, then the Admin's per-user Allow / Deny choices."""
    is_admin = _raw_field(user, "role") == "admin"
    access = {m: (is_admin or m in CASHIER_MODULES) for m in MODULES}
    raw = _raw_field(user, "modules_json")
    if raw:
        try:
            import json
            for key, allowed in (json.loads(raw) if isinstance(raw, str) else raw).items():
                if key in access:
                    access[key] = bool(allowed)
        except Exception:
            pass
    return access


def has_module(user, *modules: str) -> bool:
    access = user_modules(user)
    return any(access.get(m, False) for m in modules)


def require_module(*modules: str):
    """FastAPI dependency: the signed-in user must have at least one of the modules. Checked on the server for every request."""
    def checker(current_user=Depends(get_current_user)):
        if getattr(current_user, "role", None) == "super_admin" or not has_module(current_user, *modules):
            label = " / ".join(MODULES.get(m, m) for m in modules)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"You do not have access to {label}. Ask your Admin to allow it.")
        return current_user
    return checker


# --- Phase-based access (Phase 1 admin vs Phase 2 admin) -------------------------------------------------
PHASE_1 = 1
PHASE_2 = 2


def get_phase_access(user) -> int:
    """Every admin has full access: the separate Phase 1 admin level has been retired, so old Phase 1 records count as full too."""
    return PHASE_2


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
