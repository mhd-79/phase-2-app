"""
The central email service: settings names, MailHog-style delivery (no TLS, no login), safe errors, the forgot-PIN admin email and the invoice email.
Everything uses a fake SMTP server except the last test, which sends one real message through MailHog when it is running.
"""
import asyncio
import json
import os
import smtplib
import subprocess
import sys
import urllib.request
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import mailer
from app.config import settings
from app.database import db
from app.security import get_current_user


# ------------------------------------------------------------------------------------------ fake SMTP server
class FakeSMTP:
    """Stands in for smtplib.SMTP. `FakeSMTP.behaviour` picks what the server does; `FakeSMTP.sent` collects delivered messages."""
    behaviour: dict = {}
    sent: list = []
    log: list = []

    def __init__(self, host, port, timeout=None):
        if self.behaviour.get("refuse"):
            raise ConnectionRefusedError("[Errno 111] Connection refused (secret-host.internal:1025)")
        self.host, self.port = host, port

    def __enter__(self): return self
    def __exit__(self, *a): return False
    def ehlo(self): self.log.append("ehlo")
    def has_extn(self, name): return bool(self.behaviour.get("starttls")) and name == "starttls"
    def starttls(self, context=None): self.log.append("starttls")

    def login(self, user, password):
        self.log.append(("login", user, password))
        if self.behaviour.get("bad_login"):
            raise smtplib.SMTPAuthenticationError(535, b"5.7.8 Username and Password not accepted for secret-user")

    def send_message(self, msg):
        if self.behaviour.get("reject"):
            raise smtplib.SMTPRecipientsRefused({msg["To"]: (550, b"mailbox unavailable")})
        self.sent.append(msg)


@pytest.fixture
def smtp(monkeypatch):
    FakeSMTP.behaviour, FakeSMTP.sent, FakeSMTP.log = {}, [], []
    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    for k, v in dict(SMTP_HOST="localhost", SMTP_PORT=1025, SMTP_USERNAME="", SMTP_PASSWORD="", SMTP_FROM_EMAIL="noreply@okutomart.com",
                     SMTP_FROM_NAME="Okuto Mart", SMTP_TLS=True).items():
        monkeypatch.setattr(settings, k, v)
    return FakeSMTP


def send(**kw):
    args = dict(to="customer@example.com", subject="Hello", text="Body", html_body="<p>Body</p>")
    args.update(kw)
    return asyncio.run(mailer.send_email(args["to"], args["subject"], args["text"], args["html_body"]))


# ------------------------------------------------------------------------------------------ settings
def _settings_in_subprocess(env):
    code = "from app.config import settings as s; import json; print(json.dumps([s.SMTP_HOST, s.SMTP_PORT, s.SMTP_USERNAME, s.SMTP_PASSWORD, s.SMTP_FROM_EMAIL, s.SMTP_FROM_NAME]))"
    clean = {k: v for k, v in os.environ.items() if not k.startswith("SMTP_")}
    clean.update(env)
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=clean, cwd=os.path.dirname(os.path.dirname(__file__)))
    return json.loads(out.stdout.strip().splitlines()[-1])


def test_new_variable_names_are_read():
    got = _settings_in_subprocess({"SMTP_HOST": "localhost", "SMTP_PORT": "1025", "SMTP_USERNAME": "u", "SMTP_PASSWORD": "p",
                                   "SMTP_FROM_EMAIL": "noreply@okutomart.com", "SMTP_FROM_NAME": "Okuto Mart"})
    assert got == ["localhost", 1025, "u", "p", "noreply@okutomart.com", "Okuto Mart"]


def test_names_used_by_earlier_releases_still_work():
    # the new names are present but empty (as in a fresh .env): the old ones fill in
    got = _settings_in_subprocess({"SMTP_HOST": "mail", "SMTP_USERNAME": "", "SMTP_FROM_EMAIL": "", "SMTP_USER": "old-user", "SMTP_FROM": "old@x.com"})
    assert got[2] == "old-user" and got[4] == "old@x.com" and got[5] == "Okuto Mart"


def test_no_external_email_provider_or_credentials_are_written_into_the_code():
    root = os.path.join(os.path.dirname(os.path.dirname(__file__)), "app")
    banned = ("smtp.gmail", "smtp.office365", "outlook.com", "sendgrid", "mailgun", "amazonaws.com", "smtp-mail")
    for folder, _, files in os.walk(root):
        for name in files:
            if name.endswith(".py"):
                text = open(os.path.join(folder, name), encoding="utf-8").read().lower()
                assert not any(b in text for b in banned), f"{name} mentions an external email provider"


# ------------------------------------------------------------------------------------------ delivery
def test_mailhog_style_server_gets_the_message_without_tls_or_login(smtp):
    r = send()
    assert r == {"delivered": True, "mode": "smtp", "error": None}
    m = smtp.sent[0]
    assert m["To"] == "customer@example.com" and m["Subject"] == "Hello"
    assert m["From"] == "Okuto Mart <noreply@okutomart.com>"
    assert "starttls" not in smtp.log and not any(isinstance(x, tuple) for x in smtp.log)


def test_starttls_is_used_when_the_server_offers_it(smtp):
    smtp.behaviour = {"starttls": True}
    assert send()["delivered"] and "starttls" in smtp.log


def test_login_is_used_only_over_tls(smtp, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USERNAME", "user")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "pw")
    smtp.behaviour = {"starttls": True}
    assert send()["delivered"] and ("login", "user", "pw") in smtp.log
    smtp.behaviour, smtp.sent, smtp.log = {}, [], []                   # no STARTTLS offered: the password is never sent
    r = send()
    assert not r["delivered"] and smtp.sent == [] and not any(isinstance(x, tuple) for x in smtp.log)


def test_not_configured_is_a_quiet_no_op(smtp, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_HOST", "")
    assert send() == {"delivered": False, "mode": "logged", "error": None} and smtp.sent == []


# ------------------------------------------------------------------------------------------ failures: clear, safe, never raised
@pytest.mark.parametrize("behaviour,expected", [
    ({"refuse": True}, mailer.ERR_UNREACHABLE),
    ({"reject": True}, mailer.ERR_REJECTED),
])
def test_failures_return_a_short_safe_message(smtp, behaviour, expected):
    smtp.behaviour = behaviour
    r = send()
    assert r["delivered"] is False and r["mode"] == "smtp" and r["error"] == expected


def test_login_failure_is_reported_without_details(smtp, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USERNAME", "secret-user")
    smtp.behaviour = {"starttls": True, "bad_login": True}
    assert send()["error"] == mailer.ERR_LOGIN


def test_error_text_never_contains_server_details(smtp, monkeypatch):
    monkeypatch.setattr(settings, "SMTP_USERNAME", "secret-user")
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "secret-password")
    for behaviour in ({"refuse": True}, {"reject": True}, {"starttls": True, "bad_login": True}, {}):
        smtp.behaviour = behaviour
        text = json.dumps(send())
        for leak in ("secret-host", "secret-user", "secret-password", "1025", "Errno", "5.7.8", "mailbox unavailable", "localhost"):
            assert leak not in text, (behaviour, leak)


@pytest.mark.parametrize("bad", ["", "not-an-email", "a@b", "x@y.com\nBcc: evil@z.com", "two@x.com, three@x.com", None])
def test_bad_recipient_is_refused_before_anything_is_sent(smtp, bad):
    r = send(to=bad)
    assert r["delivered"] is False and r["error"] == mailer.ERR_ADDRESS and smtp.sent == []


def test_background_send_never_raises_into_the_caller(smtp):
    smtp.behaviour = {"refuse": True}

    async def run():
        mailer.send_in_background("customer@example.com", "s", "t")
        await asyncio.sleep(0.05)
        return len(mailer._background)
    assert asyncio.run(run()) == 0                                     # finished (failed quietly) and was released


# ------------------------------------------------------------------------------------------ templates
def test_invoice_email_lists_items_discount_and_total():
    sale = {"invoice_no": "INV-FY26-01030", "grand_total": 239.0, "discount_total": 20.0, "taxable_total": 230.0, "gst_total": 9.0,
            "lines": [{"name": "Rice", "qty": 2, "unit": "pcs", "price": 100.0, "final_amount": 189.0, "discount_amount": 20.0, "discount_name": "Festive 10%"},
                      {"name": "Dal <b>", "qty": 1.5, "unit": "kg", "price": 50.0, "final_amount": 50.0, "discount_amount": 0.0, "discount_name": None}]}
    subject, text, html_body = mailer.invoice_email("Okuto Mart", sale)
    assert subject == "Your invoice INV-FY26-01030 from Okuto Mart"
    assert "Rice" in text and "Festive 10%" in text and "-₹20.00" in text and "TOTAL: ₹239.00" in text and "1.5 kg" in text
    assert "Dal &lt;b&gt;" in html_body and "<b>" not in html_body.replace("<b>", "", 0) .split("Dal")[1][:12]       # item names are escaped


def test_pin_reset_request_email_names_the_user():
    subject, text, html_body = mailer.pin_reset_request_email("priya.k", "Forgot PIN requested from Login UI")
    assert "priya.k" in text and "priya.k" in html_body and subject == "PIN reset requested"


# ------------------------------------------------------------------------------------------ the API
@pytest.fixture
def api(monkeypatch):
    from app.main import app
    monkeypatch.setattr(type(db), "is_connected", lambda self: False)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(username="a", role="cashier", full_name="A", phase_access=2, modules_json=None)
    yield TestClient(app, headers={"Authorization": "Bearer test"})
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def sale():
    from app.routers import billing
    record = {"invoice_no": "INV-MAIL-1", "time": "2026-10-07T10:00:00", "pricing_mode": "exclusive", "grand_total": 105.0, "discount_total": 0.0,
              "taxable_total": 100.0, "gst_total": 5.0, "lines": [{"name": "Rice", "qty": 1, "unit": "pcs", "price": 100.0, "final_amount": 105.0, "discount_amount": 0.0}],
              "tenders": []}
    billing._FALLBACK_SALES.append(record)
    yield record
    billing._FALLBACK_SALES[:] = [s for s in billing._FALLBACK_SALES if s["invoice_no"] != "INV-MAIL-1"]


def test_invoice_can_be_emailed_through_the_central_service(api, sale, monkeypatch):
    captured = {}

    async def fake_send(to, subject, text, html_body=None):
        captured.update(to=to, subject=subject, text=text)
        return {"delivered": True, "mode": "smtp", "error": None}
    monkeypatch.setattr(mailer, "send_email", fake_send)
    r = api.post("/api/v1/billing/sales/INV-MAIL-1/email", json={"email": "customer@example.com"})
    assert r.status_code == 200 and "emailed" in r.json()["message"]
    assert captured["to"] == "customer@example.com" and "INV-MAIL-1" in captured["subject"] and "TOTAL: ₹105.00" in captured["text"]


def test_invoice_email_rejects_a_bad_address_and_reports_failures_safely(api, sale, monkeypatch):
    assert api.post("/api/v1/billing/sales/INV-MAIL-1/email", json={"email": "nope"}).status_code == 400

    async def failing(to, subject, text, html_body=None):
        return {"delivered": False, "mode": "smtp", "error": mailer.ERR_UNREACHABLE}
    monkeypatch.setattr(mailer, "send_email", failing)
    r = api.post("/api/v1/billing/sales/INV-MAIL-1/email", json={"email": "customer@example.com"})
    assert r.status_code == 503 and r.json()["detail"] == mailer.ERR_UNREACHABLE

    async def not_set_up(to, subject, text, html_body=None):
        return {"delivered": False, "mode": "logged", "error": None}
    monkeypatch.setattr(mailer, "send_email", not_set_up)
    r = api.post("/api/v1/billing/sales/INV-MAIL-1/email", json={"email": "customer@example.com"})
    assert r.status_code == 503 and "not set up" in r.json()["detail"]


def test_forgot_pin_emails_admins_who_have_an_email_address(monkeypatch):
    from app.main import app
    from app.routers import auth
    sent = []

    class Rows:
        async def find_unique(self, where): return SimpleNamespace(username=where["username"], role="cashier", is_active=True)
        async def find_many(self, where=None): return [SimpleNamespace(email="boss@shop.com"), SimpleNamespace(email=None), SimpleNamespace(email="second@shop.com")]

    async def create(data): return None
    stub = SimpleNamespace(is_connected=lambda: True, user=Rows(), auditlog=SimpleNamespace(create=create))
    monkeypatch.setattr(auth, "db", stub)
    monkeypatch.setattr(mailer, "send_in_background", lambda to, subject, text, html_body=None: sent.append((to, subject)))
    r = TestClient(app).post("/api/v1/auth/forgot-pin", json={"username": "priya.k", "notes": "forgot it"})
    assert r.status_code == 200 and r.json()["success"] is True
    assert sorted(t for t, _ in sent) == ["boss@shop.com", "second@shop.com"] and all(s == "PIN reset requested" for _, s in sent)


def test_forgot_pin_still_succeeds_when_email_is_broken(monkeypatch):
    from app.main import app
    from app.routers import auth

    class Rows:
        async def find_unique(self, where): return SimpleNamespace(username=where["username"], role="cashier", is_active=True)
        async def find_many(self, where=None): raise RuntimeError("database hiccup")

    async def create(data): return None
    monkeypatch.setattr(auth, "db", SimpleNamespace(is_connected=lambda: True, user=Rows(), auditlog=SimpleNamespace(create=create)))
    assert TestClient(app).post("/api/v1/auth/forgot-pin", json={"username": "priya.k"}).status_code == 200


# ------------------------------------------------------------------------------------------ the real MailHog
def _mailhog_up() -> bool:
    try:
        urllib.request.urlopen("http://localhost:8025/api/v2/messages?limit=1", timeout=2)
        return True
    except Exception:
        return False


@pytest.mark.skipif(not _mailhog_up(), reason="MailHog is not running on localhost:8025")
def test_a_real_message_arrives_in_mailhog(monkeypatch):
    for k, v in dict(SMTP_HOST="localhost", SMTP_PORT=1025, SMTP_USERNAME="", SMTP_PASSWORD="", SMTP_FROM_EMAIL="noreply@okutomart.com",
                     SMTP_FROM_NAME="Okuto Mart", SMTP_TLS=True).items():
        monkeypatch.setattr(settings, k, v)
    subject = f"MailHog check {os.urandom(4).hex()}"
    r = asyncio.run(mailer.send_email("mailhog.check@example.com", subject, "plain body", "<p>html body</p>"))
    assert r == {"delivered": True, "mode": "smtp", "error": None}
    found = None
    for item in json.load(urllib.request.urlopen("http://localhost:8025/api/v2/messages?limit=50", timeout=5))["items"]:
        if item["Content"]["Headers"]["Subject"] == [subject]:
            found = item
            break
    assert found, "the message did not reach MailHog"
    assert found["Content"]["Headers"]["From"] == ["Okuto Mart <noreply@okutomart.com>"]
    assert found["Content"]["Headers"]["To"] == ["mailhog.check@example.com"]
    try:                                                            # tidy up only our own message
        req = urllib.request.Request(f"http://localhost:8025/api/v1/messages/{found['ID']}", method="DELETE")
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass
