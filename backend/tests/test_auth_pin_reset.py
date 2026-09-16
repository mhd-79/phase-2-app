import pytest
from starlette.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module", autouse=True)
def client():
    with TestClient(app) as test_client:
        yield test_client

def test_login_successful_with_valid_pin(client):
    res = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "cashier"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert data["username"] == "priya.k"
    assert data["role"] == "cashier"

def test_login_rejected_with_invalid_pin(client):
    res = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "9999", "role": "cashier"})
    assert res.status_code == 401
    assert "Invalid username or PIN" in res.json().get("detail", "")

def test_login_rejected_nonexistent_user(client):
    res = client.post("/api/v1/auth/login", json={"username": "fake.user.123", "pin": "1234", "role": "cashier"})
    assert res.status_code == 401

def test_forgot_pin_request_creation(client):
    res = client.post("/api/v1/auth/forgot-pin", json={"username": "priya.k", "reason": "Testing forgot PIN workflow"})
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "PENDING"
    assert data["username"] == "priya.k"

def test_admin_pin_reset_and_relogin(client):
    # 1. Admin login to get admin token
    admin_login = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999", "role": "admin"})
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}", "X-User-Role": "admin", "X-Username": "owner.arjun"}

    # 2. Check pending reset requests
    requests_res = client.get("/api/v1/users/pin-reset-requests", headers=headers)
    assert requests_res.status_code == 200
    assert any(r["username"] == "priya.k" for r in requests_res.json())

    # 3. Admin resets priya.k's PIN to 7788
    reset_res = client.post("/api/v1/users/priya.k/reset-pin", json={"new_pin": "7788"}, headers=headers)
    assert reset_res.status_code == 200

    # 4. Old PIN 1234 must fail with 401
    old_login = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "cashier"})
    assert old_login.status_code == 401

    # 5. New PIN 7788 must succeed with 200
    new_login = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "7788", "role": "cashier"})
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()

    # 6. Restore PIN back to 1234 for consistency
    restore_res = client.post("/api/v1/users/priya.k/reset-pin", json={"new_pin": "1234"}, headers=headers)
    assert restore_res.status_code == 200
