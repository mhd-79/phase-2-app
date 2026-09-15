import asyncio
from app.database import connect_db, disconnect_db, db
from app.routers.catalog import get_categories, create_category
from app.schemas import CategoryCreate

async def test_categories():
    await connect_db()
    # Add Fruits if not present
    cat = await db.category.find_unique(where={"name": "Fruits"})
    if not cat:
        await db.category.create(data={"name": "Fruits"})
    
    cats = await get_categories()
    print("Categories returned by API:", cats)
    assert "Fruits" in cats
    assert "Beverages" in cats
    print("CATEGORY TEST PASSED!")
    await disconnect_db()

if __name__ == "__main__":
    asyncio.run(test_categories())
