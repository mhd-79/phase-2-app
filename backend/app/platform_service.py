"""
Tenant lifecycle and onboarding logic for the Super Admin platform (superadmin.md).

Routers stay thin; everything that changes a tenant, invitation or subscription lives here and always
writes the audit trail and notifications the specification asks for.
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, status as http

from app import mailer, notifier, platform_audit as audit, tenancy
from app.config import settings
from app.database import control_db
from app.security import create_access_token, get_pin_hash, pwd_context, user_modules

logger = logging.getLogger("uvicorn.error")

TENANT_STATUSES = ["PENDING_APPROVAL", "APPROVED", "INVITED", "ACTIVATED", "TRIAL", "ACTIVE", "EXPIRED", "SUSPENDED", "REJECTED",
                   "INVITATION_EXPIRED", "DEACTIVATED"]
# statuses the Super Admin may set by hand (Tenants / Users pages)
EDITABLE_STATUSES = ["INVITED", "TRIAL", "ACTIVE", "SUSPENDED", "EXPIRED", "DEACTIVATED"]
PAYMENT_STATUSES = ["NOT_PAID", "PENDING", "PAID", "FAILED"]
SUSPENDABLE = {"ACTIVATED", "TRIAL", "ACTIVE", "EXPIRED"}
DEFAULT_PLANS = [
    # Prices are placeholders the Super Admin edits under Plans.
    dict(code="starter", name="Phase 1 – Core Billing", description="Core billing, stock and reports for a single store", price=999.0, duration_days=30,
         max_users=3, storage_mb=1024, ai_enabled=False, reports_enabled=True),
    dict(code="business", name="Phase 2 – Billing + Vendor Management", description="Core billing plus vendor management, purchasing and AI insights", price=2499.0, duration_days=30,
         max_users=10, storage_mb=5120, ai_enabled=True, reports_enabled=True),
    dict(code="enterprise", name="Phase 3 – Multi-Outlet and Franchise", description="Multi-outlet and franchise management with unlimited users and storage", price=4999.0, duration_days=30,
         max_users=None, storage_mb=None, ai_enabled=True, reports_enabled=True),
]


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    return dt.replace(tzinfo=timezone.utc) if dt is not None and dt.tzinfo is None else dt


# --------------------------------------------------------------------------- small helpers
def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_password(password: str) -> None:
    """Raises HTTP 422 with a clear message when the password is too weak."""
    if not password or len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    if len(password) > 128:
        raise HTTPException(status_code=422, detail="Password must be at most 128 characters.")
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(status_code=422, detail="Password must contain at least one letter and one number.")


def hash_password(password: str) -> str:
    return get_pin_hash(password)


def verify_password(password: str, hashed: Optional[str]) -> bool:
    if not hashed:
        return False
    try:
        return pwd_context.verify(str(password)[:72], hashed)
    except Exception:                                           # noqa: BLE001
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256((token or "").encode()).hexdigest()


def slugify_code(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return (base or "business")[:40]


async def unique_code(name: str) -> str:
    base = slugify_code(name)
    code, n = base, 1
    while await control_db.tenant.find_unique(where={"code": code}) is not None:
        n += 1
        code = f"{base}-{n}"
    return code


def invitation_link(token: str, purpose: str = "invite") -> str:
    path = "reset-password" if purpose == "password_reset" else "accept-invitation"
    return f"{settings.FRONTEND_BASE_URL}/{path}/{token}"


def tenant_view(t: Any, sub: Any = None) -> dict:
    """JSON-safe tenant summary (never includes secrets)."""
    sub = sub if sub is not None else getattr(t, "subscription", None)
    effective = tenancy.effective_status(t.status, sub, now_utc())
    out = {k: getattr(t, k, None) for k in (
        "id", "code", "name", "legal_name", "owner_name", "email", "phone", "address", "city", "state", "country", "postal_code",
        "gstin", "business_type", "initial_outlet_name", "status", "schema_name", "is_default", "provision_status", "provision_error",
        "request_id", "created_by", "created_at", "updated_at")}
    out["effective_status"] = effective
    out["subscription"] = subscription_view(sub) if sub is not None else None
    return out


def subscription_view(s: Any) -> dict:
    return {k: getattr(s, k, None) for k in (
        "current_plan", "plan_id", "trial_start_date", "trial_end_date", "trial_duration_days", "subscription_start_date",
        "subscription_end_date", "payment_status", "pending_plan_id")}


def _days_left(end: Optional[datetime]) -> Optional[int]:
    end = _aware(end)
    return None if end is None else max(0, -(-int((end - now_utc()).total_seconds()) // 86400))


# --------------------------------------------------------------------------- tenant creation
@dataclass
class InviteResult:
    delivery: str                       # smtp | logged
    delivered: bool
    expires_at: datetime
    invite_url: Optional[str]           # only when the email could not be delivered (Super Admin copies it)
    error: Optional[str] = None


async def _ensure_email_free(email: str, exclude_tenant_id: Optional[str] = None) -> None:
    """The owner's email is their sign-in name, so two live businesses cannot share one."""
    existing = await control_db.tenant.find_first(where={"email": email})
    if existing and existing.id != exclude_tenant_id and existing.status not in ("REJECTED",) and not existing.is_default:
        raise HTTPException(status_code=409, detail="A business with this owner email already exists.")
    if await control_db.platformuser.find_unique(where={"email": email}):
        raise HTTPException(status_code=409, detail="This email belongs to a platform account.")


async def create_tenant(data: dict, *, actor: Any, ip: Optional[str], request_id: Optional[str] = None,
                        send_invite: bool = True, trial_days: Optional[int] = None, plan_code: Optional[str] = None,
                        background: bool = True) -> Tuple[Any, Optional[InviteResult]]:
    """Create tenant + subscription record, start provisioning its database schema, optionally send the invitation."""
    email = normalize_email(data["email"])
    await _ensure_email_free(email)
    plan = None
    if plan_code:
        plan = await control_db.subscriptionplan.find_unique(where={"code": plan_code})
        if plan is None or not plan.is_active:
            raise HTTPException(status_code=422, detail="Unknown or inactive subscription plan.")
    trial_days = trial_days if trial_days and trial_days > 0 else settings.DEFAULT_TRIAL_DAYS
    tenant = await control_db.tenant.create(data={
        "code": await unique_code(data["tenant_name"]), "name": data["tenant_name"].strip(), "legal_name": data["legal_name"].strip(),
        "owner_name": data["owner_name"].strip(), "email": email, "phone": data["phone"].strip(), "address": data["address"].strip(),
        "city": data["city"].strip(), "state": data["state"].strip(), "country": (data.get("country") or "India").strip(),
        "postal_code": data["postal_code"].strip(), "gstin": data["gstin"].strip().upper(), "business_type": data["business_type"].strip(),
        "initial_outlet_name": (data.get("initial_outlet_name") or None), "status": "INVITED", "schema_name": tenancy.new_schema_name(),
        "provision_status": "pending", "request_id": request_id, "created_by": getattr(actor, "email", None) or getattr(actor, "username", None),
    })
    await control_db.tenantsubscription.create(data={
        "tenant_id": tenant.id, "current_plan": plan.name if plan else "Trial", "plan_id": plan.id if plan else None,
        "trial_duration_days": trial_days, "payment_status": "NOT_PAID"})
    await audit.record(audit.TENANT_CREATED, actor=actor, tenant_id=tenant.id, ip=ip,
                       metadata={"name": tenant.name, "email": email, "request_id": request_id, "trial_days": trial_days})
    if background:
        asyncio.create_task(provision_tenant(tenant.id))
    else:
        await provision_tenant(tenant.id)
    invite = await send_invitation(tenant, actor=actor, ip=ip) if send_invite else None
    return tenant, invite


async def provision_tenant(tenant_id: str) -> bool:
    """Create the tenant's schema and tables and seed its store settings. Safe to call again after a failure."""
    tenant = await control_db.tenant.find_unique(where={"id": tenant_id})
    if tenant is None or tenant.is_default:
        return False
    try:
        await tenancy.provision_schema(tenant.schema_name)
        async with tenancy.tenant_context(tenant.schema_name) as client:
            if await client.storesettings.find_unique(where={"id": "store_main"}) is None:
                await client.storesettings.create(data={
                    "id": "store_main", "store_name": tenant.initial_outlet_name or tenant.name,
                    "address": ", ".join(x for x in (tenant.address, tenant.city, tenant.state, tenant.postal_code) if x),
                    "phone": tenant.phone, "gstin": tenant.gstin})
        await control_db.tenant.update(where={"id": tenant_id}, data={"provision_status": "ready", "provision_error": None,
                                                                      "schema_version": tenancy.SCHEMA_VERSION})
        tenancy.invalidate_tenant(tenant_id)
        return True
    except Exception as exc:                                    # noqa: BLE001
        logger.exception("Provisioning tenant %s failed", tenant_id)
        await control_db.tenant.update(where={"id": tenant_id}, data={"provision_status": "failed", "provision_error": str(exc)[:500]})
        return False


# --------------------------------------------------------------------------- invitations
async def _revoke_pending(tenant_id: str, purpose: str) -> None:
    await control_db.tenantinvitation.update_many(
        where={"tenant_id": tenant_id, "purpose": purpose, "status": "PENDING"}, data={"status": "REVOKED"})


async def create_invitation(tenant: Any, *, purpose: str = "invite", created_by: Optional[str] = None) -> Tuple[str, Any]:
    """New single-use token. Any earlier pending token for the same purpose is revoked first."""
    await _revoke_pending(tenant.id, purpose)
    token = new_token()
    row = await control_db.tenantinvitation.create(data={
        "tenant_id": tenant.id, "email": tenant.email, "token_hash": hash_token(token), "purpose": purpose,
        "expires_at": now_utc() + timedelta(hours=settings.INVITATION_EXPIRY_HOURS), "created_by": created_by})
    return token, row


async def send_invitation(tenant: Any, *, actor: Any, ip: Optional[str], resend: bool = False) -> InviteResult:
    if tenant.status not in ("INVITED", "INVITATION_EXPIRED"):
        raise HTTPException(status_code=409, detail="This business has already accepted its invitation.")
    token, row = await create_invitation(tenant, created_by=getattr(actor, "email", None))
    link = invitation_link(token)
    subject, text, html_body = mailer.invitation_email(tenant.owner_name, tenant.name, link, settings.INVITATION_EXPIRY_HOURS)
    sent = await mailer.send_email(tenant.email, subject, text, html_body)
    if tenant.status != "INVITED":
        await control_db.tenant.update(where={"id": tenant.id}, data={"status": "INVITED"})
        tenancy.invalidate_tenant(tenant.id)
    await audit.record(audit.INVITATION_RESENT if resend else audit.INVITATION_GENERATED, actor=actor, tenant_id=tenant.id, ip=ip,
                       metadata={"email": tenant.email, "expires_at": row.expires_at, "delivery": sent["mode"], "delivered": sent["delivered"]})
    await notifier.notify_tenant(tenant.id, "invitation_received", "Invitation received",
                                 f"An invitation to activate {tenant.name} was sent to {tenant.email}.")
    return InviteResult(delivery=sent["mode"], delivered=sent["delivered"], expires_at=row.expires_at,
                        invite_url=None if sent["delivered"] else link, error=sent["error"])


class InvitationError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code, self.message, self.status_code = code, message, status_code

    def http(self) -> HTTPException:
        return HTTPException(status_code=self.status_code, detail={"code": self.code, "message": self.message})


async def lookup_invitation(token: str, purpose: Optional[str] = None) -> Tuple[Any, Any]:
    """Return (invitation, tenant) for a usable token, or raise InvitationError with the reason."""
    row = await control_db.tenantinvitation.find_unique(where={"token_hash": hash_token(token)})
    if row is None or (purpose and row.purpose != purpose):
        raise InvitationError("invalid", "This link is not valid.", 404)
    if row.status == "ACCEPTED" or row.used_at is not None:
        raise InvitationError("used", "This link has already been used.", 410)
    if row.status == "REVOKED":
        raise InvitationError("revoked", "This link has been replaced by a newer one. Please use the latest email.", 410)
    tenant = await control_db.tenant.find_unique(where={"id": row.tenant_id})
    if tenant is None:
        raise InvitationError("invalid", "This link is not valid.", 404)
    if row.status == "EXPIRED" or _aware(row.expires_at) <= now_utc():
        await control_db.tenantinvitation.update(where={"id": row.id}, data={"status": "EXPIRED"})
        if row.purpose == "invite" and tenant.status == "INVITED":
            await control_db.tenant.update(where={"id": tenant.id}, data={"status": "INVITATION_EXPIRED"})
            tenancy.invalidate_tenant(tenant.id)
        raise InvitationError("expired", "This link has expired. Please ask for a new invitation.", 410)
    return row, tenant


async def invitation_info(token: str) -> dict:
    row, tenant = await lookup_invitation(token)
    return {"valid": True, "purpose": row.purpose, "email": row.email, "business_name": tenant.name, "owner_name": tenant.owner_name,
            "expires_at": row.expires_at}


async def accept_invitation(token: str, password: str, *, ip: Optional[str]) -> dict:
    """Validate the token, create the tenant's HO Admin with the chosen password and start the trial. Single use."""
    validate_password(password)
    row, tenant = await lookup_invitation(token)
    if tenant.provision_status != "ready":
        raise InvitationError("preparing", "Your business workspace is still being prepared. Please try again in a minute.", 409)
    # claim the token first: only one concurrent request can flip PENDING -> ACCEPTED
    claimed = await control_db.tenantinvitation.update_many(
        where={"id": row.id, "status": "PENDING"}, data={"status": "ACCEPTED", "used_at": now_utc(), "accepted_at": now_utc()})
    if not claimed:
        raise InvitationError("used", "This link has already been used.", 410)

    if row.purpose == "password_reset":
        await _set_tenant_user_password(tenant, row.email, password)
        await audit.record(audit.PASSWORD_RESET_COMPLETED, actor_role="tenant", tenant_id=tenant.id, ip=ip, metadata={"email": row.email})
        return {"email": row.email, "business_name": tenant.name, "status": tenant.status, "purpose": "password_reset"}

    await _create_ho_admin(tenant, row.email, password)
    now = now_utc()
    sub = await control_db.tenantsubscription.find_unique(where={"tenant_id": tenant.id})
    days = (sub.trial_duration_days if sub else None) or settings.DEFAULT_TRIAL_DAYS
    await control_db.tenantsubscription.update(where={"tenant_id": tenant.id}, data={
        "trial_start_date": now, "trial_end_date": now + timedelta(days=days), "payment_status": "NOT_PAID", "trial_reminder_sent": False})
    await control_db.tenant.update(where={"id": tenant.id}, data={"status": "TRIAL"})
    tenancy.invalidate_tenant(tenant.id)
    actor = {"actor_role": "tenant"}
    await audit.record(audit.INVITATION_ACCEPTED, tenant_id=tenant.id, ip=ip, metadata={"email": row.email}, **actor)
    await audit.record(audit.PASSWORD_SETUP_COMPLETED, tenant_id=tenant.id, ip=ip, metadata={"email": row.email}, **actor)
    await audit.record(audit.TENANT_ACTIVATED, tenant_id=tenant.id, ip=ip, metadata={"status": "TRIAL", "trial_days": days}, **actor)
    await notifier.notify_super_admin("invitation_accepted", "Tenant invitation accepted",
                                      f"{tenant.name} accepted the invitation and started a {days}-day trial.", tenant_id=tenant.id,
                                      link=f"/super-admin/tenants/{tenant.id}")
    await notifier.notify_tenant(tenant.id, "trial_started", "Welcome to OKUTO", f"Your {days}-day trial has started.")
    return {"email": row.email, "business_name": tenant.name, "status": "TRIAL", "purpose": "invite"}


async def _create_ho_admin(tenant: Any, email: str, password: str) -> None:
    """The tenant's first admin lives in the tenant's own schema, as a normal admin user of that store."""
    async with tenancy.tenant_context(tenant.schema_name) as client:
        existing = await client.user.find_unique(where={"username": email})
        data = {"email": email, "password_hash": hash_password(password), "full_name": tenant.owner_name,
                "sub_text": "Admin · HO Admin", "role": "admin", "phase_access": 2, "is_active": True, "auto_lock": "15 min"}
        if existing:
            await client.user.update(where={"username": email}, data=data)
        else:
            # no PIN exists yet: store an unguessable hash so PIN sign-in is impossible until an admin sets one
            await client.user.create(data={"username": email, "pin_hash": get_pin_hash(secrets.token_urlsafe(24)), **data})


async def _set_tenant_user_password(tenant: Any, email: str, password: str) -> None:
    async with tenancy.tenant_context(tenant.schema_name) as client:
        user = await client.user.find_first(where={"email": email})
        if user is None:
            raise InvitationError("invalid", "This account no longer exists.", 404)
        await client.user.update(where={"id": user.id}, data={"password_hash": hash_password(password)})


async def request_password_reset(email: str, *, ip: Optional[str]) -> None:
    """Always silent for the caller (no account enumeration); sends a reset link when the email belongs to a business owner."""
    email = normalize_email(email)
    tenant = await control_db.tenant.find_first(where={"email": email})
    if tenant is None or tenant.is_default or tenant.status not in ("TRIAL", "ACTIVE", "EXPIRED", "ACTIVATED"):
        return
    token, row = await create_invitation(tenant, purpose="password_reset")
    subject, text, html_body = mailer.password_reset_email(tenant.owner_name, invitation_link(token, "password_reset"),
                                                           settings.INVITATION_EXPIRY_HOURS)
    await mailer.send_email(tenant.email, subject, text, html_body)


# --------------------------------------------------------------------------- tenant requests (future public website)
async def create_tenant_request(data: dict, ip: Optional[str]) -> Any:
    email = normalize_email(data["email"])
    dup = await control_db.tenantrequest.find_first(where={"email": email, "status": "PENDING_APPROVAL"})
    if dup:
        raise HTTPException(status_code=409, detail="A request for this email is already waiting for approval.")
    await _ensure_email_free(email)
    req = await control_db.tenantrequest.create(data={
        "tenant_name": data["tenant_name"].strip(), "legal_name": data["legal_name"].strip(), "owner_name": data["owner_name"].strip(),
        "email": email, "phone": data["phone"].strip(), "address": data["address"].strip(), "city": data["city"].strip(),
        "state": data["state"].strip(), "country": (data.get("country") or "India").strip(), "postal_code": data["postal_code"].strip(),
        "gstin": data["gstin"].strip().upper(), "business_type": data["business_type"].strip(),
        "initial_outlet_name": data.get("initial_outlet_name") or None, "notes": data.get("notes") or None,
        "source": data.get("source") or "website", "ip_address": ip})
    await audit.record(audit.TENANT_REQUEST_CREATED, actor_role="public", ip=ip, metadata={"request_id": req.id, "email": email, "name": req.tenant_name})
    await notifier.notify_super_admin("tenant_request", "New tenant registration request received",
                                      f"{req.tenant_name} ({req.owner_name}) asked to join.", link="/super-admin/tenant-requests", email=True)
    return req


async def approve_request(request_id: str, *, actor: Any, ip: Optional[str], trial_days: Optional[int] = None,
                          plan_code: Optional[str] = None) -> Tuple[Any, Any, Optional[InviteResult]]:
    req = await control_db.tenantrequest.find_unique(where={"id": request_id})
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.status != "PENDING_APPROVAL":
        raise HTTPException(status_code=409, detail=f"This request is already {req.status.lower().replace('_', ' ')}.")
    claimed = await control_db.tenantrequest.update_many(where={"id": request_id, "status": "PENDING_APPROVAL"},
                                                         data={"status": "APPROVED", "reviewed_by": actor.email, "reviewed_at": now_utc()})
    if not claimed:
        raise HTTPException(status_code=409, detail="This request was just reviewed by someone else.")
    try:
        tenant, invite = await create_tenant(
            {k: getattr(req, k) for k in ("tenant_name", "legal_name", "owner_name", "email", "phone", "address", "city", "state",
                                         "country", "postal_code", "gstin", "business_type", "initial_outlet_name")},
            actor=actor, ip=ip, request_id=request_id, send_invite=True, trial_days=trial_days, plan_code=plan_code)
    except Exception:
        await control_db.tenantrequest.update(where={"id": request_id}, data={"status": "PENDING_APPROVAL", "reviewed_by": None, "reviewed_at": None})
        raise
    req = await control_db.tenantrequest.update(where={"id": request_id}, data={"tenant_id": tenant.id})
    await audit.record(audit.TENANT_REQUEST_APPROVED, actor=actor, tenant_id=tenant.id, ip=ip, metadata={"request_id": request_id})
    return req, tenant, invite


async def reject_request(request_id: str, *, actor: Any, ip: Optional[str], reason: Optional[str]) -> Any:
    req = await control_db.tenantrequest.find_unique(where={"id": request_id})
    if req is None:
        raise HTTPException(status_code=404, detail="Request not found.")
    claimed = await control_db.tenantrequest.update_many(
        where={"id": request_id, "status": "PENDING_APPROVAL"},
        data={"status": "REJECTED", "reviewed_by": actor.email, "reviewed_at": now_utc(), "reject_reason": (reason or None)})
    if not claimed:
        raise HTTPException(status_code=409, detail=f"This request is already {req.status.lower().replace('_', ' ')}.")
    await audit.record(audit.TENANT_REQUEST_REJECTED, actor=actor, ip=ip, metadata={"request_id": request_id, "reason": reason})
    subject, text, html_body = mailer.notice_email("Your OKUTO registration request",
                                                   "Thank you for your interest. We are unable to approve your registration request right now."
                                                   + (f" Reason: {reason}" if reason else ""))
    await mailer.send_email(req.email, subject, text, html_body)
    return await control_db.tenantrequest.find_unique(where={"id": request_id})


# --------------------------------------------------------------------------- status changes and subscriptions
async def suspend_tenant(tenant: Any, *, actor: Any, ip: Optional[str], reason: Optional[str]) -> Any:
    if tenant.is_default:
        raise HTTPException(status_code=409, detail="The default store cannot be suspended.")
    if tenant.status == "SUSPENDED":
        raise HTTPException(status_code=409, detail="This business is already suspended.")
    if tenant.status not in SUSPENDABLE:
        raise HTTPException(status_code=409, detail=f"A business in status {tenant.status} cannot be suspended.")
    updated = await control_db.tenant.update(where={"id": tenant.id}, data={"status": "SUSPENDED", "status_before_suspend": tenant.status})
    tenancy.invalidate_tenant(tenant.id)
    await audit.record(audit.TENANT_SUSPENDED, actor=actor, tenant_id=tenant.id, ip=ip, metadata={"reason": reason, "was": tenant.status})
    await notifier.notify_tenant(tenant.id, "suspended", "Account suspended", "Your business account has been suspended.", email_to=tenant.email)
    return updated


async def reactivate_tenant(tenant: Any, *, actor: Any, ip: Optional[str]) -> Any:
    if tenant.status != "SUSPENDED":
        raise HTTPException(status_code=409, detail="Only a suspended business can be reactivated.")
    restored = tenant.status_before_suspend if tenant.status_before_suspend in SUSPENDABLE else "TRIAL"
    updated = await control_db.tenant.update(where={"id": tenant.id}, data={"status": restored, "status_before_suspend": None})
    tenancy.invalidate_tenant(tenant.id)
    await audit.record(audit.TENANT_REACTIVATED, actor=actor, tenant_id=tenant.id, ip=ip, metadata={"restored_status": restored})
    await notifier.notify_tenant(tenant.id, "reactivated", "Account reactivated", "Your business account is active again.", email_to=tenant.email)
    return updated


async def start_checkout(tenant_id: str, plan_code: str, *, actor: Any, ip: Optional[str]) -> dict:
    plan = await control_db.subscriptionplan.find_unique(where={"code": plan_code})
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=404, detail="Plan not found.")
    sub = await control_db.tenantsubscription.find_unique(where={"tenant_id": tenant_id})
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    await control_db.tenantsubscription.update(where={"tenant_id": tenant_id}, data={"pending_plan_id": plan.id, "payment_status": "PENDING"})
    await audit.record(audit.PAYMENT_STATUS_CHANGED, actor=actor, tenant_id=tenant_id, ip=ip, metadata={"status": "PENDING", "plan": plan.code})
    return {"checkout_id": f"co_{secrets.token_hex(8)}", "plan": plan_view(plan), "amount": plan.price, "currency": plan.currency,
            "payment_status": "PENDING", "gateway": settings.PAYMENT_PROVIDER}


async def confirm_payment(tenant_id: str, *, actor: Any, ip: Optional[str], plan_code: Optional[str] = None, success: bool = True,
                          reference: Optional[str] = None, source: str = "manual") -> Any:
    """The ONLY place a subscription becomes ACTIVE. Callers must have verified the payment (Super Admin or a gateway)."""
    tenant = await control_db.tenant.find_unique(where={"id": tenant_id})
    sub = await control_db.tenantsubscription.find_unique(where={"tenant_id": tenant_id})
    if tenant is None or sub is None:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    if tenant.status in ("SUSPENDED", "REJECTED", "INVITED", "INVITATION_EXPIRED", "PENDING_APPROVAL", "APPROVED"):
        raise HTTPException(status_code=409, detail=f"A business in status {tenant.status} cannot start a subscription.")
    plan_id = None
    if plan_code:
        plan = await control_db.subscriptionplan.find_unique(where={"code": plan_code})
    else:
        plan = await control_db.subscriptionplan.find_unique(where={"id": sub.pending_plan_id}) if sub.pending_plan_id else None
    if plan is None:
        raise HTTPException(status_code=422, detail="Choose a plan first.")
    if not success:
        await control_db.tenantsubscription.update(where={"tenant_id": tenant_id}, data={"payment_status": "FAILED"})
        await audit.record(audit.PAYMENT_STATUS_CHANGED, actor=actor, tenant_id=tenant_id, ip=ip, metadata={"status": "FAILED", "reference": reference})
        return await control_db.tenant.find_unique(where={"id": tenant_id}, include={"subscription": True})
    start = now_utc()
    # renewing before the end date extends from the current end date
    current_end = _aware(sub.subscription_end_date)
    base = current_end if tenant.status == "ACTIVE" and current_end and current_end > start else start
    await control_db.tenantsubscription.update(where={"tenant_id": tenant_id}, data={
        "plan_id": plan.id, "current_plan": plan.name, "subscription_start_date": sub.subscription_start_date if base is not start else start,
        "subscription_end_date": base + timedelta(days=plan.duration_days), "payment_status": "PAID", "pending_plan_id": None})
    await control_db.tenant.update(where={"id": tenant_id}, data={"status": "ACTIVE"})
    tenancy.invalidate_tenant(tenant_id)
    meta = {"plan": plan.code, "reference": reference, "source": source, "from_status": tenant.status}
    await audit.record(audit.PAYMENT_STATUS_CHANGED, actor=actor, tenant_id=tenant_id, ip=ip, metadata={**meta, "status": "PAID"})
    await audit.record(audit.SUBSCRIPTION_CHANGED, actor=actor, tenant_id=tenant_id, ip=ip, metadata={**meta, "status": "ACTIVE"})
    await notifier.notify_tenant(tenant_id, "subscription_activated", "Subscription activated",
                                 f"Your {plan.name} subscription is active. Thank you!", email_to=tenant.email)
    await notifier.notify_super_admin("subscription_changed", "Tenant payment/subscription status changed",
                                      f"{tenant.name} is now ACTIVE on {plan.name}.", tenant_id=tenant_id, link=f"/super-admin/tenants/{tenant_id}")
    return await control_db.tenant.find_unique(where={"id": tenant_id}, include={"subscription": True})


async def admin_update_tenant(tenant: Any, *, actor: Any, ip: Optional[str], status: Optional[str] = None, plan_code: Optional[str] = None,
                              reason: Optional[str] = None) -> Any:
    """Super Admin edits a tenant's status and/or subscription plan; the change takes effect on the tenant's very next request."""
    status = status.upper() if status else None
    if status is not None and status not in EDITABLE_STATUSES:
        raise HTTPException(status_code=422, detail=f"Status must be one of: {', '.join(EDITABLE_STATUSES)}.")
    if status is None and not plan_code:
        raise HTTPException(status_code=422, detail="Choose a status or a plan to change.")
    if status is not None and status != tenant.status and tenant.is_default:
        raise HTTPException(status_code=409, detail="The default store's status cannot be changed.")
    sub = await control_db.tenantsubscription.find_unique(where={"tenant_id": tenant.id})
    if sub is None:
        raise HTTPException(status_code=404, detail="Subscription not found.")
    now = now_utc()

    plan = None
    if plan_code:
        plan = await control_db.subscriptionplan.find_unique(where={"code": plan_code})
        if plan is None or (not plan.is_active and plan.id != sub.plan_id):
            raise HTTPException(status_code=404, detail="Plan not found.")

    sub_data: dict = {}
    tenant_data: dict = {}
    if plan is not None:
        sub_data.update({"plan_id": plan.id, "current_plan": plan.name, "pending_plan_id": None})

    if status is not None and status != tenant.status:
        accepted = None
        if not tenant.is_default:
            accepted = await control_db.tenantinvitation.find_first(where={"tenant_id": tenant.id, "purpose": "invite", "status": "ACCEPTED"})
        if status in ("TRIAL", "ACTIVE", "EXPIRED") and not tenant.is_default:
            if tenant.provision_status != "ready":
                raise HTTPException(status_code=409, detail="This business's workspace is not ready yet.")
            if accepted is None:
                raise HTTPException(status_code=409, detail="The owner has not accepted the invitation yet, so this status cannot be set.")
        if status == "INVITED" and accepted is not None:
            raise HTTPException(status_code=409, detail="The owner has already accepted the invitation. Use Suspend or Deactivate to block access.")
        if status == "TRIAL":
            end = _aware(sub.trial_end_date)
            if end is None or end <= now:                       # a lapsed trial is restarted for its configured length
                days = sub.trial_duration_days or settings.DEFAULT_TRIAL_DAYS
                sub_data.update({"trial_start_date": now, "trial_end_date": now + timedelta(days=days), "trial_reminder_sent": False})
        elif status == "ACTIVE":
            chosen = plan or (await control_db.subscriptionplan.find_unique(where={"id": sub.plan_id}) if sub.plan_id else None)
            if chosen is None:
                raise HTTPException(status_code=422, detail="Choose a plan before setting a tenant to Active.")
            end = _aware(sub.subscription_end_date)
            if end is None or end <= now:
                sub_data.update({"subscription_start_date": now, "subscription_end_date": now + timedelta(days=chosen.duration_days)})
            sub_data.update({"plan_id": chosen.id, "current_plan": chosen.name, "payment_status": "PAID", "pending_plan_id": None})
        tenant_data["status"] = status
        tenant_data["status_before_suspend"] = tenant.status if status == "SUSPENDED" and tenant.status in SUSPENDABLE else None

    previous_plan = getattr(sub, "current_plan", None)
    if sub_data:
        await control_db.tenantsubscription.update(where={"tenant_id": tenant.id}, data=sub_data)
    if tenant_data:
        await control_db.tenant.update(where={"id": tenant.id}, data=tenant_data)
    tenancy.invalidate_tenant(tenant.id)

    if "status" in tenant_data:
        await audit.record(audit.TENANT_STATUS_CHANGED, actor=actor, tenant_id=tenant.id, ip=ip,
                           metadata={"from": tenant.status, "to": status, "reason": reason})
        if status in ("SUSPENDED", "DEACTIVATED"):
            await notifier.notify_tenant(tenant.id, status.lower(), f"Account {status.lower()}",
                                         f"Your business account has been {status.lower()}.", email_to=tenant.email or None)
        elif tenant.status in ("SUSPENDED", "DEACTIVATED"):
            await notifier.notify_tenant(tenant.id, "reactivated", "Account reactivated", "Your business account is active again.",
                                         email_to=tenant.email or None)
    if plan is not None and plan.name != previous_plan:
        await audit.record(audit.SUBSCRIPTION_CHANGED, actor=actor, tenant_id=tenant.id, ip=ip,
                           metadata={"plan": plan.code, "from_plan": previous_plan, "source": "super_admin"})
        await notifier.notify_tenant(tenant.id, "plan_changed", "Subscription plan changed", f"Your plan is now {plan.name}.")
    return await control_db.tenant.find_unique(where={"id": tenant.id}, include={"subscription": True})


def plan_view(p: Any) -> dict:
    return {k: getattr(p, k, None) for k in ("id", "code", "name", "description", "price", "currency", "duration_days", "max_users",
                                             "storage_mb", "ai_enabled", "reports_enabled", "is_active")}


async def subscription_status(tenant: Any) -> dict:
    sub = await control_db.tenantsubscription.find_unique(where={"tenant_id": tenant.id})
    eff = tenancy.effective_status(tenant.status, sub, now_utc())
    end = (sub.trial_end_date if eff == "TRIAL" else sub.subscription_end_date) if sub else None
    plan = await control_db.subscriptionplan.find_unique(where={"id": sub.plan_id}) if sub and sub.plan_id else None
    left = _days_left(end)
    return {"tenant_id": tenant.id, "tenant_name": tenant.name, "status": eff, "stored_status": tenant.status,
            "current_plan": sub.current_plan if sub else None, "payment_status": sub.payment_status if sub else None,
            "trial_start_date": sub.trial_start_date if sub else None, "trial_end_date": sub.trial_end_date if sub else None,
            "subscription_start_date": sub.subscription_start_date if sub else None,
            "subscription_end_date": sub.subscription_end_date if sub else None, "days_left": left,
            "reminder": eff == "TRIAL" and left is not None and left <= settings.TRIAL_REMINDER_DAYS,
            "expired_policy": settings.EXPIRED_ACCESS_POLICY,
            "limits": ({"max_users": plan.max_users, "storage_mb": plan.storage_mb, "ai_enabled": plan.ai_enabled,
                        "reports_enabled": plan.reports_enabled} if plan else None)}


# --------------------------------------------------------------------------- sign in (email + password)
def _login_fail(message: str = "Invalid email or password") -> HTTPException:
    return HTTPException(status_code=http.HTTP_401_UNAUTHORIZED, detail=message)


def _access_error(tenant: Any, sub: Any) -> Optional[HTTPException]:
    """Sign-in refusals that need a specific, helpful message (the password was already verified by now)."""
    eff = tenancy.effective_status(tenant.status, sub, now_utc())
    if eff == "SUSPENDED":
        return HTTPException(status_code=403, detail="This business account has been suspended. Please contact the platform administrator.")
    if eff == "DEACTIVATED":
        return HTTPException(status_code=403, detail="This business account has been deactivated. Please contact the platform administrator.")
    if eff in ("INVITED", "INVITATION_EXPIRED", "PENDING_APPROVAL", "APPROVED", "REJECTED"):
        return HTTPException(status_code=403, detail="This business account has not been activated yet. Please use your invitation email.")
    if tenant.provision_status != "ready":
        return HTTPException(status_code=409, detail="Your business workspace is still being prepared. Please try again shortly.")
    return None


def _tenant_token_fields(tenant: Any, sub: Any) -> dict:
    eff = tenancy.effective_status(tenant.status, sub, now_utc())
    end = sub.trial_end_date if eff == "TRIAL" and sub else (sub.subscription_end_date if sub else None)
    return {"tenant_id": tenant.id, "tenant_name": tenant.name, "tenant_status": eff, "subscription_end": end}


async def login_with_password(email: str, password: str) -> dict:
    """Super Admin or a business owner (HO Admin) signing in with email + password. Returns the TokenResponse fields."""
    email = normalize_email(email)
    platform = await control_db.platformuser.find_unique(where={"email": email})
    if platform is not None:
        if not platform.is_active or not verify_password(password, platform.password_hash):
            raise _login_fail()
        await control_db.platformuser.update(where={"id": platform.id}, data={"last_login_at": now_utc()})
        token = create_access_token({"sub": platform.email, "role": "super_admin", "phase": 2})
        return {"access_token": token, "username": platform.email, "role": "super_admin", "full_name": platform.full_name,
                "sub_text": "Platform · Super Admin", "auto_lock": "30 min", "phase_access": 2, "active_counter": None}

    tenant = await control_db.tenant.find_first(where={"email": email})
    if tenant is None or tenant.is_default:
        verify_password(password, None)                     # keep timing similar for unknown accounts
        raise _login_fail()
    sub = await control_db.tenantsubscription.find_unique(where={"tenant_id": tenant.id})
    if tenant.provision_status != "ready" or tenant.status in ("INVITED", "INVITATION_EXPIRED", "PENDING_APPROVAL", "APPROVED", "REJECTED"):
        raise (_access_error(tenant, sub) or _login_fail())
    async with tenancy.tenant_context(tenant.schema_name) as client:
        user = await client.user.find_first(where={"email": email})
        if user is None or not user.is_active or not verify_password(password, user.password_hash):
            raise _login_fail()
        fields = {"username": user.username, "role": user.role, "full_name": user.full_name, "sub_text": user.sub_text,
                  "auto_lock": user.auto_lock or "15 min", "phase_access": user.phase_access or 2, "active_counter": user.active_counter,
                  "modules": user_modules(user)}
    denied = _access_error(tenant, sub)
    if denied:
        raise denied
    extra = _tenant_token_fields(tenant, sub)
    token = create_access_token({"sub": fields["username"], "role": fields["role"], "phase": fields["phase_access"], "tenant_id": tenant.id})
    return {"access_token": token, **fields, **extra}


# --------------------------------------------------------------------------- bootstrap and background sweep
# Earlier releases seeded these names; they are renamed in place (only when the Super Admin has not already edited them).
_LEGACY_PLANS = {
    "starter": ("Starter", "Single store billing, stock and reports"),
    "business": ("Business", "Adds the AI assistant and more users"),
    "enterprise": ("Enterprise", "Unlimited users and storage"),
}


async def ensure_default_plans() -> None:
    if await control_db.subscriptionplan.count() == 0:
        for p in DEFAULT_PLANS:
            await control_db.subscriptionplan.create(data=p)
        return
    for new in DEFAULT_PLANS:
        old_name, old_desc = _LEGACY_PLANS[new["code"]]
        plan = await control_db.subscriptionplan.find_unique(where={"code": new["code"]})
        if plan is None or plan.name != old_name:
            continue
        data = {"name": new["name"]}
        if (plan.description or "") == old_desc:
            data["description"] = new["description"]
        await control_db.subscriptionplan.update(where={"id": plan.id}, data=data)
        await control_db.tenantsubscription.update_many(where={"plan_id": plan.id}, data={"current_plan": new["name"]})
    await control_db.tenantsubscription.update_many(where={"current_plan": "Starter Trial"}, data={"current_plan": "Trial"})


async def ensure_default_tenant() -> None:
    """Register the original single store as the default tenant so it shows up for the Super Admin. Its data is untouched."""
    if await control_db.tenant.find_first(where={"is_default": True}) is not None:
        return
    name = "Okuto Mart"
    store = None
    try:
        store = await control_db.storesettings.find_unique(where={"id": "store_main"})
    except Exception:                                           # noqa: BLE001
        pass
    tenant = await control_db.tenant.create(data={
        "code": "default", "name": getattr(store, "store_name", None) or name, "legal_name": getattr(store, "store_name", None) or name,
        "owner_name": "Store Owner", "email": "", "phone": getattr(store, "phone", "") or "", "address": getattr(store, "address", "") or "",
        "city": "", "state": "", "country": "India", "postal_code": "", "gstin": getattr(store, "gstin", "") or "", "business_type": "Retail",
        "status": "ACTIVE", "schema_name": tenancy.DEFAULT_SCHEMA, "is_default": True, "provision_status": "ready", "created_by": "system"})
    await control_db.tenantsubscription.create(data={"tenant_id": tenant.id, "current_plan": "Default store", "payment_status": "PAID",
                                                     "subscription_start_date": now_utc()})


async def ensure_super_admin() -> None:
    """Create the bootstrap Super Admin from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD (there is no built-in default account)."""
    email, password = settings.SUPER_ADMIN_EMAIL, settings.SUPER_ADMIN_PASSWORD
    if not email or not password:
        if await control_db.platformuser.count() == 0:
            logger.warning("[Platform] No Super Admin exists. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (or run "
                           "scripts/create_super_admin.py) and restart to create one.")
        return
    if await control_db.platformuser.find_unique(where={"email": email}) is not None:
        return
    try:
        validate_password(password)
    except HTTPException as exc:
        logger.warning("[Platform] SUPER_ADMIN_PASSWORD rejected: %s", exc.detail)
        return
    await control_db.platformuser.create(data={"email": email, "full_name": settings.SUPER_ADMIN_NAME, "password_hash": hash_password(password)})
    logger.info("[Platform] Super Admin %s created.", email)


async def ensure_platform_ready() -> None:
    await ensure_default_plans()
    await ensure_default_tenant()
    await ensure_super_admin()


async def run_sweep() -> dict:
    """Persist expiries, send trial-ending reminders and expire stale invitations. Idempotent; safe to run any time."""
    now = now_utc()
    stats = {"expired": 0, "reminders": 0, "invitations_expired": 0}
    tenants = await control_db.tenant.find_many(where={"status": {"in": ["TRIAL", "ACTIVE"]}}, include={"subscription": True})
    for t in tenants:
        sub = t.subscription
        eff = tenancy.effective_status(t.status, sub, now)
        if eff == "EXPIRED":
            await control_db.tenant.update(where={"id": t.id}, data={"status": "EXPIRED"})
            tenancy.invalidate_tenant(t.id)
            stats["expired"] += 1
            kind = "trial" if t.status == "TRIAL" else "subscription"
            await audit.record(audit.TENANT_EXPIRED, actor_role="system", tenant_id=t.id, metadata={"was": t.status})
            await notifier.notify_super_admin("tenant_expired", "Tenant subscription expired", f"{t.name}: the {kind} has expired.",
                                              tenant_id=t.id, link=f"/super-admin/tenants/{t.id}")
            await notifier.notify_tenant(t.id, "trial_expired" if kind == "trial" else "subscription_expired",
                                         "Trial has expired" if kind == "trial" else "Subscription expired",
                                         "Please choose a plan to continue using OKUTO.", email_to=t.email or None)
        elif t.status == "TRIAL" and sub and not sub.trial_reminder_sent and sub.trial_end_date:
            left = _days_left(sub.trial_end_date)
            if left is not None and left <= settings.TRIAL_REMINDER_DAYS:
                await control_db.tenantsubscription.update(where={"tenant_id": t.id}, data={"trial_reminder_sent": True})
                stats["reminders"] += 1
                await notifier.notify_tenant(t.id, "trial_ending", "Trial is ending soon", f"Your trial ends in {left} day(s). Choose a plan to keep going.",
                                             email_to=t.email or None)
                await notifier.notify_super_admin("trial_ending", "Tenant trial is ending", f"{t.name}'s trial ends in {left} day(s).",
                                                  tenant_id=t.id, link=f"/super-admin/tenants/{t.id}")
    stale = await control_db.tenantinvitation.find_many(where={"status": "PENDING", "expires_at": {"lte": now}})
    for inv in stale:
        await control_db.tenantinvitation.update(where={"id": inv.id}, data={"status": "EXPIRED"})
        if inv.purpose == "invite":
            await control_db.tenant.update_many(where={"id": inv.tenant_id, "status": "INVITED"}, data={"status": "INVITATION_EXPIRED"})
            tenancy.invalidate_tenant(inv.tenant_id)
        stats["invitations_expired"] += 1
    return stats


async def upgrade_tenant_schemas() -> int:
    """Bring every ready tenant schema up to the current application tables (additive `prisma db push`). Returns how many were upgraded."""
    upgraded = 0
    rows = await control_db.tenant.find_many(where={"is_default": False, "provision_status": "ready", "schema_version": {"lt": tenancy.SCHEMA_VERSION}})
    for t in rows:
        try:
            await tenancy.provision_schema(t.schema_name)
            await control_db.tenant.update(where={"id": t.id}, data={"schema_version": tenancy.SCHEMA_VERSION})
            await tenancy.pool.close(t.schema_name)             # reconnect so the client sees the new tables / columns
            upgraded += 1
        except asyncio.CancelledError:
            raise
        except Exception:                                       # noqa: BLE001
            logger.exception("Upgrading the schema of tenant %s failed; it will be retried", t.id)
    return upgraded


async def sweeper_loop(interval_seconds: int = 3600) -> None:
    while True:
        try:
            await run_sweep()
            await upgrade_tenant_schemas()
        except asyncio.CancelledError:
            raise
        except Exception:                                       # noqa: BLE001
            logger.exception("Platform sweep failed")
        await asyncio.sleep(interval_seconds)
