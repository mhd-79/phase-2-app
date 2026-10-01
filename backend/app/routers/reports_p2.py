from fastapi import APIRouter
from typing import Optional
from datetime import datetime
from app.database import get_db

router = APIRouter(prefix="/reports/p2", tags=["reports-phase2"])

@router.get("/purchase-register")
async def get_purchase_register_report(from_date: Optional[str] = None, to_date: Optional[str] = None):
    db = get_db()
    grns = await db.goodsreceiptnote.find_many(
        include={"lines": True, "vendor": True},
        order={"created_at": "desc"}
    )
    
    result = []
    for g in grns:
        if from_date and g.date < from_date:
            continue
        if to_date and g.date > to_date:
            continue
        vendor_name = g.vendor.name if g.vendor else g.vendor_id
        result.append({
            "id": g.id,
            "poId": g.po_id or "—",
            "vendorId": g.vendor_id,
            "vendorName": vendor_name,
            "date": g.date,
            "lineCount": len(g.lines),
            "total": g.total,
            "landedCostAllocation": g.landed_cost_allocation
        })
    return result

@router.get("/vendor-payables")
async def get_vendor_payables_report():
    db = get_db()
    vendors = await db.vendor.find_many(order={"name": "asc"})
    total_payable = sum(v.payable for v in vendors)
    
    payables_list = [
        {
            "id": v.id,
            "name": v.name,
            "category": v.category,
            "terms": v.terms,
            "payable": v.payable
        } for v in vendors
    ]
    
    return {
        "totalPayable": total_payable,
        "vendors": payables_list
    }

@router.get("/stock-valuation")
async def get_stock_valuation_report():
    db = get_db()
    items = await db.item.find_many(where={"is_active": True}, order={"name": "asc"})
    total_valuation = 0.0
    items_valuation = []
    
    for i in items:
        unit_cost = i.cost_price if i.cost_price > 0 else round(i.price * 0.7, 2)
        valuation = round(unit_cost * i.stock, 2)
        total_valuation += valuation
        items_valuation.append({
            "sku": i.sku,
            "name": i.name,
            "category": i.category_name,
            "stock": i.stock,
            "unitCost": unit_cost,
            "landedCost": i.landed_cost,
            "valuation": valuation
        })
        
    return {
        "totalValuation": round(total_valuation, 2),
        "items": items_valuation
    }

@router.get("/batch-expiry")
async def get_batch_expiry_report(days_threshold: int = 14):
    db = get_db()
    ref_date = datetime.strptime("2026-09-07", "%Y-%m-%d")
    batches = await db.batch.find_many()
    
    result = []
    for b in batches:
        exp_date = datetime.strptime(b.expiry_date, "%Y-%m-%d")
        days = (exp_date - ref_date).days
        if days <= days_threshold:
            status = "expired" if days < 0 else ("expiring_soon" if days <= 7 else "warning")
            result.append({
                "batch": b.batch_no,
                "sku": b.sku,
                "name": b.name,
                "expiryDate": b.expiry_date,
                "qty": b.qty,
                "daysToExpiry": days,
                "status": status
            })
            
    result.sort(key=lambda x: x["daysToExpiry"])
    return result
