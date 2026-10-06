"""
Admin role rules on the Users screen (in-memory user store; the database is never touched):
- there is no Phase 1 / Phase 2 admin split any more: every admin has full access
- an admin cannot change their own role, but can transfer it to another active user (PIN / password re-checked)
"""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.database import db
from app.routers.auth import _FALLBACK_USERS, _init_fallback_users
from app.security import get_current_user, get_pin_hash, get_phase_access, PHASE_2


@pytest.fixture
def api(monkeypatch):
    from app.main import app
    # never touch a real database: no app startup (no connect / seed) and the user store is the in-memory one
    monkeypatch.setattr(type(db), "is_connected", lambda self: False)
    _init_fallback_users()
    for name, role, sub in (("t.boss", "admin", "Admin · HO Admin"), ("t.till", "cashier", "Cashier · Counter 1"), ("t.off", "cashier", "Cashier")):
        _FALLBACK_USERS[name] = {"id": f"U-{name}", "username": name, "pin_hash": get_pin_hash("4321"), "role": role, "full_name": name,
                                 "sub_text": sub, "is_active": name != "t.off", "auto_lock": "2 min", "schedule_json": None}
    _FALLBACK_USERS["t.second"] = {"id": "U-t.second", "username": "t.second", "pin_hash": get_pin_hash("1111"), "role": "admin",
                                   "full_name": "t.second", "sub_text": "Admin", "is_active": True, "auto_lock": "2 min", "schedule_json": None}
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(username="t.boss", role="admin", phase_access=2)
    yield TestClient(app)
    app.dependency_overrides.pop(get_current_user, None)
    for name in ("t.boss", "t.till", "t.off", "t.second"):
        _FALLBACK_USERS.pop(name, None)


def test_old_phase1_records_have_full_access():
    assert get_phase_access({"phase_access": 1}) == PHASE_2
    assert get_phase_access(SimpleNamespace(phase_access=1)) == PHASE_2


def test_admin_cannot_change_their_own_role(api):
    r = api.put("/api/v1/users/t.boss", json={"role": "cashier"})
    assert r.status_code == 400 and "fixed" in r.json()["detail"]
    assert _FALLBACK_USERS["t.boss"]["role"] == "admin"
    assert api.put("/api/v1/users/t.boss", json={"role": "admin", "full_name": "Boss"}).status_code == 200   # same role is not a change


def test_admin_can_still_change_other_users(api):
    assert api.put("/api/v1/users/t.till", json={"role": "admin"}).status_code == 200
    assert api.put("/api/v1/users/t.till", json={"role": "cashier"}).status_code == 200


def test_transfer_hands_the_role_over(api):
    r = api.post("/api/v1/users/t.till/transfer-admin", json={"current_pin": "4321"})
    assert r.status_code == 200, r.text
    assert r.json()["role"] == "admin" and r.json()["sub_text"] == "Admin · HO Admin"
    assert _FALLBACK_USERS["t.till"]["role"] == "admin"
    assert _FALLBACK_USERS["t.boss"]["role"] == "cashier" and _FALLBACK_USERS["t.boss"]["sub_text"] == "Cashier · Counter 1"


def test_transfer_needs_the_right_pin_and_a_valid_target(api):
    assert api.post("/api/v1/users/t.till/transfer-admin", json={"current_pin": "0000"}).status_code == 403
    assert api.post("/api/v1/users/t.boss/transfer-admin", json={"current_pin": "4321"}).status_code == 400   # to yourself
    assert api.post("/api/v1/users/t.off/transfer-admin", json={"current_pin": "4321"}).status_code == 400    # disabled account
    assert api.post("/api/v1/users/nobody/transfer-admin", json={"current_pin": "4321"}).status_code == 404
    assert _FALLBACK_USERS["t.boss"]["role"] == "admin" and _FALLBACK_USERS["t.till"]["role"] == "cashier"
