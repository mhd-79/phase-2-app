"""Super Admin + tenant onboarding, end to end through the real FastAPI app, middleware and services.
The database is an in-memory fake (tests/fake_platform_db.py), so nothing here touches PostgreSQL."""
import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import database, notifier, platform_audit as audit, platform_service as svc, security, tenancy
from app.config import settings
from app.routers import platform_public as pp
from app.routers import super_admin as sa
from fake_platform_db import FakeControlDb, FakeTenantClient

run = asyncio.run
SA_EMAIL, SA_PASSWORD = "root@platform.com", "Sup3rSecret"
API = "/api/v1"

TENANT = dict(tenant_name="ABC Supermarket", legal_business_name="ABC Retail Pvt Ltd", owner_name="Asha Rao", email="asha@abc.com",
              phone="+91 98765 43210", address="12 MG Road", city="Bengaluru", state="Karnataka", postal_code="560001",
              gstin="29ABCDE1234F1Z5", business_type="Supermarket", trial_duration_days=10)


@pytest.fixture
def platform(monkeypatch):
    ctl = FakeControlDb()
    default_store = FakeTenantClient("public")
    tenants = {}

    for mod in (svc, sa, pp, notifier, audit, tenancy, security):
        monkeypatch.setattr(mod, "control_db", ctl)
    monkeypatch.setattr(database, "_default_client", default_store)
    for key in ("SMTP_HOST", "SMTP_FROM_EMAIL"):
        monkeypatch.setattr(settings, key, "")
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "none")
    monkeypatch.setattr(settings, "EXPIRED_ACCESS_POLICY", "readonly")
    tenancy.invalidate_tenant()

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def fake_context(schema):
        client = default_store if schema == "public" else tenants.setdefault(schema, FakeTenantClient(schema))
        token = database._current_client.set(None if schema == "public" else client)
        schema_token = database.current_tenant_schema.set(None if schema == "public" else schema)
        try:
            yield client
        finally:
            database.current_tenant_schema.reset(schema_token)
            database._current_client.reset(token)

    provisioned = []

    async def fake_provision(schema):
        provisioned.append(schema)

    monkeypatch.setattr(tenancy, "tenant_context", fake_context)
    monkeypatch.setattr(tenancy, "provision_schema", fake_provision)
    monkeypatch.setattr(svc.asyncio, "create_task", lambda coro, **k: coro.close())     # provisioning is triggered explicitly in tests

    run(ctl.platformuser.create(data={"email": SA_EMAIL, "full_name": "Root", "password_hash": svc.hash_password(SA_PASSWORD)}))
    run(svc.ensure_default_plans())
    run(svc.ensure_default_tenant())

    from app.main import app
    client = TestClient(app)

    def call(method, path, token=None, json=None, headers=None):
        h = dict(headers or {})
        if token:
            h["Authorization"] = f"Bearer {token}"
        return client.request(method, f"{API}{path}", json=json, headers=h)

    ns = SimpleNamespace(ctl=ctl, default=default_store, tenants=tenants, provisioned=provisioned, call=call, client=client)
    ns.sa_token = call("POST", "/auth/login", json={"email": SA_EMAIL, "password": SA_PASSWORD}).json()["access_token"]
    ns.sa = lambda method, path, json=None: call(method, f"/super-admin{path}", ns.sa_token, json)

    def create(**over):
        r = ns.sa("POST", "/tenants", {**TENANT, **over})
        assert r.status_code == 201, r.text
        body = r.json()
        tid = body["tenant"]["id"]
        assert ns.sa("POST", f"/tenants/{tid}/retry-provisioning").status_code == 200     # what the background task does
        url = body["invitation"]["invite_url"]
        return tid, url.rsplit("/", 1)[1]

    def onboard(**over):
        tid, token = create(**over)
        email = over.get("email", TENANT["email"])
        r = call("POST", f"/invitations/{token}/accept", json={"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"})
        assert r.status_code == 200, r.text
        login = call("POST", "/auth/login", json={"email": email, "password": "Passw0rdOK"})
        assert login.status_code == 200, login.text
        return tid, login.json()["access_token"]

    ns.create, ns.onboard = create, onboard
    yield ns
    tenancy.invalidate_tenant()
    from app.throttle import login_limiter, invitation_limiter, request_limiter, forgot_limiter
    for lim in (login_limiter, invitation_limiter, request_limiter, forgot_limiter):
        lim._hits.clear()


def _actions(p, tenant_id=None):
    return [r.action for r in p.ctl.platformauditlog.rows if tenant_id is None or r.tenant_id == tenant_id]


# ---- Super Admin sign-in and protection -----------------------------------------------------------------------------
def test_super_admin_login_and_wrong_password(platform):
    assert platform.call("POST", "/auth/login", json={"email": SA_EMAIL, "password": "nope12345"}).status_code == 401
    body = platform.call("POST", "/auth/login", json={"email": SA_EMAIL, "password": SA_PASSWORD}).json()
    assert body["role"] == "super_admin" and body["tenant_id"] is None
    assert platform.sa("GET", "/me").json()["email"] == SA_EMAIL


def test_super_admin_endpoints_need_a_super_admin(platform):
    assert platform.call("GET", "/super-admin/tenants").status_code in (401, 403)         # no token
    tid, tenant_token = platform.onboard()
    assert platform.call("GET", "/super-admin/tenants", tenant_token).status_code == 403   # a business owner is not a super admin
    assert platform.call("GET", "/super-admin/audit-logs", tenant_token).status_code == 403


def test_default_store_appears_as_the_default_tenant_and_cannot_be_suspended(platform):
    items = platform.sa("GET", "/tenants").json()["items"]
    default = next(t for t in items if t["is_default"])
    assert default["schema_name"] == "public" and default["status"] == "ACTIVE" and default["provision_status"] == "ready"
    r = platform.sa("PATCH", f"/tenants/{default['id']}/status", {"action": "suspend"})
    assert r.status_code == 409


# ---- creating a tenant ------------------------------------------------------------------------------------------------
def test_create_tenant_validates_input_and_rejects_duplicate_owner_email(platform):
    assert platform.sa("POST", "/tenants", {**TENANT, "gstin": "BAD"}).status_code == 422
    assert platform.sa("POST", "/tenants", {**TENANT, "email": "not-an-email"}).status_code == 422
    missing = {k: v for k, v in TENANT.items() if k != "city"}
    assert platform.sa("POST", "/tenants", missing).status_code == 422
    platform.create()
    assert platform.sa("POST", "/tenants", {**TENANT, "tenant_name": "Other"}).status_code == 409
    assert platform.sa("POST", "/tenants", {**TENANT, "email": SA_EMAIL}).status_code == 409


def test_create_tenant_makes_invited_tenant_with_own_schema_and_invitation(platform):
    r = platform.sa("POST", "/tenants", TENANT)
    t, inv = r.json()["tenant"], r.json()["invitation"]
    assert t["status"] == "INVITED" and tenancy.is_tenant_schema(t["schema_name"]) and t["code"] == "abc-supermarket"
    assert t["subscription"]["trial_duration_days"] == 10 and t["subscription"]["payment_status"] == "NOT_PAID"
    assert inv["delivery"] == "logged" and inv["delivered"] is False and "/accept-invitation/" in inv["invite_url"]
    assert "TENANT_CREATED" in _actions(platform, t["id"]) and "INVITATION_GENERATED" in _actions(platform, t["id"])
    # only the hash of the token is stored
    token = inv["invite_url"].rsplit("/", 1)[1]
    assert all(token not in str(vars(row)) for row in platform.ctl.tenantinvitation.rows)


def test_two_tenants_get_different_schemas_and_codes(platform):
    a, _ = platform.create()
    b, _ = platform.create(email="b@other.com", tenant_name="ABC Supermarket")
    rows = {t.id: t for t in platform.ctl.tenant.rows}
    assert rows[a].schema_name != rows[b].schema_name and rows[a].code != rows[b].code
    assert len(platform.provisioned) == 2 and len(set(platform.provisioned)) == 2


def test_provisioning_seeds_store_settings_only(platform):
    tid, _ = platform.create(initial_outlet_name="ABC Main Store")
    t = next(r for r in platform.ctl.tenant.rows if r.id == tid)
    store = platform.tenants[t.schema_name].storesettings.rows
    assert len(store) == 1 and store[0].store_name == "ABC Main Store" and store[0].gstin == "29ABCDE1234F1Z5"
    assert platform.tenants[t.schema_name].user.rows == [] and platform.tenants[t.schema_name].item.rows == []


# ---- invitation lifecycle -----------------------------------------------------------------------------------------------
def test_invitation_validation_and_acceptance_starts_the_trial(platform):
    tid, token = platform.create()
    info = platform.call("GET", f"/invitations/{token}").json()
    assert info["valid"] and info["business_name"] == "ABC Supermarket" and info["email"] == "asha@abc.com"
    assert platform.call("GET", "/invitations/not-a-real-token-123456").status_code == 404

    weak = platform.call("POST", f"/invitations/{token}/accept", json={"password": "short", "confirm_password": "short"})
    assert weak.status_code == 422
    no_digit = platform.call("POST", f"/invitations/{token}/accept", json={"password": "onlyletters", "confirm_password": "onlyletters"})
    assert no_digit.status_code == 422
    mismatch = platform.call("POST", f"/invitations/{token}/accept", json={"password": "Passw0rdOK", "confirm_password": "Different1"})
    assert mismatch.status_code == 422
    assert platform.ctl.tenant.rows[-1].status == "INVITED"                         # nothing happened yet

    ok = platform.call("POST", f"/invitations/{token}/accept", json={"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"})
    assert ok.status_code == 200 and ok.json()["status"] == "TRIAL"
    tenant = next(t for t in platform.ctl.tenant.rows if t.id == tid)
    sub = next(s for s in platform.ctl.tenantsubscription.rows if s.tenant_id == tid)
    assert tenant.status == "TRIAL" and sub.payment_status == "NOT_PAID"
    assert sub.trial_end_date - sub.trial_start_date == timedelta(days=10)
    for event in ("INVITATION_ACCEPTED", "PASSWORD_SETUP_COMPLETED", "TENANT_ACTIVATED"):
        assert event in _actions(platform, tid)
    assert any(n.type == "invitation_accepted" and n.audience == "super_admin" for n in platform.ctl.tenantnotification.rows)


def test_invitation_token_is_single_use(platform):
    _, token = platform.create()
    body = {"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"}
    assert platform.call("POST", f"/invitations/{token}/accept", json=body).status_code == 200
    again = platform.call("POST", f"/invitations/{token}/accept", json=body)
    assert again.status_code == 410 and again.json()["detail"]["code"] == "used"
    assert platform.call("GET", f"/invitations/{token}").status_code == 410
    # and it cannot be used to overwrite the password through the other entry point either
    assert platform.call("POST", "/auth/set-password", json={"token": token, **body}).status_code == 410


def test_concurrent_acceptance_lets_exactly_one_request_win(platform):
    tid, token = platform.create()

    async def attempt():
        try:
            await svc.accept_invitation(token, "Passw0rdOK", ip=None)
            return "ok"
        except svc.InvitationError as e:
            return e.code

    async def race():
        return await asyncio.gather(attempt(), attempt(), attempt())
    results = run(race())
    assert sorted(results) == ["ok", "used", "used"]
    t = next(t for t in platform.ctl.tenant.rows if t.id == tid)
    assert len(platform.tenants[t.schema_name].user.rows) == 1


def test_resend_invalidates_the_previous_token(platform):
    tid, old = platform.create()
    r = platform.sa("POST", f"/tenants/{tid}/resend-invitation")
    assert r.status_code == 200
    new = r.json()["invitation"]["invite_url"].rsplit("/", 1)[1]
    assert new != old
    gone = platform.call("GET", f"/invitations/{old}")
    assert gone.status_code == 410 and gone.json()["detail"]["code"] == "revoked"
    assert platform.call("GET", f"/invitations/{new}").status_code == 200
    assert "INVITATION_RESENT" in _actions(platform, tid)
    assert sum(1 for i in platform.ctl.tenantinvitation.rows if i.status == "PENDING") == 1


def test_expired_invitation_is_refused_and_marks_the_tenant(platform):
    tid, token = platform.create()
    inv = platform.ctl.tenantinvitation.rows[0]
    inv.expires_at = svc.now_utc() - timedelta(minutes=1)
    r = platform.call("POST", f"/invitations/{token}/accept", json={"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"})
    assert r.status_code == 410 and r.json()["detail"]["code"] == "expired"
    assert next(t for t in platform.ctl.tenant.rows if t.id == tid).status == "INVITATION_EXPIRED"
    # the Super Admin can send a fresh one
    assert platform.sa("POST", f"/tenants/{tid}/resend-invitation").status_code == 200
    assert next(t for t in platform.ctl.tenant.rows if t.id == tid).status == "INVITED"


def test_cannot_accept_before_the_workspace_is_ready(platform):
    r = platform.sa("POST", "/tenants", TENANT).json()                              # not provisioned (background task is disabled)
    token = r["invitation"]["invite_url"].rsplit("/", 1)[1]
    resp = platform.call("POST", f"/invitations/{token}/accept", json={"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"})
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "preparing"
    assert platform.ctl.tenantinvitation.rows[0].status == "PENDING"                # token not burned


def test_invitation_acceptance_never_creates_a_super_admin(platform):
    tid, token = platform.onboard()
    login = platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "Passw0rdOK"}).json()
    assert login["role"] == "admin" and login["tenant_id"] == tid
    assert len(platform.ctl.platformuser.rows) == 1                                  # still only the bootstrap Super Admin


# ---- tenant sign-in ------------------------------------------------------------------------------------------------------
def test_owner_cannot_sign_in_before_accepting_and_wrong_password_fails(platform):
    platform.create()
    r = platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "Passw0rdOK"})
    assert r.status_code == 403 and "not been activated" in r.json()["detail"]
    assert platform.call("POST", "/auth/login", json={"email": "ghost@nowhere.com", "password": "Passw0rdOK"}).status_code == 401


def test_tenant_login_returns_trial_info_and_a_tenant_bound_token(platform):
    tid, token = platform.onboard()
    body = platform.call("POST", "/auth/login", json={"email": "ASHA@abc.com", "password": "Passw0rdOK"}).json()   # email is case-insensitive
    assert body["tenant_status"] == "TRIAL" and body["tenant_name"] == "ABC Supermarket" and body["subscription_end"]
    assert platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "wrongPass1"}).status_code == 401


def test_login_is_throttled(platform):
    platform.onboard()
    codes = [platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": f"wrong{i}pass"}).status_code for i in range(10)]
    assert 429 in codes and codes[0] == 401


def test_business_code_login_is_gone(platform):
    tid, owner_token = platform.onboard()
    t = next(t for t in platform.ctl.tenant.rows if t.id == tid)
    run(platform.tenants[t.schema_name].user.create(data={
        "username": "ravi", "pin_hash": security.get_pin_hash("1234"), "role": "cashier", "full_name": "Ravi", "sub_text": "Cashier"}))
    # a business_code is ignored (never routes into a tenant); the username is looked up in the default store only
    r = platform.call("POST", "/auth/login", json={"username": "ravi", "pin": "1234", "business_code": "abc-supermarket"})
    assert r.status_code == 401
    assert not hasattr(svc, "login_with_business_code")
    assert "tenant_code" not in platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "Passw0rdOK"}).json()


# ---- strict isolation ---------------------------------------------------------------------------------------------------
def test_each_tenant_only_sees_its_own_data(platform):
    a_id, a_token = platform.onboard()
    b_id, b_token = platform.onboard(email="boss@other.com", tenant_name="Other Mart", gstin="27ABCDE1234F1Z5")
    assert a_id != b_id
    me_a = platform.call("GET", "/auth/me", a_token).json()
    me_b = platform.call("GET", "/auth/me", b_token).json()
    assert me_a["username"] == "asha@abc.com" and me_b["username"] == "boss@other.com"
    ta = next(t for t in platform.ctl.tenant.rows if t.id == a_id)
    tb = next(t for t in platform.ctl.tenant.rows if t.id == b_id)
    assert [u.username for u in platform.tenants[ta.schema_name].user.rows] == ["asha@abc.com"]
    assert [u.username for u in platform.tenants[tb.schema_name].user.rows] == ["boss@other.com"]
    assert platform.default.user.rows == []                                          # the default store gained nothing


def test_a_token_cannot_be_replayed_against_another_tenants_schema(platform):
    a_id, _ = platform.onboard()
    b_id, b_token = platform.onboard(email="boss@other.com", tenant_name="Other Mart", gstin="27ABCDE1234F1Z5")
    forged = security.create_access_token({"sub": "asha@abc.com", "role": "admin", "phase": 2, "tenant_id": b_id})
    # asha exists only in tenant A: with tenant B's id she is unknown there, and there is no stand-in account
    assert platform.call("GET", "/auth/me", forged).status_code == 401


def test_super_admin_cannot_use_tenant_routes_and_tenants_cannot_use_super_admin_routes(platform):
    _, tenant_token = platform.onboard()
    for path in ("/catalog/items", "/users", "/vendors", "/reports/summary"):
        r = platform.call("GET", path, platform.sa_token)
        assert r.status_code == 403 and r.json().get("code") == "platform_only", path
    assert platform.call("GET", "/super-admin/tenants", tenant_token).status_code == 403


def test_super_admin_tenant_detail_is_read_only_summary(platform):
    tid, _ = platform.onboard()
    d = platform.sa("GET", f"/tenants/{tid}").json()
    assert d["owner"]["email"] == "asha@abc.com" and d["ho_admin"]["username"] == "asha@abc.com"
    assert d["counts"] == {"users": 1, "items": 0, "sales": 0} and d["trial"]["days_left"] == 10
    assert d["subscription"]["status"] == "TRIAL"
    assert {"password_hash", "pin_hash"}.isdisjoint(d["ho_admin"]) and "token_hash" not in str(d["invitations"])
    actions = [a["action"] for a in d["audit_history"]]
    assert "TENANT_CREATED" in actions and "INVITATION_ACCEPTED" in actions


# ---- status lifecycle ---------------------------------------------------------------------------------------------------
def test_suspend_blocks_the_tenant_at_once_and_reactivate_restores_it(platform):
    tid, token = platform.onboard()
    assert platform.call("GET", "/subscriptions/status", token).status_code == 200
    r = platform.sa("PATCH", f"/tenants/{tid}/status", {"action": "suspend", "reason": "non-payment"})
    assert r.status_code == 200 and r.json()["status"] == "SUSPENDED"
    blocked = platform.call("GET", "/subscriptions/status", token)
    assert blocked.status_code == 403 and blocked.json()["code"] == "tenant_suspended"
    assert platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "Passw0rdOK"}).status_code == 403
    assert platform.sa("PATCH", f"/tenants/{tid}/status", {"action": "suspend"}).status_code == 409                 # already suspended
    r = platform.sa("PATCH", f"/tenants/{tid}/status", {"action": "reactivate"})
    assert r.json()["status"] == "TRIAL"
    assert platform.call("GET", "/subscriptions/status", token).status_code == 200
    assert {"TENANT_SUSPENDED", "TENANT_REACTIVATED"} <= set(_actions(platform, tid))
    assert platform.sa("PATCH", f"/tenants/{tid}/status", {"action": "reactivate"}).status_code == 409


def test_expired_trial_is_read_only_but_the_tenant_can_still_pick_a_plan(platform):
    tid, token = platform.onboard()
    sub = next(s for s in platform.ctl.tenantsubscription.rows if s.tenant_id == tid)
    sub.trial_end_date = svc.now_utc() - timedelta(minutes=1)
    tenancy.invalidate_tenant(tid)
    st = platform.call("GET", "/subscriptions/status", token).json()
    assert st["status"] == "EXPIRED" and st["expired_policy"] == "readonly"
    assert platform.call("GET", "/auth/me", token).status_code == 200                                             # reads allowed
    w = platform.call("POST", "/billing/calculate-totals", token, json={})
    assert w.status_code == 402 and w.json()["code"] == "subscription_expired"                                    # writes refused
    assert platform.call("POST", "/subscriptions/checkout", token, json={"plan_code": "starter"}).status_code == 200
    assert platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "Passw0rdOK"}).status_code == 200
    settings.EXPIRED_ACCESS_POLICY = "block"
    tenancy.invalidate_tenant(tid)
    assert platform.call("GET", "/auth/me", token).status_code == 402


def test_status_change_validation(platform):
    tid, _ = platform.create()
    assert platform.sa("PATCH", f"/tenants/{tid}/status", {"action": "suspend"}).status_code == 409                # still INVITED
    assert platform.sa("PATCH", f"/tenants/{tid}/status", {"action": "explode"}).status_code == 422
    assert platform.sa("PATCH", f"/tenants/{tid}/status", {"action": "activate"}).status_code == 422               # plan required
    assert platform.sa("PATCH", "/tenants/nope/status", {"action": "suspend"}).status_code == 404


def test_update_tenant_and_email_lock_after_acceptance(platform):
    tid, _ = platform.create()
    r = platform.sa("PUT", f"/tenants/{tid}", {"phone": "+91 90000 11111", "email": "new@abc.com", "trial_duration_days": 20})
    assert r.status_code == 200 and r.json()["phone"] == "+91 90000 11111" and r.json()["email"] == "new@abc.com"
    assert r.json()["subscription"]["trial_duration_days"] == 20 and "TENANT_UPDATED" in _actions(platform, tid)
    platform.call("POST", f"/invitations/{platform.sa('POST', f'/tenants/{tid}/resend-invitation').json()['invitation']['invite_url'].rsplit('/', 1)[1]}/accept",
                  json={"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"})
    assert platform.sa("PUT", f"/tenants/{tid}", {"email": "again@abc.com"}).status_code == 409


# ---- subscriptions and payment -------------------------------------------------------------------------------------------
def test_trial_to_active_only_through_verified_payment(platform):
    tid, token = platform.onboard()
    co = platform.call("POST", "/subscriptions/checkout", token, json={"plan_code": "business"})
    assert co.status_code == 200 and co.json()["payment_status"] == "PENDING" and "not connected" in co.json()["message"]
    sub = next(s for s in platform.ctl.tenantsubscription.rows if s.tenant_id == tid)
    assert sub.payment_status == "PENDING"
    # a tenant can never mark itself as paid
    r = platform.call("POST", "/subscriptions/payment", token, json={"provider_reference": "x", "success": True})
    assert r.status_code == 501
    assert next(t for t in platform.ctl.tenant.rows if t.id == tid).status == "TRIAL"
    # the Super Admin confirms the payment
    paid = platform.sa("POST", f"/subscriptions/{tid}/mark-paid", {"plan_code": "business", "reference": "UPI-1"})
    assert paid.status_code == 200 and paid.json()["status"] == "ACTIVE"
    assert sub.payment_status == "PAID" and sub.current_plan == "Phase 2 – Billing + Vendor Management" and sub.subscription_end_date - sub.subscription_start_date == timedelta(days=30)
    assert {"PAYMENT_STATUS_CHANGED", "SUBSCRIPTION_CHANGED"} <= set(_actions(platform, tid))
    st = platform.call("GET", "/subscriptions/status", token).json()
    assert st["status"] == "ACTIVE" and st["limits"]["ai_enabled"] is True and st["days_left"] in (29, 30)


def test_dev_payment_provider_simulates_success_and_renewal_extends(platform, monkeypatch):
    tid, token = platform.onboard()
    monkeypatch.setattr(settings, "PAYMENT_PROVIDER", "dev")
    r = platform.call("POST", "/subscriptions/payment", token, json={"plan_code": "starter"})
    assert r.status_code == 200 and r.json()["status"] == "ACTIVE"
    sub = next(s for s in platform.ctl.tenantsubscription.rows if s.tenant_id == tid)
    first_end = sub.subscription_end_date
    platform.call("POST", "/subscriptions/payment", token, json={"plan_code": "starter"})
    assert sub.subscription_end_date - first_end == timedelta(days=30)                                           # renewed before the end date
    failed = platform.call("POST", "/subscriptions/payment", token, json={"plan_code": "starter", "success": False})
    assert failed.status_code == 200 and sub.payment_status == "FAILED"


def test_payment_endpoints_need_a_tenant_admin_and_a_known_plan(platform):
    tid, token = platform.onboard()
    assert platform.call("POST", "/subscriptions/checkout", token, json={"plan_code": "nope"}).status_code == 404
    assert platform.call("POST", "/subscriptions/checkout", json={"plan_code": "starter"}).status_code in (401, 403)
    assert platform.sa("POST", f"/subscriptions/{tid}/mark-paid", {"plan_code": "nope"}).status_code == 422


def test_plans_crud_for_super_admin_and_listing_for_tenants(platform):
    tid, token = platform.onboard()
    assert len(platform.call("GET", "/subscriptions/plans", token).json()["items"]) == 3
    r = platform.sa("POST", "/plans", {"code": "mini", "name": "Mini", "price": 199, "duration_days": 30, "max_users": 1})
    assert r.status_code == 201 and platform.sa("POST", "/plans", {"code": "mini", "name": "Mini", "price": 1, "duration_days": 30}).status_code == 409
    pid = r.json()["id"]
    assert platform.sa("PUT", f"/plans/{pid}", {"is_active": False, "price": 249}).json()["price"] == 249
    assert "mini" not in [p["code"] for p in platform.call("GET", "/subscriptions/plans", token).json()["items"]]   # inactive plans are hidden
    assert platform.call("POST", "/super-admin/plans", token, json={"code": "x1", "name": "X", "price": 1, "duration_days": 1}).status_code == 403


# ---- tenant requests (future website) ---------------------------------------------------------------------------------
REQUEST = {k: v for k, v in TENANT.items() if k != "trial_duration_days"}


def test_public_request_then_approve_creates_tenant_and_invites(platform):
    r = platform.call("POST", "/tenant-requests", json=REQUEST)                       # public: no token
    assert r.status_code == 201 and r.json()["status"] == "PENDING_APPROVAL"
    rid = r.json()["id"]
    assert platform.call("POST", "/tenant-requests", json=REQUEST).status_code == 409   # duplicate pending request
    note = [n for n in platform.ctl.tenantnotification.rows if n.type == "tenant_request"]
    assert note and note[0].audience == "super_admin" and "TENANT_REQUEST_CREATED" in _actions(platform)
    assert platform.sa("GET", "/tenant-requests?status=PENDING_APPROVAL").json()["total"] == 1
    assert platform.sa("GET", f"/tenant-requests/{rid}").json()["tenant_name"] == "ABC Supermarket"

    ok = platform.sa("POST", f"/tenant-requests/{rid}/approve", {"trial_duration_days": 7})
    assert ok.status_code == 200 and ok.json()["request"]["status"] == "APPROVED"
    tenant = ok.json()["tenant"]
    assert tenant["status"] == "INVITED" and tenant["request_id"] == rid and tenant["subscription"]["trial_duration_days"] == 7
    assert ok.json()["invitation"]["invite_url"]
    assert {"TENANT_REQUEST_APPROVED", "TENANT_CREATED", "INVITATION_GENERATED"} <= set(_actions(platform))
    assert platform.sa("POST", f"/tenant-requests/{rid}/approve").status_code == 409     # cannot approve twice
    assert platform.sa("POST", f"/tenant-requests/{rid}/reject", {"reason": "late"}).status_code == 409


def test_reject_request(platform):
    rid = platform.call("POST", "/tenant-requests", json=REQUEST).json()["id"]
    r = platform.sa("POST", f"/tenant-requests/{rid}/reject", {"reason": "Not a retailer"})
    assert r.status_code == 200 and r.json()["status"] == "REJECTED" and r.json()["reject_reason"] == "Not a retailer"
    assert "TENANT_REQUEST_REJECTED" in _actions(platform)
    assert platform.sa("POST", f"/tenant-requests/{rid}/approve").status_code == 409
    assert platform.ctl.tenant.rows[-1].is_default                                           # no tenant was created
    assert platform.call("POST", "/tenant-requests", json=REQUEST).status_code == 201         # the applicant may apply again


def test_public_request_is_validated_and_rate_limited(platform):
    assert platform.call("POST", "/tenant-requests", json={**REQUEST, "gstin": "nope"}).status_code == 422
    assert platform.call("POST", "/tenant-requests", json={"tenant_name": "x"}).status_code == 422
    codes = [platform.call("POST", "/tenant-requests", json={**REQUEST, "email": f"u{i}@x.com"}).status_code for i in range(7)]
    assert 429 in codes


# ---- password reset -----------------------------------------------------------------------------------------------------
def test_forgot_and_reset_password(platform):
    tid, _ = platform.onboard()
    generic = platform.call("POST", "/auth/forgot-password", json={"email": "ghost@nowhere.com"})
    known = platform.call("POST", "/auth/forgot-password", json={"email": "asha@abc.com"})
    assert generic.status_code == known.status_code == 200 and generic.json() == known.json()
    reset = [i for i in platform.ctl.tenantinvitation.rows if i.purpose == "password_reset"]
    assert len(reset) == 1                                                                   # only the real account got a token
    # recover the raw token the same way the email link carries it
    token = svc.new_token()
    reset[0].token_hash = svc.hash_token(token)
    assert platform.call("GET", f"/invitations/{token}").json()["purpose"] == "password_reset"
    ok = platform.call("POST", "/auth/reset-password", json={"token": token, "password": "NewPassw0rd", "confirm_password": "NewPassw0rd"})
    assert ok.status_code == 200 and "PASSWORD_RESET_COMPLETED" in _actions(platform, tid)
    assert platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "Passw0rdOK"}).status_code == 401
    assert platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "NewPassw0rd"}).status_code == 200
    assert platform.call("POST", "/auth/reset-password", json={"token": token, "password": "Another1Pass", "confirm_password": "Another1Pass"}).status_code == 410


# ---- sweeper, notifications, audit logs, settings, dashboard ---------------------------------------------------------
def test_sweeper_expires_trials_sends_reminders_once_and_expires_stale_invitations(platform):
    near, _ = platform.onboard(email="near@x.com", tenant_name="Near Co", gstin="27ABCDE1234F1Z5")
    gone, _ = platform.onboard(email="gone@x.com", tenant_name="Gone Co", gstin="19ABCDE1234F1Z5")
    pending, _ = platform.create(email="late@x.com", tenant_name="Late Co", gstin="07ABCDE1234F1Z5")
    subs = {s.tenant_id: s for s in platform.ctl.tenantsubscription.rows}
    subs[near].trial_end_date = svc.now_utc() + timedelta(days=2)
    subs[gone].trial_end_date = svc.now_utc() - timedelta(hours=1)
    stale = [i for i in platform.ctl.tenantinvitation.rows if i.tenant_id == pending][0]
    stale.expires_at = svc.now_utc() - timedelta(minutes=5)

    stats = run(svc.run_sweep())
    assert stats == {"expired": 1, "reminders": 1, "invitations_expired": 1}
    status = {t.id: t.status for t in platform.ctl.tenant.rows}
    assert status[gone] == "EXPIRED" and status[near] == "TRIAL" and status[pending] == "INVITATION_EXPIRED"
    kinds = [n.type for n in platform.ctl.tenantnotification.rows]
    assert {"trial_ending", "tenant_expired", "trial_expired"} <= set(kinds)
    assert "TENANT_EXPIRED" in _actions(platform, gone)
    assert run(svc.run_sweep()) == {"expired": 0, "reminders": 0, "invitations_expired": 0}                      # idempotent


def test_notifications_for_super_admin_and_tenant(platform):
    tid, token = platform.onboard()
    unread = platform.sa("GET", "/notifications?unread=true").json()
    assert unread["unread"] >= 1 and all(not n["is_read"] for n in unread["items"])
    nid = unread["items"][0]["id"]
    assert platform.sa("POST", f"/notifications/{nid}/read").status_code == 200
    assert platform.sa("POST", "/notifications/read-all").status_code == 200 and platform.sa("GET", "/notifications").json()["unread"] == 0
    mine = platform.call("GET", "/notifications", token).json()["items"]
    assert {n["type"] for n in mine} >= {"invitation_received", "trial_started"}
    assert platform.call("POST", f"/notifications/{mine[0]['id']}/read", token).status_code == 200
    other_id, other_token = platform.onboard(email="boss@other.com", tenant_name="Other Mart", gstin="27ABCDE1234F1Z5")
    assert platform.call("POST", f"/notifications/{mine[1]['id']}/read", other_token).status_code == 404       # not theirs
    assert all(n["id"] not in {m["id"] for m in mine} for n in platform.call("GET", "/notifications", other_token).json()["items"])


def test_audit_log_listing_fields_and_filters(platform):
    tid, _ = platform.onboard()
    logs = platform.sa("GET", f"/audit-logs?tenant_id={tid}").json()
    assert logs["total"] >= 5
    first = logs["items"][0]
    assert {"actor_role", "tenant_id", "action", "timestamp", "ip_address", "metadata"} <= set(first)
    created = next(i for i in logs["items"] if i["action"] == "TENANT_CREATED")
    assert created["actor_role"] == "super_admin" and created["actor_email"] == SA_EMAIL and created["metadata"]["email"] == "asha@abc.com"
    assert platform.sa("GET", "/audit-logs?action=tenant_created").json()["total"] == 1


def test_dashboard_cards_and_filters(platform):
    a, _ = platform.onboard()
    b, _ = platform.create(email="b@x.com", tenant_name="B Co", gstin="27ABCDE1234F1Z5")
    platform.call("POST", "/tenant-requests", json={**REQUEST, "email": "req@x.com"})
    platform.sa("PATCH", f"/tenants/{a}/status", {"action": "suspend"})
    cards = platform.sa("GET", "/dashboard").json()["cards"]
    assert cards == {"total_tenants": 3, "active_tenants": 1, "trial_tenants": 0, "pending_requests": 1, "expired_tenants": 0,
                     "suspended_tenants": 1, "total_users": 1}
    assert platform.sa("GET", "/tenants?status=SUSPENDED").json()["total"] == 1
    assert platform.sa("GET", "/tenants?q=b co").json()["total"] == 1
    assert platform.sa("GET", f"/tenants/{b}").json()["tenant"]["status"] == "INVITED"


def test_platform_settings_update_and_audit(platform, monkeypatch):
    for key in ("DEFAULT_TRIAL_DAYS", "INVITATION_EXPIRY_HOURS", "TRIAL_REMINDER_DAYS", "EXPIRED_ACCESS_POLICY"):
        monkeypatch.setattr(settings, key, getattr(settings, key))
    r = platform.sa("PUT", "/settings", {"default_trial_days": 21, "expired_access_policy": "block"})
    assert r.status_code == 200 and r.json()["default_trial_days"] == 21 and r.json()["expired_access_policy"] == "block"
    assert platform.sa("PUT", "/settings", {"default_trial_days": 0}).status_code == 422
    assert "SETTINGS_CHANGED" in _actions(platform)
    tid, _ = platform.create(trial_duration_days=None)
    assert next(s for s in platform.ctl.tenantsubscription.rows if s.tenant_id == tid).trial_duration_days == 21
    assert next(r for r in platform.ctl.platformsetting.rows if r.key == "default_trial_days").value == "21"


# ---- bootstrap ----------------------------------------------------------------------------------------------------------
def test_bootstrap_is_idempotent_and_never_invents_a_default_password(platform, monkeypatch):
    monkeypatch.setattr(settings, "SUPER_ADMIN_EMAIL", "")
    monkeypatch.setattr(settings, "SUPER_ADMIN_PASSWORD", "")
    ctl = platform.ctl
    ctl.platformuser.rows.clear()
    run(svc.ensure_platform_ready())
    assert ctl.platformuser.rows == [] and len([t for t in ctl.tenant.rows if t.is_default]) == 1
    monkeypatch.setattr(settings, "SUPER_ADMIN_EMAIL", "boss@platform.com")
    monkeypatch.setattr(settings, "SUPER_ADMIN_PASSWORD", "weak")
    run(svc.ensure_super_admin())
    assert ctl.platformuser.rows == []                                                         # weak password refused
    monkeypatch.setattr(settings, "SUPER_ADMIN_PASSWORD", "Str0ngPassw0rd")
    run(svc.ensure_platform_ready())
    run(svc.ensure_platform_ready())
    assert [u.email for u in ctl.platformuser.rows] == ["boss@platform.com"] and len(ctl.subscriptionplan.rows) == 3
    assert svc.verify_password("Str0ngPassw0rd", ctl.platformuser.rows[0].password_hash)


def test_invitation_mail_uses_the_frontend_url(platform, monkeypatch):
    monkeypatch.setattr(settings, "FRONTEND_BASE_URL", "https://app.example.com")
    _, token = platform.create()
    assert svc.invitation_link(token) == f"https://app.example.com/accept-invitation/{token}"
    assert svc.invitation_link(token, "password_reset") == f"https://app.example.com/reset-password/{token}"


def test_smtp_delivery_path_hides_the_link_from_the_api_response(platform, monkeypatch):
    sent = []

    async def fake_send(to, subject, text, html_body=None):
        sent.append((to, subject, text))
        return {"delivered": True, "mode": "smtp", "error": None}
    monkeypatch.setattr(svc.mailer, "send_email", fake_send)
    r = platform.sa("POST", "/tenants", TENANT).json()
    assert r["invitation"]["delivered"] is True and r["invitation"]["invite_url"] is None
    assert sent[0][0] == "asha@abc.com" and sent[0][1] == "Invitation to join OKUTO Billing & POS" and "/accept-invitation/" in sent[0][2]


def test_idle_lock_unlocks_a_business_owner_with_their_password(platform):
    tid, token = platform.onboard()
    ok = platform.call("POST", "/auth/verify-pin", token, json={"pin": "Passw0rdOK"})
    assert ok.status_code == 200 and ok.json()["valid"] is True
    assert platform.call("POST", "/auth/verify-pin", token, json={"pin": "wrong-password1"}).json()["valid"] is False
    assert platform.call("POST", "/auth/verify-pin", token, json={"pin": "1234"}).json()["valid"] is False         # no PIN exists for the owner


# ---- Super Admin edits tenant status / plan; plan names -------------------------------------------------------------
def test_default_plans_use_phase_names(platform):
    names = {p["code"]: p["name"] for p in platform.sa("GET", "/plans").json()["items"]}
    assert names == {"starter": "Phase 1 – Core Billing", "business": "Phase 2 – Billing + Vendor Management",
                     "enterprise": "Phase 3 – Multi-Outlet and Franchise"}


def test_old_plan_names_are_renamed_in_place_and_custom_ones_kept(platform):
    plans = {p.code: p for p in platform.ctl.subscriptionplan.rows}
    plans["starter"].name, plans["starter"].description = "Starter", "Single store billing, stock and reports"
    plans["business"].name = "Business"
    plans["business"].description = "Custom text by the admin"
    plans["enterprise"].name = "Enterprise Plus"                                    # edited by the admin: left alone
    tid, _ = platform.create()
    sub = next(s for s in platform.ctl.tenantsubscription.rows if s.tenant_id == tid)
    sub.plan_id, sub.current_plan = plans["starter"].id, "Starter"
    run(svc.ensure_default_plans())
    assert plans["starter"].name == "Phase 1 – Core Billing" and sub.current_plan == "Phase 1 – Core Billing"
    assert plans["starter"].description.startswith("Core billing")
    assert plans["business"].name == "Phase 2 – Billing + Vendor Management" and plans["business"].description == "Custom text by the admin"
    assert plans["enterprise"].name == "Enterprise Plus"


def test_super_admin_edits_plan_and_it_applies_immediately(platform):
    tid, token = platform.onboard()
    r = platform.sa("PATCH", f"/tenants/{tid}", {"plan_code": "enterprise"})
    assert r.status_code == 200 and r.json()["subscription"]["current_plan"] == "Phase 3 – Multi-Outlet and Franchise"
    st = platform.call("GET", "/subscriptions/status", token).json()
    assert st["current_plan"] == "Phase 3 – Multi-Outlet and Franchise" and st["limits"]["max_users"] is None and st["status"] == "TRIAL"
    assert "SUBSCRIPTION_CHANGED" in _actions(platform, tid)
    assert platform.sa("PATCH", f"/tenants/{tid}", {"plan_code": "nope"}).status_code == 404
    assert platform.sa("PATCH", f"/tenants/{tid}", {}).status_code == 422


def test_super_admin_edits_status_and_access_changes_immediately(platform):
    tid, token = platform.onboard()
    assert platform.call("GET", "/auth/me", token).status_code == 200
    r = platform.sa("PATCH", f"/tenants/{tid}", {"status": "DEACTIVATED"})
    assert r.status_code == 200 and r.json()["status"] == "DEACTIVATED" and r.json()["effective_status"] == "DEACTIVATED"
    assert platform.call("GET", "/auth/me", token).status_code == 403                                              # same token, next request
    login = platform.call("POST", "/auth/login", json={"email": "asha@abc.com", "password": "Passw0rdOK"})
    assert login.status_code == 403 and "deactivated" in login.json()["detail"]
    r = platform.sa("PATCH", f"/tenants/{tid}", {"status": "SUSPENDED"})
    assert r.json()["status"] == "SUSPENDED" and platform.call("GET", "/auth/me", token).status_code == 403
    r = platform.sa("PATCH", f"/tenants/{tid}", {"status": "TRIAL"})
    assert r.status_code == 200 and r.json()["effective_status"] == "TRIAL"
    assert platform.call("GET", "/auth/me", token).status_code == 200
    assert "TENANT_STATUS_CHANGED" in _actions(platform, tid)


def test_status_edit_active_needs_a_plan_and_expired_is_read_only(platform):
    tid, token = platform.onboard()
    assert platform.sa("PATCH", f"/tenants/{tid}", {"status": "ACTIVE"}).status_code == 422                       # no plan chosen yet
    r = platform.sa("PATCH", f"/tenants/{tid}", {"status": "ACTIVE", "plan_code": "business"})
    sub = r.json()["subscription"]
    assert r.status_code == 200 and r.json()["effective_status"] == "ACTIVE" and sub["payment_status"] == "PAID"
    assert sub["current_plan"] == "Phase 2 – Billing + Vendor Management" and sub["subscription_end_date"]
    r = platform.sa("PATCH", f"/tenants/{tid}", {"status": "EXPIRED"})
    assert r.json()["effective_status"] == "EXPIRED"
    assert platform.call("GET", "/auth/me", token).status_code == 200
    assert platform.call("POST", "/billing/calculate-totals", token, json={}).status_code == 402


def test_status_edit_validation_and_guards(platform):
    tid, _ = platform.create()                                                                                      # still INVITED
    assert platform.sa("PATCH", f"/tenants/{tid}", {"status": "BOGUS"}).status_code == 422
    assert platform.sa("PATCH", f"/tenants/{tid}", {"status": "REJECTED"}).status_code == 422                       # not an editable status
    assert platform.sa("PATCH", f"/tenants/{tid}", {"status": "TRIAL"}).status_code == 409                          # owner has not accepted
    assert platform.sa("PATCH", f"/tenants/{tid}", {"status": "SUSPENDED"}).status_code == 200
    assert platform.sa("PATCH", f"/tenants/{tid}", {"status": "INVITED"}).status_code == 200                        # back to invited
    assert platform.sa("PATCH", "/tenants/nope", {"status": "ACTIVE"}).status_code == 404
    default = next(t for t in platform.ctl.tenant.rows if t.is_default)
    assert platform.sa("PATCH", f"/tenants/{default.id}", {"status": "SUSPENDED"}).status_code == 409
    done, _ = platform.onboard(email="b@abc.com", tenant_name="B Store")
    assert platform.sa("PATCH", f"/tenants/{done}", {"status": "INVITED"}).status_code == 409                       # already accepted


def test_tenant_cannot_use_the_status_edit_endpoint(platform):
    tid, token = platform.onboard()
    assert platform.call("PATCH", f"/super-admin/tenants/{tid}", token, json={"status": "ACTIVE", "plan_code": "starter"}).status_code == 403


# ---- existing tenant schemas receive new application tables / columns --------------------------------------------------
def test_tenant_schemas_are_upgraded_when_the_application_tables_change(platform):
    tid, _ = platform.onboard()
    t = next(t for t in platform.ctl.tenant.rows if t.id == tid)
    assert t.schema_version == tenancy.SCHEMA_VERSION                      # provisioned with the current tables
    platform.provisioned.clear()
    t.schema_version = 0                                                    # as if it was created by an older release
    assert run(svc.upgrade_tenant_schemas()) == 1
    assert platform.provisioned == [t.schema_name] and t.schema_version == tenancy.SCHEMA_VERSION
    platform.provisioned.clear()
    assert run(svc.upgrade_tenant_schemas()) == 0 and platform.provisioned == []       # nothing left to do


def test_method_1_request_approved_with_trial_and_plan_runs_through_to_a_trial_tenant(platform):
    rid = platform.call("POST", "/tenant-requests", json=REQUEST).json()["id"]
    ok = platform.sa("POST", f"/tenant-requests/{rid}/approve", {"trial_duration_days": 5, "subscription_plan": "business"}).json()
    sub = ok["tenant"]["subscription"]
    assert sub["trial_duration_days"] == 5 and sub["current_plan"] == "Phase 2 – Billing + Vendor Management" and sub["plan_id"]
    token = ok["invitation"]["invite_url"].rsplit("/", 1)[1]
    assert platform.sa("POST", f"/tenants/{ok['tenant']['id']}/retry-provisioning").status_code == 200       # what the background task does
    assert platform.call("POST", f"/invitations/{token}/accept", json={"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"}).status_code == 200
    assert platform.call("POST", f"/invitations/{token}/accept", json={"password": "Passw0rdOK", "confirm_password": "Passw0rdOK"}).status_code == 410
    login = platform.call("POST", "/auth/login", json={"email": REQUEST["email"], "password": "Passw0rdOK"}).json()
    assert login["tenant_status"] == "TRIAL"
    st = platform.call("GET", "/subscriptions/status", login["access_token"]).json()
    assert st["status"] == "TRIAL" and st["days_left"] in (4, 5)
    assert platform.sa("POST", f"/tenant-requests/{rid}/approve", {"subscription_plan": "nope"}).status_code == 409      # already approved
