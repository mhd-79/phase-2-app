from fastapi import APIRouter
from typing import List
from app.database import get_db

router = APIRouter(prefix="/reorder-alerts", tags=["reorder-alerts"])

VENDOR_BY_CATEGORY = {
    "Beverages": "V-002",
    "Snacks": "V-005",
    "Dairy": "V-003",
    "Bakery": "V-004",
    "Grocery": "V-001",
    "Personal Care": "V-006"
}

@router.get("")
async def get_reorder_suggestions():
    db = get_db()
    items = await db.item.find_many(where={"is_active": True})
    vendors = await db.vendor.find_many()
    vendor_dict = {v.id: v.name for v in vendors}
    
    suggestions = []
    for i in items:
        if i.stock <= i.min_stock:
            suggested_qty = max(i.min_stock * 3 - i.stock, i.min_stock)
            preferred_v_id = i.preferred_vendor_id or VENDOR_BY_CATEGORY.get(i.category_name, "V-007")
            v_name = vendor_dict.get(preferred_v_id, "—")
            suggested_cost = round(i.price * 0.65, 2)
            
            suggestions.append({
                "sku": i.sku,
                "name": i.name,
                "category": i.category_name,
                "stock": i.stock,
                "min": i.min_stock,
                "suggestedQty": suggested_qty,
                "price": i.price,
                "suggestedCost": suggested_cost,
                "vendorId": preferred_v_id,
                "vendorName": v_name
            })
            
    return suggestions
