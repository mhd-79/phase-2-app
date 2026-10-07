from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import Depends, HTTPException, Request, status
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
MODULE_GROUPS = [
    ("Billing", {"billing": "Billing", "hold_recall": "Hold & Recall", "returns": "Returns"}),
    ("Inventory", {"items_stock": "Items & Stock", "stock_upload": "Stock Upload"}),
    ("Procurement", {"vendors": "Vendors", "purchase_orders": "Purchase Orders", "purchase_returns": "Purchase Returns"}),
    ("Stock Maintenance", {"stock_adjustment": "Stock Adjustment", "batch_expiry": "Batch & Expiry", "reorder_alerts": "Reorder Alerts",
                           "physical_audit": "Physical Audit"}),
    ("Insights", {"reports": "Reports", "ai_insights": "AI Insights"}),
    ("Administration", {"discounts": "Discounts", "tax_config": "Tax Configuration", "users": "Users & Roles", "store_settings": "Store Settings"}),
]
MODULES = {key: label for _, items in MODULE_GROUPS for key, label in items.items()}
# keys saved by an earlier version of this screen expand to the modules they used to cover
_LEGACY_KEYS = {"inventory": ("items_stock", "stock_adjustment", "batch_expiry", "reorder_alerts", "physical_audit"), "backup": ("store_settings",)}
CASHIER_MODULES = {"billing", "hold_recall", "returns"}


def _raw_field(user, name):
    return user.get(name) if isinstance(user, dict) else getattr(user, name, None)


ACTIONS = ("view", "create", "edit", "delete")
ACTION_LABELS = {"view": "view", "create": "create in", "edit": "edit in", "delete": "delete from"}
# POST requests that only read (calculate a total, preview an upload, check a PIN) need View, not Create
READ_ONLY_POSTS = ("/calculate-totals", "/upload/preview", "/approve-discount", "/email")


def user_permissions(user) -> dict:
    """What a user may do in each module: {module: {view, create, edit, delete}}.
    Role defaults give every action of an allowed module; the Admin's per-user choices then refine them. A module saved by an earlier
    version as a single on/off value means all four actions. Create / Edit / Delete only count while View is on."""
    is_admin = _raw_field(user, "role") == "admin"
    full = {a: True for a in ACTIONS}
    none = {a: False for a in ACTIONS}
    perms = {m: dict(full if (is_admin or m in CASHIER_MODULES) else none) for m in MODULES}
    raw = _raw_field(user, "modules_json")
    if raw:
        try:
            import json
            saved = json.loads(raw) if isinstance(raw, str) else raw
            for old, new_keys in _LEGACY_KEYS.items():
                if old in saved:
                    for k in new_keys:
                        saved.setdefault(k, saved[old] if old != "backup" else perms["store_settings"]["view"])
            for key, value in saved.items():
                if key not in perms:
                    continue
                if isinstance(value, dict):
                    perms[key] = {a: bool(value.get(a, False)) for a in ACTIONS}
                else:
                    perms[key] = dict(full if value else none)
                if not perms[key]["view"]:
                    perms[key] = dict(none)
        except Exception:
            pass
    return perms


def user_modules(user) -> dict:
    """Which modules a user may open (the View permission of each)."""
    return {m: p["view"] for m, p in user_permissions(user).items()}


def has_module(user, *modules: str, action: str = "view") -> bool:
    perms = user_permissions(user)
    return any(perms.get(m, {}).get(action, False) for m in modules)


def action_for_request(request) -> str:
    """The permission a request needs: GET = View, POST on a collection = Create, PUT / PATCH or POST on an existing record
    (e.g. /purchase-orders/{id}/approve) = Edit, DELETE = Delete."""
    if request is None or request.method in ("GET", "HEAD", "OPTIONS"):
        return "view"
    if request.method == "DELETE":
        return "delete"
    if request.method in ("PUT", "PATCH"):
        return "edit"
    route = request.scope.get("route")
    path = getattr(route, "path", None) or request.url.path
    if any(path.endswith(suffix) for suffix in READ_ONLY_POSTS):
        return "view"
    return "edit" if "{" in path else "create"


def require_module(*modules: str):
    """FastAPI dependency: the signed-in user must hold the permission this request needs (View / Create / Edit / Delete, by HTTP method)
    on at least one of the modules. Checked on the server for every request."""
    def checker(current_user=Depends(get_current_user), request: Request = None):
        action = action_for_request(request)
        if getattr(current_user, "role", None) == "super_admin" or not has_module(current_user, *modules, action=action):
            label = " / ".join(MODULES.get(m, m) for m in modules)
            if action != "view" and has_module(current_user, *modules):
                detail = f"You do not have permission to {ACTION_LABELS[action]} {label}. Ask your Admin to allow it."
            else:
                detail = f"You do not have access to {label}. Ask your Admin to allow it."
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)
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
