from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.schemas import UserSchema, UserCreate, UserUpdate
from app.security import get_pin_hash, require_admin
from app.database import db

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("", response_model=List[UserSchema])
async def get_users(user = Depends(require_admin)):
    users = await db.user.find_many()
    result = []
    for u in users:
        result.append(UserSchema(
            id=u.id,
            username=u.username,
            role=u.role,
            full_name=u.full_name,
            sub_text=u.sub_text,
            is_active=u.is_active
        ))
    return result

@router.post("", response_model=UserSchema)
async def create_user(req: UserCreate, user = Depends(require_admin)):
    existing = await db.user.find_unique(where={"username": req.username})
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    pin_hash = get_pin_hash(req.pin)
    u = await db.user.create(data={
        "username": req.username,
        "pin_hash": pin_hash,
        "role": req.role,
        "full_name": req.full_name,
        "sub_text": req.sub_text,
        "is_active": True
    })
    return UserSchema(
        id=u.id, username=u.username, role=u.role,
        full_name=u.full_name, sub_text=u.sub_text, is_active=u.is_active
    )

@router.put("/{username}", response_model=UserSchema)
async def update_user(username: str, req: UserUpdate, user = Depends(require_admin)):
    existing = await db.user.find_unique(where={"username": username})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    data = {}
    if req.full_name is not None: data["full_name"] = req.full_name
    if req.role is not None: data["role"] = req.role
    if req.is_active is not None: data["is_active"] = req.is_active
    if req.pin: data["pin_hash"] = get_pin_hash(req.pin)
    
    u = await db.user.update(where={"username": username}, data=data)
    return UserSchema(
        id=u.id, username=u.username, role=u.role,
        full_name=u.full_name, sub_text=u.sub_text, is_active=u.is_active
    )

@router.get("/audit-logs")
async def get_audit_logs(user = Depends(require_admin)):
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
