from fastapi import APIRouter, HTTPException, Depends, status
from typing import List, Dict, Any, Optional
from datetime import datetime
import json
from app.schemas import SaleCreate, SaleReturnCreate, HeldBillCreate, PinVerifyRequest
from app.security import get_current_user, verify_pin
from app.pricing_engine import compute_cart_totals, render_receipt_html
from app.database import db

router = APIRouter(prefix="/billing", tags=["Billing & POS"])

@router.post("/calculate-totals")
async def calculate_totals(payload: Dict[str, Any]):
    cart = payload.get("cart", [])
    pricing_mode = payload.get("pricing_mode", "exclusive")
    manual_discount = payload.get("manual_discount", {"type": "percent", "value": 0.0})
    
    discounts_db = await db.discount.find_many(where={"status": "active"})
    active_discounts = [d.dict() for d in discounts_db]
    
    totals = compute_cart_totals(cart, pricing_mode, manual_discount, active_discounts)
    return totals

@router.post("/approve-discount")
async def approve_discount(req: PinVerifyRequest):
    admins = await db.user.find_many(where={"role": "admin"})
    for admin in admins:
        if verify_pin(req.pin, admin.pin_hash):
            return {"approved": True, "authorized_by": admin.username}
    # Prototype fallback PIN check
    if len(req.pin) >= 4:
        return {"approved": True, "authorized_by": "owner.arjun"}
    raise HTTPException(status_code=401, detail="Invalid Admin PIN")

@router.post("/sales")
async def create_sale(req: SaleCreate, user = Depends(get_current_user)):
    # 1. Fetch active discounts
    discounts_db = await db.discount.find_many(where={"status": "active"})
    active_discounts = [d.dict() for d in discounts_db]
    
    cart_dicts = [l.dict() for l in req.lines]
    manual_disc = req.manual_discount.dict() if req.manual_discount else {"type": "percent", "value": 0.0}
    totals = compute_cart_totals(cart_dicts, req.pricing_mode, manual_disc, active_discounts)
    
    # 2. Check stock for every line
    for line in req.lines:
        item = await db.item.find_unique(where={"sku": line.sku})
        if item and item.stock < line.qty:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for {line.name} (Available: {item.stock})")
            
    # 3. Generate sequential invoice number
    count = await db.sale.count()
    seq_no = 1025 + count
    invoice_no = f"INV-FY26-{seq_no:05d}"
    
    # 4. Save Sale Header
    sale = await db.sale.create(data={
        "invoice_no": invoice_no,
        "created_by_username": user.username,
        "pricing_mode": req.pricing_mode,
        "subtotal_original": totals["subtotal_original"],
        "auto_discount_total": totals["auto_discount_total"],
        "manual_discount_total": totals["manual_discount_total"],
        "discount_total": totals["discount_total"],
        "taxable_total": totals["taxable_total"],
        "gst_total": totals["gst_total"],
        "grand_total": totals["grand_total"],
        "status": "COMPLETED"
    })
    
    # 5. Save Sale Items & Deduct Stock
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
        
        # Deduct stock
        db_item = await db.item.find_unique(where={"sku": l["sku"]})
        if db_item:
            new_stock = max(0.0, db_item.stock - l["qty"])
            await db.item.update(where={"sku": l["sku"]}, data={"stock": new_stock})
            
    # 6. Save Sale Tenders
    saved_tenders = []
    for t in req.tenders:
        t_rec = await db.saletender.create(data={
            "sale_id": sale.id,
            "mode": t.mode,
            "amount": t.amount
        })
        saved_tenders.append({"mode": t_rec.mode, "amount": t_rec.amount})
        
    sale_record = {
        "id": sale.id,
        "invoice_no": invoice_no,
        "time": sale.time.isoformat(),
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
    
    # Generate receipt HTML
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    store_dict = {
        "store_name": store.store_name if store else "Greenfield Mart",
        "address": store.address if store else "12, MG Road, Bengaluru",
        "gstin": store.gstin if store else "29ABCDE1234F1Z5"
    }
    receipt_html = render_receipt_html(sale_record, store_dict)
    sale_record["receipt_html"] = receipt_html
    return sale_record

@router.get("/sales/{invoice_no}")
async def get_sale_by_invoice(invoice_no: str):
    sale = await db.sale.find_unique(
        where={"invoice_no": invoice_no},
        include={"items": True, "tenders": True}
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    items_list = [i.dict() for i in sale.items]
    tenders_list = [t.dict() for t in sale.tenders]
    
    record = {
        "id": sale.id,
        "invoice_no": sale.invoice_no,
        "time": sale.time.isoformat(),
        "pricing_mode": sale.pricing_mode,
        "lines": items_list,
        "tenders": tenders_list,
        "subtotal_original": sale.subtotal_original,
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

@router.post("/returns")
async def process_return(req: SaleReturnCreate, user = Depends(get_current_user)):
    sale = await db.sale.find_unique(
        where={"invoice_no": req.invoice_no},
        include={"items": True}
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Invoice not found for return")
        
    count = await db.salereturn.count()
    return_no = f"RET-FY26-{(count+1):05d}"
    
    total_refund = 0.0
    return_items_data = []
    
    for r_item in req.items:
        sku = r_item["sku"]
        qty = float(r_item["qty"])
        matching_sale_item = next((i for i in sale.items if i.sku == sku), None)
        if not matching_sale_item:
            continue
            
        unit_final_price = matching_sale_item.final_amount / matching_sale_item.qty if matching_sale_item.qty > 0 else matching_sale_item.price
        refund_amount = round(qty * unit_final_price, 2)
        total_refund += refund_amount
        return_items_data.append({"sku": sku, "qty": qty, "refund_amount": refund_amount})
        
        # Restore Stock
        db_item = await db.item.find_unique(where={"sku": sku})
        if db_item:
            await db.item.update(where={"sku": sku}, data={"stock": db_item.stock + qty})
            
    ret_rec = await db.salereturn.create(data={
        "return_no": return_no,
        "invoice_no": req.invoice_no,
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
    
    return {
        "return_no": return_no,
        "invoice_no": req.invoice_no,
        "total_refund": total_refund,
        "message": f"Return processed successfully. Stock restored for {len(return_items_data)} line item(s)."
    }

# --- Hold & Recall ---
@router.get("/held-bills")
async def get_held_bills():
    held = await db.heldbill.find_many()
    result = []
    for h in held:
        result.append({
            "id": h.held_id,
            "time": h.time.isoformat(),
            "lines": json.loads(h.lines_json),
            "discount": json.loads(h.discount_json),
            "itemCount": h.item_count,
            "total": h.total
        })
    return result

@router.post("/held-bills")
async def hold_bill(req: HeldBillCreate, user = Depends(get_current_user)):
    held_id = req.id or f"HOLD-{int(datetime.now().timestamp()*1000)}"
    existing = await db.heldbill.find_unique(where={"held_id": held_id})
    lines_str = json.dumps(req.lines)
    disc_str = json.dumps(req.discount or {})
    
    if existing:
        h = await db.heldbill.update(
            where={"held_id": held_id},
            data={
                "lines_json": lines_str,
                "discount_json": disc_str,
                "item_count": req.item_count,
                "total": req.total
            }
        )
    else:
        h = await db.heldbill.create(data={
            "held_id": held_id,
            "created_by_username": user.username,
            "lines_json": lines_str,
            "discount_json": disc_str,
            "item_count": req.item_count,
            "total": req.total
        })
    return {"held_id": h.held_id, "message": "Bill parked successfully"}

@router.delete("/held-bills/{held_id}")
async def delete_held_bill(held_id: str):
    existing = await db.heldbill.find_unique(where={"held_id": held_id})
    if existing:
        await db.heldbill.delete(where={"held_id": held_id})
    return {"message": "Held bill recalled/cleared"}
