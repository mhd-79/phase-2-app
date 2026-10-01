import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, status
from app.schemas import LoginRequest, TokenResponse, UserSchema, PinVerifyRequest, ForgotPinRequest, ResetPinRequest
from app.security import verify_pin, get_pin_hash, create_access_token, get_current_user, require_admin, get_phase_access, PHASE_2
from app.database import db
from seed import DEMO_USERS

router = APIRouter(prefix="/auth", tags=["Auth"])

# In-memory fallback user store (seeded with DEMO_USERS) when database is in dummy/disconnected mode
_FALLBACK_USERS = {}

def _init_fallback_users():
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
_FALLBACK_AUDIT_LOGS = []

async def _get_user_by_username(username: str):
    _init_fallback_users()
    if db.is_connected():
        try:
            return await db.user.find_unique(where={"username": username})
        except Exception:
            pass
    return _FALLBACK_USERS.get(username)

@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest):
    # 1. Enforce login against actual stored user credentials
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
        phase_access=phase_access
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
async def list_pin_reset_requests(admin = Depends(require_admin)):
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
async def admin_reset_pin(req: ResetPinRequest, admin = Depends(require_admin)):
    """
    Allows Admin to reset a user's PIN with proper authorization and audit logging.
    """
    if len(req.new_pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
        
    username = req.username.strip()
    user = await _get_user_by_username(username)
    if not user:
        raise HTTPException(status_code=404, detail=f"User '{username}' not found")
        
    if get_phase_access(admin) < PHASE_2 and get_phase_access(user) >= PHASE_2 and (user.get("role") if isinstance(user, dict) else user.role) == "admin":
        raise HTTPException(status_code=403, detail="A Phase 1 admin cannot reset the PIN of a Phase 2 admin")

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
        phase_access=get_phase_access(user)
    )
