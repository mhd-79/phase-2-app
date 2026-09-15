import asyncio
import json
from app.database import connect_db, disconnect_db, db
from app.routers.billing import get_held_bills, hold_bill, delete_held_bill
from app.schemas import HeldBillCreate

async def run_tests():
    await connect_db()
    print("DB connected for test.")

    # 1. Test clean state / list held bills
    initial_bills = await get_held_bills()
    print(f"Initial held bills count: {len(initial_bills)}")

    # 2. Hold a new test bill
    test_id = "HOLD-TEST-001"
    # Ensure cleanup first if exists
    existing = await db.heldbill.find_unique(where={"held_id": test_id})
    if existing:
        await db.heldbill.delete(where={"held_id": test_id})

    payload = HeldBillCreate(
        id=test_id,
        lines=[
            {
                "sku": "BEV-001",
                "name": "Cola 500ml",
                "mrp": 45.0,
                "wholesale_price": 38.0,
                "priceMode": "mrp",
                "price": 45.0,
                "tax": 18.0,
                "pricingMethod": "qty",
                "unit": "pcs",
                "qty": 2
            }
        ],
        discount={"type": "percent", "value": 10, "amount": 9.0},
        item_count=2,
        total=81.0
    )

    user = await db.user.find_first(where={"username": "priya.k"})
    hold_res = await hold_bill(payload, user=user)
    print(f"Hold response: {hold_res}")
    assert hold_res["held_id"] == test_id
    assert hold_res["message"] == "Bill held successfully"

    # 3. Retrieve held bills and verify contents
    bills_after_hold = await get_held_bills()
    found = next((b for b in bills_after_hold if b["held_id"] == test_id or b["id"] == test_id), None)
    assert found is not None, "Newly held bill not found in held bills list"
    assert found["total"] == 81.0
    assert len(found["lines"]) == 1
    assert found["lines"][0]["sku"] == "BEV-001"
    print(f"Found held bill in list: {found['held_id']}, lines: {len(found['lines'])}, total: {found['total']}")

    # 4. Recall / Delete held bill
    del_res = await delete_held_bill(test_id)
    print(f"Delete response: {del_res}")
    assert del_res["message"] == "Held bill recalled/cleared"

    # 5. Verify it is gone
    bills_after_delete = await get_held_bills()
    found_after = next((b for b in bills_after_delete if b["held_id"] == test_id or b["id"] == test_id), None)
    assert found_after is None, "Held bill still exists after recall"
    print("Held bill successfully deleted/recalled.")

    await disconnect_db()
    print("ALL HOLD & RECALL BACKEND TESTS PASSED!")

if __name__ == "__main__":
    asyncio.run(run_tests())
