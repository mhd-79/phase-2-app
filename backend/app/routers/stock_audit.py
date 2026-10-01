from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.database import get_db
from app.schemas import StockAuditPostInput
from app.security import get_current_user

router = APIRouter(prefix="/stock-audit", tags=["stock-audit"])

@router.get("/items")
async def get_audit_items():
    db = get_db()
    items = await db.item.find_many(where={"is_active": True}, order={"category_name": "asc"})
    return [
        {
            "sku": i.sku,
            "name": i.name,
            "category": i.category_name,
            "bookQty": i.stock
        } for i in items
    ]

@router.post("/post-variances")
async def post_audit_variances(data: StockAuditPostInput, current_user=Depends(get_current_user)):
    db = get_db()
    approver = data.approvedBy or (current_user.full_name if hasattr(current_user, 'full_name') else "Arjun M.")
    posted_count = 0
    adjustments_posted = []
    
    for c in data.counts:
        item = await db.item.find_unique(where={"sku": c.sku})
        if not item:
            continue
            
        variance = c.countedQty - item.stock
        if variance == 0:
            continue
            
        # Update item stock to physical counted quantity
        await db.item.update(
            where={"sku": c.sku},
            data={"stock": c.countedQty}
        )
        
        count = await db.stockadjustment.count()
        adj_id = f"ADJ-{str(90 + count + 1).zfill(4)}"
        
        adj = await db.stockadjustment.create(
            data={
                "id": adj_id,
                "sku": c.sku,
                "name": item.name,
                "delta": variance,
                "reason": "Cycle count variance",
                "notes": f"Physical count: {c.countedQty}, Book count: {item.stock}",
                "approved_by": approver,
                "date": "2026-09-07"
            }
        )
        posted_count += 1
        adjustments_posted.append({"id": adj_id, "sku": c.sku, "variance": variance})
        
    return {
        "postedCount": posted_count,
        "adjustments": adjustments_posted,
        "message": f"{posted_count} adjustment(s) posted from cycle count audit"
    }
