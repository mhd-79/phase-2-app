import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List
from app.schemas import UserSchema, UserCreate, UserUpdate, LeaveRequest, UserAccessUpdate, TransferAdminRequest
from app.security import get_pin_hash, verify_pin, require_admin, require_module, get_phase_access, has_module, user_modules, MODULES
from app import platform_service
from app.database import db
from app.idempotency import enforce_idempotency
from app.routers.auth import _FALLBACK_USERS, _FALLBACK_AUDIT_LOGS, _get_user_by_username

router = APIRouter(prefix="/users", tags=["Users"])


def _field(rec, name, default=None):
    return rec.get(name, default) if isinstance(rec, dict) else getattr(rec, name, default)


async def _snapshot(username: str):
    """Role / active flag of a stored user (database first, then the in-memory fallback store)."""
    rec = None
    if db.is_connected():
        try:
            rec = await db.user.find_unique(where={"username": username})
        except Exception:
            rec = None
    if rec is None:
        rec = _FALLBACK_USERS.get(username)
    if rec is None:
        return None
    return {"role": _field(rec, "role", "cashier"), "active": bool(_field(rec, "is_active", True))}


async def _other_active_admins(excluding: str) -> int:
    rows = []
    if db.is_connected():
        try:
            rows = await db.user.find_many(where={"role": "admin", "is_active": True})
        except Exception:
            rows = []
    if not rows:
        rows = [u for u in _FALLBACK_USERS.values() if u.get("role") == "admin" and u.get("is_active", True)]
    return sum(1 for u in rows if _field(u, "username") != excluding)

@router.get("", response_model=List[UserSchema])
async def get_users(user = Depends(require_module("users"))):
    if db.is_connected():
        try:
            users = await db.user.find_many()
            result = []
            for u in users:
                result.append(UserSchema(
                    id=u.id,
                    username=u.username,
                    role=u.role,
                    full_name=u.full_name,
                    sub_text=u.sub_text,
                    is_active=u.is_active,
                    auto_lock=u.auto_lock or "2 min",
                    schedule_json=u.schedule_json,
                    phase_access=get_phase_access(u),
                    on_leave=bool(getattr(u, "on_leave", False)),
                    leave_reason=getattr(u, "leave_reason", None),
                    leave_started_at=getattr(u, "leave_started_at", None),
                    modules=user_modules(u)
                ))
            return result
        except Exception:
            pass
            
    # Fallback
    return [
        UserSchema(
            id=u["id"],
            username=u["username"],
            role=u["role"],
            full_name=u["full_name"],
            sub_text=u["sub_text"],
            is_active=u["is_active"],
            auto_lock=u.get("auto_lock", "2 min"),
            schedule_json=u.get("schedule_json"),
            phase_access=get_phase_access(u),
            on_leave=bool(u.get("on_leave", False)),
            leave_reason=u.get("leave_reason"),
            modules=user_modules(u)
        ) for u in _FALLBACK_USERS.values()
    ]

@router.post("", response_model=UserSchema)
async def create_user(req: UserCreate, request: Request, user = Depends(require_module("users"))):
    await enforce_idempotency(request, "create_user", req.username)
    
    admin_user = getattr(user, 'username', 'admin') if not isinstance(user, dict) else user.get("username", "admin")
    if getattr(user, "role", None) != "admin" and req.role.lower() == "admin":
        raise HTTPException(status_code=403, detail="Only an Admin can create an Admin account")
    pin_hash = get_pin_hash(req.pin)
    now_iso = datetime.now(timezone.utc).isoformat()

    if db.is_connected():
        try:
            existing = await db.user.find_unique(where={"username": req.username})
            if existing:
                raise HTTPException(status_code=400, detail="Username already exists")
                
            u = await db.user.create(data={
                "username": req.username,
                "pin_hash": pin_hash,
                "role": req.role.lower(),
                "full_name": req.full_name,
                "sub_text": req.sub_text,
                "auto_lock": req.auto_lock or "2 min",
                                "schedule_json": req.schedule_json,
                "is_active": True
            })

            await db.auditlog.create(data={
                "username": req.username,
                "action": "USER_CREATED",
                "details_json": json.dumps({"created_by": admin_user, "role": req.role.lower(), "timestamp": now_iso})
            })

            return UserSchema(
                id=u.id, username=u.username, role=u.role,
                full_name=u.full_name, sub_text=u.sub_text, is_active=u.is_active,
                auto_lock=u.auto_lock, schedule_json=u.schedule_json
            )
        except HTTPException:
            raise
        except Exception:
            pass
            
    # Fallback store
    if req.username in _FALLBACK_USERS:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    new_u = {
        "id": f"U-{req.username}",
        "username": req.username,
        "pin_hash": pin_hash,
        "role": req.role.lower(),
        "full_name": req.full_name,
        "sub_text": req.sub_text,
        "auto_lock": req.auto_lock or "2 min",
        "schedule_json": req.schedule_json,
        "is_active": True
    }
    _FALLBACK_USERS[req.username] = new_u
    _FALLBACK_AUDIT_LOGS.append({
        "id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}",
        "username": req.username,
        "action": "USER_CREATED",
        "details_json": json.dumps({"created_by": admin_user, "role": req.role.lower(), "timestamp": now_iso}),
        "timestamp": now_iso
    })
    
    return UserSchema(
        id=new_u["id"], username=new_u["username"], role=new_u["role"],
        full_name=new_u["full_name"], sub_text=new_u["sub_text"], is_active=new_u["is_active"],
        auto_lock=new_u["auto_lock"], schedule_json=new_u["schedule_json"]
    )

@router.put("/{username}", response_model=UserSchema)
async def update_user(username: str, req: UserUpdate, request: Request, user = Depends(require_module("users"))):
    await enforce_idempotency(request, f"update_user_{username}")
    
    admin_user = getattr(user, 'username', 'admin') if not isinstance(user, dict) else user.get("username", "admin")
    now_iso = datetime.now(timezone.utc).isoformat()
    
    data = {}
    if req.full_name is not None: data["full_name"] = req.full_name
    if req.role is not None: data["role"] = req.role.lower()
    if req.is_active is not None: data["is_active"] = req.is_active
    if req.auto_lock is not None: data["auto_lock"] = req.auto_lock
    if req.schedule_json is not None: data["schedule_json"] = req.schedule_json
    if req.pin: data["pin_hash"] = get_pin_hash(req.pin)

    target = await _snapshot(username)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if getattr(user, "role", None) != "admin" and (target["role"] == "admin" or data.get("role") == "admin"):
        raise HTTPException(status_code=403, detail="Only an Admin can change an Admin account")
    # An admin's own role is fixed: it can only be handed to someone else via /users/{username}/transfer-admin.
    if username == admin_user and "role" in data and data["role"] != target["role"]:
        raise HTTPException(status_code=400, detail="Your admin role is fixed. Use 'Transfer Admin Role' to hand it to another user.")
    new_role = data.get("role", target["role"])
    new_active = data.get("is_active", target["active"])
    loses_admin = target["role"] == "admin" and target["active"] and (new_role != "admin" or not new_active)
    if loses_admin and await _other_active_admins(username) == 0:
        raise HTTPException(status_code=400, detail="At least one active admin must remain")

    if db.is_connected():
        try:
            existing = await db.user.find_unique(where={"username": username})
            if not existing:
                raise HTTPException(status_code=404, detail="User not found")

            u = await db.user.update(where={"username": username}, data=data)
            
            action = "USER_PIN_RESET" if req.pin else "USER_UPDATED"
            await db.auditlog.create(data={
                "username": username,
                "action": action,
                "details_json": json.dumps({"updated_by": admin_user, "changes": list(data.keys()), "timestamp": now_iso})
            })
            
            return UserSchema(
                id=u.id, username=u.username, role=u.role,
                full_name=u.full_name, sub_text=u.sub_text, is_active=u.is_active,
                auto_lock=u.auto_lock, schedule_json=u.schedule_json,
                on_leave=bool(getattr(u, "on_leave", False)), leave_reason=getattr(u, "leave_reason", None)
            )
        except HTTPException:
            raise
        except Exception:
            pass

    # Fallback store
    if username not in _FALLBACK_USERS:
        raise HTTPException(status_code=404, detail="User not found")
        
    u = _FALLBACK_USERS[username]
    u.update(data)
    action = "USER_PIN_RESET" if req.pin else "USER_UPDATED"
    _FALLBACK_AUDIT_LOGS.append({
        "id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}",
        "username": username,
        "action": action,
        "details_json": json.dumps({"updated_by": admin_user, "changes": list(data.keys()), "timestamp": now_iso}),
        "timestamp": now_iso
    })
    
    return UserSchema(
        id=u["id"], username=u["username"], role=u["role"],
        full_name=u["full_name"], sub_text=u["sub_text"], is_active=u["is_active"],
        auto_lock=u.get("auto_lock", "2 min"), schedule_json=u.get("schedule_json")
    )

@router.put("/{username}/leave", response_model=UserSchema)
async def set_user_leave(username: str, req: LeaveRequest, request: Request, user = Depends(require_module("users"))):
    """Marks a user as on leave (with a reason) or back at work. Only the leave fields change: role, PIN, schedule and permissions are untouched."""
    await enforce_idempotency(request, f"user_leave_{username}")
    admin_user = getattr(user, 'username', 'admin') if not isinstance(user, dict) else user.get("username", "admin")
    now = datetime.now(timezone.utc)
    reason = (req.reason or "").strip()

    if req.on_leave and not reason:
        raise HTTPException(status_code=400, detail="Please give a reason for the leave")
    if req.on_leave and username == admin_user:
        raise HTTPException(status_code=400, detail="You cannot put your own account on leave")

    target = await _snapshot(username)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if getattr(user, "role", None) != "admin" and target["role"] == "admin":
        raise HTTPException(status_code=403, detail="Only an Admin can change an Admin account")
    if (req.on_leave and target["role"] == "admin" and target["active"]
            and await _other_active_admins(username) == 0):
        raise HTTPException(status_code=400, detail="At least one active admin must remain")

    data = {
        "on_leave": req.on_leave,
        "leave_reason": reason if req.on_leave else None,
        "leave_started_at": now if req.on_leave else None,
    }
    details = {"by": admin_user, "reason": reason if req.on_leave else None, "timestamp": now.isoformat()}
    action = "USER_ON_LEAVE" if req.on_leave else "USER_RETURNED_FROM_LEAVE"

    if db.is_connected():
        try:
            if not await db.user.find_unique(where={"username": username}):
                raise HTTPException(status_code=404, detail="User not found")
            u = await db.user.update(where={"username": username}, data=data)
            await db.auditlog.create(data={"username": username, "action": action, "details_json": json.dumps(details)})
            return UserSchema(
                id=u.id, username=u.username, role=u.role, full_name=u.full_name, sub_text=u.sub_text, is_active=u.is_active,
                auto_lock=u.auto_lock or "2 min", schedule_json=u.schedule_json, phase_access=get_phase_access(u),
                on_leave=bool(u.on_leave), leave_reason=u.leave_reason, leave_started_at=u.leave_started_at
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not save the leave status ({type(exc).__name__}). Run `prisma generate` and `prisma db push`.")

    if username not in _FALLBACK_USERS:
        raise HTTPException(status_code=404, detail="User not found")
    f = _FALLBACK_USERS[username]
    f.update(data)
    _FALLBACK_AUDIT_LOGS.append({"id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}", "username": username, "action": action,
                                 "details_json": json.dumps(details), "timestamp": now.isoformat()})
    return UserSchema(
        id=f["id"], username=f["username"], role=f["role"], full_name=f["full_name"], sub_text=f["sub_text"], is_active=f["is_active"],
        auto_lock=f.get("auto_lock", "2 min"), schedule_json=f.get("schedule_json"), phase_access=get_phase_access(f),
        on_leave=f["on_leave"], leave_reason=f["leave_reason"], leave_started_at=f["leave_started_at"]
    )

@router.post("/{username}/transfer-admin", response_model=UserSchema)
async def transfer_admin_role(username: str, req: TransferAdminRequest, request: Request, user = Depends(require_admin)):
    """The signed-in admin hands their admin role to another active user and becomes a cashier. Needs their own PIN / password."""
    await enforce_idempotency(request, f"transfer_admin_{username}")
    admin_user = getattr(user, 'username', 'admin') if not isinstance(user, dict) else user.get("username", "admin")
    now_iso = datetime.now(timezone.utc).isoformat()

    if username == admin_user:
        raise HTTPException(status_code=400, detail="Choose another user to transfer the admin role to")

    actor = await _get_user_by_username(admin_user)
    if actor is None:
        raise HTTPException(status_code=404, detail="Your account was not found")
    pin_hash, password_hash = _field(actor, "pin_hash"), _field(actor, "password_hash")
    if not ((pin_hash and verify_pin(req.current_pin, pin_hash))
            or (password_hash and platform_service.verify_password(req.current_pin, password_hash))):
        raise HTTPException(status_code=403, detail="Your PIN or password is incorrect")

    target = await _get_user_by_username(username)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not _field(target, "is_active", True):
        raise HTTPException(status_code=400, detail="Enable this user's account before transferring the admin role")
    if _field(target, "on_leave", False):
        raise HTTPException(status_code=400, detail="This user is on leave. Mark them as returned before transferring the admin role")

    # the new admin takes over the title (e.g. "Admin · HO Admin"); the previous admin takes the new admin's old one
    actor_sub, target_sub = _field(actor, "sub_text", "Admin"), _field(target, "sub_text", "Cashier")
    promote = {"role": "admin", "sub_text": actor_sub}
    demote = {"role": "cashier", "sub_text": target_sub if _field(target, "role") != "admin" else "Cashier · Counter Staff"}
    details = json.dumps({"from": admin_user, "to": username, "timestamp": now_iso})

    if db.is_connected():
        try:
            u = await db.user.update(where={"username": username}, data=promote)        # promote first: never zero admins
            await db.user.update(where={"username": admin_user}, data=demote)
            await db.auditlog.create(data={"username": username, "action": "ADMIN_ROLE_TRANSFERRED", "details_json": details})
            return UserSchema(
                id=u.id, username=u.username, role=u.role, full_name=u.full_name, sub_text=u.sub_text, is_active=u.is_active,
                auto_lock=u.auto_lock or "2 min", schedule_json=u.schedule_json, phase_access=get_phase_access(u)
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not transfer the admin role ({type(exc).__name__}).")

    if username not in _FALLBACK_USERS or admin_user not in _FALLBACK_USERS:
        raise HTTPException(status_code=404, detail="User not found")
    _FALLBACK_USERS[username].update(promote)
    _FALLBACK_USERS[admin_user].update(demote)
    _FALLBACK_AUDIT_LOGS.append({"id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}", "username": username, "action": "ADMIN_ROLE_TRANSFERRED",
                                 "details_json": details, "timestamp": now_iso})
    f = _FALLBACK_USERS[username]
    return UserSchema(
        id=f["id"], username=f["username"], role=f["role"], full_name=f["full_name"], sub_text=f["sub_text"], is_active=f["is_active"],
        auto_lock=f.get("auto_lock", "2 min"), schedule_json=f.get("schedule_json"), phase_access=get_phase_access(f)
    )


@router.get("/audit-logs")
async def get_audit_logs(user = Depends(require_module("users"))):
    if db.is_connected():
        try:
            logs = await db.auditlog.find_many(take=50, order={"timestamp": "desc"})
            return [
                {
                    "id": l.id,
                    "username": l.username,
                    "action": l.action,
                    "details": l.details_json,
                    "timestamp": l.timestamp.isoformat()
                } for l in logs
            ]
        except Exception:
            pass
            
    return [
        {
            "id": l["id"],
            "username": l["username"],
            "action": l["action"],
            "details": l["details_json"],
            "timestamp": l["timestamp"]
        } for l in reversed(_FALLBACK_AUDIT_LOGS)
    ]



# --------------------------------------------------------------------------- User Access (module permissions per user)
async def _access_target(username: str):
    """The user's stored record, from the signed-in tenant's own user table only."""
    if db.is_connected():
        try:
            rec = await db.user.find_unique(where={"username": username})
            if rec is not None:
                return rec
        except Exception:
            pass
    return _FALLBACK_USERS.get(username)


def _access_view(rec) -> dict:
    return {"username": _field(rec, "username"), "full_name": _field(rec, "full_name"), "role": _field(rec, "role", "cashier"),
            "modules": user_modules(rec), "available": [{"key": k, "label": v} for k, v in MODULES.items()]}


@router.get("/{username}/access")
async def get_user_access(username: str, user = Depends(require_admin), _m = Depends(require_module("users"))):
    rec = await _access_target(username)
    if rec is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _access_view(rec)


@router.put("/{username}/access")
async def set_user_access(username: str, req: UserAccessUpdate, request: Request, user = Depends(require_admin), _m = Depends(require_module("users"))):
    """Allow / Deny each module for one user of the signed-in business. Stored on that user only; enforced by the APIs, not just the menu."""
    await enforce_idempotency(request, f"user_access_{username}")
    admin_user = getattr(user, "username", "admin")
    unknown = [k for k in req.modules if k not in MODULES]
    if unknown:
        raise HTTPException(status_code=422, detail=f"Unknown module(s): {', '.join(unknown)}")
    if username == admin_user:
        raise HTTPException(status_code=400, detail="You cannot change your own access")
    rec = await _access_target(username)
    if rec is None:
        raise HTTPException(status_code=404, detail="User not found")
    # nobody can hand out more than they hold themselves
    beyond = [MODULES[k] for k, allowed in req.modules.items() if allowed and not has_module(user, k)]
    if beyond:
        raise HTTPException(status_code=403, detail=f"You cannot grant access you do not have: {', '.join(beyond)}")
    before = user_modules(rec)
    stored = json.dumps({k: bool(v) for k, v in req.modules.items()})
    now_iso = datetime.now(timezone.utc).isoformat()
    after = user_modules({"role": _field(rec, "role"), "modules_json": stored})
    changes = {k: after[k] for k in MODULES if before[k] != after[k]}
    details = json.dumps({"updated_by": admin_user, "changed": changes, "timestamp": now_iso})

    if db.is_connected() and not isinstance(rec, dict):
        try:
            updated = await db.user.update(where={"username": username}, data={"modules_json": stored})
            await db.auditlog.create(data={"username": username, "action": "USER_ACCESS_UPDATED", "details_json": details})
            return _access_view(updated)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Could not save the access ({type(exc).__name__}). Run `prisma generate` and `prisma db push`.")

    rec["modules_json"] = stored
    _FALLBACK_AUDIT_LOGS.append({"id": f"audit-{len(_FALLBACK_AUDIT_LOGS)+1}", "username": username, "action": "USER_ACCESS_UPDATED",
                                "details_json": details, "timestamp": now_iso})
    return _access_view(rec)
