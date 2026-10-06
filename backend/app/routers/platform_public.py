"""
Platform APIs used by tenants and by the future public website:

  POST /tenant-requests                  public registration request (website integration point)
  GET  /invitations/{token}              validate an invitation / reset link
  POST /invitations/{token}/accept       set the password and activate the account
  GET  /subscriptions/plans              available plans
  POST /subscriptions/checkout           start checkout (tenant admin)
  POST /subscriptions/payment            verify a payment (gateway callback; refuses self-service without a gateway)
  GET  /subscriptions/status             the signed-in business's trial / subscription state
  GET  /notifications, POST /notifications/{id}/read   the business's in-app notifications
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app import platform_audit as audit
from app import platform_service as svc
from app import tenancy
from app.config import settings
from app.database import control_db
from app.routers.super_admin import TenantDetails
from app.security import get_current_user, require_admin
from app.tenant_middleware import decode_claims
from app.throttle import invitation_limiter, request_limiter
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

public_router = APIRouter(tags=["Platform (public)"])
subscriptions_router = APIRouter(prefix="/subscriptions", tags=["Subscriptions"])
notifications_router = APIRouter(prefix="/notifications", tags=["Notifications"])
_bearer = HTTPBearer(auto_error=False)


class TenantRequestIn(TenantDetails):
    notes: Optional[str] = Field(default=None, max_length=500)
    source: str = Field(default="website", max_length=30)


class AcceptIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirm_password: str = Field(min_length=1, max_length=128)


class SetPasswordIn(AcceptIn):
    token: str = Field(min_length=10, max_length=200)


async def accept_with_password(token: str, body: AcceptIn, request: Request) -> dict:
    """Shared by POST /invitations/{token}/accept and POST /auth/set-password."""
    ip = audit.client_ip(request)
    invitation_limiter.hit(f"accept:{ip}")
    if body.password != body.confirm_password:
        raise HTTPException(status_code=422, detail="The two passwords do not match.")
    try:
        return await svc.accept_invitation(token, body.password, ip=ip)
    except svc.InvitationError as err:
        raise err.http()


# --------------------------------------------------------------------------- public: tenant request, invitations
@public_router.post("/tenant-requests", status_code=201)
async def submit_tenant_request(req: TenantRequestIn, request: Request):
    """Called by the (future) public website. Creates a PENDING_APPROVAL request and notifies the Super Admin."""
    ip = audit.client_ip(request)
    request_limiter.hit(f"request:{ip}")
    row = await svc.create_tenant_request({**req.as_service_data(), "notes": req.notes, "source": req.source}, ip)
    return {"id": row.id, "status": row.status, "message": "Your request was received and is waiting for approval."}


@public_router.get("/invitations/{token}")
async def validate_invitation(token: str, request: Request):
    invitation_limiter.hit(f"validate:{audit.client_ip(request)}")
    try:
        return await svc.invitation_info(token)
    except svc.InvitationError as err:
        raise err.http()


@public_router.post("/invitations/{token}/accept")
async def accept_invitation(token: str, body: AcceptIn, request: Request):
    return await accept_with_password(token, body, request)


# --------------------------------------------------------------------------- tenant: subscription
async def request_tenant(credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer), user=Depends(get_current_user)):
    """The business of the signed-in user (legacy tokens without a tenant belong to the default store)."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    claims = decode_claims(credentials.credentials)
    tenant_id = (claims or {}).get("tenant_id")
    tenant = (await control_db.tenant.find_unique(where={"id": tenant_id}) if tenant_id
              else await control_db.tenant.find_first(where={"is_default": True}))
    if tenant is None:
        raise HTTPException(status_code=404, detail="Business not found.")
    return tenant


@subscriptions_router.get("/plans")
async def plans(user=Depends(get_current_user)):
    rows = await control_db.subscriptionplan.find_many(where={"is_active": True}, order={"price": "asc"})
    return {"items": [svc.plan_view(p) for p in rows]}


@subscriptions_router.get("/status")
async def status(tenant=Depends(request_tenant)):
    return await svc.subscription_status(tenant)


class CheckoutIn(BaseModel):
    plan_code: str = Field(min_length=2, max_length=40)


class PaymentIn(BaseModel):
    plan_code: Optional[str] = None
    provider_reference: Optional[str] = Field(default=None, max_length=120)
    success: bool = True


@subscriptions_router.post("/checkout")
async def checkout(body: CheckoutIn, request: Request, tenant=Depends(request_tenant), user=Depends(require_admin)):
    if tenant.is_default:
        raise HTTPException(status_code=409, detail="The default store has no platform subscription to change.")
    result = await svc.start_checkout(tenant.id, body.plan_code, actor=user, ip=audit.client_ip(request))
    result["message"] = ("Payment gateway not connected yet. Your plan request is recorded; the platform administrator will confirm payment."
                         if settings.PAYMENT_PROVIDER == "none" else "Continue to payment.")
    return result


@subscriptions_router.post("/payment")
async def payment(body: PaymentIn, request: Request, tenant=Depends(request_tenant), user=Depends(require_admin)):
    """Payment verification entry point.

    A business can never mark itself as paid. Until a real gateway is wired in here (verify the gateway signature, then
    call svc.confirm_payment), only PAYMENT_PROVIDER=dev simulates a successful payment, for development.
    """
    if settings.PAYMENT_PROVIDER != "dev":
        raise HTTPException(status_code=501, detail="Online payment is not available yet. The platform administrator confirms payments for now.")
    await svc.confirm_payment(tenant.id, actor=user, ip=audit.client_ip(request), plan_code=body.plan_code, success=body.success,
                              reference=body.provider_reference or "dev-simulated", source="dev")
    return await svc.subscription_status(await control_db.tenant.find_unique(where={"id": tenant.id}))


# --------------------------------------------------------------------------- tenant: notifications
@notifications_router.get("")
async def my_notifications(tenant=Depends(request_tenant), unread: bool = False):
    where = {"audience": "tenant", "tenant_id": tenant.id, **({"is_read": False} if unread else {})}
    rows = await control_db.tenantnotification.find_many(where=where, order={"created_at": "desc"}, take=50)
    return {"items": [{"id": n.id, "type": n.type, "title": n.title, "message": n.message, "link": n.link, "is_read": n.is_read,
                       "created_at": n.created_at} for n in rows]}


@notifications_router.post("/{notification_id}/read")
async def read_my_notification(notification_id: str, tenant=Depends(request_tenant)):
    n = await control_db.tenantnotification.update_many(where={"id": notification_id, "audience": "tenant", "tenant_id": tenant.id},
                                                         data={"is_read": True})
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"updated": n}
