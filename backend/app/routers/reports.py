from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from app.security import get_current_user, require_admin
from app.database import db
from app.schemas import (
    CashCounterSchema, CashCounterCreate, CashCounterUpdate,
    AIInsightsResponse, AIInsightItem, AIRecommendation
)

router = APIRouter(prefix="/reports", tags=["Reports"])

def parse_date_range(period: str = "today", start_date: Optional[str] = None, end_date: Optional[str] = None):
    now = datetime.now()
    if period == "today":
        s_date = now.strftime("%Y-%m-%d")
        e_date = s_date
    elif period == "week" or period == "this_week":
        # Monday through Sunday of the current week
        monday = now - timedelta(days=now.weekday())
        sunday = monday + timedelta(days=6)
        s_date = monday.strftime("%Y-%m-%d")
        e_date = sunday.strftime("%Y-%m-%d")
    elif period == "month" or period == "this_month":
        first_day = now.replace(day=1)
        next_month = (first_day + timedelta(days=32)).replace(day=1)
        last_day = next_month - timedelta(days=1)
        s_date = first_day.strftime("%Y-%m-%d")
        e_date = last_day.strftime("%Y-%m-%d")
    elif period == "custom" and start_date and end_date:
        s_date = start_date
        e_date = end_date
    else:
        s_date = start_date or now.strftime("%Y-%m-%d")
        e_date = end_date or s_date
    return s_date, e_date

@router.get(
    "/z-report",
    summary="Daily Sales (Z-Report) Summary",
    description="Generates end-of-day Z-Report summary of gross sales, discounts, net tax collected, average bill value, and payment mode breakup for selected date boundaries."
)
async def get_z_report(period: str = "today", start_date: Optional[str] = None, end_date: Optional[str] = None, date: Optional[str] = None, user = Depends(require_admin)):
    s_day, e_day = parse_date_range(period, start_date or date, end_date or date)
    
    sales = await db.sale.find_many(include={"tenders": True})
    
    total_sales = 0.0
    total_tax = 0.0
    total_discount = 0.0
    bill_count = 0
    
    payment_breakup = {"Cash": 0.0, "Card": 0.0, "UPI": 0.0}
    
    for s in sales:
        s_date = s.time.strftime("%Y-%m-%d")
        if s_day <= s_date <= e_day and s.status != "CANCELLED":
            bill_count += 1
            total_sales += s.grand_total
            total_tax += s.gst_total
            total_discount += s.discount_total
            for t in s.tenders:
                if t.mode in payment_breakup:
                    payment_breakup[t.mode] += t.amount
                else:
                    payment_breakup[t.mode] = t.amount
                    
    avg_bill = (total_sales / bill_count) if bill_count > 0 else 0.0
    
    return {
        "start_date": s_day,
        "end_date": e_day,
        "date": s_day if s_day == e_day else f"{s_day} to {e_day}",
        "bill_count": bill_count,
        "total_sales": round(total_sales, 2),
        "total_tax": round(total_tax, 2),
        "total_discount": round(total_discount, 2),
        "average_bill_value": round(avg_bill, 2),
        "payment_breakup": payment_breakup
    }

@router.get(
    "/completed-transactions",
    summary="List Completed Transactions for Z-Report",
    description="Returns every completed bill transaction in the selected date range with full itemized lines, taxes, tenders, and cashier details for inspection."
)
async def get_completed_transactions(period: str = "today", start_date: Optional[str] = None, end_date: Optional[str] = None, user = Depends(require_admin)):
    s_day, e_day = parse_date_range(period, start_date, end_date)
    
    sales = await db.sale.find_many(
        include={"items": True, "tenders": True, "created_by": True},
        order={"time": "desc"}
    )
    
    results = []
    for s in sales:
        s_date = s.time.strftime("%Y-%m-%d")
        if s_day <= s_date <= e_day:
            tenders_formatted = ", ".join([f"{t.mode}: ₹{t.amount:.2f}" for t in s.tenders])
            primary_mode = s.tenders[0].mode if s.tenders else "Cash"
            cashier_name = s.created_by.full_name if s.created_by else s.created_by_username
            results.append({
                "id": s.id,
                "invoice_no": s.invoice_no,
                "created_at": s.time.isoformat(),
                "time": s.time.isoformat(),
                "time_formatted": s.time.strftime("%Y-%m-%d %H:%M:%S"),
                "cashier_username": s.created_by_username,
                "cashier_name": cashier_name,
                "pricing_mode": s.pricing_mode,
                "subtotal_original": s.subtotal_original,
                "discount_total": s.discount_total,
                "taxable_total": s.taxable_total,
                "gst_total": s.gst_total,
                "grand_total": s.grand_total,
                "status": s.status,
                "payment_mode": primary_mode,
                "tenders_summary": tenders_formatted,
                "items_count": len(s.items),
                "item_count": sum(i.qty for i in s.items),
                "lines": [i.dict() for i in s.items],
                "items": [i.dict() for i in s.items],
                "tenders": [t.dict() for t in s.tenders]
            })
            
    return results

@router.get(
    "/item-sales",
    summary="Item-wise Sales Breakdown Report",
    description="Aggregates item sales over selected date range, supporting search filtering, category filtering, and sorting by SKU, Name, Category, Qty Sold, or Revenue."
)
async def get_item_sales_report(
    period: str = "today",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = "revenue",
    sort_asc: bool = False,
    user = Depends(require_admin)
):
    s_day, e_day = parse_date_range(period, start_date, end_date)
    
    sales = await db.sale.find_many(include={"items": True})
    valid_sale_ids = set()
    for s in sales:
        s_date = s.time.strftime("%Y-%m-%d")
        if s_day <= s_date <= e_day and s.status != "CANCELLED":
            valid_sale_ids.add(s.id)
            
    sale_items = await db.saleitem.find_many()
    catalog_items = await db.item.find_many()
    item_catalog_map = {i.sku: i for i in catalog_items}
    
    item_map: Dict[str, Dict[str, Any]] = {}
    
    for si in sale_items:
        if si.sale_id not in valid_sale_ids:
            continue
            
        cat_info = item_catalog_map.get(si.sku)
        cat_name = cat_info.category_name if cat_info else "Grocery"
        
        if category and category != "All" and cat_name.lower() != category.lower():
            continue
            
        sku = si.sku
        if search:
            q = search.strip().lower()
            if q not in si.name.lower() and q not in sku.lower() and q not in cat_name.lower():
                continue
                
        if sku not in item_map:
            item_map[sku] = {
                "sku": sku,
                "name": si.name,
                "category": cat_name,
                "qty": 0.0,
                "qty_sold": 0.0,
                "unit": si.unit,
                "tax_rate": si.tax_rate,
                "gross_sales": 0.0,
                "discount_amount": 0.0,
                "taxable_amount": 0.0,
                "gst_amount": 0.0,
                "revenue": 0.0,
                "total_revenue": 0.0
            }
        item_map[sku]["qty"] += si.qty
        item_map[sku]["qty_sold"] += si.qty
        item_map[sku]["gross_sales"] += si.original_amount
        item_map[sku]["discount_amount"] += si.discount_amount
        item_map[sku]["taxable_amount"] += si.taxable_amount
        item_map[sku]["gst_amount"] += si.gst_amount
        item_map[sku]["revenue"] += si.final_amount
        item_map[sku]["total_revenue"] += si.final_amount
        
    results = list(item_map.values())
    for r in results:
        r["qty"] = round(r["qty"], 3 if r["unit"] == "kg" else 0)
        r["qty_sold"] = r["qty"]
        r["gross_sales"] = round(r["gross_sales"], 2)
        r["discount_amount"] = round(r["discount_amount"], 2)
        r["taxable_amount"] = round(r["taxable_amount"], 2)
        r["gst_amount"] = round(r["gst_amount"], 2)
        r["revenue"] = round(r["revenue"], 2)
        r["total_revenue"] = r["revenue"]
        r["net_revenue"] = r["revenue"]
        
    # Sorting support
    if sort_by in ["sku", "name", "category", "qty", "qty_sold", "revenue", "gross_sales", "net_revenue"]:
        key_fn = lambda x: x.get(sort_by, 0)
        results.sort(key=key_fn, reverse=not sort_asc)
        
    return results

@router.get(
    "/cash-counters",
    response_model=List[CashCounterSchema],
    summary="List Configured Cash Drawer Counters",
    description="Retrieves all configured store cash counters, opening float values, today's cash sales, expected drawer cash, counted cash, and variance."
)
async def get_cash_counters(user = Depends(get_current_user)):
    counters = await db.cashcounter.find_many()
    today = datetime.now().strftime("%Y-%m-%d")
    sales = await db.sale.find_many(include={"tenders": True})
    
    result = []
    for c in counters:
        counter_cash = 0.0
        c_name_norm = c.counter_name.strip().lower()
        for s in sales:
            if s.time.strftime("%Y-%m-%d") == today and s.status != "CANCELLED":
                s_counter = (getattr(s, "counter_name", None) or "Counter 1 - Main Express").strip().lower()
                # Associate cash if counters match or either starts with the other
                if s_counter == c_name_norm or c_name_norm.startswith(s_counter) or s_counter.startswith(c_name_norm):
                    for t in s.tenders:
                        if t.mode == "Cash":
                            counter_cash += t.amount

        expected = c.opening_float + counter_cash
        variance = (c.counted_cash - expected) if c.counted_cash is not None else 0.0
        result.append(CashCounterSchema(
            id=c.id,
            counter_name=c.counter_name,
            opening_float=c.opening_float,
            cash_sales_today=round(counter_cash, 2),
            expected_cash=round(expected, 2),
            counted_cash=c.counted_cash,
            variance=round(variance, 2),
            notes=c.notes,
            is_active=c.is_active
        ))
    return result

@router.post(
    "/cash-counters",
    response_model=CashCounterSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create New Cash Counter",
    description="Admin-only endpoint allowing Admin to create/add a new counter and manage multiple configured counters in database."
)
async def create_cash_counter(req: CashCounterCreate, user = Depends(require_admin)):
    name_clean = req.counter_name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Counter name cannot be empty")
    if req.opening_float < 0:
        raise HTTPException(status_code=400, detail="Opening Float must be greater than or equal to 0")
        
    existing = await db.cashcounter.find_unique(where={"counter_name": name_clean})
    if existing:
        raise HTTPException(status_code=400, detail="Counter name already exists")
        
    c = await db.cashcounter.create(data={
        "counter_name": name_clean,
        "opening_float": req.opening_float,
        "notes": req.notes
    })
    return CashCounterSchema(
        id=c.id,
        counter_name=c.counter_name,
        opening_float=c.opening_float,
        cash_sales_today=0.0,
        expected_cash=c.opening_float,
        counted_cash=None,
        variance=0.0,
        notes=c.notes,
        is_active=c.is_active
    )

@router.put(
    "/cash-counters/{id}",
    response_model=CashCounterSchema,
    summary="Edit Cash Counter & Opening Float",
    description="Admin-only endpoint allowing Admin to edit the Opening Float for each counter with proper validation (>= 0) and database persistence."
)
async def update_cash_counter(id: str, req: CashCounterUpdate, user = Depends(require_admin)):
    existing = await db.cashcounter.find_unique(where={"id": id})
    if not existing:
        raise HTTPException(status_code=404, detail="Counter not found")
        
    if req.opening_float is not None and req.opening_float < 0:
        raise HTTPException(status_code=400, detail="Opening float must be a non-negative number")
        
    data = req.dict(exclude_unset=True)
    c = await db.cashcounter.update(where={"id": id}, data=data)
    
    today = datetime.now().strftime("%Y-%m-%d")
    sales = await db.sale.find_many(include={"tenders": True})
    cash_collected = sum(
        t.amount for s in sales
        if s.time.strftime("%Y-%m-%d") == today and s.status != "CANCELLED"
        for t in s.tenders if t.mode == "Cash"
    )
    expected = c.opening_float + cash_collected
    variance = (c.counted_cash - expected) if c.counted_cash is not None else 0.0
    
    return CashCounterSchema(
        id=c.id,
        counter_name=c.counter_name,
        opening_float=c.opening_float,
        cash_sales_today=round(cash_collected, 2),
        expected_cash=round(expected, 2),
        counted_cash=c.counted_cash,
        variance=round(variance, 2),
        notes=c.notes,
        is_active=c.is_active
    )

@router.get(
    "/ai-insights",
    response_model=AIInsightsResponse,
    summary="Get AI Best-Selling Insights & Stock Suggestions",
    description="Analyzes actual stored transaction data for Today, This Week, This Month, or Custom Date Range to identify best-selling items, rank performance (highest-to-lowest or lowest-to-highest), and generate smart AI suggestions."
)
async def get_ai_insights(
    period: str = "today",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    sort_by: str = "most_sold",
    user = Depends(require_admin)
):
    s_day, e_day = parse_date_range(period, start_date, end_date)
    
    sales = await db.sale.find_many(include={"items": True})
    valid_sale_ids = set()
    for s in sales:
        s_date = s.time.strftime("%Y-%m-%d")
        if s_day <= s_date <= e_day and s.status != "CANCELLED":
            valid_sale_ids.add(s.id)
            
    sale_items = await db.saleitem.find_many()
    catalog = await db.item.find_many()
    catalog_map = {i.sku: i for i in catalog}
    
    item_stats: Dict[str, Dict[str, Any]] = {}
    
    for si in sale_items:
        if si.sale_id not in valid_sale_ids:
            continue
            
        sku = si.sku
        cat_item = catalog_map.get(sku)
        current_stock = cat_item.stock if cat_item else 0.0
        min_stock = cat_item.min_stock if cat_item else 10.0
        category_name = cat_item.category_name if cat_item else "Grocery"
        
        if sku not in item_stats:
            item_stats[sku] = {
                "sku": sku,
                "name": si.name,
                "category": category_name,
                "unit": si.unit,
                "qty_sold": 0.0,
                "revenue": 0.0,
                "current_stock": current_stock,
                "min_stock": min_stock,
                "is_low_stock": current_stock <= min_stock
            }
        item_stats[sku]["qty_sold"] += si.qty
        item_stats[sku]["revenue"] += si.final_amount
        
    items_list = list(item_stats.values())
    
    if sort_by == "least_sold":
        items_list.sort(key=lambda x: x["qty_sold"], reverse=False)
    elif sort_by == "highest_revenue":
        items_list.sort(key=lambda x: x["revenue"], reverse=True)
    else: # "most_sold"
        items_list.sort(key=lambda x: x["qty_sold"], reverse=True)
        
    for idx, item in enumerate(items_list, 1):
        item["rank"] = idx
        item["qty_sold"] = round(item["qty_sold"], 3 if item["unit"] == "kg" else 0)
        item["revenue"] = round(item["revenue"], 2)
        
    suggestions = []
    
    low_stock_fast = [i for i in items_list if i["is_low_stock"] and i["qty_sold"] > 0]
    if low_stock_fast:
        items_str = ", ".join([f"'{i['name']}' ({i['current_stock']} {i['unit']} left)" for i in low_stock_fast[:3]])
        suggestions.append(AIRecommendation(
            type="warning",
            title="High Demand Stock Alert",
            message=f"Top selling items are running low on stock: {items_str}. Immediate reorder is recommended to prevent stockouts."
        ))
        
    total_period_revenue = sum(i["revenue"] for i in items_list)
    if items_list and total_period_revenue > 0:
        top_driver = max(items_list, key=lambda x: x["revenue"])
        pct = round((top_driver["revenue"] / total_period_revenue) * 100, 1)
        suggestions.append(AIRecommendation(
            type="success",
            title="Revenue Driver Insight",
            message=f"'{top_driver['name']}' generated ₹{top_driver['revenue']:.2f} ({pct}% of total revenue) during this period. Ensure prime store display."
        ))
        
    all_active_skus = {i.sku for i in catalog}
    sold_skus = {i["sku"] for i in items_list}
    unsold_skus = all_active_skus - sold_skus
    if unsold_skus:
        unsold_items = [catalog_map[s] for s in list(unsold_skus)[:3] if s in catalog_map]
        unsold_names = ", ".join([f"'{i.name}'" for i in unsold_items])
        suggestions.append(AIRecommendation(
            type="info",
            title="Slow-Moving Product Opportunity",
            message=f"Products with zero sales in this period include: {unsold_names}. Consider running promotional discounts or bundle offers."
        ))
        
    if not suggestions:
        suggestions.append(AIRecommendation(
            type="info",
            title="Sales Performance Steady",
            message="All product categories demonstrate stable demand. Stock levels are sufficient across active inventory."
        ))
        
    return AIInsightsResponse(
        period=period,
        start_date=s_day,
        end_date=e_day,
        sort_by=sort_by,
        total_items_analyzed=len(items_list),
        total_period_revenue=round(total_period_revenue, 2) if items_list else 0.0,
        items=[AIInsightItem(**item) for item in items_list],
        suggestions=suggestions
    )

@router.get(
    "/stock-on-hand",
    summary="Stock on Hand Valuation Report",
    description="Returns current active product inventory stock quantities, estimated unit costs, valuation totals, and low stock status."
)
async def get_stock_on_hand_report(user = Depends(require_admin)):
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

@router.get(
    "/tax-summary",
    summary="Tax Collected by GST Rate Slab Report",
    description="Groups total taxable sales value and net tax collected by applicable GST percentage slabs (0%, 5%, 12%, 18%)."
)
async def get_tax_summary(user = Depends(require_admin)):
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
