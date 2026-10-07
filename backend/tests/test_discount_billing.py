"""
Discount Management -> Billing: which discounts apply, how percentage / fixed amounts are taken off, and validation when a discount is saved.
The pricing engine is pure; the discount API runs against its in-memory store (no app startup, database forced off).
"""
from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.database import db
from app.pricing_engine import compute_cart_totals, get_active_discount_for_item
from app.security import get_current_user

TODAY = date.today()
D = lambda n: (TODAY + timedelta(days=n)).isoformat()


def rule(name, type_="percent", value=10, applies_to="all", skus=None, start=None, end=None, status="active"):
    return {"id": name, "name": name, "type": type_, "value": value, "applies_to": applies_to, "product_skus": skus or [],
            "start_date": start, "end_date": end, "status": status}


def line(sku, price=100.0, qty=1, tax=0.0):
    return {"sku": sku, "name": sku, "price": price, "qty": qty, "tax": tax, "unit": "pcs"}


def bill(cart, discounts, manual=None, mode="exclusive"):
    return compute_cart_totals(cart, mode, manual, discounts)


# ------------------------------------------------------------------------------------------ which discounts apply
def test_only_active_discounts_inside_their_dates_apply():
    sku = "A"
    for r, expected in [(rule("live"), True),
                        (rule("inactive", status="inactive"), False),
                        (rule("not-started", start=D(1)), False),
                        (rule("expired", end=D(-1)), False),
                        (rule("starts-today", start=D(0)), True),
                        (rule("ends-today", end=D(0)), True),
                        (rule("open-ended", start=D(-30)), True)]:
        assert (get_active_discount_for_item(sku, [r]) is not None) is expected, r["name"]


def test_blocked_discounts_do_not_change_the_bill():
    for r in (rule("inactive", status="inactive"), rule("not-started", start=D(2)), rule("expired", end=D(-2))):
        t = bill([line("A", 200, 2)], [r])
        assert t["discount_total"] == 0 and t["grand_total"] == 400 and t["lines"][0]["discount_name"] is None


# ------------------------------------------------------------------------------------------ percentage / fixed
def test_percentage_discount_reduces_the_line():
    t = bill([line("A", 200, 2)], [rule("ten", "percent", 10)])
    assert t["auto_discount_total"] == 40 and t["grand_total"] == 360
    assert t["lines"][0]["discount_amount"] == 40 and t["lines"][0]["discount_name"] == "ten"


def test_fixed_amount_discount_is_taken_off_each_eligible_line():
    t = bill([line("A", 100, 1), line("B", 80, 1)], [rule("flat", "flat", 15)])
    assert [l["discount_amount"] for l in t["lines"]] == [15, 15] and t["grand_total"] == 150
    # the UI saves it as "fixed"; anything that is not a percentage is a fixed amount
    assert bill([line("A", 100, 1)], [rule("fx", "fixed", 15)])["grand_total"] == 85


def test_fixed_discount_never_exceeds_the_line_amount():
    t = bill([line("A", 10, 1)], [rule("big", "flat", 500)])
    assert t["lines"][0]["final_amount"] == 0 and t["auto_discount_total"] == 10


def test_discount_is_applied_before_gst():
    t = bill([line("A", 100, 1, tax=18)], [rule("ten", "percent", 10)])
    assert (t["taxable_total"], t["gst_total"], t["grand_total"]) == (90, 16.2, 106.2)
    t = bill([line("A", 118, 1, tax=18)], [rule("ten", "percent", 10)], mode="inclusive")
    assert t["grand_total"] == 106.2 and t["gst_total"] == 16.2


# ------------------------------------------------------------------------------------------ all products / selected items
def test_all_products_discount_applies_to_every_item():
    t = bill([line("A"), line("B"), line("C")], [rule("everything", "percent", 10)])
    assert [l["discount_amount"] for l in t["lines"]] == [10, 10, 10]


def test_selected_items_discount_applies_only_to_those_items():
    t = bill([line("A"), line("B")], [rule("just-a", "percent", 20, "selected", ["A"])])
    assert [l["discount_amount"] for l in t["lines"]] == [20, 0] and t["lines"][1]["discount_name"] is None


def test_a_selected_item_discount_beats_the_all_products_one():
    rules = [rule("all-5", "percent", 5), rule("a-25", "percent", 25, "selected", ["A"])]
    t = bill([line("A"), line("B")], rules)
    assert [(l["discount_amount"], l["discount_name"]) for l in t["lines"]] == [(25, "a-25"), (5, "all-5")]


def test_a_blocked_selected_discount_falls_back_to_the_all_products_one():
    rules = [rule("all-5", "percent", 5), rule("a-25", "percent", 25, "selected", ["A"], end=D(-1))]
    assert bill([line("A")], rules)["lines"][0]["discount_name"] == "all-5"


def test_selected_discount_with_product_list_stored_as_json_text():
    r = rule("a-10", "percent", 10, "selected")
    r["product_skus"] = '["A", "Z"]'                 # how the database stores it
    assert bill([line("A")], [r])["auto_discount_total"] == 10


# ------------------------------------------------------------------------------------------ with a bill discount
def test_bill_discount_applies_after_the_item_discounts():
    t = bill([line("A", 100, 1)], [rule("ten", "percent", 10)], manual={"type": "percent", "value": 10})
    # 100 -> 90 after the offer, then 10% of 90 = 9 more
    assert (t["auto_discount_total"], t["manual_discount_total"], t["discount_total"], t["grand_total"]) == (10, 9, 19, 81)


# ------------------------------------------------------------------------------------------ saving a discount (API validation)
@pytest.fixture
def api(monkeypatch):
    from app.main import app
    monkeypatch.setattr(type(db), "is_connected", lambda self: False)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(username="a", role="admin", full_name="Admin A", phase_access=2)
    yield TestClient(app, headers={"Authorization": "Bearer test"})
    app.dependency_overrides.pop(get_current_user, None)


def _body(**over):
    body = {"name": "Test offer", "type": "percent", "value": 10, "applies_to": "all", "product_skus": [], "start_date": D(0), "end_date": None, "status": "active"}
    body.update(over)
    return body


@pytest.mark.parametrize("change,fragment", [
    ({"name": "  "}, "discount name"),
    ({"type": "bogus"}, "type"),
    ({"value": 0}, "greater than zero"),
    ({"value": -5}, "greater than zero"),
    ({"type": "percent", "value": 150}, "100%"),
    ({"applies_to": "selected", "product_skus": []}, "at least one product"),
    ({"applies_to": "somewhere"}, "apply to"),
    ({"status": "paused"}, "active or inactive"),
    ({"start_date": "10-10-2026"}, "valid date"),
    ({"start_date": D(5), "end_date": D(1)}, "End date cannot be earlier"),
])
def test_invalid_discounts_are_rejected(api, change, fragment):
    r = api.post("/api/v1/discounts", json=_body(**{"name": "Bad " + fragment, **change}))
    assert r.status_code == 400 and fragment in r.json()["detail"], r.text


def test_valid_discount_is_saved_in_the_form_billing_reads(api):
    r = api.post("/api/v1/discounts", json=_body(name="Fixed fifty", type="fixed", value=50, applies_to="selected", product_skus=["A", "A", "B"]))
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["type"] == "flat" and d["product_skus"] == ["A", "B"] and d["status"] == "active"      # "fixed" is stored as flat; duplicates dropped
    assert d["name"] in [x["name"] for x in api.get("/api/v1/discounts").json()]
    upd = api.put(f"/api/v1/discounts/{d['id']}", json=_body(name="Fixed fifty", status="inactive", type="flat", value=50, applies_to="all"))
    assert upd.status_code == 200 and upd.json()["status"] == "inactive"
    assert api.put(f"/api/v1/discounts/{d['id']}", json=_body(name="x", value=0)).status_code == 400
    assert api.delete(f"/api/v1/discounts/{d['id']}").status_code == 200
    assert d["id"] not in [x["id"] for x in api.get("/api/v1/discounts").json()]
