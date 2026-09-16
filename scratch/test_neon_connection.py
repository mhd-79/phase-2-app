import sys
import os
import asyncio
from dotenv import load_dotenv

sys.path.insert(0, os.path.abspath("backend"))
load_dotenv("backend/.env")

from app.database import db, connect_db, disconnect_db
from app.security import verify_pin

async def verify():
    print("Connecting to Neon PostgreSQL...")
    await connect_db()
    users_count = await db.user.count()
    items_count = await db.item.count()
    categories_count = await db.category.count()
    sales_count = await db.sale.count()
    settings = await db.storesettings.find_first()

    print("\n==========================================")
    print("  [SUCCESS] NEON DB IS CONNECTED & ACTIVE")
    print("==========================================")
    print(f"  Store Name     : {settings.store_name if settings else 'N/A'}")
    print(f"  Users in DB    : {users_count}")
    print(f"  Catalog Items  : {items_count}")
    print(f"  Categories     : {categories_count}")
    print(f"  Sales Recorded : {sales_count}")
    print("==========================================\n")
    await disconnect_db()

if __name__ == "__main__":
    asyncio.run(verify())
