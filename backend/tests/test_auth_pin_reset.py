import pytest
from datetime import datetime
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

def test_user_crud_and_deactivation_lifecycle(client):
    # Admin login
    admin_login = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999", "role": "admin"})
    admin_token = admin_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {admin_token}", "X-User-Role": "admin", "X-Username": "owner.arjun"}

    username = f"test.cashier_{int(datetime.now().timestamp())}"

    # 1. Create a new cashier user
    create_res = client.post("/api/v1/users", json={
        "username": username,
        "pin": "5566",
        "role": "cashier",
        "full_name": "Test Cashier",
        "sub_text": "Cashier · Counter 4",
        "auto_lock_minutes": 5
    }, headers=headers)
    assert create_res.status_code == 201
    created_data = create_res.json()
    assert created_data["username"] == username
    assert created_data["role"] == "cashier"
    assert created_data["is_active"] is True

    # 2. Login with the new cashier credentials
    login_res = client.post("/api/v1/auth/login", json={"username": username, "pin": "5566", "role": "cashier"})
    assert login_res.status_code == 200
    assert login_res.json()["full_name"] == "Test Cashier"

    # 3. Update user details & PIN
    update_res = client.put(f"/api/v1/users/{username}", json={
        "full_name": "Test Cashier Senior",
        "pin": "7788"
    }, headers=headers)
    assert update_res.status_code == 200
    assert update_res.json()["full_name"] == "Test Cashier Senior"

    # Old PIN fails
    assert client.post("/api/v1/auth/login", json={"username": username, "pin": "5566"}).status_code == 401
    # New PIN succeeds
    assert client.post("/api/v1/auth/login", json={"username": username, "pin": "7788"}).status_code == 200

    # 4. Deactivate user
    deactivate_res = client.put(f"/api/v1/users/{username}", json={"is_active": False}, headers=headers)
    assert deactivate_res.status_code == 200
    assert deactivate_res.json()["is_active"] is False

    # Login must now be rejected for deactivated account
    inactive_login = client.post("/api/v1/auth/login", json={"username": username, "pin": "7788"})
    assert inactive_login.status_code == 401
    assert "inactive or disabled" in inactive_login.json().get("detail", "")

    # 5. Reactivate user
    reactivate_res = client.put(f"/api/v1/users/{username}", json={"is_active": True}, headers=headers)
    assert reactivate_res.status_code == 200
    assert reactivate_res.json()["is_active"] is True

    # Login succeeds again
    assert client.post("/api/v1/auth/login", json={"username": username, "pin": "7788"}).status_code == 200

def test_database_backed_admin_discount_approval(client):
    # Valid admin PIN 9999 succeeds
    valid_res = client.post("/api/v1/billing/approve-discount", json={"pin": "9999"})
    assert valid_res.status_code == 200
    assert valid_res.json()["approved"] is True
    assert valid_res.json()["authorized_by"] == "owner.arjun"

    # Invalid admin PIN fails
    invalid_res = client.post("/api/v1/billing/approve-discount", json={"pin": "0000"})
    assert invalid_res.status_code == 401

def test_cashier_cannot_login_as_admin(client):
    # Priya is a cashier; attempting to login with role 'admin' must return 401, never 500
    res = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "admin"})
    assert res.status_code == 401
    assert "privileges" in res.json().get("detail", "").lower()

def test_admin_can_login_with_admin_or_cashier_role(client):
    # Admin login with role 'admin'
    admin_res = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999", "role": "admin"})
    assert admin_res.status_code == 200
    assert admin_res.json()["role"] == "admin"

    # Admin login with role 'cashier'
    cashier_res = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999", "role": "cashier"})
    assert cashier_res.status_code == 200
    assert cashier_res.json()["role"] == "admin"

def test_login_validation_errors_never_return_500(client):
    # Empty username and pin -> 400
    res1 = client.post("/api/v1/auth/login", json={"username": "", "pin": "", "role": "cashier"})
    assert res1.status_code == 400

    # Whitespace username -> 400
    res2 = client.post("/api/v1/auth/login", json={"username": "   ", "pin": "1234", "role": "cashier"})
    assert res2.status_code == 400

    # Whitespace pin -> 400
    res3 = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "   ", "role": "cashier"})
    assert res3.status_code == 400

    # Invalid role -> 400
    res4 = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "superuser"})
    assert res4.status_code == 400

    # Nonexistent user -> 401, never 500
    res5 = client.post("/api/v1/auth/login", json={"username": "definitely_not_a_user", "pin": "1234", "role": "cashier"})
    assert res5.status_code == 401

    # Inactive user -> 401, never 500
    res6 = client.post("/api/v1/auth/login", json={"username": "meena.t", "pin": "3456", "role": "cashier"})
    assert res6.status_code == 401


