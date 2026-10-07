"""
Per-user View / Create / Edit / Delete permissions for every module: how they are stored and read, which request needs which
permission, and that the real routes refuse an action the user was not given (a direct API call, not just a hidden button).
"""
import json
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.database import db
from app.routers.auth import _FALLBACK_USERS, _init_fallback_users
from app.security import (ACTIONS, MODULES, action_for_request, get_current_user, get_pin_hash, has_module, require_module, user_modules,
                          user_permissions)

FULL = {a: True for a in ACTIONS}
NONE = {a: False for a in ACTIONS}


def stored(**modules):
    return json.dumps(modules)


# ------------------------------------------------------------------------------------------ reading permissions
def test_role_defaults_give_every_action_of_an_allowed_module():
    admin = user_permissions(NS(role="admin"))
    assert set(admin) == set(MODULES) and all(p == FULL for p in admin.values())
    cashier = user_permissions(NS(role="cashier"))
    assert {k for k, p in cashier.items() if p == FULL} == {"billing", "hold_recall", "returns"}
    assert all(p == NONE for k, p in cashier.items() if k not in ("billing", "hold_recall", "returns"))


def test_a_module_saved_as_one_on_off_value_means_all_four_actions():
    p = user_permissions(NS(role="cashier", modules_json=stored(reports=True, billing=False)))
    assert p["reports"] == FULL and p["billing"] == NONE


def test_per_action_choices_are_kept_per_module():
    p = user_permissions(NS(role="cashier", modules_json=stored(billing={"view": True, "create": True, "edit": True, "delete": False})))
    assert p["billing"] == {"view": True, "create": True, "edit": True, "delete": False}
    assert p["hold_recall"] == FULL                     # untouched modules keep the role default


def test_create_edit_delete_need_view():
    p = user_permissions(NS(role="admin", modules_json=stored(vendors={"view": False, "create": True, "edit": True, "delete": True})))
    assert p["vendors"] == NONE
    assert user_modules(NS(role="admin", modules_json=stored(vendors={"view": False, "create": True})))["vendors"] is False


def test_missing_actions_in_a_saved_module_count_as_not_allowed():
    p = user_permissions(NS(role="admin", modules_json=stored(vendors={"view": True})))
    assert p["vendors"] == {"view": True, "create": False, "edit": False, "delete": False}


def test_modules_view_matches_the_view_permission_and_has_module_checks_an_action():
    u = NS(role="cashier", modules_json=stored(reports={"view": True, "create": False, "edit": False, "delete": False}))
    assert user_modules(u)["reports"] is True
    assert has_module(u, "reports") and not has_module(u, "reports", action="create")
    assert has_module(u, "vendors", "reports", action="view") and not has_module(u, "vendors", "reports", action="delete")


def test_one_users_permissions_never_touch_another():
    a, b = NS(role="cashier", modules_json=stored(reports=True)), NS(role="cashier", modules_json=None)
    assert has_module(a, "reports") and not has_module(b, "reports")


# ------------------------------------------------------------------------------------------ which request needs which permission
class Req:
    def __init__(self, method, path):
        self.method = method
        self.scope = {"route": NS(path=path)}
        self.url = NS(path=path)


@pytest.mark.parametrize("method,path,action", [
    ("GET", "/api/v1/vendors", "view"),
    ("POST", "/api/v1/vendors", "create"),
    ("PUT", "/api/v1/vendors/{vendor_id}", "edit"),
    ("PATCH", "/api/v1/vendors/{vendor_id}", "edit"),
    ("DELETE", "/api/v1/discounts/{discount_id}", "delete"),
    ("POST", "/api/v1/purchase-orders/{po_id}/approve", "edit"),            # an action on an existing record is an edit
    ("POST", "/api/v1/vendors/{vendor_id}/payments", "edit"),
    ("POST", "/api/v1/billing/sales", "create"),
    ("POST", "/api/v1/billing/calculate-totals", "view"),                    # reads only
    ("POST", "/api/v1/catalog/upload/preview", "view"),
    ("POST", "/api/v1/billing/approve-discount", "view"),
])
def test_request_to_permission(method, path, action):
    assert action_for_request(Req(method, path)) == action


def test_a_check_without_a_request_means_view():
    check = require_module("reports")
    u = NS(role="cashier", modules_json=stored(reports={"view": True}))
    assert check(u) is u


def test_require_module_names_the_missing_permission():
    check = require_module("vendors")
    u = NS(role="admin", modules_json=stored(vendors={"view": True, "create": True, "edit": False, "delete": False}))
    assert check(u, Req("POST", "/api/v1/vendors")) is u
    with pytest.raises(HTTPException) as e:
        check(u, Req("PUT", "/api/v1/vendors/{vendor_id}"))
    assert e.value.status_code == 403 and "permission to edit in Vendors" in e.value.detail
    with pytest.raises(HTTPException) as e:
        check(NS(role="cashier", modules_json=None), Req("GET", "/api/v1/vendors"))
    assert e.value.status_code == 403 and "do not have access to Vendors" in e.value.detail


# ------------------------------------------------------------------------------------------ real routes
@pytest.fixture
def make_client(monkeypatch):
    from app.main import app
    monkeypatch.setattr(type(db), "is_connected", lambda self: False)
    _init_fallback_users()
    current = {}

    def as_user(**fields):
        current["user"] = NS(username=fields.pop("username", "t.user"), full_name="Test User", phase_access=2, **fields)
        return TestClient(app, headers={"Authorization": "Bearer test"})

    app.dependency_overrides[get_current_user] = lambda: current["user"]
    yield as_user
    app.dependency_overrides.pop(get_current_user, None)
    for name in ("t.target", "t.boss"):
        _FALLBACK_USERS.pop(name, None)


def vendors_user(**flags):
    return dict(role="cashier", modules_json=stored(vendors={"view": True, "create": False, "edit": False, "delete": False, **flags}))


def test_view_only_user_can_read_but_not_create_edit_or_pay(make_client):
    api = make_client(**vendors_user())
    assert api.get("/api/v1/vendors").status_code == 200
    r = api.post("/api/v1/vendors", json={"name": "Blocked Traders"})
    assert r.status_code == 403 and "permission to create in Vendors" in r.json()["detail"], r.text
    assert api.put("/api/v1/vendors/V-001", json={"contact": "x"}).status_code == 403
    assert api.post("/api/v1/vendors/V-001/payments", json={"amount": 10, "mode": "Cash"}).status_code == 403


def test_each_action_unlocks_only_itself(make_client):
    assert make_client(**vendors_user(create=True)).post("/api/v1/vendors", json={"name": "Allowed Traders"}).status_code == 200
    assert make_client(**vendors_user(create=True)).put("/api/v1/vendors/V-001", json={"contact": "x"}).status_code == 403
    assert make_client(**vendors_user(edit=True)).put("/api/v1/vendors/V-001", json={"contact": "Ramesh Gupta"}).status_code == 200
    assert make_client(**vendors_user(edit=True)).post("/api/v1/vendors", json={"name": "Nope"}).status_code == 403


def test_a_user_without_view_cannot_even_read(make_client):
    api = make_client(role="cashier", modules_json=None)
    r = api.get("/api/v1/vendors")
    assert r.status_code == 403 and "do not have access" in r.json()["detail"]


def test_delete_needs_its_own_permission(make_client):
    perms = {"view": True, "create": True, "edit": True, "delete": False}
    api = make_client(role="cashier", modules_json=stored(discounts=perms))
    assert api.delete("/api/v1/discounts/some-id").status_code == 403
    api = make_client(role="cashier", modules_json=stored(discounts={**perms, "delete": True}))
    assert api.delete("/api/v1/discounts/some-id").status_code == 200


def test_billing_totals_need_only_view_but_a_sale_needs_create(make_client):
    billing = {"view": True, "create": False, "edit": False, "delete": False}
    api = make_client(role="cashier", modules_json=stored(billing=billing))
    cart = {"cart": [{"sku": "A", "name": "A", "price": 10, "qty": 1, "tax": 0}], "pricing_mode": "exclusive"}
    assert api.post("/api/v1/billing/calculate-totals", json=cart).status_code == 200
    sale = {"lines": [{"sku": "A", "name": "A", "price": 10, "qty": 1, "tax": 0}], "pricing_mode": "exclusive", "tenders": [{"mode": "Cash", "amount": 10}]}
    r = api.post("/api/v1/billing/sales", json=sale)
    assert r.status_code == 403 and "permission to create in Billing" in r.json()["detail"]


def test_default_cashier_billing_is_unchanged(make_client):
    api = make_client(role="cashier", modules_json=None)
    sale = {"lines": [{"sku": "A", "name": "A", "price": 10, "qty": 1, "tax": 0}], "pricing_mode": "exclusive", "tenders": [{"mode": "Cash", "amount": 10}]}
    assert api.post("/api/v1/billing/sales", json=sale).status_code == 200


# ------------------------------------------------------------------------------------------ the User Access screen's API
def _target(role="cashier"):
    _FALLBACK_USERS["t.target"] = {"id": "U-t.target", "username": "t.target", "pin_hash": get_pin_hash("1111"), "role": role, "full_name": "Target",
                                   "sub_text": "x", "is_active": True, "auto_lock": "2 min", "schedule_json": None}
    return _FALLBACK_USERS["t.target"]


def test_admin_saves_a_matrix_per_user_and_reads_it_back(make_client):
    api = make_client(username="t.boss", role="admin", modules_json=None)
    _target()
    body = {"modules": {"billing": {"view": True, "create": True, "edit": True, "delete": False},
                        "vendors": {"view": True, "create": False, "edit": False, "delete": False},
                        "reports": True, "returns": False}}
    r = api.put("/api/v1/users/t.target/access", json=body)
    assert r.status_code == 200, r.text
    p = r.json()["permissions"]
    assert p["billing"] == {"view": True, "create": True, "edit": True, "delete": False}
    assert p["vendors"] == {"view": True, "create": False, "edit": False, "delete": False}
    assert p["reports"] == FULL and p["returns"] == NONE and p["hold_recall"] == FULL
    assert r.json()["modules"]["billing"] is True and r.json()["modules"]["returns"] is False
    again = api.get("/api/v1/users/t.target/access").json()
    assert again["permissions"] == p and again["actions"] == ["view", "create", "edit", "delete"]
    other = _FALLBACK_USERS.get("owner.arjun")
    assert other is None or user_permissions(other)["billing"] == FULL        # someone else is untouched


def test_unticking_view_clears_the_other_actions(make_client):
    api = make_client(username="t.boss", role="admin", modules_json=None)
    _target()
    r = api.put("/api/v1/users/t.target/access", json={"modules": {"vendors": {"view": False, "create": True, "edit": True, "delete": True}}})
    assert r.status_code == 200 and r.json()["permissions"]["vendors"] == NONE


def test_unknown_module_or_permission_is_rejected(make_client):
    api = make_client(username="t.boss", role="admin", modules_json=None)
    _target()
    assert api.put("/api/v1/users/t.target/access", json={"modules": {"bogus": True}}).status_code == 422
    assert api.put("/api/v1/users/t.target/access", json={"modules": {"vendors": {"view": True, "export": True}}}).status_code == 422


def test_your_own_access_cannot_be_changed(make_client):
    api = make_client(username="t.boss", role="admin", modules_json=None)
    _FALLBACK_USERS["t.boss"] = {"id": "U-t.boss", "username": "t.boss", "pin_hash": get_pin_hash("1111"), "role": "admin", "full_name": "Boss",
                                 "sub_text": "x", "is_active": True, "auto_lock": "2 min", "schedule_json": None}
    r = api.put("/api/v1/users/t.boss/access", json={"modules": {"vendors": False}})
    assert r.status_code == 400 and "own access" in r.json()["detail"]


def test_nobody_can_grant_an_action_they_do_not_hold(make_client):
    # an admin who may view and edit Users & Roles but holds only View on Vendors cannot hand out Create on Vendors
    boss = dict(username="t.boss", role="admin", modules_json=stored(vendors={"view": True, "create": False, "edit": False, "delete": False}))
    api = make_client(**boss)
    _target()
    r = api.put("/api/v1/users/t.target/access", json={"modules": {"vendors": {"view": True, "create": True}}})
    assert r.status_code == 403 and "Vendors (create)" in r.json()["detail"]
    assert api.put("/api/v1/users/t.target/access", json={"modules": {"vendors": {"view": True}}}).status_code == 200


def test_the_screens_own_api_needs_edit_on_users_and_roles(make_client):
    no_edit = stored(users={"view": True, "create": False, "edit": False, "delete": False})
    api = make_client(username="t.boss", role="admin", modules_json=no_edit)
    _target()
    assert api.get("/api/v1/users/t.target/access").status_code == 200
    r = api.put("/api/v1/users/t.target/access", json={"modules": {"reports": True}})
    assert r.status_code == 403 and "permission to edit in Users & Roles" in r.json()["detail"]


def test_login_style_payloads_carry_the_permissions():
    from app.schemas import TokenResponse, UserSchema
    perms = user_permissions(NS(role="cashier"))
    t = TokenResponse(access_token="x", username="u", role="cashier", full_name="U", sub_text="s", modules=user_modules(NS(role="cashier")), permissions=perms)
    assert t.permissions["billing"] == FULL and t.modules["billing"] is True
    assert UserSchema(id="1", username="u", role="cashier", full_name="U", sub_text="s", is_active=True, permissions=perms).permissions["vendors"] == NONE
