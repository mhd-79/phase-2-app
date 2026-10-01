"""
Phase 1 admin / Phase 2 admin access control, exercised end-to-end against a real PostgreSQL database.

SAFETY: these tests create and delete users, so they only run against a local database
(DATABASE_URL host localhost/127.0.0.1). They are skipped for anything else (e.g. Neon / Railway).
They also need a Prisma client generated from the current prisma/schema.prisma (User.phase_access).
"""
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.security import create_access_token

_host = urlparse(settings.DATABASE_URL).hostname or ""
pytestmark = pytest.mark.skipif(
    _host not in ("localhost", "127.0.0.1"),
    reason="phase-access tests mutate users; run only against a local scratch PostgreSQL (set DATABASE_URL)")

P1_USER, P1_PIN = "t.p1admin", "4321"
P2_USER, P2_PIN = "t.p2admin", "8765"
CASHIER = "t.cashier"
made_extra = []      # users created inside individual tests; removed by the module fixture
PHASE2_PREFIXES = ("/vendors", "/purchase-orders", "/grn", "/purchase-returns", "/stock-adjustments", "/batches",
                   "/reorder-alerts", "/stock-audit", "/reports/p2", "/reports/ai-insights", "/ai-insights")
# Phase 1 features a Phase 1 admin must keep using normally
PHASE1_GETS = ["/catalog/items", "/catalog/categories", "/discounts", "/settings/store", "/users", "/users/audit-logs",
               "/reports/z-report", "/reports/item-sales", "/reports/cash-drawer/counters", "/reports/stock-on-hand",
               "/reports/tax-summary", "/billing/held-bills", "/auth/me"]
PHASE2_GETS = ["/vendors", "/purchase-orders", "/grn", "/purchase-returns", "/stock-adjustments", "/batches", "/reorder-alerts",
               "/reports/p2/purchase-register", "/reports/p2/vendor-payables", "/reports/p2/stock-valuation",
               "/reports/p2/batch-expiry", "/reports/ai-insights", "/ai-insights/business-summary", "/ai-insights/vendor-intelligence"]


@pytest.fixture(scope="module")
def client():
    from app.main import app
    with TestClient(app) as c:
        yield c


def _login(client, username, pin):
    r = client.post("/api/v1/auth/login", json={"username": username, "pin": pin})
    assert r.status_code == 200, r.text
    return r.json(), {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def actors(client):
    from app.database import db
    owner, owner_h = _login(client, "owner.arjun", "9999")
    assert owner["role"] == "admin"
    made = []

    async def purge_leftovers():              # a previously aborted run may have left test users behind
        stale = [P1_USER, P2_USER, CASHIER, "t.child", "t.sneaky"]
        await db.auditlog.delete_many(where={"username": {"in": stale}})
        await db.user.delete_many(where={"username": {"in": stale}})
    client.portal.call(purge_leftovers)

    def create(username, pin, role, phase, headers=owner_h):
        r = client.post("/api/v1/users", headers=headers, json={
            "username": username, "pin": pin, "role": role, "full_name": username, "sub_text": "test", "phase_access": phase})
        assert r.status_code == 200, r.text
        made.append(username)
        return r.json()

    p1 = create(P1_USER, P1_PIN, "admin", 1)
    p2 = create(P2_USER, P2_PIN, "admin", 2)
    create(CASHIER, "1111", "cashier", None)
    assert p1["phase_access"] == 1 and p2["phase_access"] == 2
    yield {
        "owner": owner_h,
        "p1": _login(client, P1_USER, P1_PIN),
        "p2": _login(client, P2_USER, P2_PIN),
        "cashier": _login(client, CASHIER, "1111"),
    }
    import asyncio
    loop = asyncio.new_event_loop()

    async def cleanup():
        names = made + made_extra
        await db.auditlog.delete_many(where={"username": {"in": names}})     # audit rows reference the user
        await db.user.delete_many(where={"username": {"in": names}})
    # the TestClient owns the connection loop; delete through the API-less path using its portal
    try:
        client.portal.call(cleanup)
    finally:
        loop.close()


# ------------------------------------------------------------------------------------------ identity / token
def test_login_reports_access_level_and_existing_admins_keep_full_access(client, actors):
    body, _ = actors["p1"]
    assert body["role"] == "admin" and body["phase_access"] == 1
    assert actors["p2"][0]["phase_access"] == 2
    owner, _ = _login(client, "owner.arjun", "9999")
    assert owner["phase_access"] == 2          # pre-existing admins default to Phase 2: nothing is taken away


def test_me_endpoint_exposes_phase(client, actors):
    assert client.get("/api/v1/auth/me", headers=actors["p1"][1]).json()["phase_access"] == 1
    assert client.get("/api/v1/auth/me", headers=actors["p2"][1]).json()["phase_access"] == 2


# ------------------------------------------------------------------------------------------ Phase 1 admin
@pytest.mark.parametrize("path", PHASE1_GETS)
def test_phase1_admin_can_use_phase1_features(client, actors, path):
    r = client.get(f"/api/v1{path}", headers=actors["p1"][1])
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


@pytest.mark.parametrize("path", PHASE2_GETS)
def test_phase1_admin_is_denied_every_phase2_api(client, actors, path):
    r = client.get(f"/api/v1{path}", headers=actors["p1"][1])
    assert r.status_code == 403, f"{path}: {r.status_code}"
    assert "Phase 2" in r.json()["detail"]


def test_phase1_admin_is_denied_on_every_registered_phase2_route_and_method(client, actors):
    """Walk the app's real route table so a newly added Phase 2 route cannot be forgotten."""
    from app.main import app
    checked = 0
    for route in app.routes:
        path = getattr(route, "path", "")
        rel = path.replace("/api/v1", "", 1)
        if not rel.startswith(PHASE2_PREFIXES):
            continue
        url = "/api/v1" + rel.replace("{", "").replace("}", "")           # path params -> harmless literals
        for method in route.methods - {"HEAD", "OPTIONS"}:
            r = client.request(method, url, headers=actors["p1"][1], json={})
            assert r.status_code == 403, f"{method} {path} -> {r.status_code}"
            checked += 1
    assert checked >= 40


def test_anonymous_and_invalid_tokens_are_rejected_on_phase2_apis(client):
    assert client.get("/api/v1/vendors").status_code == 401
    assert client.get("/api/v1/reorder-alerts").status_code == 401
    assert client.get("/api/v1/ai-insights/business-summary").status_code == 401
    assert client.get("/api/v1/vendors", headers={"Authorization": "Bearer not-a-token"}).status_code == 401


# ------------------------------------------------------------------------------------------ Phase 2 admin
@pytest.mark.parametrize("path", PHASE1_GETS + PHASE2_GETS)
def test_phase2_admin_keeps_everything(client, actors, path):
    r = client.get(f"/api/v1{path}", headers=actors["p2"][1])
    assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"


def test_phase2_admin_can_perform_phase2_actions(client, actors):
    h = actors["p2"][1]
    r = client.post("/api/v1/stock-adjustments", headers=h, json={"sku": "ZZ-PHASE-TEST", "name": "Phase test", "delta": 1,
                                                                    "reason": "Count correction", "notes": "t"})
    assert r.status_code == 200, r.text
    assert client.post("/api/v1/vendors", headers=h, json={"name": "T Vendor", "category": "x", "contact": "c", "phone": "1",
                                                           "email": "e", "terms": "Net 7", "status": "Active", "payable": 0}).status_code in (200, 201)


def test_cashier_behaviour_on_existing_apis_is_unchanged(client, actors):
    # Cashiers were never locked out of these APIs by role; only Phase 1 admins are newly restricted.
    assert client.get("/api/v1/vendors", headers=actors["cashier"][1]).status_code == 200


# ------------------------------------------------------------------------------------------ no privilege escalation
def test_phase1_admin_cannot_grant_phase2_access(client, actors):
    h = actors["p1"][1]
    r = client.post("/api/v1/users", headers=h, json={"username": "t.sneaky", "pin": "1234", "role": "admin", "full_name": "s",
                                                      "sub_text": "s", "phase_access": 2})
    assert r.status_code == 403
    r = client.put(f"/api/v1/users/{P1_USER}", headers=h, json={"phase_access": 2})
    assert r.status_code == 403
    me = client.get("/api/v1/auth/me", headers=h).json()
    assert me["phase_access"] == 1


def test_users_created_or_promoted_by_a_phase1_admin_stay_phase1(client, actors):
    h = actors["p1"][1]
    r = client.post("/api/v1/users", headers=h, json={"username": "t.child", "pin": "2222", "role": "admin", "full_name": "c", "sub_text": "c"})
    assert r.status_code == 200 and r.json()["phase_access"] == 1
    r = client.put(f"/api/v1/users/{CASHIER}", headers=h, json={"role": "admin"})
    assert r.status_code == 200 and r.json()["phase_access"] == 1
    client.put(f"/api/v1/users/{CASHIER}", headers=actors["owner"], json={"role": "cashier", "phase_access": 2})
    from app.database import db
    made_extra.append("t.child")


def test_phase1_admin_cannot_modify_or_reset_a_phase2_admin(client, actors):
    h = actors["p1"][1]
    for payload in ({"pin": "0000"}, {"is_active": False}, {"role": "cashier"}, {"full_name": "x"}):
        assert client.put(f"/api/v1/users/{P2_USER}", headers=h, json=payload).status_code == 403, payload
    assert client.post("/api/v1/auth/reset-pin", headers=h, json={"username": P2_USER, "new_pin": "0000"}).status_code == 403
    assert client.post("/api/v1/auth/reset-pin", headers=h, json={"username": "owner.arjun", "new_pin": "0000"}).status_code == 403
    assert client.post("/api/v1/auth/login", json={"username": P2_USER, "pin": P2_PIN}).status_code == 200      # PIN untouched


def test_phase1_admin_can_still_manage_cashiers(client, actors):
    h = actors["p1"][1]
    assert client.put(f"/api/v1/users/{CASHIER}", headers=h, json={"full_name": "Renamed Cashier"}).status_code == 200
    assert client.post("/api/v1/auth/reset-pin", headers=h, json={"username": CASHIER, "new_pin": "3333"}).status_code == 200
    client.post("/api/v1/auth/reset-pin", headers=actors["owner"], json={"username": CASHIER, "new_pin": "1111"})


# ------------------------------------------------------------------------------------------ DB is authoritative
def test_access_follows_the_database_not_a_stale_token(client, actors):
    h_p1 = actors["p1"][1]
    assert client.get("/api/v1/vendors", headers=h_p1).status_code == 403
    r = client.put(f"/api/v1/users/{P1_USER}", headers=actors["owner"], json={"phase_access": 2})
    assert r.status_code == 200 and r.json()["phase_access"] == 2
    assert client.get("/api/v1/vendors", headers=h_p1).status_code == 200            # same old token, now promoted
    assert client.put(f"/api/v1/users/{P1_USER}", headers=actors["owner"], json={"phase_access": 1}).status_code == 200
    assert client.get("/api/v1/vendors", headers=h_p1).status_code == 403            # demoted again, immediately


def test_forged_phase_claim_cannot_help_a_stored_phase1_user(client, actors):
    forged = create_access_token({"sub": P1_USER, "role": "admin", "phase": 2})
    assert client.get("/api/v1/vendors", headers={"Authorization": f"Bearer {forged}"}).status_code == 403


def test_last_phase2_admin_cannot_be_removed(client, actors):
    from app.database import db
    owner_h = actors["owner"]

    async def others():
        return [u.username for u in await db.user.find_many(where={"role": "admin", "is_active": True, "phase_access": 2})]
    admins = client.portal.call(others)
    # demote every Phase 2 admin except owner.arjun, then try to demote the last one
    demoted = []
    try:
        for u in admins:
            if u != "owner.arjun":
                assert client.put(f"/api/v1/users/{u}", headers=owner_h, json={"phase_access": 1}).status_code == 200
                demoted.append(u)
        r = client.put("/api/v1/users/owner.arjun", headers=owner_h, json={"phase_access": 1})
        assert r.status_code == 400 and "Phase 2 admin" in r.json()["detail"]
        assert client.put("/api/v1/users/owner.arjun", headers=owner_h, json={"is_active": False}).status_code == 400
    finally:
        for u in demoted:
            client.put(f"/api/v1/users/{u}", headers=owner_h, json={"phase_access": 2})


# ------------------------------------------------------------------------------------------ token stand-in (DB user missing)
def test_missing_db_user_falls_back_to_the_phase_claim(client):
    p1_tok = create_access_token({"sub": "ghost.user", "role": "admin", "phase": 1})
    p2_tok = create_access_token({"sub": "ghost.user", "role": "admin"})                # legacy token without a claim
    assert client.get("/api/v1/vendors", headers={"Authorization": f"Bearer {p1_tok}"}).status_code == 403
    assert client.get("/api/v1/vendors", headers={"Authorization": f"Bearer {p2_tok}"}).status_code == 200
