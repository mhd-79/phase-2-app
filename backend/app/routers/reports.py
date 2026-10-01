from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.security import get_current_user, require_admin
from app.database import db
from app.schemas import CashCounterCreate, CashCounterUpdateFloat

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("/z-report")
async def get_z_report(date: Optional[str] = None):
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    sales = await db.sale.find_many(include={"tenders": True})
    
    total_sales = 0.0
    total_tax = 0.0
    total_discount = 0.0
    bill_count = 0
    payment_breakup = {"Cash": 0.0, "Card": 0.0, "UPI": 0.0}
    
    for s in sales:
        s_date = s.time.strftime("%Y-%m-%d")
        if s_date == target_date:
            bill_count += 1
            total_sales += s.grand_total
            total_tax += s.gst_total
            total_discount += s.discount_total
            for t in s.tenders:
                if t.mode in payment_breakup:
                    payment_breakup[t.mode] += t.amount
                    
    avg_bill = (total_sales / bill_count) if bill_count > 0 else 0.0
    
    return {
        "date": target_date,
        "bill_count": bill_count,
        "total_sales": round(total_sales, 2),
        "total_tax": round(total_tax, 2),
        "total_discount": round(total_discount, 2),
        "average_bill_value": round(avg_bill, 2),
        "payment_breakup": payment_breakup
    }

@router.get("/item-sales")
async def get_item_sales_report():
    sale_items = await db.saleitem.find_many()
    items = await db.item.find_many()
    cat_map = {i.sku: i.category_name for i in items}
    item_map: Dict[str, Dict[str, Any]] = {}
    
    total_rev = 0.0
    for si in sale_items:
        sku = si.sku
        if sku not in item_map:
            item_map[sku] = {
                "sku": sku,
                "name": si.name,
                "category": cat_map.get(sku, "General"),
                "qty_sold": 0.0,
                "unit": si.unit,
                "total_revenue": 0.0
            }
        item_map[sku]["qty_sold"] += si.qty
        item_map[sku]["total_revenue"] += si.final_amount
        total_rev += si.final_amount
        
    results = list(item_map.values())
    for r in results:
        r["qty_sold"] = round(r["qty_sold"], 3 if r["unit"] == "kg" else 0)
        r["total_revenue"] = round(r["total_revenue"], 2)
        r["share"] = f"{round((r['total_revenue'] / (total_rev or 1)) * 100, 1)}"
        
    return results

# --- Cash Drawer & Counter Management (Gap 8) ---
@router.get("/cash-drawer/counters")
async def get_cash_counters():
    counters = await db.cashcounter.find_many(where={"is_active": True})
    if not counters:
        c1 = await db.cashcounter.create(data={
            "counter_name": "Counter 1",
            "opening_float": 2000.0,
            "is_active": True
        })
        counters = [c1]
    return [
        {
            "id": c.id,
            "counter_name": c.counter_name,
            "opening_float": c.opening_float,
            "is_active": c.is_active
        } for c in counters
    ]

@router.post("/cash-drawer/counters")
async def create_cash_counter(req: CashCounterCreate, user = Depends(require_admin)):
    existing = await db.cashcounter.find_unique(where={"counter_name": req.counter_name})
    if existing:
        raise HTTPException(status_code=400, detail="Counter name already exists")
    c = await db.cashcounter.create(data={
        "counter_name": req.counter_name,
        "opening_float": req.opening_float,
        "is_active": True
    })
    return {
        "id": c.id,
        "counter_name": c.counter_name,
        "opening_float": c.opening_float,
        "is_active": c.is_active
    }

@router.put("/cash-drawer/counters/{counter_id}/float")
async def update_counter_float(counter_id: str, req: CashCounterUpdateFloat, user = Depends(require_admin)):
    c = await db.cashcounter.find_unique(where={"id": counter_id})
    if not c:
        raise HTTPException(status_code=404, detail="Counter not found")
    updated = await db.cashcounter.update(
        where={"id": counter_id},
        data={"opening_float": req.opening_float}
    )
    return {
        "id": updated.id,
        "counter_name": updated.counter_name,
        "opening_float": updated.opening_float,
        "message": f"Opening float updated for {updated.counter_name}"
    }

@router.get("/cash-drawer")
async def get_cash_drawer_report(counter_id: Optional[str] = None, opening_float: Optional[float] = None, counted_cash: Optional[float] = None):
    today = datetime.now().strftime("%Y-%m-%d")
    float_val = opening_float
    counter_name = "Counter 1"
    
    if counter_id:
        c = await db.cashcounter.find_unique(where={"id": counter_id})
        if c:
            float_val = float_val if float_val is not None else c.opening_float
            counter_name = c.counter_name
            
    if float_val is None:
        c = await db.cashcounter.find_first(where={"is_active": True})
        float_val = c.opening_float if c else 2000.0
        counter_name = c.counter_name if c else "Counter 1"
        
    sales = await db.sale.find_many(include={"tenders": True})
    returns = await db.salereturn.find_many()
    
    cash_collected = sum(
        t.amount for s in sales if s.time.strftime("%Y-%m-%d") == today for t in s.tenders if t.mode == "Cash"
    )
    cash_refunds = sum(
        r.total_refund for r in returns if r.time.strftime("%Y-%m-%d") == today
    )
    
    expected_cash = float_val + cash_collected - cash_refunds
    variance = (counted_cash - expected_cash) if counted_cash is not None else 0.0
    
    return {
        "date": today,
        "counter_name": counter_name,
        "opening_float": float_val,
        "cash_sales": round(cash_collected, 2),
        "cash_refunds": round(cash_refunds, 2),
        "expected_cash": round(expected_cash, 2),
        "counted_cash": counted_cash,
        "variance": round(variance, 2)
    }

@router.get("/stock-on-hand")
async def get_stock_on_hand_report():
    items = await db.item.find_many(where={"is_active": True})
    batches = await db.batch.find_many()
    
    # Map earliest expiry date for each sku
    expiry_map: Dict[str, str] = {}
    for b in batches:
        if b.sku not in expiry_map or b.expiry_date < expiry_map[b.sku]:
            expiry_map[b.sku] = b.expiry_date
            
    total_skus = len(items)
    total_value = sum(i.price * i.stock for i in items)
    low_stock_count = len([i for i in items if 0 < i.stock <= i.min_stock])
    out_of_stock_count = len([i for i in items if i.stock == 0])
    
    item_rows = []
    for i in items:
        unit_cost = i.cost_price if i.cost_price > 0 else round(i.price * 0.7, 2)
        item_rows.append({
            "sku": i.sku,
            "barcode": i.barcode,
            "name": i.name,
            "category": i.category_name,
            "price": i.price,
            "wholesalePrice": i.wholesale_price,
            "costPrice": unit_cost,
            "tax": i.tax_rate,
            "stock": i.stock,
            "unit": i.unit,
            "pricingMethod": i.pricing_method,
            "stockValue": round(unit_cost * i.stock, 2),
            "expiryDate": expiry_map.get(i.sku, "—"),
            "status": "Out of Stock" if i.stock == 0 else ("Low Stock" if i.stock <= i.min_stock else "In Stock")
        })
        
    return {
        "total_skus": total_skus,
        "total_stock_value": round(total_value, 2),
        "low_stock_count": low_stock_count,
        "out_of_stock_count": out_of_stock_count,
        "items": item_rows
    }

@router.get("/tax-summary")
async def get_tax_summary():
    sale_items = await db.saleitem.find_many()
    slabs: Dict[float, Dict[str, float]] = {}
    
    for si in sale_items:
        rate = si.tax_rate
        if rate not in slabs:
            slabs[rate] = {"taxable": 0.0, "gst": 0.0}
        slabs[rate]["taxable"] += si.taxable_amount
        slabs[rate]["gst"] += si.gst_amount
        
    result = []
    for rate, vals in sorted(slabs.items()):
        result.append({
            "tax_rate": rate,
            "taxable_amount": round(vals["taxable"], 2),
            "gst_collected": round(vals["gst"], 2)
        })
    return result
