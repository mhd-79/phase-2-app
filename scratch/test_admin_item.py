import asyncio
from app.database import connect_db, disconnect_db, db
from app.routers.catalog import create_item
from app.schemas import ItemCreate

async def test_admin_item_creation():
    await connect_db()
    admin_user = await db.user.find_first(where={"username": "owner.arjun"})
    assert admin_user is not None
    assert admin_user.role == "admin"

    test_sku = "FRT-TEST-001"
    existing = await db.item.find_unique(where={"sku": test_sku})
    if existing:
        await db.item.delete(where={"sku": test_sku})

    payload = ItemCreate(
        sku=test_sku,
        barcode="8901033652849",
        name="Mango Test",
        category_name="Fruits",
        price=100.0,
        wholesale_price=90.0,
        cost_price=60.0,
        tax_rate=12.0,
        stock=50.0,
        min_stock=10.0,
        pricing_method="weight",
        unit="kg"
    )

    created = await create_item(payload, user=admin_user)
    print("Created item successfully:", created.sku, created.name, created.category_name, created.price)
    assert created.sku == test_sku
    assert created.name == "Mango Test"

    # Clean up
    await db.item.delete(where={"sku": test_sku})
    print("Cleaned up test item.")

    await disconnect_db()
    print("ADMIN ITEM CREATION TEST PASSED!")

if __name__ == "__main__":
    asyncio.run(test_admin_item_creation())
