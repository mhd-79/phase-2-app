import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List
from app.schemas import UserSchema, UserCreate, UserUpdate, LeaveRequest
from app.security import get_pin_hash, require_admin, get_phase_access, PHASE_1, PHASE_2
from app.database import db
from app.idempotency import enforce_idempotency
from app.routers.auth import _FALLBACK_USERS, _FALLBACK_AUDIT_LOGS

router = APIRouter(prefix="/users", tags=["Users"])


def _field(rec, name, default=None):
    return rec.get(name, default) if isinstance(rec, dict) else getattr(rec, name, default)


async def _snapshot(username: str):
    """Role / phase / active flag of a stored user (database first, then the in-memory fallback store)."""
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
    return {"role": _field(rec, "role", "cashier"), "phase": get_phase_access(rec), "active": bool(_field(rec, "is_active", True))}


async def _other_active_phase2_admins(excluding: str) -> int:
    rows = []
    if db.is_connected():
        try:
            rows = await db.user.find_many(where={"role": "admin", "is_active": True})
        except Exception:
            rows = []
    if not rows:
        rows = [u for u in _FALLBACK_USERS.values() if u.get("role") == "admin" and u.get("is_active", True)]
    return sum(1 for u in rows if _field(u, "username") != excluding and get_phase_access(u) >= PHASE_2)

@router.get("", response_model=List[UserSchema])
async def get_users(user = Depends(require_admin)):
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
                    leave_started_at=getattr(u, "leave_started_at", None)
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
            leave_reason=u.get("leave_reason")
        ) for u in _FALLBACK_USERS.values()
    ]

@router.post("", response_model=UserSchema)
async def create_user(req: UserCreate, request: Request, user = Depends(require_admin)):
    await enforce_idempotency(request, "create_user", req.username)
    
    admin_user = getattr(user, 'username', 'admin') if not isinstance(user, dict) else user.get("username", "admin")
    pin_hash = get_pin_hash(req.pin)
    now_iso = datetime.now(timezone.utc).isoformat()

    # A Phase 1 admin can only create Phase 1 accounts; they cannot hand out Phase 2 access.
    if get_phase_access(user) < PHASE_2:
        if req.phase_access == PHASE_2:
            raise HTTPException(status_code=403, detail="Only a Phase 2 admin can grant Phase 2 access")
        phase_access = PHASE_1
    else:
        phase_access = req.phase_access or PHASE_2

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
                "phase_access": phase_access,
                "is_active": True
            })

            await db.auditlog.create(data={
                "username": req.username,
                "action": "USER_CREATED",
                "details_json": json.dumps({"created_by": admin_user, "role": req.role.lower(), "phase_access": phase_access, "timestamp": now_iso})
            })

            return UserSchema(
                id=u.id, username=u.username, role=u.role,
                full_name=u.full_name, sub_text=u.sub_text, is_active=u.is_active,
                auto_lock=u.auto_lock, schedule_json=u.schedule_json, phase_access=get_phase_access(u)
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
        "phase_access": phase_access,
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
        auto_lock=new_u["auto_lock"], schedule_json=new_u["schedule_json"], phase_access=phase_access
    )

@router.put("/{username}", response_model=UserSchema)
async def update_user(username: str, req: UserUpdate, request: Request, user = Depends(require_admin)):
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

    # --- Phase access rules -------------------------------------------------------------------
    target = await _snapshot(username)
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    actor_phase = get_phase_access(user)
    if actor_phase < PHASE_2:
        if target["role"] == "admin" and target["phase"] >= PHASE_2:
            raise HTTPException(status_code=403, detail="A Phase 1 admin cannot modify a Phase 2 admin account")
        if req.phase_access == PHASE_2:
            raise HTTPException(status_code=403, detail="Only a Phase 2 admin can grant Phase 2 access")
        if data.get("role") == "admin":
            data["phase_access"] = PHASE_1          # promoted by a Phase 1 admin -> stays Phase 1
    if req.phase_access is not None and actor_phase >= PHASE_2:
        data["phase_access"] = req.phase_access
    new_role = data.get("role", target["role"])
    new_phase = data.get("phase_access", target["phase"])
    new_active = data.get("is_active", target["active"])
    loses_phase2_admin = target["role"] == "admin" and target["phase"] >= PHASE_2 and target["active"] and (
        new_role != "admin" or new_phase < PHASE_2 or not new_active)
    if loses_phase2_admin and await _other_active_phase2_admins(username) == 0:
        raise HTTPException(status_code=400, detail="At least one active Phase 2 admin must remain")

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
                auto_lock=u.auto_lock, schedule_json=u.schedule_json, phase_access=get_phase_access(u),
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
        auto_lock=u.get("auto_lock", "2 min"), schedule_json=u.get("schedule_json"), phase_access=get_phase_access(u)
    )

@router.put("/{username}/leave", response_model=UserSchema)
async def set_user_leave(username: str, req: LeaveRequest, request: Request, user = Depends(require_admin)):
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
    if get_phase_access(user) < PHASE_2 and target["role"] == "admin" and target["phase"] >= PHASE_2:
        raise HTTPException(status_code=403, detail="A Phase 1 admin cannot modify a Phase 2 admin account")
    if (req.on_leave and target["role"] == "admin" and target["phase"] >= PHASE_2 and target["active"]
            and await _other_active_phase2_admins(username) == 0):
        raise HTTPException(status_code=400, detail="At least one active Phase 2 admin must remain")

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

@router.get("/audit-logs")
async def get_audit_logs(user = Depends(require_admin)):
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
