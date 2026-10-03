import random
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db
from app.schemas import PurchaseReturnCreate
from app.security import get_current_user
from app.idempotency import enforce_idempotency, idempotency_manager

router = APIRouter(prefix="/purchase-returns", tags=["purchase-returns"])

_FALLBACK_RETURNS = []


async def _resolve_invoice(db, vendor_id: str, ref: str):
    """Finds the purchase invoice a vendor billed us under: a goods receipt (GRN) id, or a PO id (all of its receipts together).
    Returns {"id", "kind", "date", "total", "lines": [{sku, name, qty, cost}]} or None."""
    ref = (ref or "").strip()
    if not ref:
        return None
    grn = await db.goodsreceiptnote.find_first(
        where={"id": {"equals": ref, "mode": "insensitive"}, "vendor_id": vendor_id}, include={"lines": True})
    if grn:
        return {"id": grn.id, "kind": "GRN", "date": grn.date, "total": grn.total, "poId": grn.po_id,
                "lines": [{"sku": l.sku, "name": l.name, "qty": l.qty, "cost": l.cost} for l in grn.lines]}
    po = await db.purchaseorder.find_first(where={"id": {"equals": ref, "mode": "insensitive"}, "vendor_id": vendor_id})
    if po:
        grns = await db.goodsreceiptnote.find_many(where={"po_id": po.id}, include={"lines": True}, order={"created_at": "asc"})
        merged = {}
        for g in grns:
            for l in g.lines:
                m = merged.setdefault(l.sku, {"sku": l.sku, "name": l.name, "qty": 0.0, "cost": l.cost})
                m["qty"] += l.qty
                m["cost"] = l.cost
        if merged:
            return {"id": po.id, "kind": "PO", "date": grns[-1].date, "total": sum(m["qty"] * m["cost"] for m in merged.values()),
                    "poId": po.id, "lines": list(merged.values())}
    return None


async def _already_returned(db, invoice_id: str):
    """Quantity per SKU already sent back against this invoice by earlier purchase returns."""
    done = {}
    for r in await db.purchasereturn.find_many(where={"invoice_id": invoice_id}, include={"lines": True}):
        for l in r.lines:
            done[l.sku] = done.get(l.sku, 0.0) + l.qty
    return done


@router.get("/invoices")
async def list_purchase_invoices(vendor_id: str, limit: int = 20):
    """Recent purchase invoices (goods receipts) of a vendor, newest first."""
    db = get_db()
    if not db.is_connected():
        return []
    grns = await db.goodsreceiptnote.find_many(where={"vendor_id": vendor_id}, include={"lines": True},
                                               order={"created_at": "desc"}, take=max(1, min(limit, 100)))
    return [{"id": g.id, "poId": g.po_id, "date": g.date, "total": g.total, "itemCount": len(g.lines)} for g in grns]


@router.get("/invoices/{invoice_ref}")
async def get_purchase_invoice(invoice_ref: str, vendor_id: str):
    """Items bought on one purchase invoice, with how much of each can still be returned."""
    db = get_db()
    inv = await _resolve_invoice(db, vendor_id, invoice_ref) if db.is_connected() else None
    if not inv:
        raise HTTPException(status_code=404, detail="No purchase invoice with that number was found for this vendor")
    done = await _already_returned(db, inv["id"])
    for l in inv["lines"]:
        l["returnedQty"] = done.get(l["sku"], 0.0)
        l["availableQty"] = max(0.0, l["qty"] - l["returnedQty"])
    return inv

@router.get("")
async def list_purchase_returns(vendor_id: Optional[str] = None):
    db = get_db()
    if db.is_connected():
        try:
            where_clause = {}
            if vendor_id:
                where_clause["vendor_id"] = vendor_id
                
            returns = await db.purchasereturn.find_many(
                where=where_clause,
                include={"lines": True},
                order={"created_at": "desc"}
            )
            
            result = []
            for r in returns:
                vendor = await db.vendor.find_unique(where={"id": r.vendor_id})
                result.append({
                    "id": r.id,
                    "vendorId": r.vendor_id,
                    "vendorName": vendor.name if vendor else r.vendor_id,
                    "date": r.date,
                    "reason": r.reason,
                    "total": r.total,
                    "invoiceId": getattr(r, "invoice_id", None),
                    "lines": [
                        {"sku": l.sku, "name": l.name, "qty": l.qty, "cost": l.cost} for l in r.lines
                    ]
                })
            return result
        except Exception:
            pass
            
    # Fallback
    res = []
    for r in _FALLBACK_RETURNS:
        if vendor_id and r.get("vendorId") != vendor_id:
            continue
        res.append(r)
    return res

@router.post("")
async def create_purchase_return(data: PurchaseReturnCreate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, "purchase_return", f"{data.vendorId}_{len(data.lines)}")
    try:
        db = get_db()
        if db.is_connected():
            try:
                vendor = await db.vendor.find_unique(where={"id": data.vendorId})
                if not vendor:
                    raise HTTPException(status_code=404, detail="Vendor not found")
                    
                invoice_id = None
                if data.invoiceId and data.invoiceId.strip():
                    inv = await _resolve_invoice(db, data.vendorId, data.invoiceId)
                    if not inv:
                        raise HTTPException(status_code=404, detail="No purchase invoice with that number was found for this vendor")
                    invoice_id = inv["id"]
                    bought = {l["sku"]: l["qty"] for l in inv["lines"]}
                    prices = {l["sku"]: l["cost"] for l in inv["lines"]}
                    for line in data.lines:
                        if line.sku in prices:
                            line.cost = prices[line.sku]   # debit note value uses the price paid on the invoice
                    done = await _already_returned(db, invoice_id)
                    wanted = {}
                    for line in data.lines:
                        wanted[line.sku] = wanted.get(line.sku, 0.0) + line.qty
                    for sku, qty in wanted.items():
                        if sku not in bought:
                            raise HTTPException(status_code=400, detail=f"{sku} is not on purchase invoice {invoice_id}")
                        available = bought[sku] - done.get(sku, 0.0)
                        if qty > available + 1e-9:
                            raise HTTPException(status_code=400, detail=f"Only {available:g} of {sku} can still be returned against {invoice_id}")

                rand_suffix = str(random.randint(1000, 9999))
                dn_id = f"DN-{rand_suffix}"
                
                total_refund = 0.0
                for line in data.lines:
                    line_total = line.qty * line.cost
                    total_refund += line_total
                    
                    # Deduct stock for returned items
                    item = await db.item.find_unique(where={"sku": line.sku})
                    if item:
                        await db.item.update(
                            where={"sku": line.sku},
                            data={"stock": max(0.0, item.stock - line.qty)}
                        )
                        
                pr_data = {
                    "id": dn_id,
                    "vendor_id": data.vendorId,
                    "date": "2026-09-07",
                    "reason": data.reason,
                    "total": total_refund
                }
                if invoice_id:
                    pr_data["invoice_id"] = invoice_id   # link the debit note to the purchase invoice
                pr = await db.purchasereturn.create(data=pr_data)
                
                for line in data.lines:
                    await db.purchasereturnline.create(
                        data={
                            "return_id": dn_id,
                            "sku": line.sku,
                            "name": line.name,
                            "qty": line.qty,
                            "cost": line.cost
                        }
                    )
                    
                # Reduce vendor payable balance by debit note total
                new_payable = max(0.0, vendor.payable - total_refund)
                await db.vendor.update(
                    where={"id": data.vendorId},
                    data={"payable": new_payable}
                )
                
                res = {
                    "id": dn_id,
                    "vendorId": data.vendorId,
                    "date": pr.date,
                    "reason": pr.reason,
                    "total": total_refund,
                    "invoiceId": invoice_id,
                    "message": f"Purchase return processed — Debit Note {dn_id} generated"
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception:
                pass
                
        # Fallback
        rand_suffix = str(random.randint(1000, 9999))
        dn_id = f"DN-{rand_suffix}"
        total_refund = sum(l.qty * l.cost for l in data.lines)
        res = {
            "id": dn_id,
            "vendorId": data.vendorId,
            "date": "2026-09-07",
            "reason": data.reason,
            "total": total_refund,
            "message": f"Purchase return processed — Debit Note {dn_id} generated"
        }
        _FALLBACK_RETURNS.append(res)
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res)
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
