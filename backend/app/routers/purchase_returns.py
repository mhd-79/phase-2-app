from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db
from app.tenant_scoped import TenantList, TenantDict
from app.schemas import PurchaseReturnCreate
from app.security import get_current_user
from app.idempotency import enforce_idempotency, idempotency_manager
from app.procurement import RETURN_REASONS, today, unique_id, with_gst, db_error, tx

router = APIRouter(prefix="/purchase-returns", tags=["purchase-returns"])

_FALLBACK_RETURNS = TenantList()


async def _resolve_invoice(db, vendor_id: str, ref: str):
    """Finds the purchase invoice a vendor billed us under: a goods receipt (GRN) id, or a PO id (all of its receipts together).
    Returns {"id", "kind", "date", "total", "poId", "lines": [{sku, name, qty, cost, taxRate}]} or None."""
    ref = (ref or "").strip()
    if not ref:
        return None
    grn = await db.goodsreceiptnote.find_first(
        where={"id": {"equals": ref, "mode": "insensitive"}, "vendor_id": vendor_id}, include={"lines": True})
    if grn:
        return {"id": grn.id, "kind": "GRN", "date": grn.date, "total": grn.total, "poId": grn.po_id,
                "lines": [{"sku": l.sku, "name": l.name, "qty": l.qty, "cost": l.cost, "taxRate": getattr(l, "tax_rate", 0.0) or 0.0} for l in grn.lines]}
    po = await db.purchaseorder.find_first(where={"id": {"equals": ref, "mode": "insensitive"}, "vendor_id": vendor_id})
    if po:
        grns = await db.goodsreceiptnote.find_many(where={"po_id": po.id}, include={"lines": True}, order={"created_at": "asc"})
        merged = {}
        for g in grns:
            for l in g.lines:
                m = merged.setdefault(l.sku, {"sku": l.sku, "name": l.name, "qty": 0.0, "cost": l.cost, "taxRate": 0.0})
                m["qty"] += l.qty
                m["cost"] = l.cost
                m["taxRate"] = getattr(l, "tax_rate", 0.0) or 0.0
        if merged:
            return {"id": po.id, "kind": "PO", "date": grns[-1].date, "total": sum(m["qty"] * m["cost"] for m in merged.values()),
                    "poId": po.id, "lines": list(merged.values())}
    return None


async def _availability(db, inv: dict) -> dict:
    """Per SKU: how much was bought on the invoice, how much has already gone back, and how much can still be returned.
    A return against a PO and a return against one of its receipts draw on the same goods, so they are counted together."""
    po_id = inv.get("poId")
    group_ids = {inv["id"]}
    po_received = {}
    if po_id:
        group_ids.add(po_id)
        group_ids |= {g.id for g in await db.goodsreceiptnote.find_many(where={"po_id": po_id})}
        po_received = {l.sku: l.received_qty for l in await db.purchaseorderline.find_many(where={"po_id": po_id})}
    conditions = [{"invoice_id": {"in": list(group_ids)}}]
    if po_id:
        conditions.append({"po_id": po_id})
    group_returned, own_returned = {}, {}
    for r in await db.purchasereturn.find_many(where={"OR": conditions}, include={"lines": True}):
        if getattr(r, "status", "Processed") == "Draft":
            continue                                    # a draft has not sent anything back yet
        for l in r.lines:
            group_returned[l.sku] = group_returned.get(l.sku, 0.0) + l.qty
            if r.invoice_id == inv["id"]:
                own_returned[l.sku] = own_returned.get(l.sku, 0.0) + l.qty
    out = {}
    for l in inv["lines"]:
        sku = l["sku"]
        if inv["kind"] == "PO":
            returned = group_returned.get(sku, 0.0)
            available = l["qty"] - returned
        else:
            returned = own_returned.get(sku, 0.0)
            available = l["qty"] - returned
            if po_id and sku in po_received:
                available = min(available, po_received[sku] - group_returned.get(sku, 0.0))
        out[sku] = {"bought": l["qty"], "returned": returned, "available": max(0.0, available)}
    return out


@router.get("/invoices")
async def list_purchase_invoices(vendor_id: str, limit: int = 20):
    """Recent purchase invoices of a vendor, newest first: goods receipts (GRN) and the purchase orders that have received stock."""
    db = get_db()
    if not db.is_connected():
        return []
    take = max(1, min(limit, 100))
    grns = await db.goodsreceiptnote.find_many(where={"vendor_id": vendor_id}, include={"lines": True},
                                               order={"created_at": "desc"}, take=take)
    out = [{"id": g.id, "kind": "GRN", "poId": g.po_id, "date": g.date, "total": g.total, "itemCount": len(g.lines), "_at": g.created_at} for g in grns]
    pos = await db.purchaseorder.find_many(where={"vendor_id": vendor_id, "status": {"in": ["Partially Received", "Received", "Closed"]}},
                                           include={"lines": True}, order={"created_at": "desc"}, take=take)
    for p in pos:
        received = [l for l in p.lines if l.received_qty > 0]
        out.append({"id": p.id, "kind": "PO", "poId": p.id, "date": p.date,
                    "total": round(sum(l.received_qty * l.cost for l in received), 2), "itemCount": len(received), "_at": p.created_at})
    out.sort(key=lambda r: r["_at"], reverse=True)
    for r in out:
        r.pop("_at")
    return out[:take]


@router.get("/invoices/{invoice_ref}")
async def get_purchase_invoice(invoice_ref: str, vendor_id: str):
    """Items bought on one purchase invoice, with how much of each can still be returned."""
    db = get_db()
    inv = await _resolve_invoice(db, vendor_id, invoice_ref) if db.is_connected() else None
    if not inv:
        raise HTTPException(status_code=404, detail="No purchase invoice with that number was found for this vendor")
    avail = await _availability(db, inv)
    for l in inv["lines"]:
        l["returnedQty"] = avail[l["sku"]]["returned"]
        l["availableQty"] = avail[l["sku"]]["available"]
    return inv


def _return_out(r, vendor_name: str) -> dict:
    return {
        "id": r.id,
        "vendorId": r.vendor_id,
        "vendorName": vendor_name,
        "date": r.date,
        "reason": r.reason,
        "total": r.total,
        "invoiceId": getattr(r, "invoice_id", None),
        "poId": getattr(r, "po_id", None),
        "status": getattr(r, "status", None) or "Processed",
        "lines": [{"sku": l.sku, "name": l.name, "qty": l.qty, "cost": l.cost, "taxRate": getattr(l, "tax_rate", 0.0) or 0.0} for l in r.lines]
    }


@router.get("")
async def list_purchase_returns(vendor_id: Optional[str] = None):
    db = get_db()
    if db.is_connected():
        try:
            where_clause = {}
            if vendor_id:
                where_clause["vendor_id"] = vendor_id

            returns = await db.purchasereturn.find_many(where=where_clause, include={"lines": True}, order={"created_at": "desc"})
            names = {v.id: v.name for v in await db.vendor.find_many()}
            return [_return_out(r, names.get(r.vendor_id, r.vendor_id)) for r in returns]
        except Exception:
            pass

    # Fallback
    res = []
    for r in _FALLBACK_RETURNS:
        if vendor_id and r.get("vendorId") != vendor_id:
            continue
        res.append(r)
    return res


async def _prepare(db, vendor_id: str, reason: str, invoice_ref: Optional[str], lines) -> dict:
    """Checks a purchase return against the vendor, the purchase invoice and the stock, and prices its lines (GST included)."""
    if reason not in RETURN_REASONS:
        raise HTTPException(status_code=400, detail=f"Choose a return reason: {', '.join(RETURN_REASONS)}")
    if not lines:
        raise HTTPException(status_code=400, detail="Add at least one product to return")
    wanted: dict = {}
    for l in lines:
        if not (l.qty > 0):
            raise HTTPException(status_code=400, detail=f"Return quantity for {l.sku} must be greater than zero")
        if l.cost < 0:
            raise HTTPException(status_code=400, detail=f"Cost for {l.sku} cannot be negative")
        wanted[l.sku] = wanted.get(l.sku, 0.0) + l.qty
    vendor = await db.vendor.find_unique(where={"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    invoice_id, po_id, priced = None, None, {}
    if invoice_ref and invoice_ref.strip():
        inv = await _resolve_invoice(db, vendor_id, invoice_ref)
        if not inv:
            raise HTTPException(status_code=404, detail="No purchase invoice with that number was found for this vendor")
        invoice_id, po_id = inv["id"], inv.get("poId")
        avail = await _availability(db, inv)
        for sku, qty in wanted.items():
            if sku not in avail:
                raise HTTPException(status_code=400, detail=f"{sku} is not on purchase invoice {invoice_id}")
            if qty > avail[sku]["available"] + 1e-9:
                raise HTTPException(status_code=400, detail=f"Only {avail[sku]['available']:g} of {sku} can still be returned against {invoice_id}")
        priced = {l["sku"]: (l["cost"], l["taxRate"]) for l in inv["lines"]}   # the debit note uses the price and GST paid on the invoice

    items = {i.sku: i for i in await db.item.find_many(where={"sku": {"in": list(wanted)}})}
    for sku, qty in wanted.items():
        item = items.get(sku)
        if not item:
            raise HTTPException(status_code=400, detail=f"{sku} is not in your item list")
        if qty > item.stock + 1e-9:
            raise HTTPException(status_code=400, detail=f"Only {item.stock:g} of {sku} is in stock, so {qty:g} cannot be returned")

    out = []
    for l in lines:
        cost, tax = priced.get(l.sku, (l.cost, items[l.sku].tax_rate or 0.0))
        out.append({"sku": l.sku, "name": l.name, "qty": l.qty, "cost": cost, "tax_rate": tax})
    total = round(sum(with_gst(l["qty"] * l["cost"], l["tax_rate"]) for l in out), 2)
    return {"vendor": vendor, "invoice_id": invoice_id, "po_id": po_id, "lines": out, "total": total}


async def _apply_stock_and_payable(t, vendor, lines: list, total: float):
    """Processing a return: stock goes down (earliest-expiring batches first) and the vendor payable is credited."""
    for l in lines:
        await t.item.update(where={"sku": l["sku"]}, data={"stock": {"decrement": l["qty"]}})
        left = l["qty"]
        for b in sorted(await t.batch.find_many(where={"sku": l["sku"], "qty": {"gt": 0}}), key=lambda b: b.expiry_date):
            if left <= 1e-9:
                break
            take = min(b.qty, left)
            await t.batch.update(where={"id": b.id}, data={"qty": b.qty - take})
            left -= take
    fresh = await t.vendor.find_unique(where={"id": vendor.id})
    await t.vendor.update(where={"id": vendor.id}, data={"payable": max(0.0, (fresh or vendor).payable - total)})


@router.post("")
async def create_purchase_return(data: PurchaseReturnCreate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, "purchase_return",
                                         f"{data.vendorId}_{data.invoiceId}_{data.reason}_{data.process}_" + ",".join(f"{l.sku}:{l.qty}" for l in data.lines))
    try:
        db = get_db()
        if db.is_connected():
            try:
                prep = await _prepare(db, data.vendorId, data.reason, data.invoiceId, data.lines)
                dn_id = await unique_id("DN", lambda c: db.purchasereturn.find_unique(where={"id": c}))
                status = "Processed" if data.process else "Draft"
                async with tx(db) as t:
                    await t.purchasereturn.create(data={"id": dn_id, "vendor_id": data.vendorId, "date": today(), "reason": data.reason,
                                                         "total": prep["total"], "invoice_id": prep["invoice_id"], "po_id": prep["po_id"], "status": status})
                    for l in prep["lines"]:
                        await t.purchasereturnline.create(data={"return_id": dn_id, **l})
                    if data.process:
                        await _apply_stock_and_payable(t, prep["vendor"], prep["lines"], prep["total"])

                res = {
                    "id": dn_id,
                    "vendorId": data.vendorId,
                    "date": today(),
                    "reason": data.reason,
                    "total": prep["total"],
                    "invoiceId": prep["invoice_id"],
                    "poId": prep["po_id"],
                    "status": status,
                    "message": (f"Purchase return processed — Debit Note {dn_id} generated" if data.process
                                else f"Purchase return {dn_id} saved as a draft; stock and payable change when it is processed")
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        # Fallback (no database connection)
        if data.reason not in RETURN_REASONS:
            raise HTTPException(status_code=400, detail=f"Choose a return reason: {', '.join(RETURN_REASONS)}")
        dn_id = f"DN-{1001 + len(_FALLBACK_RETURNS)}"
        total_refund = sum(l.qty * l.cost for l in data.lines)
        res = {
            "id": dn_id,
            "vendorId": data.vendorId,
            "date": today(),
            "reason": data.reason,
            "total": total_refund,
            "status": "Processed" if data.process else "Draft",
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


@router.post("/{return_id}/process")
async def process_purchase_return(return_id: str, request: Request, current_user=Depends(get_current_user)):
    """Processes a Draft return: checks it again against the current stock and invoice, then reduces stock and credits the vendor."""
    lock_key = await enforce_idempotency(request, f"process_purchase_return_{return_id}")
    try:
        db = get_db()
        if not db.is_connected():
            raise HTTPException(status_code=503, detail="The database is not connected")
        try:
            r = await db.purchasereturn.find_unique(where={"id": return_id}, include={"lines": True})
            if not r:
                raise HTTPException(status_code=404, detail="Purchase return not found")
            if (getattr(r, "status", None) or "Processed") != "Draft":
                raise HTTPException(status_code=400, detail="Only a draft purchase return can be processed")
            from app.schemas import PurchaseReturnLineInput
            lines = [PurchaseReturnLineInput(sku=l.sku, name=l.name, qty=l.qty, cost=l.cost) for l in r.lines]
            prep = await _prepare(db, r.vendor_id, r.reason, r.invoice_id, lines)
            async with tx(db) as t:
                await t.purchasereturnline.delete_many(where={"return_id": return_id})
                for l in prep["lines"]:
                    await t.purchasereturnline.create(data={"return_id": return_id, **l})
                await t.purchasereturn.update(where={"id": return_id}, data={"status": "Processed", "total": prep["total"], "date": today(),
                                                                              "po_id": prep["po_id"]})
                await _apply_stock_and_payable(t, prep["vendor"], prep["lines"], prep["total"])
            res = {"id": return_id, "status": "Processed", "total": prep["total"],
                   "message": f"Purchase return processed — Debit Note {return_id} generated"}
            if lock_key:
                await idempotency_manager.release_lock(lock_key, res)
            return res
        except HTTPException:
            raise
        except Exception as exc:
            raise db_error(exc)
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{return_id}")
async def discard_draft_purchase_return(return_id: str, current_user=Depends(get_current_user)):
    """Discards a Draft purchase return. A processed return is a debit note and cannot be deleted."""
    db = get_db()
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="The database is not connected")
    r = await db.purchasereturn.find_unique(where={"id": return_id})
    if not r:
        raise HTTPException(status_code=404, detail="Purchase return not found")
    if (getattr(r, "status", None) or "Processed") != "Draft":
        raise HTTPException(status_code=400, detail="A processed purchase return cannot be deleted")
    try:
        await db.purchasereturn.delete(where={"id": return_id})
    except Exception as exc:
        raise db_error(exc)
    return {"id": return_id, "message": "Draft purchase return discarded"}
