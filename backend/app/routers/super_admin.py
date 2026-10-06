"""
Super Admin API (/api/v1/super-admin/*): tenant management, onboarding review, invitations, subscriptions, plans,
notifications, audit logs and platform settings. Every route requires a Super Admin token.

Tenant business data is never exposed here: tenant detail only returns read-only counts and the user list of that
tenant, read through that tenant's own database schema.
"""
import re
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, field_validator

from app import platform_audit as audit
from app import platform_service as svc
from app import mailer, tenancy
from app.config import settings
from app.database import control_db
from app.security import require_super_admin

router = APIRouter(prefix="/super-admin", tags=["Super Admin"], dependencies=[Depends(require_super_admin)])

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")
PHONE_RE = re.compile(r"^\+?[0-9][0-9 \-]{6,18}$")
GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$")
POSTAL_RE = re.compile(r"^[A-Za-z0-9 \-]{3,10}$")


def check_email(v):
    if v is None:
        return v
    v = v.strip().lower()
    if not EMAIL_RE.match(v):
        raise ValueError("Enter a valid email address")
    return v


def check_phone(v):
    if v is None:
        return v
    v = v.strip()
    if not PHONE_RE.match(v):
        raise ValueError("Enter a valid phone number")
    return v


def check_gstin(v):
    if v is None:
        return v
    v = v.strip().upper()
    if not GSTIN_RE.match(v):
        raise ValueError("Enter a valid 15-character GSTIN")
    return v


def check_postal(v):
    if v is None:
        return v
    v = v.strip()
    if not POSTAL_RE.match(v):
        raise ValueError("Enter a valid postal code")
    return v


class TenantDetails(BaseModel):
    """Business + owner fields required by superadmin.md (also used by the public tenant-request API)."""
    tenant_name: str = Field(min_length=2, max_length=120)
    legal_business_name: str = Field(min_length=2, max_length=160)
    owner_name: str = Field(min_length=2, max_length=120)
    email: str
    phone: str
    address: str = Field(min_length=3, max_length=240)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    country: str = Field(default="India", min_length=2, max_length=80)
    postal_code: str
    gstin: str
    business_type: str = Field(min_length=2, max_length=80)
    initial_outlet_name: Optional[str] = Field(default=None, max_length=120)

    _v_email = field_validator("email")(lambda cls, v: check_email(v))
    _v_phone = field_validator("phone")(lambda cls, v: check_phone(v))
    _v_gstin = field_validator("gstin")(lambda cls, v: check_gstin(v))
    _v_postal = field_validator("postal_code")(lambda cls, v: check_postal(v))

    def as_service_data(self) -> dict:
        d = self.model_dump()
        d["legal_name"] = d.pop("legal_business_name")
        return d


class TenantCreate(TenantDetails):
    trial_duration_days: Optional[int] = Field(default=None, ge=1, le=365)
    subscription_plan: Optional[str] = None            # plan code
    send_invitation: bool = True


class TenantUpdate(BaseModel):
    tenant_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    legal_business_name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    owner_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = Field(default=None, min_length=3, max_length=240)
    city: Optional[str] = Field(default=None, min_length=2, max_length=80)
    state: Optional[str] = Field(default=None, min_length=2, max_length=80)
    country: Optional[str] = Field(default=None, min_length=2, max_length=80)
    postal_code: Optional[str] = None
    gstin: Optional[str] = None
    business_type: Optional[str] = Field(default=None, min_length=2, max_length=80)
    initial_outlet_name: Optional[str] = Field(default=None, max_length=120)
    trial_duration_days: Optional[int] = Field(default=None, ge=1, le=365)

    _v_email = field_validator("email")(lambda cls, v: check_email(v))
    _v_phone = field_validator("phone")(lambda cls, v: check_phone(v))
    _v_gstin = field_validator("gstin")(lambda cls, v: check_gstin(v))
    _v_postal = field_validator("postal_code")(lambda cls, v: check_postal(v))


class StatusChange(BaseModel):
    action: Literal["suspend", "reactivate", "activate"]
    reason: Optional[str] = Field(default=None, max_length=300)
    plan_code: Optional[str] = None


class TenantAdminUpdate(BaseModel):
    status: Optional[str] = None
    plan_code: Optional[str] = None
    reason: Optional[str] = Field(default=None, max_length=300)


class RequestApprove(BaseModel):
    trial_duration_days: Optional[int] = Field(default=None, ge=1, le=365)
    subscription_plan: Optional[str] = None


class RequestReject(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=300)


class MarkPaid(BaseModel):
    plan_code: str
    reference: Optional[str] = Field(default=None, max_length=120)


class PlanIn(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9][a-z0-9\-]*$")
    name: str = Field(min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=300)
    price: float = Field(ge=0)
    duration_days: int = Field(ge=1, le=3650)
    max_users: Optional[int] = Field(default=None, ge=1)
    storage_mb: Optional[int] = Field(default=None, ge=1)
    ai_enabled: bool = False
    reports_enabled: bool = True
    is_active: bool = True


class PlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    description: Optional[str] = Field(default=None, max_length=300)
    price: Optional[float] = Field(default=None, ge=0)
    duration_days: Optional[int] = Field(default=None, ge=1, le=3650)
    max_users: Optional[int] = Field(default=None, ge=1)
    storage_mb: Optional[int] = Field(default=None, ge=1)
    ai_enabled: Optional[bool] = None
    reports_enabled: Optional[bool] = None
    is_active: Optional[bool] = None


class SettingsUpdate(BaseModel):
    default_trial_days: Optional[int] = Field(default=None, ge=1, le=365)
    invitation_expiry_hours: Optional[int] = Field(default=None, ge=1, le=720)
    trial_reminder_days: Optional[int] = Field(default=None, ge=1, le=60)
    expired_access_policy: Optional[Literal["readonly", "block"]] = None


def _invite_payload(invite: Optional[svc.InviteResult]) -> Optional[dict]:
    if invite is None:
        return None
    return {"delivery": invite.delivery, "delivered": invite.delivered, "expires_at": invite.expires_at,
            "invite_url": invite.invite_url, "error": invite.error}


async def _tenant_or_404(tenant_id: str):
    t = await control_db.tenant.find_unique(where={"id": tenant_id}, include={"subscription": True})
    if t is None:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return t


# --------------------------------------------------------------------------- profile + dashboard
@router.get("/me")
async def me(user=Depends(require_super_admin)):
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": "super_admin"}


@router.get("/dashboard")
async def dashboard():
    tenants = await control_db.tenant.find_many(include={"subscription": True})
    now = svc.now_utc()
    counts = {"total": len(tenants), "active": 0, "trial": 0, "expired": 0, "suspended": 0, "invited": 0}
    total_users = 0
    for t in tenants:
        eff = tenancy.effective_status(t.status, t.subscription, now)
        key = {"ACTIVE": "active", "TRIAL": "trial", "EXPIRED": "expired", "SUSPENDED": "suspended"}.get(eff)
        if eff in ("INVITED", "INVITATION_EXPIRED"):
            key = "invited"
        if key:
            counts[key] += 1
        if t.provision_status == "ready":
            try:
                async with tenancy.tenant_context(t.schema_name) as client:
                    total_users += await client.user.count()
            except Exception:                                   # noqa: BLE001
                pass
    pending = await control_db.tenantrequest.count(where={"status": "PENDING_APPROVAL"})
    unread = await control_db.tenantnotification.count(where={"audience": "super_admin", "is_read": False})
    recent = await control_db.platformauditlog.find_many(order={"timestamp": "desc"}, take=8)
    return {"cards": {"total_tenants": counts["total"], "active_tenants": counts["active"], "trial_tenants": counts["trial"],
                      "pending_requests": pending, "expired_tenants": counts["expired"], "suspended_tenants": counts["suspended"],
                      "total_users": total_users}, "invited_tenants": counts["invited"], "unread_notifications": unread,
            "recent_activity": [_audit_row(r) for r in recent]}


# --------------------------------------------------------------------------- tenants
@router.get("/tenants")
async def list_tenants(status: Optional[str] = None, q: Optional[str] = None, limit: int = Query(100, ge=1, le=500),
                       offset: int = Query(0, ge=0)):
    rows = await control_db.tenant.find_many(order={"created_at": "desc"}, include={"subscription": True})
    out = [svc.tenant_view(t) for t in rows]
    if status:
        wanted = status.upper()
        out = [t for t in out if t["effective_status"] == wanted or t["status"] == wanted]
    if q:
        needle = q.strip().lower()
        out = [t for t in out if any(needle in (str(t.get(f)) or "").lower() for f in ("name", "owner_name", "email", "code", "city"))]
    return {"total": len(out), "items": out[offset:offset + limit]}


@router.post("/tenants", status_code=201)
async def create_tenant(req: TenantCreate, request: Request, user=Depends(require_super_admin)):
    tenant, invite = await svc.create_tenant(
        req.as_service_data(), actor=user, ip=audit.client_ip(request), send_invite=req.send_invitation,
        trial_days=req.trial_duration_days, plan_code=req.subscription_plan)
    t = await _tenant_or_404(tenant.id)
    return {"tenant": svc.tenant_view(t), "invitation": _invite_payload(invite)}


@router.get("/tenants/{tenant_id}")
async def tenant_detail(tenant_id: str):
    t = await _tenant_or_404(tenant_id)
    view = svc.tenant_view(t)
    users, counts = [], {"users": None, "items": None, "sales": None}
    if t.provision_status == "ready":
        try:
            async with tenancy.tenant_context(t.schema_name) as client:
                rows = await client.user.find_many(order={"created_at": "asc"})
                users = [{"username": u.username, "full_name": u.full_name, "role": u.role, "email": u.email, "is_active": u.is_active,
                          "created_at": u.created_at} for u in rows]
                counts = {"users": len(rows), "items": await client.item.count(), "sales": await client.sale.count()}
        except Exception:                                       # noqa: BLE001
            view["activity_error"] = "Could not read the tenant's data right now."
    invitations = await control_db.tenantinvitation.find_many(where={"tenant_id": tenant_id}, order={"created_at": "desc"}, take=20)
    history = await control_db.platformauditlog.find_many(where={"tenant_id": tenant_id}, order={"timestamp": "desc"}, take=30)
    ho_admin = next((u for u in users if u["role"] == "admin"), None)
    sub = view["subscription"] or {}
    return {"tenant": view,
            "business": {k: view[k] for k in ("name", "legal_name", "business_type", "gstin", "phone", "address", "city", "state",
                                              "country", "postal_code", "initial_outlet_name", "code")},
            "owner": {"owner_name": view["owner_name"], "email": view["email"], "phone": view["phone"]},
            "ho_admin": ho_admin, "users": users, "counts": counts,
            "subscription": {**sub, "status": view["effective_status"]},
            "trial": {"trial_start_date": sub.get("trial_start_date"), "trial_end_date": sub.get("trial_end_date"),
                      "trial_duration_days": sub.get("trial_duration_days"), "days_left": svc._days_left(sub.get("trial_end_date"))
                      if view["effective_status"] == "TRIAL" else None},
            "invitations": [_invitation_row(i) for i in invitations], "audit_history": [_audit_row(a) for a in history]}


@router.put("/tenants/{tenant_id}")
async def update_tenant(tenant_id: str, req: TenantUpdate, request: Request, user=Depends(require_super_admin)):
    t = await _tenant_or_404(tenant_id)
    data = req.model_dump(exclude_unset=True)
    trial_days = data.pop("trial_duration_days", None)
    if "legal_business_name" in data:
        data["legal_name"] = data.pop("legal_business_name")
    if "tenant_name" in data:
        data["name"] = data.pop("tenant_name")
    if "gstin" in data and data["gstin"]:
        data["gstin"] = data["gstin"].upper()
    if "email" in data and data["email"] != t.email:
        if t.status not in ("INVITED", "INVITATION_EXPIRED"):
            raise HTTPException(status_code=409, detail="The owner email can only be changed before the invitation is accepted.")
        await svc._ensure_email_free(data["email"], exclude_tenant_id=t.id)
    if data:
        await control_db.tenant.update(where={"id": tenant_id}, data=data)
    if trial_days is not None:
        await control_db.tenantsubscription.update(where={"tenant_id": tenant_id}, data={"trial_duration_days": trial_days})
    tenancy.invalidate_tenant(tenant_id)
    await audit.record(audit.TENANT_UPDATED, actor=user, tenant_id=tenant_id, ip=audit.client_ip(request),
                       metadata={"fields": sorted(list(data) + (["trial_duration_days"] if trial_days is not None else []))})
    return svc.tenant_view(await _tenant_or_404(tenant_id))


@router.patch("/tenants/{tenant_id}/status")
async def change_status(tenant_id: str, req: StatusChange, request: Request, user=Depends(require_super_admin)):
    t = await _tenant_or_404(tenant_id)
    ip = audit.client_ip(request)
    if req.action == "suspend":
        await svc.suspend_tenant(t, actor=user, ip=ip, reason=req.reason)
    elif req.action == "reactivate":
        await svc.reactivate_tenant(t, actor=user, ip=ip)
    else:                                                       # activate = start a paid subscription manually
        if not req.plan_code:
            raise HTTPException(status_code=422, detail="plan_code is required to activate a subscription.")
        await svc.confirm_payment(tenant_id, actor=user, ip=ip, plan_code=req.plan_code, reference=req.reason, source="super_admin")
    return svc.tenant_view(await _tenant_or_404(tenant_id))


@router.patch("/tenants/{tenant_id}")
async def admin_update(tenant_id: str, req: TenantAdminUpdate, request: Request, user=Depends(require_super_admin)):
    """Edit a tenant's status and/or subscription plan (Tenants and Users pages)."""
    t = await _tenant_or_404(tenant_id)
    updated = await svc.admin_update_tenant(t, actor=user, ip=audit.client_ip(request), status=req.status, plan_code=req.plan_code, reason=req.reason)
    return svc.tenant_view(updated)


@router.post("/tenants/{tenant_id}/invite")
async def invite(tenant_id: str, request: Request, user=Depends(require_super_admin)):
    t = await _tenant_or_404(tenant_id)
    result = await svc.send_invitation(t, actor=user, ip=audit.client_ip(request))
    return {"tenant": svc.tenant_view(await _tenant_or_404(tenant_id)), "invitation": _invite_payload(result)}


@router.post("/tenants/{tenant_id}/resend-invitation")
async def resend_invitation(tenant_id: str, request: Request, user=Depends(require_super_admin)):
    t = await _tenant_or_404(tenant_id)
    result = await svc.send_invitation(t, actor=user, ip=audit.client_ip(request), resend=True)
    return {"tenant": svc.tenant_view(await _tenant_or_404(tenant_id)), "invitation": _invite_payload(result)}


@router.post("/tenants/{tenant_id}/retry-provisioning")
async def retry_provisioning(tenant_id: str):
    t = await _tenant_or_404(tenant_id)
    if t.is_default:
        raise HTTPException(status_code=409, detail="The default store does not need provisioning.")
    ok = await svc.provision_tenant(tenant_id)
    return svc.tenant_view(await _tenant_or_404(tenant_id)) | {"provisioned": ok}


# --------------------------------------------------------------------------- tenant requests
def _request_row(r) -> dict:
    return {k: getattr(r, k, None) for k in ("id", "tenant_name", "legal_name", "owner_name", "email", "phone", "address", "city", "state",
                                             "country", "postal_code", "gstin", "business_type", "initial_outlet_name", "notes", "source",
                                             "status", "reviewed_by", "reviewed_at", "reject_reason", "tenant_id", "created_at")}


@router.get("/tenant-requests")
async def list_requests(status: Optional[str] = None):
    where = {"status": status.upper()} if status else {}
    rows = await control_db.tenantrequest.find_many(where=where, order={"created_at": "desc"}, take=500)
    return {"total": len(rows), "items": [_request_row(r) for r in rows]}


@router.get("/tenant-requests/{request_id}")
async def get_request(request_id: str):
    r = await control_db.tenantrequest.find_unique(where={"id": request_id})
    if r is None:
        raise HTTPException(status_code=404, detail="Request not found.")
    return _request_row(r)


@router.post("/tenant-requests/{request_id}/approve")
async def approve_request(request_id: str, request: Request, req: RequestApprove = RequestApprove(), user=Depends(require_super_admin)):
    r, tenant, invite = await svc.approve_request(request_id, actor=user, ip=audit.client_ip(request), trial_days=req.trial_duration_days,
                                                  plan_code=req.subscription_plan)
    return {"request": _request_row(r), "tenant": svc.tenant_view(await _tenant_or_404(tenant.id)), "invitation": _invite_payload(invite)}


@router.post("/tenant-requests/{request_id}/reject")
async def reject_request(request_id: str, request: Request, req: RequestReject = RequestReject(), user=Depends(require_super_admin)):
    return _request_row(await svc.reject_request(request_id, actor=user, ip=audit.client_ip(request), reason=req.reason))


# --------------------------------------------------------------------------- invitations, subscriptions, plans
def _invitation_row(i) -> dict:
    return {"id": i.id, "tenant_id": i.tenant_id, "email": i.email, "purpose": i.purpose, "status": i.status, "expires_at": i.expires_at,
            "used_at": i.used_at, "accepted_at": i.accepted_at, "created_by": i.created_by, "created_at": i.created_at}


@router.get("/invitations")
async def list_invitations(status: Optional[str] = None):
    where = {"status": status.upper()} if status else {}
    rows = await control_db.tenantinvitation.find_many(where=where, order={"created_at": "desc"}, take=500, include={"tenant": True})
    items = []
    for i in rows:
        row = _invitation_row(i)
        row["tenant_name"] = i.tenant.name if i.tenant else None
        items.append(row)
    return {"total": len(items), "items": items}


@router.get("/subscriptions")
async def list_subscriptions():
    rows = await control_db.tenant.find_many(order={"created_at": "desc"}, include={"subscription": True})
    items = []
    for t in rows:
        v = svc.tenant_view(t)
        sub = v["subscription"] or {}
        items.append({"tenant_id": t.id, "tenant_name": t.name, "status": v["effective_status"], **sub})
    return {"total": len(items), "items": items}


@router.post("/subscriptions/{tenant_id}/mark-paid")
async def mark_paid(tenant_id: str, req: MarkPaid, request: Request, user=Depends(require_super_admin)):
    """Super Admin confirms a payment received outside the app (until a payment gateway is connected)."""
    await _tenant_or_404(tenant_id)
    t = await svc.confirm_payment(tenant_id, actor=user, ip=audit.client_ip(request), plan_code=req.plan_code, reference=req.reference,
                                  source="super_admin")
    return svc.tenant_view(t)


@router.get("/plans")
async def list_plans():
    rows = await control_db.subscriptionplan.find_many(order={"price": "asc"})
    return {"items": [svc.plan_view(p) for p in rows]}


@router.post("/plans", status_code=201)
async def create_plan(req: PlanIn, request: Request, user=Depends(require_super_admin)):
    if await control_db.subscriptionplan.find_unique(where={"code": req.code}):
        raise HTTPException(status_code=409, detail="A plan with this code already exists.")
    p = await control_db.subscriptionplan.create(data=req.model_dump())
    await audit.record(audit.PLAN_CHANGED, actor=user, ip=audit.client_ip(request), metadata={"plan": p.code, "change": "created"})
    return svc.plan_view(p)


@router.put("/plans/{plan_id}")
async def update_plan(plan_id: str, req: PlanUpdate, request: Request, user=Depends(require_super_admin)):
    if await control_db.subscriptionplan.find_unique(where={"id": plan_id}) is None:
        raise HTTPException(status_code=404, detail="Plan not found.")
    data = req.model_dump(exclude_unset=True)
    p = await control_db.subscriptionplan.update(where={"id": plan_id}, data=data)
    await audit.record(audit.PLAN_CHANGED, actor=user, ip=audit.client_ip(request), metadata={"plan": p.code, "fields": sorted(data)})
    return svc.plan_view(p)


# --------------------------------------------------------------------------- notifications, audit logs, settings
def _notification_row(n) -> dict:
    return {"id": n.id, "type": n.type, "title": n.title, "message": n.message, "link": n.link, "tenant_id": n.tenant_id,
            "is_read": n.is_read, "created_at": n.created_at}


@router.get("/notifications")
async def list_notifications(unread: bool = False, limit: int = Query(100, ge=1, le=500)):
    where = {"audience": "super_admin", **({"is_read": False} if unread else {})}
    rows = await control_db.tenantnotification.find_many(where=where, order={"created_at": "desc"}, take=limit)
    unread_count = await control_db.tenantnotification.count(where={"audience": "super_admin", "is_read": False})
    return {"unread": unread_count, "items": [_notification_row(n) for n in rows]}


@router.post("/notifications/read-all")
async def read_all_notifications():
    n = await control_db.tenantnotification.update_many(where={"audience": "super_admin", "is_read": False}, data={"is_read": True})
    return {"updated": n}


@router.post("/notifications/{notification_id}/read")
async def read_notification(notification_id: str):
    n = await control_db.tenantnotification.update_many(where={"id": notification_id, "audience": "super_admin"}, data={"is_read": True})
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"updated": n}


def _audit_row(a) -> dict:
    import json
    meta = None
    if a.metadata_json:
        try:
            meta = json.loads(a.metadata_json)
        except ValueError:
            meta = a.metadata_json
    return {"id": a.id, "action": a.action, "actor_id": a.actor_id, "actor_role": a.actor_role, "actor_email": a.actor_email,
            "tenant_id": a.tenant_id, "ip_address": a.ip_address, "metadata": meta, "timestamp": a.timestamp}


@router.get("/audit-logs")
async def audit_logs(tenant_id: Optional[str] = None, action: Optional[str] = None, limit: int = Query(100, ge=1, le=500),
                     offset: int = Query(0, ge=0)):
    where = {**({"tenant_id": tenant_id} if tenant_id else {}), **({"action": action.upper()} if action else {})}
    rows = await control_db.platformauditlog.find_many(where=where, order={"timestamp": "desc"}, take=limit, skip=offset)
    total = await control_db.platformauditlog.count(where=where)
    return {"total": total, "items": [_audit_row(a) for a in rows]}


def _settings_view() -> dict:
    return {"default_trial_days": settings.DEFAULT_TRIAL_DAYS, "invitation_expiry_hours": settings.INVITATION_EXPIRY_HOURS,
            "trial_reminder_days": settings.TRIAL_REMINDER_DAYS, "expired_access_policy": settings.EXPIRED_ACCESS_POLICY,
            "smtp_configured": mailer.smtp_configured(), "payment_provider": settings.PAYMENT_PROVIDER,
            "frontend_base_url": settings.FRONTEND_BASE_URL}


_SETTING_KEYS = {"default_trial_days": "DEFAULT_TRIAL_DAYS", "invitation_expiry_hours": "INVITATION_EXPIRY_HOURS",
                 "trial_reminder_days": "TRIAL_REMINDER_DAYS", "expired_access_policy": "EXPIRED_ACCESS_POLICY"}


async def load_platform_settings() -> None:
    """Apply settings saved by the Super Admin over the .env defaults (called at startup)."""
    try:
        for row in await control_db.platformsetting.find_many():
            attr = _SETTING_KEYS.get(row.key)
            if attr:
                current = getattr(settings, attr)
                setattr(settings, attr, int(row.value) if isinstance(current, int) else row.value)
    except Exception:                                           # noqa: BLE001
        pass


@router.get("/settings")
async def get_settings():
    return _settings_view()


@router.put("/settings")
async def update_settings(req: SettingsUpdate, request: Request, user=Depends(require_super_admin)):
    changes = req.model_dump(exclude_unset=True, exclude_none=True)
    for key, value in changes.items():
        await control_db.platformsetting.upsert(where={"key": key}, data={"create": {"key": key, "value": str(value)},
                                                                         "update": {"value": str(value)}})
        setattr(settings, _SETTING_KEYS[key], value)
    tenancy.invalidate_tenant()
    await audit.record(audit.SETTINGS_CHANGED, actor=user, ip=audit.client_ip(request), metadata=changes)
    return _settings_view()


@router.post("/sweep")
async def run_sweep_now():
    """Run the expiry / reminder sweep immediately (it also runs hourly)."""
    return await svc.run_sweep()
