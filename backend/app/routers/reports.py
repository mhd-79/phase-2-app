from fastapi import APIRouter, Depends
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.security import get_current_user
from app.database import db

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
    item_map: Dict[str, Dict[str, Any]] = {}
    
    for si in sale_items:
        sku = si.sku
        if sku not in item_map:
            item_map[sku] = {
                "sku": sku,
                "name": si.name,
                "qty_sold": 0.0,
                "unit": si.unit,
                "total_revenue": 0.0
            }
        item_map[sku]["qty_sold"] += si.qty
        item_map[sku]["total_revenue"] += si.final_amount
        
    results = list(item_map.values())
    for r in results:
        r["qty_sold"] = round(r["qty_sold"], 3 if r["unit"] == "kg" else 0)
        r["total_revenue"] = round(r["total_revenue"], 2)
        
    return results

@router.get("/cash-drawer")
async def get_cash_drawer_report(opening_float: float = 2000.0, counted_cash: Optional[float] = None):
    today = datetime.now().strftime("%Y-%m-%d")
    sales = await db.sale.find_many(include={"tenders": True})
    
    cash_collected = 0.0
    for s in sales:
        if s.time.strftime("%Y-%m-%d") == today:
            for t in s.tenders:
                if t.mode == "Cash":
                    cash_collected += t.amount
                    
    expected_cash = opening_float + cash_collected
    variance = (counted_cash - expected_cash) if counted_cash is not None else 0.0
    
    return {
        "date": today,
        "opening_float": opening_float,
        "cash_sales": round(cash_collected, 2),
        "expected_cash": round(expected_cash, 2),
        "counted_cash": counted_cash,
        "variance": round(variance, 2)
    }

@router.get("/stock-on-hand")
async def get_stock_on_hand_report():
    items = await db.item.find_many(where={"is_active": True})
    total_skus = len(items)
    total_value = sum(i.price * i.stock for i in items)
    low_stock_count = len([i for i in items if 0 < i.stock <= i.min_stock])
    out_of_stock_count = len([i for i in items if i.stock == 0])
    
    item_rows = []
    for i in items:
        item_rows.append({
            "sku": i.sku,
            "barcode": i.barcode,
            "name": i.name,
            "category": i.category_name,
            "price": i.price,
            "wholesalePrice": i.wholesale_price,
            "tax": i.tax_rate,
            "stock": i.stock,
            "unit": i.unit,
            "pricingMethod": i.pricing_method,
            "stockValue": round(i.price * i.stock, 2),
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
