import asyncio
from app.database import db, connect_db, disconnect_db

async def check():
    await connect_db()
    print("Users:", await db.user.count())
    print("Categories:", await db.category.count())
    print("Items:", await db.item.count())
    print("Vendors:", await db.vendor.count())
    print("POs:", await db.purchaseorder.count())
    print("Batches:", await db.batch.count())
    print("Discounts:", await db.discount.count())
    print("Adjustments:", await db.stockadjustment.count())
    print("Returns:", await db.purchasereturn.count())
    print("Payments:", await db.vendorpayment.count())
    print("Held Bills:", await db.heldbill.count())
    await disconnect_db()

if __name__ == "__main__":
    asyncio.run(check())
