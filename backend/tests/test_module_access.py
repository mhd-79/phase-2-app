"""Per-user module access: defaults by role, per-user Allow / Deny, and the server-side check."""
import json
from types import SimpleNamespace as NS

import pytest
from fastapi import HTTPException

from app.security import CASHIER_MODULES, MODULES, has_module, require_module, user_modules


def test_admin_has_everything_and_cashier_only_billing_hold_returns_by_default():
    assert all(user_modules(NS(role="admin")).values())
    cashier = user_modules(NS(role="cashier"))
    assert {k for k, v in cashier.items() if v} == CASHIER_MODULES == {"billing", "hold_recall", "returns"}
    assert set(MODULES) == set(cashier)


def test_per_user_allow_and_deny_override_the_role_defaults():
    cashier = NS(role="cashier", modules_json=json.dumps({"reports": True, "hold_recall": False}))
    m = user_modules(cashier)
    assert m["reports"] and not m["hold_recall"] and m["billing"] and not m["vendors"]
    admin = NS(role="admin", modules_json=json.dumps({"reports": False}))
    assert not user_modules(admin)["reports"] and user_modules(admin)["vendors"]


def test_dict_users_unknown_keys_and_bad_json_are_handled():
    assert user_modules({"role": "cashier", "modules_json": json.dumps({"reports": True, "bogus": True})})["reports"]
    assert "bogus" not in user_modules({"role": "cashier", "modules_json": json.dumps({"bogus": True})})
    assert user_modules(NS(role="cashier", modules_json="not json")) == user_modules(NS(role="cashier"))


def test_changing_one_users_access_never_touches_another():
    a, b = NS(role="cashier", modules_json=None), NS(role="cashier", modules_json=None)
    a.modules_json = json.dumps({"reports": True})
    assert has_module(a, "reports") and not has_module(b, "reports")


def test_require_module_checks_any_of_the_modules_on_the_server():
    check = require_module("inventory", "stock_upload")
    cashier = NS(role="cashier", modules_json=json.dumps({"stock_upload": True}))
    assert check(cashier) is cashier
    with pytest.raises(HTTPException) as e:
        check(NS(role="cashier", modules_json=None))
    assert e.value.status_code == 403 and "Inventory" in e.value.detail
    with pytest.raises(HTTPException):
        check(NS(role="super_admin"))
