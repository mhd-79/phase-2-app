from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db
from app.tenant_scoped import TenantList, TenantDict
from app.schemas import GRNCreate, DirectGRNCreate, LandedCostAllocationInput
from app.security import get_current_user
from app.idempotency import enforce_idempotency, idempotency_manager
from app.procurement import (PO_RECEIVABLE, norm_po_status, parse_date, today, unique_id, with_gst, db_error, tx, batch_no_supported)

router = APIRouter(prefix="/grn", tags=["goods-receipt-notes"])

_FALLBACK_GRNS = TenantList()


def _batch_fields(rl, label: str):
    """(batch_no, mfg_date, expiry_date) of a receipt line, checked."""
    batch_no = (rl.batchNo or "").strip() or None
    mfg = parse_date(rl.mfgDate, f"Mfg date of {label}")
    exp = parse_date(rl.expiryDate, f"Expiry date of {label}")
    if mfg and exp and exp < mfg:
        raise HTTPException(status_code=400, detail=f"Expiry date of {label} cannot be before its manufacturing date")
    return batch_no, mfg, exp


async def _receive_line(t, sku: str, name: str, qty: float, batch_no, mfg, exp):
    """Stock in: Item.stock goes up, the batch is recorded (when it has an expiry date) and becomes the item's current batch."""
    item = await t.item.find_unique(where={"sku": sku})
    if item:
        data = {"stock": {"increment": qty}}
        if batch_no and batch_no_supported():
            data["batch_no"] = batch_no
        await t.item.update(where={"sku": sku}, data=data)
        name = item.name
    if batch_no and exp:
        await t.batch.create(data={"sku": sku, "name": name, "batch_no": batch_no, "mfg_date": mfg or today(), "expiry_date": exp, "qty": qty})
    return name


@router.get("")
async def list_grn_logs(vendor_id: Optional[str] = None):
    db = get_db()
    if db.is_connected():
        try:
            where_clause = {}
            if vendor_id:
                where_clause["vendor_id"] = vendor_id

            grns = await db.goodsreceiptnote.find_many(
                where=where_clause,
                include={"lines": True},
                order={"created_at": "desc"}
            )
            po_ids = list({g.po_id for g in grns if g.po_id})
            po_lines = await db.purchaseorderline.find_many(where={"po_id": {"in": po_ids}}) if po_ids else []
            remaining = {(l.po_id, l.sku): l.ordered_qty - l.received_qty for l in po_lines}

            result = []
            for g in grns:
                result.append({
                    "id": g.id,
                    "poId": g.po_id,
                    "vendorId": g.vendor_id,
                    "date": g.date,
                    "total": g.total,
                    "landedCostAllocation": g.landed_cost_allocation,
                    "lines": [
                        {"sku": l.sku, "name": l.name, "qty": l.qty, "cost": l.cost, "taxRate": getattr(l, "tax_rate", 0.0) or 0.0}
                        for l in g.lines
                    ],
                    # what is still outstanding on the PO for the items of this receipt (empty when everything arrived)
                    "variances": [
                        {"sku": l.sku, "name": l.name, "remaining": remaining[(g.po_id, l.sku)]}
                        for l in g.lines if g.po_id and abs(remaining.get((g.po_id, l.sku), 0.0)) > 1e-9
                    ]
                })
            return result
        except Exception:
            pass

    # Fallback
    res = []
    for g in _FALLBACK_GRNS:
        if vendor_id and g.get("vendorId") != vendor_id:
            continue
        res.append(g)
    return res

@router.post("/receipt")
async def record_goods_receipt(data: GRNCreate, request: Request, current_user=Depends(get_current_user)):
    # lines left at zero are ignored; anything else must be a positive quantity of a distinct item
    wanted: dict = {}
    for rl in data.lines:
        if rl.qty < 0:
            raise HTTPException(status_code=400, detail=f"Quantity received for {rl.sku} cannot be negative")
        if rl.qty > 0:
            if rl.sku in wanted:
                raise HTTPException(status_code=400, detail=f"{rl.sku} is listed twice in this receipt")
            wanted[rl.sku] = rl
    if not wanted:
        raise HTTPException(status_code=400, detail="Enter the quantity received for at least one item")
    batches = {sku: _batch_fields(rl, sku) for sku, rl in wanted.items()}

    lock_key = await enforce_idempotency(request, "record_goods_receipt", f"{data.poId}_" + ",".join(f"{s}:{r.qty}" for s, r in wanted.items()))
    try:
        db = get_db()
        if db.is_connected():
            try:
                po = await db.purchaseorder.find_unique(where={"id": data.poId}, include={"lines": True})
                if not po:
                    raise HTTPException(status_code=404, detail="Purchase order not found")
                status = norm_po_status(po.status)
                if status not in PO_RECEIVABLE:
                    raise HTTPException(status_code=400, detail=f"Stock cannot be received against a purchase order that is {status}")
                lines_by_sku = {l.sku: l for l in po.lines}
                for sku, rl in wanted.items():
                    po_line = lines_by_sku.get(sku)
                    if not po_line:
                        raise HTTPException(status_code=400, detail=f"{sku} is not on purchase order {po.id}")
                    still_due = po_line.ordered_qty - po_line.received_qty
                    if rl.qty > still_due + 1e-9:
                        raise HTTPException(status_code=400, detail=f"Only {still_due:g} of {sku} is still to be received on {po.id}")

                vendor_id = po.vendor_id
                grn_id = await unique_id(f"GRN-{today()[:4]}", lambda c: db.goodsreceiptnote.find_unique(where={"id": c}))
                total_cost = 0.0
                received_now = {}
                grn_lines = []
                variances = []
                async with tx(db) as t:
                    for sku, rl in wanted.items():
                        po_line = lines_by_sku[sku]
                        new_received = po_line.received_qty + rl.qty
                        await t.purchaseorderline.update(where={"id": po_line.id}, data={"received_qty": new_received})
                        received_now[sku] = new_received
                        batch_no, mfg, exp = batches[sku]
                        name = await _receive_line(t, sku, po_line.name, rl.qty, batch_no or getattr(po_line, "batch_no", None), mfg, exp)
                        tax = getattr(po_line, "tax_rate", 0.0) or 0.0
                        total_cost += with_gst(po_line.cost * rl.qty, tax)
                        grn_lines.append({"grn_id": grn_id, "sku": sku, "name": name, "qty": rl.qty, "cost": po_line.cost, "tax_rate": tax})
                        remaining = po_line.ordered_qty - new_received
                        if remaining != 0:
                            variances.append({"sku": sku, "name": name, "remaining": remaining})

                    all_done = all(received_now.get(l.sku, l.received_qty) >= l.ordered_qty for l in po.lines)
                    new_status = "Received" if all_done else "Partially Received"
                    await t.purchaseorder.update(where={"id": po.id}, data={"status": new_status})
                    await t.goodsreceiptnote.create(data={"id": grn_id, "po_id": po.id, "vendor_id": vendor_id, "date": today(), "total": total_cost})
                    for gl in grn_lines:
                        await t.goodsreceiptnoteline.create(data=gl)
                    await t.vendor.update(where={"id": vendor_id}, data={"payable": {"increment": total_cost}})

                res = {
                    "grnId": grn_id,
                    "poId": po.id,
                    "status": new_status,
                    "total": total_cost,
                    "variances": variances,
                    "message": "Goods receipt recorded and stock updated"
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        # Fallback (no database connection)
        grn_id = f"GRN-{today()[:4]}-{len(_FALLBACK_GRNS) + 1001}"
        total_cost = sum(l.qty * 30.0 for l in wanted.values())
        res = {
            "grnId": grn_id,
            "poId": data.poId,
            "status": "Received",
            "total": total_cost,
            "variances": [],
            "message": "Goods receipt recorded and stock updated"
        }
        _FALLBACK_GRNS.append(res)
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res)
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/direct")
async def record_direct_receipt(data: DirectGRNCreate, request: Request, current_user=Depends(get_current_user)):
    if not data.lines:
        raise HTTPException(status_code=400, detail="Add at least one item to receive")
    for l in data.lines:
        if not (l.qty > 0):
            raise HTTPException(status_code=400, detail=f"Quantity for {l.sku} must be greater than zero")
        if l.cost < 0:
            raise HTTPException(status_code=400, detail=f"Purchase price for {l.sku} cannot be negative")
        if not (0 <= l.taxRate <= 100):
            raise HTTPException(status_code=400, detail=f"GST for {l.sku} must be between 0 and 100%")
    batches = [_batch_fields(l, l.sku) for l in data.lines]
    lock_key = await enforce_idempotency(request, "record_direct_receipt", f"{data.vendorId}_" + ",".join(f"{l.sku}:{l.qty}" for l in data.lines))
    try:
        db = get_db()
        total_cost = sum(with_gst(line.qty * line.cost, line.taxRate) for line in data.lines)

        if db.is_connected():
            try:
                vendor = await db.vendor.find_unique(where={"id": data.vendorId})
                if not vendor:
                    raise HTTPException(status_code=404, detail="Vendor not found")
                if vendor.status != "Active":
                    raise HTTPException(status_code=400, detail=f"{vendor.name} is inactive: activate the vendor before receiving stock from them")
                grn_id = await unique_id("GRN-DIRECT", lambda c: db.goodsreceiptnote.find_unique(where={"id": c}))
                async with tx(db) as t:
                    await t.goodsreceiptnote.create(data={"id": grn_id, "po_id": None, "vendor_id": data.vendorId, "date": today(), "total": total_cost})
                    for line, (batch_no, mfg, exp) in zip(data.lines, batches):
                        name = await _receive_line(t, line.sku, line.name or line.sku, line.qty, batch_no, mfg, exp)
                        await t.goodsreceiptnoteline.create(data={"grn_id": grn_id, "sku": line.sku, "name": name, "qty": line.qty,
                                                                  "cost": line.cost, "tax_rate": line.taxRate})
                    await t.vendor.update(where={"id": data.vendorId}, data={"payable": {"increment": total_cost}})

                res = {
                    "grnId": grn_id,
                    "vendorId": data.vendorId,
                    "total": total_cost,
                    "message": "Direct GRN recorded, stock and payables updated"
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        # Fallback (no database connection)
        res = {
            "grnId": f"GRN-DIRECT-{len(_FALLBACK_GRNS) + 1001}",
            "vendorId": data.vendorId,
            "total": total_cost,
            "message": "Direct GRN recorded, stock and payables updated"
        }
        _FALLBACK_GRNS.append(res)
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res)
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{grn_id}/landed-cost")
async def allocate_landed_cost(grn_id: str, data: LandedCostAllocationInput, current_user=Depends(get_current_user)):
    db = get_db()
    grn = await db.goodsreceiptnote.find_unique(
        where={"id": grn_id},
        include={"lines": True}
    )
    if not grn:
        raise HTTPException(status_code=404, detail="Goods receipt note not found")
        
    total_grn_val = grn.total if grn.total > 0 else 1.0
    allocated_items = []
    
    for line in grn.lines:
        item = await db.item.find_unique(where={"sku": line.sku})
        if not item:
            continue
        line_val = line.qty * line.cost
        if data.allocation_method == "equal":
            allocated_share = data.amount / len(grn.lines)
        else: # cost_ratio
            allocated_share = (line_val / total_grn_val) * data.amount
            
        per_unit_landed = (allocated_share / line.qty) if line.qty > 0 else 0.0
        new_landed_cost = item.cost_price + per_unit_landed
        
        await db.item.update(
            where={"sku": line.sku},
            data={"landed_cost": round(new_landed_cost, 2)}
        )
        allocated_items.append({"sku": line.sku, "allocatedShare": round(allocated_share, 2), "newLandedCost": round(new_landed_cost, 2)})
        
    await db.goodsreceiptnote.update(
        where={"id": grn_id},
        data={"landed_cost_allocation": grn.landed_cost_allocation + data.amount}
    )
    
    return {
        "grnId": grn_id,
        "totalAllocated": data.amount,
        "allocatedItems": allocated_items,
        "message": "Landed cost allocated to items successfully"
    }
