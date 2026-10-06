import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c

def test_auth_verify_pin_and_role_enforcement(client):
    # 1. Login with Admin credentials
    login_res = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999"})
    assert login_res.status_code == 200
    data = login_res.json()
    assert data["role"] == "admin"
    token = data["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Verify PIN with correct pin
    verify_res = client.post(
        "/api/v1/auth/verify-pin",
        headers=headers,
        json={"pin": "9999"}
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["valid"] is True

    # 3. Verify PIN with wrong pin
    verify_wrong = client.post(
        "/api/v1/auth/verify-pin",
        headers=headers,
        json={"pin": "0000"}
    )
    assert verify_wrong.status_code == 200
    assert verify_wrong.json()["valid"] is False

def test_ai_insights_endpoint(client):
    # Phase 2 API: requires a signed-in Phase 2 admin (Phase 1 admins / anonymous callers are rejected)
    login_res = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999"})
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}
    res = client.get("/api/v1/reports/ai-insights", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "trends" in data
    assert "top_selling_by_quantity" in data
    assert "top_revenue_generators" in data
    assert "slow_moving_items" in data
    assert len(data["trends"]) > 0

def test_cash_counters_and_float_management(client):
    # Login admin
    login_res = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Get counters
    counters_res = client.get("/api/v1/reports/cash-drawer/counters", headers=headers)
    assert counters_res.status_code == 200
    counters = counters_res.json()
    assert len(counters) >= 1

    counter_id = counters[0]["id"]
    # Update float
    update_res = client.put(
        f"/api/v1/reports/cash-drawer/counters/{counter_id}/float",
        headers=headers,
        json={"opening_float": 3500.0}
    )
    assert update_res.status_code == 200
    assert update_res.json()["opening_float"] == 3500.0

def test_stock_on_hand_report_with_expiry(client):
    token = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999"}).json()["access_token"]
    res = client.get("/api/v1/reports/stock-on-hand", headers={"Authorization": f"Bearer {token}"})   # Reports module: admins have it, anonymous callers do not
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert len(data["items"]) > 0
    first_item = data["items"][0]
    assert "expiryDate" in first_item
    assert "sku" in first_item
    assert "stockValue" in first_item
