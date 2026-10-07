"""
Outgoing email interface for the platform (invitations, password resets, subscription notices).

`send_email()` never raises: it reports what happened so the caller can fall back (for invitations the Super Admin is
shown the link to copy when no SMTP server is configured). Secrets in the message body (invitation links) are never logged.
"""
from __future__ import annotations

import asyncio
import html
import logging
import re
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Optional

from app.config import settings

logger = logging.getLogger("uvicorn.error")


# What callers (and through them the browser) are told when delivery fails. The real cause goes to the server log only.
ERR_UNREACHABLE = "The email server could not be reached."
ERR_REJECTED = "The email server did not accept the message."
ERR_LOGIN = "The email server did not accept the sign-in details."
ERR_ADDRESS = "The email address is not valid."
_EMAIL_RE = re.compile(r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")


def smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_FROM_EMAIL)


def valid_address(address: Optional[str]) -> bool:
    return bool(address) and len(address) <= 254 and bool(_EMAIL_RE.match(address.strip()))


def _send_sync(to: str, subject: str, text: str, html_body: Optional[str]) -> None:
    msg = EmailMessage()
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, settings.SMTP_FROM_EMAIL))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    if settings.SMTP_PORT == 465:                                # implicit TLS
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20, context=ssl.create_default_context()) as s:
            if settings.SMTP_USERNAME:
                s.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
            s.send_message(msg)
        return
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=20) as s:
        s.ehlo()
        if settings.SMTP_TLS and s.has_extn("starttls"):
            s.starttls(context=ssl.create_default_context())
            s.ehlo()
        elif settings.SMTP_USERNAME:
            raise smtplib.SMTPNotSupportedError("TLS is required before sending a login but the server does not offer STARTTLS")
        if settings.SMTP_USERNAME:
            s.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
        s.send_message(msg)


def _friendly(exc: Exception) -> str:
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return ERR_LOGIN
    if isinstance(exc, (smtplib.SMTPRecipientsRefused, smtplib.SMTPSenderRefused, smtplib.SMTPDataError, smtplib.SMTPResponseException, ValueError)):
        return ERR_REJECTED
    return ERR_UNREACHABLE                                      # refused / timed out / DNS / TLS problems


async def send_email(to: str, subject: str, text: str, html_body: Optional[str] = None) -> dict:
    """The one place the application sends email. Never raises.
    Returns {"delivered": bool, "mode": "smtp" | "logged", "error": str | None}; `error` is a short, safe message (never SMTP details)."""
    if not valid_address(to):
        logger.warning("Email not sent: invalid recipient address")
        return {"delivered": False, "mode": "logged", "error": ERR_ADDRESS}
    if not smtp_configured():
        logger.info("Email not sent (SMTP not configured): subject=%r", subject)
        return {"delivered": False, "mode": "logged", "error": None}
    try:
        await asyncio.to_thread(_send_sync, to.strip(), subject, text, html_body)
        return {"delivered": True, "mode": "smtp", "error": None}
    except Exception as exc:                                    # noqa: BLE001
        logger.warning("Email to %s failed: %s", to, type(exc).__name__)       # the type only: never the message, credentials or body
        return {"delivered": False, "mode": "smtp", "error": _friendly(exc)}


def send_in_background(to: str, subject: str, text: str, html_body: Optional[str] = None) -> None:
    """Sends without making the caller wait (the result is only logged). For notifications that must not slow a request down."""
    task = asyncio.ensure_future(send_email(to, subject, text, html_body))
    _background.add(task)
    task.add_done_callback(_background.discard)


_background: set = set()


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


def pin_reset_request_email(username: str, notes: str) -> tuple[str, str, str]:
    subject = "PIN reset requested"
    text = f"{username} has asked for a PIN reset ({notes}).\nReview it under Users & Roles and reset their PIN.\n"
    body = (f"<p><strong>{html.escape(username)}</strong> has asked for a PIN reset.</p><p style=\"color:#64748b;font-size:13px\">"
            f"{html.escape(notes)}</p><p>Review the request under <em>Users &amp; Roles</em> and reset their PIN.</p>")
    return subject, text, _wrap(subject, body)


def invoice_email(store_name: str, sale: dict) -> tuple[str, str, str]:
    """A copy of an invoice for the customer: items, discount, GST and total. `sale` is the sale record the billing API returns."""
    inv = sale.get("invoice_no") or sale.get("invoiceNo") or ""
    subject = f"Your invoice {inv} from {store_name}"
    lines = sale.get("lines") or []

    def money(v) -> str:
        return f"₹{float(v or 0):,.2f}"

    def qty_label(l: dict) -> str:
        q = float(l.get("qty") or 0)
        return f"{q:g} kg" if l.get("unit") == "kg" else f"{q:g}"

    text = [f"Thank you for shopping at {store_name}.", f"Invoice: {inv}", ""]
    rows = ""
    for l in lines:
        amount = l.get("final_amount", float(l.get("price") or 0) * float(l.get("qty") or 0))
        text.append(f"{l.get('name')}  x {qty_label(l)}  {money(amount)}")
        if float(l.get("discount_amount") or 0) > 0:
            text.append(f"    Discount{' (' + l['discount_name'] + ')' if l.get('discount_name') else ''}: -{money(l['discount_amount'])}")
        rows += (f"<tr><td>{html.escape(str(l.get('name')))}</td><td style='text-align:right'>{html.escape(qty_label(l))}</td>"
                 f"<td style='text-align:right'>{money(amount)}</td></tr>")
        if float(l.get("discount_amount") or 0) > 0:
            rows += (f"<tr><td colspan='2' style='color:#15803d;font-size:12px'>Discount{' (' + html.escape(l['discount_name']) + ')' if l.get('discount_name') else ''}</td>"
                     f"<td style='text-align:right;color:#15803d;font-size:12px'>-{money(l['discount_amount'])}</td></tr>")
    totals = [("Discount", sale.get("discount_total")), ("Taxable amount", sale.get("taxable_total")), ("GST", sale.get("gst_total"))]
    totals = [(k, v) for k, v in totals if v is not None and not (k == "Discount" and not float(v or 0))]
    for k, v in totals:
        text.append(f"{k}: {money(v)}")
    text += [f"TOTAL: {money(sale.get('grand_total'))}", "", "Thank you, visit again."]
    extra = "".join(f"<tr><td colspan='2' style='color:#64748b'>{k}</td><td style='text-align:right'>{money(v)}</td></tr>" for k, v in totals)
    body = (f"<p>Thank you for shopping at <strong>{html.escape(store_name)}</strong>.</p><p>Invoice <strong>{html.escape(str(inv))}</strong></p>"
            f"<table style='width:100%;border-collapse:collapse;font-size:14px' cellpadding='4'><thead><tr style='text-align:left;border-bottom:1px solid #e2e8f0'>"
            f"<th>Item</th><th style='text-align:right'>Qty</th><th style='text-align:right'>Amount</th></tr></thead><tbody>{rows}{extra}"
            f"<tr style='border-top:1px solid #0f172a;font-weight:700'><td colspan='2'>Total</td><td style='text-align:right'>{money(sale.get('grand_total'))}</td></tr></tbody></table>")
    return subject, "\n".join(text) + "\n", _wrap(subject, body)
