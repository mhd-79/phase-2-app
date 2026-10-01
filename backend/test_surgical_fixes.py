import asyncio
import uuid
import httpx

BASE_URL = "http://127.0.0.1:8000/api/v1"

async def test_all():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=10.0) as client:
        print("--- 1. TESTING LOGIN AUTHENTICATION REJECTION ---")
        # Test wrong PIN for cashier priya.k
        res = await client.post("/auth/login", json={"username": "priya.k", "pin": "9999"})
        print(f"Login priya.k with wrong PIN (9999): Status {res.status_code}")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        
        # Test wrong PIN for admin owner.arjun
        res = await client.post("/auth/login", json={"username": "owner.arjun", "pin": "0000"})
        print(f"Login owner.arjun with wrong PIN (0000): Status {res.status_code}")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"

        # Test valid PIN for admin owner.arjun
        res = await client.post("/auth/login", json={"username": "owner.arjun", "pin": "9999"})
        print(f"Login owner.arjun with correct PIN (9999): Status {res.status_code}, Body: {res.text}")
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        admin_token = res.json().get("access_token")
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        print(f"Admin logged in successfully, role: {res.json().get('role')}")

        print("\n--- 2. TESTING FORGOT PIN / PASSWORD FLOW ---")
        # Submit forgot-pin for cashier priya.k
        forgot_res = await client.post("/auth/forgot-pin", json={
            "username": "priya.k",
            "reason": "Forgot my 4-digit POS PIN"
        })
        print(f"Forgot PIN request status: {forgot_res.status_code}, body: {forgot_res.json()}")
        assert forgot_res.status_code == 200

        # Admin gets pending reset requests
        reqs_res = await client.get("/auth/pin-reset-requests", headers=admin_headers)
        print(f"Admin fetch PIN reset requests: Status {reqs_res.status_code}, count: {len(reqs_res.json())}")
        assert reqs_res.status_code == 200
        reqs = reqs_res.json()
        assert any(r.get("username") == "priya.k" for r in reqs)

        # Admin resets priya.k's PIN to '4321'
        reset_res = await client.post("/auth/reset-pin", json={
            "username": "priya.k",
            "new_pin": "4321"
        }, headers=admin_headers)
        print(f"Admin reset PIN status: {reset_res.status_code}, body: {reset_res.json()}")
        assert reset_res.status_code == 200

        # Login with old PIN should fail
        old_login = await client.post("/auth/login", json={"username": "priya.k", "pin": "1234"})
        print(f"Login priya.k with old PIN (1234): Status {old_login.status_code}")
        assert old_login.status_code == 401

        # Login with new PIN should succeed
        new_login = await client.post("/auth/login", json={"username": "priya.k", "pin": "4321"})
        print(f"Login priya.k with new PIN (4321): Status {new_login.status_code}")
        assert new_login.status_code == 200
        cashier_token = new_login.json().get("access_token")

        # Verify audit logs record the PIN reset
        audit_res = await client.get("/users/audit-logs", headers=admin_headers)
        print(f"Audit logs status: {audit_res.status_code}, total entries: {len(audit_res.json())}")
        logs = audit_res.json()
        pin_reset_logs = [l for l in logs if "PIN" in l.get("action", "") or "Reset" in l.get("action", "")]
        print(f"Found PIN reset audit logs: {len(pin_reset_logs)}")
        assert len(pin_reset_logs) > 0

        print("\n--- 3. TESTING DUPLICATE ACTION PREVENTION (IDEMPOTENCY) ---")
        sale_key = str(uuid.uuid4())
        sale_payload = {
            "customer_name": "Test Customer",
            "customer_phone": "9999999999",
            "items": [
                {"sku": "SKU-001", "name": "Organic Milk 1L", "quantity": 2, "unit_price": 65.0, "total_price": 130.0}
            ],
            "subtotal": 130.0,
            "discount_amount": 0.0,
            "tax_amount": 6.5,
            "total_amount": 136.5,
            "payment_method": "cash"
        }
        
        # 1st execution
        res1 = await client.post(
            "/billing/sales",
            json=sale_payload,
            headers={"Idempotency-Key": sale_key, "Authorization": f"Bearer {cashier_token}"}
        )
        print(f"Sale 1st request: Status {res1.status_code}, body: {res1.json()}")
        assert res1.status_code in (200, 201)
        invoice1 = res1.json().get("invoice_number") or res1.json().get("id") or res1.json().get("sale_id")

        # 2nd execution with same key (simulating duplicate click or network replay)
        res2 = await client.post(
            "/billing/sales",
            json=sale_payload,
            headers={"Idempotency-Key": sale_key, "Authorization": f"Bearer {cashier_token}"}
        )
        print(f"Sale 2nd duplicate request: Status {res2.status_code}, body: {res2.json()}")
        assert res2.status_code in (200, 201)
        invoice2 = res2.json().get("invoice_number") or res2.json().get("id") or res2.json().get("sale_id")
        assert invoice1 == invoice2, f"Duplicate created a new invoice! {invoice1} != {invoice2}"

        # 4. Held Bill Idempotency
        hold_key = str(uuid.uuid4())
        hold_payload = {
            "name": "Held Cart 1",
            "cart": [{"sku": "SKU-001", "name": "Organic Milk 1L", "qty": 1, "price": 65.0}]
        }
        h1 = await client.post("/billing/held-bills", json=hold_payload, headers={"Idempotency-Key": hold_key})
        h2 = await client.post("/billing/held-bills", json=hold_payload, headers={"Idempotency-Key": hold_key})
        print(f"Hold bill 1st: {h1.json().get('id')}, Hold bill 2nd: {h2.json().get('id')}")
        assert h1.json().get("id") == h2.json().get("id")

        print("\n ALL SURGICAL VERIFICATION TESTS PASSED SUCCESSFULLY! ")

if __name__ == "__main__":
    asyncio.run(test_all())
