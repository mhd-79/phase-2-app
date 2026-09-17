import asyncio
import sys
sys.path.insert(0, ".")
from starlette.testclient import TestClient
from app.main import app

with TestClient(app) as client:
    # 1. Admin login
    res_admin = client.post("/api/v1/auth/login", json={"username": "owner.arjun", "pin": "9999", "role": "admin"})
    print("Admin login status:", res_admin.status_code, res_admin.json().get("role"), res_admin.json().get("full_name"))
    assert res_admin.status_code == 200

    # 2. Cashier login
    res_cashier = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "cashier"})
    print("Cashier login status:", res_cashier.status_code, res_cashier.json().get("role"), res_cashier.json().get("full_name"))
    assert res_cashier.status_code == 200

    # 3. Invalid PIN
    res_invalid = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "9999", "role": "cashier"})
    print("Invalid login status (expected 401):", res_invalid.status_code, res_invalid.json().get("detail"))
    assert res_invalid.status_code == 401

    # 4. Catalog items from Neon DB
    res_items = client.get("/api/v1/catalog/items")
    print("Catalog items count:", len(res_items.json()))
    assert res_items.status_code == 200

    # 5. Store settings from Neon DB
    res_store = client.get("/api/v1/settings/store")
    print("Store name:", res_store.json().get("store_name"))
    assert res_store.status_code == 200

    print("ALL TESTS PASSED WITH NEON POSTGRESQL DATABASE!")
