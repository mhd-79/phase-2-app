"""In-app notifications (TenantNotification rows) plus the optional email that goes with them."""
from __future__ import annotations

import logging
from typing import Optional

from app import mailer
from app.database import control_db

logger = logging.getLogger("uvicorn.error")


async def _store(audience: str, type_: str, title: str, message: str, tenant_id: Optional[str], link: Optional[str]) -> None:
    try:
        await control_db.tenantnotification.create(data={
            "audience": audience, "tenant_id": tenant_id, "type": type_, "title": title, "message": message, "link": link})
    except Exception:                                           # noqa: BLE001
        logger.exception("Could not store notification %s", type_)


async def notify_super_admin(type_: str, title: str, message: str, tenant_id: Optional[str] = None,
                             link: Optional[str] = None, email: bool = False) -> None:
    """In-app notification for every Super Admin, and an email to each active Super Admin when `email` is set."""
    await _store("super_admin", type_, title, message, tenant_id, link)
    if not email:
        return
    try:
        admins = await control_db.platformuser.find_many(where={"is_active": True})
    except Exception:                                           # noqa: BLE001
        return
    subject, text, html_body = mailer.notice_email(title, message)
    for admin in admins:
        await mailer.send_email(admin.email, subject, text, html_body)


async def notify_tenant(tenant_id: str, type_: str, title: str, message: str, link: Optional[str] = None,
                        email_to: Optional[str] = None) -> None:
    await _store("tenant", type_, title, message, tenant_id, link)
    if email_to:
        subject, text, html_body = mailer.notice_email(title, message)
        await mailer.send_email(email_to, subject, text, html_body)
