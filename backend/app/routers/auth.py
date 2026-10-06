import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request, status
from pydantic import BaseModel, Field
from app.schemas import LoginRequest, TokenResponse, UserSchema, PinVerifyRequest, ForgotPinRequest, ResetPinRequest, SwitchCounterRequest
from app.security import verify_pin, get_pin_hash, create_access_token, get_current_user, require_admin, require_module, user_modules, get_phase_access, security_bearer
from app.database import db, current_tenant_schema
from app.tenant_scoped import TenantList, TenantDict
from seed import DEMO_USERS
from app import platform_audit, platform_service
from app.throttle import login_limiter, forgot_limiter

router = APIRouter(prefix="/auth", tags=["Auth"])

# In-memory fallback user store (seeded with DEMO_USERS) when database is in dummy/disconnected mode
_FALLBACK_USERS = TenantDict()

def _init_fallback_users():
    if current_tenant_schema.get() is not None:      # demo accounts exist only in the original store
        return
    for u in DEMO_USERS:
        if u["username"] not in _FALLBACK_USERS:
            _FALLBACK_USERS[u["username"]] = {
                "id": f"U-{u['username']}",
                "username": u["username"],
                "pin_hash": get_pin_hash(u["pin"]),
                "role": u["role"],
                "full_name": u["full_name"],
                "sub_text": u["sub_text"],
                "is_active": u["is_active"],
                "auto_lock": "15 min" if u["role"] == "admin" else "2 min",
                "schedule_json": None,
                "phase_access": u.get("phase_access", 2)
            }

_init_fallback_users()
_FALLBACK_AUDIT_LOGS = TenantList()

async def _get_user_by_username(username: str):
    _init_fallback_users()
    if db.is_connected():
        try:
            return await db.user.find_unique(where={"username": username})
        except Exception:
            pass
    return _FALLBACK_USERS.get(username)

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request):
    # Business owners and Super Admins: email + password (throttled per client and email)
    if req.email or req.password:
        if not (req.email and req.password):
            raise HTTPException(status_code=422, detail="Enter your email and password.")
        key = f"pw:{platform_audit.client_ip(request)}:{req.email.strip().lower()}"
        login_limiter.hit(key)
        data = await platform_service.login_with_password(req.email, req.password)
        login_limiter.reset(key)
        return TokenResponse(**data)
    if not req.username or req.pin is None:
        raise HTTPException(status_code=422, detail="Enter your username and PIN.")
    # 1. Enforce login against actual stored user credentials (default store, unchanged)
    user = await _get_user_by_username(req.username.strip())
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or PIN"
        )
    
    # Check if user is active
    is_active = getattr(user, 'is_active', None)
    if is_active is None and isinstance(user, dict):
        is_active = user.get("is_active", True)
    if not is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is disabled or inactive. Please contact your store manager."
        )
    
    # On leave: no sign-in until an admin marks the user as returned
    on_leave = user.get("on_leave", False) if isinstance(user, dict) else getattr(user, "on_leave", False)
    if on_leave:
        reason = user.get("leave_reason") if isinstance(user, dict) else getattr(user, "leave_reason", None)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="You are on leave" + (f": {reason}" if reason else "") + ". Please contact your store manager."
        )

    # 2. Reject every incorrect PIN/password
    pin_hash = getattr(user, 'pin_hash', None)
    if pin_hash is None and isinstance(user, dict):
        pin_hash = user.get("pin_hash")
        
    if not pin_hash or not verify_pin(req.pin, pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or PIN"
        )
        
    username = getattr(user, 'username', req.username)
    role = getattr(user, 'role', 'cashier')
    full_name = getattr(user, 'full_name', username)
    sub_text = getattr(user, 'sub_text', '')
    auto_lock = getattr(user, 'auto_lock', '2 min')
    if isinstance(user, dict):
        username = user.get("username", req.username)
        role = user.get("role", "cashier")
        full_name = user.get("full_name", username)
        sub_text = user.get("sub_text", "")
        auto_lock = user.get("auto_lock", "2 min")
        
    phase_access = get_phase_access(user)
    token = create_access_token({"sub": username, "role": role, "phase": phase_access})
    return TokenResponse(
        access_token=token,
        username=username,
        role=role,
        full_name=full_name,
        sub_text=sub_text,
        auto_lock=auto_lock or "2 min",
        phase_access=phase_access,
        active_counter=user.get("active_counter") if isinstance(user, dict) else getattr(user, "active_counter", None),
        modules=user_modules(user)
    )

@router.post("/verify-pin")
async def verify_user_pin(req: PinVerifyRequest, user = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthenticated")
    
    pin_hash = getattr(user, 'pin_hash', None)
    if pin_hash is None and isinstance(user, dict):
        pin_hash = user.get("pin_hash")
    
    if not pin_hash:
        # Fetch fresh user
        u = await _get_user_by_username(user.username if hasattr(user, 'username') else user.get("username"))
        if u:
            pin_hash = getattr(u, 'pin_hash', None) if not isinstance(u, dict) else u.get("pin_hash")
            
    if pin_hash and verify_pin(req.pin, pin_hash):
        return {"valid": True, "username": getattr(user, 'username', 'user')}

    # business owners sign in with a password (their PIN is unset): accept it to unlock the idle screen
    password_hash = getattr(user, 'password_hash', None)
    if password_hash is None:
        fresh = await _get_user_by_username(user.username if hasattr(user, 'username') else None)
        password_hash = getattr(fresh, 'password_hash', None) if fresh and not isinstance(fresh, dict) else None
    if password_hash and platform_service.verify_password(req.pin, password_hash):
        return {"valid": True, "username": getattr(user, 'username', 'user')}
    
    return {"valid": False, "username": getattr(user, 'username', 'user')}

@router.post("/forgot-pin")
async def request_forgot_pin(req: ForgotPinRequest):
    """
    Submits a 'Forgot PIN/Password?' request for a user, notifying Admin and logging to AuditLog.
    """
    username = req.username.strip()
    user = await _get_user_by_username(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User '{username}' does not exist in the system."
        )
    
    now_iso = datetime.now(timezone.utc).isoformat()
    details = {
        "status": "PENDING",
        "requested_at": now_iso,
        "notes": req.notes or "Forgot PIN requested from Login UI"
    }
    
    if db.is_connected():
        try:
            await db.auditlog.create(data={
                "username": username,
                "action": "FORGOT_PIN_REQUESTED",
                "details_json": json.dumps(details)
            })
        except Exception:
            _FALLBACK_AUDIT_LOGS.append({
                "id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}",
                "username": username,
                "action": "FORGOT_PIN_REQUESTED",
                "details_json": json.dumps(details),
                "timestamp": now_iso
            })
    else:
        _FALLBACK_AUDIT_LOGS.append({
            "id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}",
            "username": username,
            "action": "FORGOT_PIN_REQUESTED",
            "details_json": json.dumps(details),
            "timestamp": now_iso
        })
        
    return {
        "success": True,
        "message": f"PIN reset request for '{username}' submitted successfully. Store Admin has been notified.",
        "username": username
    }

@router.get("/pin-reset-requests")
async def list_pin_reset_requests(admin = Depends(require_module("users"))):
    """
    Lists pending and recent PIN reset requests for Admin review.
    """
    requests_list = []
    if db.is_connected():
        try:
            logs = await db.auditlog.find_many(
                where={"action": {"in": ["FORGOT_PIN_REQUESTED", "PIN_RESET_COMPLETED"]}},
                order={"timestamp": "desc"},
                take=50
            )
            for l in logs:
                details = {}
                try:
                    details = json.loads(l.details_json or "{}")
                except Exception:
                    pass
                requests_list.append({
                    "id": l.id,
                    "username": l.username,
                    "action": l.action,
                    "details": details,
                    "timestamp": l.timestamp.isoformat()
                })
            return requests_list
        except Exception:
            pass
            
    # Fallback store
    for l in reversed(_FALLBACK_AUDIT_LOGS):
        if l["action"] in ["FORGOT_PIN_REQUESTED", "PIN_RESET_COMPLETED"]:
            details = {}
            try:
                details = json.loads(l["details_json"] or "{}")
            except Exception:
                pass
            requests_list.append({
                "id": l["id"],
                "username": l["username"],
                "action": l["action"],
                "details": details,
                "timestamp": l["timestamp"]
            })
    return requests_list

@router.post("/reset-pin")
async def admin_reset_pin(req: ResetPinRequest, admin = Depends(require_module("users"))):
    """
    Allows Admin to reset a user's PIN with proper authorization and audit logging.
    """
    if len(req.new_pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
        
    username = req.username.strip()
    user = await _get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
    if getattr(admin, "role", None) != "admin" and (user.get("role") if isinstance(user, dict) else getattr(user, "role", None)) == "admin":
        raise HTTPException(status_code=403, detail="Only an Admin can reset an Admin's PIN")
        
    new_pin_hash = get_pin_hash(req.new_pin)
    admin_username = getattr(admin, 'username', 'admin') if not isinstance(admin, dict) else admin.get("username", "admin")
    now_iso = datetime.now(timezone.utc).isoformat()
    
    details = {
        "status": "COMPLETED",
        "reset_by": admin_username,
        "completed_at": now_iso
    }
    
    if db.is_connected():
        try:
            await db.user.update(
                where={"username": username},
                data={"pin_hash": new_pin_hash}
            )
            await db.auditlog.create(data={
                "username": username,
                "action": "PIN_RESET_COMPLETED",
                "details_json": json.dumps(details)
            })
        except Exception:
            if username in _FALLBACK_USERS:
                _FALLBACK_USERS[username]["pin_hash"] = new_pin_hash
            _FALLBACK_AUDIT_LOGS.append({
                "id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}",
                "username": username,
                "action": "PIN_RESET_COMPLETED",
                "details_json": json.dumps(details),
                "timestamp": now_iso
            })
    else:
        if username in _FALLBACK_USERS:
            _FALLBACK_USERS[username]["pin_hash"] = new_pin_hash
        _FALLBACK_AUDIT_LOGS.append({
            "id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}",
            "username": username,
            "action": "PIN_RESET_COMPLETED",
            "details_json": json.dumps(details),
            "timestamp": now_iso
        })
        
    return {
        "success": True,
        "message": f"PIN for user '{username}' was reset successfully by Admin ({admin_username}).",
        "username": username
    }

@router.put("/active-counter")
async def switch_active_counter(req: SwitchCounterRequest, credentials = Depends(security_bearer), user = Depends(get_current_user)):
    """Switches the signed-in user to another billing counter. Only the user's own active counter changes: role and permissions are untouched."""
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    counter = await db.cashcounter.find_unique(where={"id": req.counter_id}) if db.is_connected() else None
    if not counter or not counter.is_active:
        raise HTTPException(status_code=404, detail="Counter not found")
    username = user.get("username") if isinstance(user, dict) else user.username
    if db.is_connected():
        try:
            await db.user.update(where={"username": username}, data={"active_counter": counter.counter_name})
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not save the active counter ({type(exc).__name__}). Run `prisma generate` and `prisma db push`.")
    return {"counter_id": counter.id, "active_counter": counter.counter_name, "username": username}

@router.get("/me", response_model=UserSchema)
async def get_me(user = Depends(get_current_user)):
    username = getattr(user, 'username', 'priya.k') if not isinstance(user, dict) else user.get("username", "priya.k")
    role = getattr(user, 'role', 'cashier') if not isinstance(user, dict) else user.get("role", "cashier")
    full_name = getattr(user, 'full_name', username) if not isinstance(user, dict) else user.get("full_name", username)
    sub_text = getattr(user, 'sub_text', '') if not isinstance(user, dict) else user.get("sub_text", "")
    is_active = getattr(user, 'is_active', True) if not isinstance(user, dict) else user.get("is_active", True)
    auto_lock = getattr(user, 'auto_lock', "2 min") if not isinstance(user, dict) else user.get("auto_lock", "2 min")
    schedule_json = getattr(user, 'schedule_json', None) if not isinstance(user, dict) else user.get("schedule_json", None)
    
    return UserSchema(
        id=getattr(user, 'id', f"U-{username}") if not isinstance(user, dict) else user.get("id", f"U-{username}"),
        username=username,
        role=role,
        full_name=full_name,
        sub_text=sub_text,
        is_active=is_active,
        auto_lock=auto_lock or "2 min",
        schedule_json=schedule_json,
        modules=user_modules(user),
        phase_access=get_phase_access(user),
        active_counter=getattr(user, 'active_counter', None) if not isinstance(user, dict) else user.get('active_counter')
    )


# --- Password setup / recovery for business owners (multi-tenant) -------------------------------------------------
class SetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=1, max_length=128)
    confirm_password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)


async def _set_password(req: SetPasswordRequest, request: Request):
    from app.routers.platform_public import AcceptIn, accept_with_password
    return await accept_with_password(req.token, AcceptIn(password=req.password, confirm_password=req.confirm_password), request)


@router.post("/set-password")
async def set_password(req: SetPasswordRequest, request: Request):
    """Create the password after the invitation was verified (same single-use token as /invitations/{token}/accept)."""
    return await _set_password(req, request)


@router.post("/reset-password")
async def reset_password(req: SetPasswordRequest, request: Request):
    """Choose a new password with a reset link sent by /auth/forgot-password."""
    return await _set_password(req, request)


@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest, request: Request):
    """Always answers the same way, so it cannot be used to find out which emails have accounts."""
    ip = platform_audit.client_ip(request)
    forgot_limiter.hit(f"forgot:{ip}")
    try:
        await platform_service.request_password_reset(req.email, ip=ip)
    except Exception:                                           # noqa: BLE001
        pass
    return {"message": "If an account exists for that email, a password reset link has been sent."}
