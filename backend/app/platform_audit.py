"""Audit trail of Super Admin and tenant-onboarding actions (superadmin.md `audit_logs`). Stored in the control plane."""
from __future__ import annotations

import json
import logging
from typing import Any, Optional

from fastapi import Request

from app.database import control_db

logger = logging.getLogger("uvicorn.error")

# events listed in superadmin.md
TENANT_REQUEST_CREATED = "TENANT_REQUEST_CREATED"
TENANT_REQUEST_APPROVED = "TENANT_REQUEST_APPROVED"
TENANT_REQUEST_REJECTED = "TENANT_REQUEST_REJECTED"
TENANT_CREATED = "TENANT_CREATED"
TENANT_UPDATED = "TENANT_UPDATED"
INVITATION_GENERATED = "INVITATION_GENERATED"
INVITATION_RESENT = "INVITATION_RESENT"
INVITATION_ACCEPTED = "INVITATION_ACCEPTED"
PASSWORD_SETUP_COMPLETED = "PASSWORD_SETUP_COMPLETED"
PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED"
TENANT_ACTIVATED = "TENANT_ACTIVATED"
TENANT_SUSPENDED = "TENANT_SUSPENDED"
TENANT_REACTIVATED = "TENANT_REACTIVATED"
TENANT_STATUS_CHANGED = "TENANT_STATUS_CHANGED"
SUBSCRIPTION_CHANGED = "SUBSCRIPTION_CHANGED"
PAYMENT_STATUS_CHANGED = "PAYMENT_STATUS_CHANGED"
TENANT_EXPIRED = "TENANT_EXPIRED"
PLAN_CHANGED = "PLAN_CHANGED"
SETTINGS_CHANGED = "SETTINGS_CHANGED"


def client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()[:64]
    return request.client.host if request.client else None


async def record(action: str, *, actor: Any = None, actor_role: Optional[str] = None, tenant_id: Optional[str] = None,
                 ip: Optional[str] = None, metadata: Optional[dict] = None) -> None:
    """Never raises: a logging problem must not undo or block the action being audited."""
    try:
        await control_db.platformauditlog.create(data={
            "actor_id": getattr(actor, "id", None),
            "actor_role": actor_role or getattr(actor, "role", None) or "system",
            "actor_email": getattr(actor, "email", None) or getattr(actor, "username", None),
            "tenant_id": tenant_id,
            "action": action,
            "ip_address": ip,
            "metadata_json": json.dumps(metadata, default=str) if metadata else None,
        })
    except Exception:                                           # noqa: BLE001
        logger.exception("Could not write platform audit entry %s", action)
