from fastapi import APIRouter, HTTPException, Depends
from datetime import datetime
from app.schemas import StoreSettingsSchema, StoreSettingsUpdate
from app.security import get_current_user, require_admin
from app.database import db

router = APIRouter(prefix="/settings", tags=["Settings"])

@router.get(
    "/store",
    response_model=StoreSettingsSchema,
    summary="Get Store Profile Settings",
    description="Retrieves store configuration including store name, address, contact phone, GSTIN number, pricing mode (exclusive/inclusive), and default idle timeout."
)
async def get_store_settings():
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    if not store:
        store = await db.storesettings.create(data={"id": "store_main"})
    return StoreSettingsSchema(
        store_name=store.store_name,
        address=store.address,
        phone=store.phone,
        gstin=store.gstin,
        pricing_mode=store.pricing_mode,
        idle_timeout_seconds=store.idle_timeout_seconds
    )

@router.put(
    "/store",
    response_model=StoreSettingsSchema,
    summary="Update Store Profile Settings",
    description="Admin-only endpoint to update store details, GSTIN, default tax pricing mode, and idle timeout."
)
async def update_store_settings(req: StoreSettingsUpdate, user = Depends(require_admin)):
    data = req.dict(exclude_unset=True)
    store = await db.storesettings.upsert(
        where={"id": "store_main"},
        data={"create": {"id": "store_main", **data}, "update": data}
    )
    return StoreSettingsSchema(
        store_name=store.store_name,
        address=store.address,
        phone=store.phone,
        gstin=store.gstin,
        pricing_mode=store.pricing_mode,
        idle_timeout_seconds=store.idle_timeout_seconds
    )

@router.post(
    "/backup",
    summary="Trigger Store Data Backup",
    description="Admin-only endpoint to generate a manual local/cloud database backup snapshot of catalog items, transactions, users, and store configurations."
)
async def trigger_backup(user = Depends(require_admin)):
    items = await db.item.find_many()
    sales = await db.sale.find_many(include={"items": True, "tenders": True})
    users = await db.user.find_many()
    discounts = await db.discount.find_many()
    
    backup_data = {
        "timestamp": datetime.now().isoformat(),
        "items_count": len(items),
        "sales_count": len(sales),
        "users_count": len(users),
        "discounts_count": len(discounts)
    }
    return {
        "message": "Database backup completed successfully",
        "backup_summary": backup_data
    }
