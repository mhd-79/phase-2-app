import pytest
import time
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

@pytest.fixture(scope="module")
def admin_token(client):
    response = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999", "role": "admin"})
    assert response.status_code == 200
    return response.json()["access_token"]

def test_prototype_sample_items_are_seeded(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = client.get("/api/v1/catalog/items", headers=headers)
    assert response.status_code == 200
    items = {i["sku"]: i for i in response.json()}

    for sku in ["BEV-005", "SNK-005", "DAI-005", "GRO-006", "PC-005"]:
        assert sku in items, f"Missing prototype item {sku}"
        assert items[sku]["name"]


def test_vendor_management(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    
    # List vendors
    response = client.get("/api/v1/vendors", headers=headers)
    assert response.status_code == 200
    vendors = response.json()
    assert len(vendors) >= 8

    # Create new vendor
    new_v = {
        "name": "Test Wholesale Ltd",
        "category": "General",
        "contact": "John Doe",
        "phone": "+91 99999 11111",
        "email": "john@test.com",
        "terms": "Net 30"
    }
    create_res = client.post("/api/v1/vendors", json=new_v, headers=headers)
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["name"] == "Test Wholesale Ltd"
    v_id = created["id"]

    # Record vendor payment
    pmt_res = client.post(f"/api/v1/vendors/{v_id}/payments", json={"amount": 1000.0, "mode": "Bank Transfer"}, headers=headers)
    assert pmt_res.status_code == 200
    assert "PMT-" in pmt_res.json()["id"]

    # Get vendor ledger
    ledger_res = client.get(f"/api/v1/vendors/{v_id}/ledger", headers=headers)
    assert ledger_res.status_code == 200
    assert len(ledger_res.json()["ledger"]) >= 1

def test_purchase_order_lifecycle(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    start_time = time.time()
    
    # 1. Create Purchase Order
    po_payload = {
        "vendorId": "V-001",
        "expected": "2026-09-15",
        "lines": [
            {"sku": "BEV-001", "name": "Cola 500ml", "qty": 50, "cost": 30.0},
            {"sku": "SNK-001", "name": "Potato Chips 90g", "qty": 30, "cost": 25.0}
        ]
    }
    create_res = client.post("/api/v1/purchase-orders", json=po_payload, headers=headers)
    assert create_res.status_code == 200
    po_id = create_res.json()["id"]
    assert create_res.json()["status"] == "Pending"

    # 2. Approve Purchase Order
    app_res = client.post(f"/api/v1/purchase-orders/{po_id}/approve", headers=headers)
    assert app_res.status_code == 200
    assert app_res.json()["status"] == "Approved"

    # 3. Record Goods Receipt (GRN)
    grn_payload = {
        "poId": po_id,
        "lines": [
            {"sku": "BEV-001", "qty": 50},
            {"sku": "SNK-001", "qty": 20} # Short shipment variance
        ]
    }
    grn_res = client.post("/api/v1/grn/receipt", json=grn_payload, headers=headers)
    assert grn_res.status_code == 200
    grn_data = grn_res.json()
    assert "GRN-" in grn_data["grnId"]
    assert grn_data["status"] == "Partially Received"
    assert len(grn_data["variances"]) == 1

    processing_time = time.time() - start_time
    # SRS Performance NFR Requirement: under 5 seconds
    assert processing_time < 5.0

def test_direct_stock_receipt(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "vendorId": "V-008",
        "lines": [
            {"sku": "BAK-001", "qty": 20, "cost": 28.0}
        ]
    }
    res = client.post("/api/v1/grn/direct", json=payload, headers=headers)
    assert res.status_code == 200
    assert "GRN-DIRECT-" in res.json()["grnId"]

def test_purchase_returns(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "vendorId": "V-002",
        "reason": "Damaged",
        "lines": [
            {"sku": "BEV-003", "name": "Mineral Water 1L", "qty": 5, "cost": 12.0}
        ]
    }
    res = client.post("/api/v1/purchase-returns", json=payload, headers=headers)
    assert res.status_code == 200
    assert "DN-" in res.json()["id"]

def test_stock_adjustment(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "sku": "SNK-001",
        "name": "Potato Chips 90g",
        "delta": -2,
        "reason": "Damaged / broken",
        "notes": "Torn packaging during inventory move",
        "approvedBy": "Arjun M."
    }
    res = client.post("/api/v1/stock-adjustments", json=payload, headers=headers)
    assert res.status_code == 200
    assert "ADJ-" in res.json()["id"]

def test_batch_fefo_issuing(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/v1/batches/issue-fefo/DAI-001", headers=headers)
    assert res.status_code == 200
    assert res.json()["recommendedBatch"] is not None

def test_reorder_alerts(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/v1/reorder-alerts", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)

def test_stock_audit_post_variances(client, admin_token):
    headers = {"Authorization": f"Bearer {admin_token}"}
    payload = {
        "counts": [
            {"sku": "BEV-001", "countedQty": 80.0} # Variance against current stock
        ],
        "approvedBy": "Arjun M."
    }
    res = client.post("/api/v1/stock-audit/post-variances", json=payload, headers=headers)
    assert res.status_code == 200
    assert "postedCount" in res.json()
