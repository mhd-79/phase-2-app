"""
Outgoing email interface for the platform (invitations, password resets, subscription notices).

`send_email()` never raises: it reports what happened so the caller can fall back (for invitations the Super Admin is
shown the link to copy when no SMTP server is configured). Secrets in the message body (invitation links) are never logged.
"""
from __future__ import annotations

import asyncio
import html
import logging
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional

from app.config import settings

logger = logging.getLogger("uvicorn.error")


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM)


def _send_sync(to: str, subject: str, text: str, html_body: Optional[str]) -> None:
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    if settings.SMTP_PORT == 465:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20, context=ssl.create_default_context()) as s:
            if settings.SMTP_USER:
                s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            s.send_message(msg)
        return
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
        if settings.SMTP_TLS:
            s.starttls(context=ssl.create_default_context())
        if settings.SMTP_USER:
            s.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        s.send_message(msg)


async def send_email(to: str, subject: str, text: str, html_body: Optional[str] = None) -> dict:
    """Returns {"delivered": bool, "mode": "smtp" | "logged", "error": str | None}."""
    if not smtp_configured():
        logger.info("Email not sent (SMTP not configured): to=%s subject=%r", to, subject)
        return {"delivered": False, "mode": "logged", "error": None}
    try:
        await asyncio.to_thread(_send_sync, to, subject, text, html_body)
        return {"delivered": True, "mode": "smtp", "error": None}
    except Exception as exc:                                    # noqa: BLE001
        logger.warning("Email to %s failed: %s", to, type(exc).__name__)
        return {"delivered": False, "mode": "smtp", "error": f"{type(exc).__name__}: {str(exc)[:160]}"}


# --------------------------------------------------------------------------- message templates
def _wrap(title: str, body_html: str) -> str:
    return (f'<div style="font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">'
            f'<h2 style="color:#4a4fd6">{html.escape(title)}</h2>{body_html}'
            f'<p style="color:#64748b;font-size:12px;margin-top:24px">OKUTO Billing &amp; POS</p></div>')


def invitation_email(owner_name: str, business_name: str, link: str, expires_hours: int) -> tuple[str, str, str]:
    subject = "Invitation to join OKUTO Billing & POS"
    text = (f"Hello {owner_name},\n\nYou have been invited to activate the business account for {business_name} on OKUTO Billing & POS.\n"
            f"Open this link to verify the invitation, create your password and sign in:\n{link}\n\n"
            f"The link can be used once and expires in {expires_hours} hours.\n")
    body = (f"<p>Hello {html.escape(owner_name)},</p><p>You have been invited to activate the business account for "
            f"<strong>{html.escape(business_name)}</strong>. Verify the invitation, create your password and sign in.</p>"
            f'<p><a href="{html.escape(link)}" style="background:#4a4fd6;color:#fff;padding:10px 18px;border-radius:8px;'
            f'text-decoration:none">Activate account</a></p><p style="color:#64748b;font-size:13px">The link can be used once and '
            f"expires in {expires_hours} hours.</p>")
    return subject, text, _wrap(subject, body)


def password_reset_email(owner_name: str, link: str, expires_hours: int) -> tuple[str, str, str]:
    subject = "Reset your OKUTO password"
    text = (f"Hello {owner_name},\n\nUse this link to choose a new password:\n{link}\n\n"
            f"It can be used once and expires in {expires_hours} hours. If you did not ask for this, ignore this email.\n")
    body = (f"<p>Hello {html.escape(owner_name)},</p><p>Use the button below to choose a new password.</p>"
            f'<p><a href="{html.escape(link)}" style="background:#4a4fd6;color:#fff;padding:10px 18px;border-radius:8px;'
            f'text-decoration:none">Choose a new password</a></p><p style="color:#64748b;font-size:13px">It can be used once and '
            f"expires in {expires_hours} hours. If you did not ask for this, you can ignore this email.</p>")
    return subject, text, _wrap(subject, body)


def notice_email(title: str, message: str) -> tuple[str, str, str]:
    return title, f"{message}\n", _wrap(title, f"<p>{html.escape(message)}</p>")
