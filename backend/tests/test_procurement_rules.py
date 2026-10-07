"""
Procurement rules that do not need a database: PO statuses and transitions, GSTIN, input validation on purchase orders,
goods receipts, purchase returns and vendor payments. The API runs against its in-memory store (no app startup, database forced off).
"""
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import procurement as pr
from app.database import db
from app.security import get_current_user


# ------------------------------------------------------------------------------------------ pure rules
def test_legacy_po_statuses_are_mapped():
    assert pr.norm_po_status("Pending Approval") == "Pending"
    assert pr.norm_po_status("Closed") == "Received"
    assert pr.norm_po_status("Approved") == "Approved"
    assert pr.stored_po_statuses("Pending") == ["Pending", "Pending Approval"]


@pytest.mark.parametrize("current,target", [("Draft", "Pending"), ("Pending", "Approved"), ("Approved", "Ordered"),
                                            ("Draft", "Cancelled"), ("Pending", "Cancelled"), ("Approved", "Cancelled"),
                                            ("Ordered", "Cancelled"), ("Pending Approval", "Approved")])
def test_allowed_po_transitions(current, target):
    pr.check_po_transition(current, target)


@pytest.mark.parametrize("current,target", [("Draft", "Approved"), ("Pending", "Ordered"), ("Approved", "Pending"),
                                            ("Received", "Cancelled"), ("Partially Received", "Cancelled"),
                                            ("Cancelled", "Pending"), ("Closed", "Approved")])
def test_blocked_po_transitions(current, target):
    with pytest.raises(HTTPException) as e:
        pr.check_po_transition(current, target)
    assert e.value.status_code == 400


def test_receiving_is_allowed_only_after_approval():
    assert pr.PO_RECEIVABLE == {"Approved", "Ordered", "Partially Received"}


def test_gstin_validation():
    assert pr.clean_gstin(" 29abcde1234f1z5 ") == "29ABCDE1234F1Z5"
    assert pr.clean_gstin("") is None and pr.clean_gstin(None) is None
    for bad in ("29ABCDE1234F1Z", "ABCDE1234F", "29ABCDE1234F1X5"):
        with pytest.raises(HTTPException):
            pr.clean_gstin(bad)


def test_gst_is_added_to_a_line_value():
    assert pr.with_gst(100, 18) == 118.0
    assert pr.with_gst(100, 0) == 100.0 and pr.with_gst(100, None) == 100.0


def test_dates_are_validated():
    assert pr.parse_date("2026-10-07", "x") == "2026-10-07" and pr.parse_date("", "x") is None
    with pytest.raises(HTTPException):
        pr.parse_date("07-10-2026", "x")


def test_return_reasons_are_the_agreed_six():
    assert pr.RETURN_REASONS == ("Damaged", "Wrong Product", "Wrong Quantity", "Expired", "Quality Issue", "Warranty")


# ------------------------------------------------------------------------------------------ API (in-memory store)
@pytest.fixture
def api(monkeypatch):
    from app.main import app
    monkeypatch.setattr(type(db), "is_connected", lambda self: False)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(username="a", role="admin", full_name="Admin A", phase_access=2)
    yield TestClient(app, headers={"Authorization": "Bearer test"})      # the Phase 2 routers insist on a bearer token being present
    app.dependency_overrides.pop(get_current_user, None)


def _po(**over):
    body = {"vendorId": "V-001", "expected": "2099-01-10", "date": "2099-01-01", "status": "Pending",
            "lines": [{"sku": "ZZ-1", "name": "Test item", "qty": 5, "cost": 10, "taxRate": 18}]}
    body.update(over)
    return body


def test_po_is_created_with_gst_totals(api):
    r = api.post("/api/v1/purchase-orders", json=_po())
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["status"] == "Pending" and d["date"] == "2099-01-01"
    assert d["subtotal"] == 50.0 and d["gst"] == 9.0 and d["total"] == 59.0
    assert d["lines"][0]["taxRate"] == 18


@pytest.mark.parametrize("change,fragment", [
    ({"lines": []}, "at least one product"),
    ({"lines": [{"sku": "A", "name": "A", "qty": 0, "cost": 5}]}, "greater than zero"),
    ({"lines": [{"sku": "A", "name": "A", "qty": 1, "cost": -5}]}, "negative"),
    ({"lines": [{"sku": "A", "name": "A", "qty": 1, "cost": 5, "taxRate": 150}]}, "GST"),
    ({"lines": [{"sku": "A", "name": "A", "qty": 1, "cost": 5}, {"sku": "A", "name": "A", "qty": 2, "cost": 5}]}, "twice"),
    ({"expected": "2098-12-31"}, "before the PO date"),
    ({"expected": ""}, "expected delivery"),
    ({"date": "01-01-2099"}, "valid date"),
    ({"status": "Approved"}, "Draft or Pending"),
])
def test_po_validation(api, change, fragment):
    r = api.post("/api/v1/purchase-orders", json=_po(**change))
    assert r.status_code == 400 and fragment in r.json()["detail"], r.text


def test_po_status_flow_and_cancel(api):
    po_id = api.post("/api/v1/purchase-orders", json=_po(status="Draft", expected="2099-02-01")).json()["id"]
    assert api.post(f"/api/v1/purchase-orders/{po_id}/approve").status_code == 400            # Draft must be submitted first
    assert api.post(f"/api/v1/purchase-orders/{po_id}/submit").json()["status"] == "Pending"
    assert api.post(f"/api/v1/purchase-orders/{po_id}/order").status_code == 400              # approval comes first
    assert api.post(f"/api/v1/purchase-orders/{po_id}/approve").json()["status"] == "Approved"
    assert api.post(f"/api/v1/purchase-orders/{po_id}/order").json()["status"] == "Ordered"
    assert api.post(f"/api/v1/purchase-orders/{po_id}/cancel").json()["status"] == "Cancelled"
    assert api.post(f"/api/v1/purchase-orders/{po_id}/submit").status_code == 400            # a cancelled PO stays cancelled
    assert api.get(f"/api/v1/purchase-orders/{po_id}").json()["status"] == "Cancelled"


def test_po_can_only_be_edited_while_draft_or_pending(api):
    po_id = api.post("/api/v1/purchase-orders", json=_po(expected="2099-03-01")).json()["id"]
    r = api.put(f"/api/v1/purchase-orders/{po_id}", json={"expected": "2099-03-05", "lines": [{"sku": "ZZ-2", "name": "Other", "qty": 2, "cost": 4}]})
    assert r.status_code == 200 and r.json()["expected"] == "2099-03-05" and r.json()["lines"][0]["sku"] == "ZZ-2"
    api.post(f"/api/v1/purchase-orders/{po_id}/approve")
    assert api.put(f"/api/v1/purchase-orders/{po_id}", json={"expected": "2099-03-09"}).status_code == 400


def test_po_list_filters_by_status_and_vendor(api):
    api.post("/api/v1/purchase-orders", json=_po(vendorId="V-777", expected="2099-04-01"))
    assert all(p["status"] == "Pending" for p in api.get("/api/v1/purchase-orders?status=Pending").json())
    assert [p["vendorId"] for p in api.get("/api/v1/purchase-orders?vendor_id=V-777").json()] == ["V-777"]


def test_goods_receipt_needs_a_positive_quantity(api):
    assert api.post("/api/v1/grn/receipt", json={"poId": "PO-X", "lines": [{"sku": "A", "qty": 0}]}).status_code == 400
    r = api.post("/api/v1/grn/receipt", json={"poId": "PO-X", "lines": [{"sku": "A", "qty": -2}]})
    assert r.status_code == 400 and "negative" in r.json()["detail"]
    r = api.post("/api/v1/grn/receipt", json={"poId": "PO-X", "lines": [{"sku": "A", "qty": 1}, {"sku": "A", "qty": 2}]})
    assert r.status_code == 400 and "twice" in r.json()["detail"]
    r = api.post("/api/v1/grn/receipt", json={"poId": "PO-X", "lines": [{"sku": "A", "qty": 1, "mfgDate": "2026-05-01", "expiryDate": "2026-04-01"}]})
    assert r.status_code == 400 and "before" in r.json()["detail"]


def test_direct_receipt_validation(api):
    bad = {"vendorId": "V-001", "lines": [{"sku": "A", "qty": 0, "cost": 5}]}
    assert api.post("/api/v1/grn/direct", json=bad).status_code == 400
    assert api.post("/api/v1/grn/direct", json={"vendorId": "V-001", "lines": []}).status_code == 400


def test_purchase_return_reason_must_be_one_of_the_six(api):
    body = {"vendorId": "V-001", "reason": "Damaged in transit", "lines": [{"sku": "A", "name": "A", "qty": 1, "cost": 5}]}
    r = api.post("/api/v1/purchase-returns", json=body)
    assert r.status_code == 400 and "return reason" in r.json()["detail"]
    for reason in pr.RETURN_REASONS:
        assert api.post("/api/v1/purchase-returns", json={**body, "reason": reason}).status_code == 200


def test_purchase_return_can_be_saved_as_draft(api):
    body = {"vendorId": "V-001", "reason": "Expired", "process": False, "lines": [{"sku": "A", "name": "A", "qty": 1, "cost": 5}]}
    assert api.post("/api/v1/purchase-returns", json=body).json()["status"] == "Draft"


def test_vendor_payment_must_be_positive(api):
    for amount in (0, -50):
        r = api.post("/api/v1/vendors/V-001/payments", json={"amount": amount, "mode": "Cash"})
        assert r.status_code == 400 and "greater than zero" in r.json()["detail"]


def test_vendor_gstin_is_validated_and_normalised(api):
    r = api.post("/api/v1/vendors", json={"name": "Gst Test Traders", "gstin": "29ABCDE1234F1X5"})
    assert r.status_code == 400 and "GSTIN" in r.json()["detail"]
    r = api.post("/api/v1/vendors", json={"name": "Gst Test Traders", "gstin": "29abcde1234f1z5"})
    assert r.status_code == 200 and r.json()["gstin"] == "29ABCDE1234F1Z5"
    vendor_id = r.json()["id"]
    assert api.put(f"/api/v1/vendors/{vendor_id}", json={"gstin": "bad"}).status_code == 400
    assert api.put(f"/api/v1/vendors/{vendor_id}", json={"status": "Inactive"}).json()["status"] == "Inactive"
    assert api.put(f"/api/v1/vendors/{vendor_id}", json={"status": "Paused"}).status_code == 400
    assert api.post("/api/v1/vendors", json={"name": "   "}).status_code == 400
