import re
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
from app.schemas import SaleCreate, SaleReturnCreate, HeldBillCreate, PinVerifyRequest
from app.security import get_current_user, verify_pin
from app.pricing_engine import compute_cart_totals, render_receipt_html
from app.database import db

router = APIRouter(prefix="/billing", tags=["Billing & POS"])

async def generate_next_invoice_no() -> str:
    sales = await db.sale.find_many()
    max_seq = 1024
    pattern = re.compile(r"INV-FY26-(\d+)", re.IGNORECASE)
    for s in sales:
        m = pattern.search(s.invoice_no)
        if m:
            try:
                num = int(m.group(1))
                if num > max_seq:
                    max_seq = num
            except ValueError:
                pass
    seq_no = max_seq + 1
    while True:
        candidate = f"INV-FY26-{seq_no:05d}"
        existing = await db.sale.find_unique(where={"invoice_no": candidate})
        if not existing:
            return candidate
        seq_no += 1

async def generate_next_return_no() -> str:
    returns = await db.salereturn.find_many()
    max_seq = 0
    pattern = re.compile(r"RET-FY26-(\d+)", re.IGNORECASE)
    for r in returns:
        m = pattern.search(r.return_no)
        if m:
            try:
                num = int(m.group(1))
                if num > max_seq:
                    max_seq = num
            except ValueError:
                pass
    seq_no = max_seq + 1
    while True:
        candidate = f"RET-FY26-{seq_no:05d}"
        existing = await db.salereturn.find_unique(where={"return_no": candidate})
        if not existing:
            return candidate
        seq_no += 1

@router.post(
    "/calculate-totals",
    summary="Compute Cart Totals and Tax Breakup",
    description="Calculates subtotal, auto discounts, line discounts, GST taxes (inclusive/exclusive), and grand total for a shopping cart payload."
)
async def calculate_totals(payload: Dict[str, Any]):
    cart = payload.get("cart", [])
    pricing_mode = payload.get("pricing_mode")
    if not pricing_mode:
        store = await db.storesettings.find_unique(where={"id": "store_main"})
        pricing_mode = store.pricing_mode if store else "exclusive"
        
    manual_discount = payload.get("manual_discount", {"type": "percent", "value": 0.0})
    
    discounts_db = await db.discount.find_many(where={"status": "active"})
    active_discounts = [d.dict() for d in discounts_db]
    
    totals = compute_cart_totals(cart, pricing_mode, manual_discount, active_discounts)
    return totals

@router.post(
    "/approve-discount",
    summary="Verify Admin PIN for Above-Limit Discount Approval",
    description="Validates an Admin PIN before allowing a cashier to apply an above-limit manual bill discount."
)
async def approve_discount(req: PinVerifyRequest):
    admins = await db.user.find_many(where={"role": "admin", "is_active": True})
    for admin in admins:
        if verify_pin(req.pin.strip(), admin.pin_hash):
            return {"approved": True, "authorized_by": admin.username}
    raise HTTPException(status_code=401, detail="Invalid Admin PIN")

@router.post(
    "/sales",
    status_code=status.HTTP_201_CREATED,
    summary="Complete Checkout Sale Transaction",
    description="Processes sale checkout, verifies item stock, generates sequential invoice number (INV-FY26-XXXXX), records sale items and payment tenders, automatically deducts inventory stock, and generates thermal receipt HTML."
)
async def create_sale(req: SaleCreate, user = Depends(get_current_user)):
    discounts_db = await db.discount.find_many(where={"status": "active"})
    active_discounts = [d.dict() for d in discounts_db]
    
    pricing_mode = req.pricing_mode
    if not pricing_mode:
        store = await db.storesettings.find_unique(where={"id": "store_main"})
        pricing_mode = store.pricing_mode if store else "exclusive"

    cart_dicts = [l.dict() for l in req.lines]
    manual_disc = req.manual_discount.dict() if req.manual_discount else {"type": "percent", "value": 0.0}
    totals = compute_cart_totals(cart_dicts, pricing_mode, manual_disc, active_discounts)
    
    for line in req.lines:
        item = await db.item.find_unique(where={"sku": line.sku})
        if item and item.stock < line.qty:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {line.name} (Available: {item.stock})")
            
    invoice_no = await generate_next_invoice_no()
    
    sale = await db.sale.create(data={
        "invoice_no": invoice_no,
        "created_by_username": user.username,
        "pricing_mode": pricing_mode,
        "subtotal_original": totals["subtotal_original"],
        "auto_discount_total": totals["auto_discount_total"],
        "manual_discount_total": totals["manual_discount_total"],
        "discount_total": totals["discount_total"],
        "taxable_total": totals["taxable_total"],
        "gst_total": totals["gst_total"],
        "grand_total": totals["grand_total"],
        "status": "COMPLETED"
    })
    
    saved_items = []
    for l in totals["lines"]:
        item_rec = await db.saleitem.create(data={
            "sale_id": sale.id,
            "sku": l["sku"],
            "name": l["name"],
            "price": l["price"],
            "tax_rate": l["tax"],
            "qty": l["qty"],
            "unit": l["unit"],
            "pricing_method": l["pricing_method"],
            "original_amount": l["original_amount"],
            "discount_amount": l["discount_amount"],
            "discount_name": l["discount_name"],
            "taxable_amount": l["taxable_amount"],
            "gst_amount": l["gst_amount"],
            "final_amount": l["final_amount"]
        })
        saved_items.append(item_rec.dict())
        
        db_item = await db.item.find_unique(where={"sku": l["sku"]})
        if db_item:
            precision = 3 if l["unit"] == "kg" else 2
            new_stock = max(0.0, round(db_item.stock - l["qty"], precision))
            await db.item.update(where={"sku": l["sku"]}, data={"stock": new_stock})
            
    saved_tenders = []
    for t in req.tenders:
        t_rec = await db.saletender.create(data={
            "sale_id": sale.id,
            "mode": t.mode,
            "amount": t.amount
        })
        saved_tenders.append({"mode": t_rec.mode, "amount": t_rec.amount})
        
    try:
        await db.auditlog.create(data={
            "username": user.username,
            "action": "Bill completed",
            "details_json": json.dumps({"reference": invoice_no, "grand_total": sale.grand_total})
        })
    except Exception as e:
        print(f"Audit log notice: {e}")

    sale_record = {
        "id": sale.id,
        "invoice_no": invoice_no,
        "time": sale.time.isoformat(),
        "cashier_username": user.username,
        "cashier_name": user.full_name,
        "pricing_mode": sale.pricing_mode,
        "lines": saved_items,
        "tenders": saved_tenders,
        "subtotal_original": sale.subtotal_original,
        "auto_discount_total": sale.auto_discount_total,
        "manual_discount_total": sale.manual_discount_total,
        "discount_total": sale.discount_total,
        "taxable_total": sale.taxable_total,
        "gst_total": sale.gst_total,
        "grand_total": sale.grand_total,
        "status": sale.status
    }
    
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    store_dict = {
        "store_name": store.store_name if store else "Greenfield Mart",
        "address": store.address if store else "12, MG Road, Bengaluru",
        "gstin": store.gstin if store else "29ABCDE1234F1Z5"
    }
    receipt_html = render_receipt_html(sale_record, store_dict)
    sale_record["receipt_html"] = receipt_html
    return sale_record

@router.get(
    "/invoices/search",
    summary="Search Completed Invoices",
    description="Allows Admin or Cashier to search and retrieve existing completed invoices by full or partial invoice number or cashier username."
)
async def search_invoices(q: Optional[str] = None):
    sales = await db.sale.find_many(
        include={"items": True, "tenders": True, "created_by": True},
        order={"time": "desc"}
    )
    query = (q or "").strip().lower()
    results = []
    for s in sales:
        if query:
            if query not in s.invoice_no.lower() and query not in s.created_by_username.lower():
                continue
        primary_mode = s.tenders[0].mode if s.tenders else "Cash"
        cashier_name = s.created_by.full_name if s.created_by else s.created_by_username
        results.append({
            "id": s.id,
            "invoice_no": s.invoice_no,
            "time": s.time.isoformat(),
            "time_formatted": s.time.strftime("%Y-%m-%d %H:%M:%S"),
            "cashier_username": s.created_by_username,
            "cashier_name": cashier_name,
            "payment_mode": primary_mode,
            "subtotal_original": s.subtotal_original,
            "discount_total": s.discount_total,
            "taxable_total": s.taxable_total,
            "gst_total": s.gst_total,
            "grand_total": s.grand_total,
            "status": s.status,
            "items_count": len(s.items),
            "lines": [i.dict() for i in s.items],
            "tenders": [t.dict() for t in s.tenders]
        })
    return results

@router.get(
    "/sales/{invoice_no}",
    summary="Retrieve Detailed Invoice Record",
    description="Retrieves a full sales invoice by invoice number, including purchased line items, quantities, prices, tax breakup, discounts, payment tenders, and thermal receipt HTML."
)
async def get_sale_by_invoice(invoice_no: str):
    q = invoice_no.strip()
    sale = await db.sale.find_unique(
        where={"invoice_no": q},
        include={"items": True, "tenders": True, "created_by": True}
    )
    if not sale:
        all_sales = await db.sale.find_many(include={"items": True, "tenders": True, "created_by": True})
        sale = next((s for s in all_sales if s.invoice_no.lower() == q.lower() or q.lower() in s.invoice_no.lower()), None)
    if not sale:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    items_list = [i.dict() for i in sale.items]
    tenders_list = [t.dict() for t in sale.tenders]
    cashier_name = sale.created_by.full_name if sale.created_by else sale.created_by_username
    
    record = {
        "id": sale.id,
        "invoice_no": sale.invoice_no,
        "time": sale.time.isoformat(),
        "cashier_username": sale.created_by_username,
        "cashier_name": cashier_name,
        "pricing_mode": sale.pricing_mode,
        "lines": items_list,
        "tenders": tenders_list,
        "subtotal_original": sale.subtotal_original,
        "auto_discount_total": sale.auto_discount_total,
        "manual_discount_total": sale.manual_discount_total,
        "discount_total": sale.discount_total,
        "taxable_total": sale.taxable_total,
        "gst_total": sale.gst_total,
        "grand_total": sale.grand_total,
        "status": sale.status
    }
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    store_dict = {
        "store_name": store.store_name if store else "Greenfield Mart",
        "address": store.address if store else "12, MG Road, Bengaluru",
        "gstin": store.gstin if store else "29ABCDE1234F1Z5"
    }
    record["receipt_html"] = render_receipt_html(record, store_dict)
    return record

@router.post(
    "/returns",
    summary="Process Full or Partial Return and Refund",
    description="Processes full or partial product returns against an existing invoice, restores item inventory stock in database, creates a return record (RET-FY26-XXXXX), and updates invoice status."
)
async def process_return(req: SaleReturnCreate, user = Depends(get_current_user)):
    q = req.invoice_no.strip()
    sale = await db.sale.find_unique(
        where={"invoice_no": q},
        include={"items": True}
    )
    if not sale:
        all_sales = await db.sale.find_many(include={"items": True})
        sale = next((s for s in all_sales if s.invoice_no.lower() == q.lower() or q.lower() in s.invoice_no.lower()), None)
    if not sale:
        raise HTTPException(status_code=404, detail="Invoice not found for return")
        
    return_no = await generate_next_return_no()
    
    total_refund = 0.0
    return_items_data = []
    
    for r_item in req.items:
        sku = r_item.get("sku")
        qty = float(r_item.get("qty", 1))
        if not sku or qty <= 0:
            continue
        matching_sale_item = next((i for i in sale.items if i.sku == sku), None)
        if not matching_sale_item:
            continue
            
        unit_final_price = matching_sale_item.final_amount / matching_sale_item.qty if matching_sale_item.qty > 0 else matching_sale_item.price
        refund_amount = round(qty * unit_final_price, 2)
        total_refund += refund_amount
        return_items_data.append({"sku": sku, "qty": qty, "refund_amount": refund_amount})
        
        # Restore Stock in database
        db_item = await db.item.find_unique(where={"sku": sku})
        if db_item:
            precision = 3 if matching_sale_item.unit == "kg" else 2
            await db.item.update(where={"sku": sku}, data={"stock": round(db_item.stock + qty, precision)})
            
    ret_rec = await db.salereturn.create(data={
        "return_no": return_no,
        "invoice_no": sale.invoice_no,
        "sale_id": sale.id,
        "created_by_username": user.username,
        "total_refund": total_refund,
        "reason": req.reason or "Customer Return"
    })
    
    for r_data in return_items_data:
        await db.returnitem.create(data={
            "return_id": ret_rec.id,
            "sku": r_data["sku"],
            "qty": r_data["qty"],
            "refund_amount": r_data["refund_amount"]
        })
        
    await db.sale.update(where={"id": sale.id}, data={"status": "RETURNED"})
    
    try:
        await db.auditlog.create(data={
            "username": user.username,
            "action": "Return processed",
            "details_json": json.dumps({"reference": sale.invoice_no, "return_no": return_no, "refund": total_refund})
        })
    except Exception as e:
        print(f"Audit log notice: {e}")

    return {
        "return_no": return_no,
        "invoice_no": sale.invoice_no,
        "total_refund": total_refund,
        "message": f"Return processed successfully. Stock restored for {len(return_items_data)} line item(s)."
    }

# --- Hold & Recall ---
@router.get(
    "/held-bills",
    summary="List Held Bills",
    description="Retrieves all held bills waiting to be recalled and resumed at checkout."
)
async def get_held_bills():
    held = await db.heldbill.find_many(order={"time": "desc"})
    result = []
    for h in held:
        lines = json.loads(h.lines_json) if isinstance(h.lines_json, str) else (h.lines_json or [])
        discount = json.loads(h.discount_json) if isinstance(h.discount_json, str) else (h.discount_json or None)
        result.append({
            "id": h.held_id,
            "held_id": h.held_id,
            "time": h.time.isoformat(),
            "created_by_username": h.created_by_username,
            "lines": lines,
            "discount": discount,
            "item_count": h.item_count,
            "itemCount": h.item_count,
            "total": h.total
        })
    return result

@router.post(
    "/held-bills",
    summary="Hold Current Bill",
    description="Holds an in-progress checkout bill to be resumed later."
)
async def hold_bill(req: HeldBillCreate, user = Depends(get_current_user)):
    held_id = req.id or f"HOLD-{int(datetime.now().timestamp()*1000)}"
    existing = await db.heldbill.find_unique(where={"held_id": held_id})
    lines_str = json.dumps(req.lines)
    disc_str = json.dumps(req.discount or {})
    item_count = req.computed_item_count
    username = user.username if user else "priya.k"
    
    if existing:
        h = await db.heldbill.update(
            where={"held_id": held_id},
            data={
                "lines_json": lines_str,
                "discount_json": disc_str,
                "item_count": item_count,
                "total": req.total
            }
        )
    else:
        h = await db.heldbill.create(data={
            "held_id": held_id,
            "created_by_username": username,
            "lines_json": lines_str,
            "discount_json": disc_str,
            "item_count": item_count,
            "total": req.total
        })
    return {"held_id": h.held_id, "message": "Bill held successfully"}

@router.delete(
    "/held-bills/{held_id}",
    summary="Recall or Clear Held Bill",
    description="Removes a held bill from hold queue upon recall or cancellation."
)
async def delete_held_bill(held_id: str):
    existing = await db.heldbill.find_unique(where={"held_id": held_id})
    if existing:
        await db.heldbill.delete(where={"held_id": held_id})
    return {"message": "Held bill recalled/cleared"}
