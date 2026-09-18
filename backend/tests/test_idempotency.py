import pytest
import concurrent.futures
from starlette.testclient import TestClient
from app.main import app

@pytest.fixture(scope="module", autouse=True)
def client():
    with TestClient(app) as test_client:
        yield test_client

def test_sale_idempotency_same_key(client):
    """
    Test that submitting two identical sales with the same Idempotency-Key
    returns the exact same invoice, creates exactly one sale in DB, and
    deducts stock only once.
    """
    login_res = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "cashier"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "X-User-Role": "cashier",
        "X-Username": "priya.k",
        "Idempotency-Key": "test-idempotency-key-sale-001"
    }

    item_res = client.get("/api/v1/catalog/items/BEV-001")
    initial_stock = item_res.json()["stock"]

    sale_payload = {
        "cashier_username": "priya.k",
        "payment_mode": "Cash",
        "tenders": [{"mode": "Cash", "amount": 90.0}],
        "pricing_mode": "exclusive",
        "lines": [
            {
                "sku": "BEV-001",
                "name": "Tata Tea Gold 250g",
                "price": 45.0,
                "mrp": 45.0,
                "priceMode": "mrp",
                "qty": 2.0,
                "tax": 0.0,
                "unit": "pcs",
                "pricingMethod": "qty"
            }
        ]
    }

    # Request 1
    res1 = client.post("/api/v1/billing/sales", json=sale_payload, headers=headers)
    assert res1.status_code == 201
    data1 = res1.json()
    invoice1 = data1["invoice_no"]
    assert data1["grand_total"] == 81.0  # 90.0 - 10% seed promotional discount

    # Stock after request 1 should be initial - 2
    stock_after_1 = client.get("/api/v1/catalog/items/BEV-001").json()["stock"]
    assert stock_after_1 == initial_stock - 2.0

    # Request 2 with identical Idempotency-Key
    res2 = client.post("/api/v1/billing/sales", json=sale_payload, headers=headers)
    assert res2.status_code == 201
    data2 = res2.json()

    # Must return identical invoice data
    assert data2["invoice_no"] == invoice1
    assert data2["grand_total"] == data1["grand_total"]

    # Stock after request 2 must NOT be deducted again
    stock_after_2 = client.get("/api/v1/catalog/items/BEV-001").json()["stock"]
    assert stock_after_2 == initial_stock - 2.0


def test_concurrent_sales_with_same_key(client):
    """
    Simulate rapid duplicate clicks: two simultaneous requests sent in parallel
    threads with the same Idempotency-Key. Exactly 1 sale must be created.
    """
    login_res = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "cashier"})
    token = login_res.json()["access_token"]
    idemp_key = "test-concurrent-click-002"
    headers = {
        "Authorization": f"Bearer {token}",
        "X-User-Role": "cashier",
        "X-Username": "priya.k",
        "Idempotency-Key": idemp_key
    }

    item_res = client.get("/api/v1/catalog/items/BEV-002")
    initial_stock = item_res.json()["stock"]

    sale_payload = {
        "cashier_username": "priya.k",
        "payment_mode": "Cash",
        "tenders": [{"mode": "Cash", "amount": 110.0}],
        "pricing_mode": "exclusive",
        "lines": [
            {
                "sku": "BEV-002",
                "name": "Nescafe Classic 50g",
                "price": 110.0,
                "mrp": 110.0,
                "priceMode": "mrp",
                "qty": 1.0,
                "tax": 0.0,
                "unit": "pcs",
                "pricingMethod": "qty"
            }
        ]
    }

    def post_sale():
        return client.post("/api/v1/billing/sales", json=sale_payload, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(post_sale)
        f2 = executor.submit(post_sale)
        res1 = f1.result()
        res2 = f2.result()

    assert res1.status_code == 201
    assert res2.status_code == 201
    assert res1.json()["invoice_no"] == res2.json()["invoice_no"]

    # Stock deducted exactly 1 time
    final_stock = client.get("/api/v1/catalog/items/BEV-002").json()["stock"]
    assert final_stock == initial_stock - 1.0


def test_return_idempotency_and_double_refund_prevention(client):
    """
    Test that returns are protected:
    1. A return with the same idempotency key returns the cached refund response.
    2. Attempting to refund more items than originally purchased/remaining fails with 400.
    """
    login_res = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "cashier"})
    token = login_res.json()["access_token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "X-User-Role": "cashier",
        "X-Username": "priya.k"
    }

    # 1. Create a sale with 1 unit of SNK-001
    sale_res = client.post("/api/v1/billing/sales", json={
        "cashier_username": "priya.k",
        "payment_mode": "Cash",
        "tenders": [{"mode": "Cash", "amount": 20.0}],
        "pricing_mode": "exclusive",
        "lines": [
            {
                "sku": "SNK-001",
                "name": "Lay's Classic Salted 50g",
                "price": 20.0,
                "mrp": 20.0,
                "priceMode": "mrp",
                "qty": 1.0,
                "tax": 0.0,
                "unit": "pcs",
                "pricingMethod": "qty"
            }
        ]
    }, headers=headers)
    assert sale_res.status_code == 201
    inv = sale_res.json()["invoice_no"]

    # Record stock before return
    stock_before_ret = client.get("/api/v1/catalog/items/SNK-001").json()["stock"]

    return_headers = {
        **headers,
        "Idempotency-Key": f"return-key-{inv}-snk"
    }
    return_payload = {
        "invoice_no": inv,
        "reason": "Damaged pack",
        "items": [
            {"sku": "SNK-001", "qty": 1.0}
        ]
    }

    # 2. First return request
    ret1 = client.post("/api/v1/billing/returns", json=return_payload, headers=return_headers)
    assert ret1.status_code == 200
    ret_data1 = ret1.json()
    assert ret_data1["total_refund"] == 18.0  # 20.0 - 10% promotional discount

    # Stock should be incremented by 1
    stock_after_ret1 = client.get("/api/v1/catalog/items/SNK-001").json()["stock"]
    assert stock_after_ret1 == stock_before_ret + 1.0

    # 3. Duplicate return request with same Idempotency-Key
    ret2 = client.post("/api/v1/billing/returns", json=return_payload, headers=return_headers)
    assert ret2.status_code == 200
    assert ret2.json()["return_no"] == ret_data1["return_no"]
    assert ret2.json()["total_refund"] == ret_data1["total_refund"]

    # Stock should NOT be incremented again
    stock_after_ret2 = client.get("/api/v1/catalog/items/SNK-001").json()["stock"]
    assert stock_after_ret2 == stock_after_ret1

    # 4. Attempting another return with a DIFFERENT key should be rejected because all purchased qty is already returned
    diff_headers = {**headers, "Idempotency-Key": f"new-key-{inv}-snk"}
    ret3 = client.post("/api/v1/billing/returns", json=return_payload, headers=diff_headers)
    assert ret3.status_code == 400
    assert "already" in ret3.json()["detail"].lower()


def test_hold_bill_idempotency(client):
    """
    Test that clicking 'Hold Bill' repeatedly with the same idempotency key
    creates only 1 held bill record.
    """
    login_res = client.post("/api/v1/auth/login", json={"username": "priya.k", "pin": "1234", "role": "cashier"})
    token = login_res.json()["access_token"]
    headers = {
        "Authorization": f"Bearer {token}",
        "X-User-Role": "cashier",
        "X-Username": "priya.k",
        "Idempotency-Key": "hold-bill-key-999"
    }

    hold_payload = {
        "id": "HOLD-test-999",
        "total": 50.0,
        "item_count": 1.0,
        "lines": [{"sku": "SNK-001", "name": "Chips", "price": 50.0, "qty": 1.0}]
    }

    h1 = client.post("/api/v1/billing/held-bills", json=hold_payload, headers=headers)
    assert h1.status_code == 200
    h1_id = h1.json()["held_id"]

    h2 = client.post("/api/v1/billing/held-bills", json=hold_payload, headers=headers)
    assert h2.status_code == 200
    h2_id = h2.json()["held_id"]

    assert h1_id == h2_id

