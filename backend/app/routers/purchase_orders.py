from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db, is_default_store
from app.tenant_scoped import TenantList, TenantDict
from app.schemas import PurchaseOrderCreate, PurchaseOrderUpdate
from app.security import get_current_user
from app.idempotency import enforce_idempotency, idempotency_manager
from app.procurement import (PO_EDITABLE, check_po_transition, norm_po_status, parse_date, today, db_error, tx)

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])

_DEMO_POS = [
    {
        "id": "PO-2026-0139", "vendor_id": "V-004", "date": "2026-08-20", "expected": "2026-08-24", "status": "Received", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "BAK-001", "name": "White Bread 400g", "ordered_qty": 60.0, "received_qty": 60.0, "cost": 28.0 },
            { "sku": "BAK-002", "name": "Brown Bread 400g", "ordered_qty": 60.0, "received_qty": 60.0, "cost": 32.0 },
            { "sku": "BAK-003", "name": "Croissant (pc)", "ordered_qty": 100.0, "received_qty": 100.0, "cost": 22.0 }
        ]
    },
    {
        "id": "PO-2026-0142", "vendor_id": "V-001", "date": "2026-08-28", "expected": "2026-09-02", "status": "Received", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "GRO-001", "name": "Basmati Rice 1kg", "ordered_qty": 100.0, "received_qty": 100.0, "cost": 95.0 },
            { "sku": "GRO-002", "name": "Toor Dal 1kg", "ordered_qty": 80.0, "received_qty": 80.0, "cost": 105.0 },
            { "sku": "GRO-004", "name": "Sugar 1kg", "ordered_qty": 120.0, "received_qty": 120.0, "cost": 38.0 }
        ]
    },
    {
        "id": "PO-2026-0145", "vendor_id": "V-002", "date": "2026-09-02", "expected": "2026-09-06", "status": "Partially Received", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "BEV-001", "name": "Cola 500ml", "ordered_qty": 200.0, "received_qty": 160.0, "cost": 30.0 },
            { "sku": "BEV-002", "name": "Orange Juice 1L", "ordered_qty": 100.0, "received_qty": 100.0, "cost": 78.0 },
            { "sku": "BEV-003", "name": "Mineral Water 1L", "ordered_qty": 300.0, "received_qty": 0.0, "cost": 12.0 }
        ]
    },
    {
        "id": "PO-2026-0148", "vendor_id": "V-003", "date": "2026-09-05", "expected": "2026-09-08", "status": "Approved", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "DAI-001", "name": "Toned Milk 500ml", "ordered_qty": 150.0, "received_qty": 0.0, "cost": 20.0 },
            { "sku": "DAI-002", "name": "Curd Cup 200g", "ordered_qty": 100.0, "received_qty": 0.0, "cost": 16.0 },
            { "sku": "DAI-003", "name": "Paneer 200g", "ordered_qty": 40.0, "received_qty": 0.0, "cost": 65.0 }
        ]
    },
    {
        "id": "PO-2026-0150", "vendor_id": "V-005", "date": "2026-09-06", "expected": "2026-09-10", "status": "Pending", "approved_by": None,
        "lines": [
            { "sku": "SNK-002", "name": "Choco Cookies 200g", "ordered_qty": 80.0, "received_qty": 0.0, "cost": 42.0 },
            { "sku": "SNK-004", "name": "Popcorn Butter 100g", "ordered_qty": 60.0, "received_qty": 0.0, "cost": 38.0 }
        ]
    },
    {
        "id": "PO-2026-0151", "vendor_id": "V-006", "date": "2026-09-07", "expected": "2026-09-12", "status": "Draft", "approved_by": None,
        "lines": [
            { "sku": "PC-002", "name": "Shampoo 340ml", "ordered_qty": 50.0, "received_qty": 0.0, "cost": 150.0 },
            { "sku": "PC-003", "name": "Hand Wash 250ml", "ordered_qty": 70.0, "received_qty": 0.0, "cost": 62.0 }
        ]
    }
]

SEED_POS = TenantList(_DEMO_POS)

async def seed_pos_if_needed():
    if not is_default_store():          # a new tenant starts with NO purchase orders
        return
    db = get_db()
    if db.is_connected():
        try:
            count = await db.purchaseorder.count()
            if count == 0:
                for po in SEED_POS:
                    lines = po.get("lines", [])
                    po_data = {k: v for k, v in po.items() if k != "lines"}
                    await db.purchaseorder.create(data=po_data)
                    for line in lines:
                        l_copy = dict(line)
                        l_copy["po_id"] = po["id"]
                        await db.purchaseorderline.create(data=l_copy)
        except Exception:
            pass

def _line_out(l) -> dict:
    return {
        "sku": l.sku,
        "name": l.name,
        "orderedQty": l.ordered_qty,
        "receivedQty": l.received_qty,
        "cost": l.cost,
        "taxRate": getattr(l, "tax_rate", 0.0) or 0.0,
        "batchNo": getattr(l, "batch_no", None)
    }


def _totals(lines: list) -> dict:
    subtotal = sum(l["orderedQty"] * l["cost"] for l in lines)
    gst = sum(l["orderedQty"] * l["cost"] * l["taxRate"] / 100.0 for l in lines)
    return {"subtotal": round(subtotal, 2), "gst": round(gst, 2), "total": round(subtotal + gst, 2)}


def _po_out(p, vendor_name: Optional[str] = None) -> dict:
    lines = [_line_out(l) for l in p.lines]
    return {
        "id": p.id,
        "vendorId": p.vendor_id,
        "vendorName": vendor_name or (p.vendor.name if getattr(p, "vendor", None) else p.vendor_id),
        "date": p.date,
        "expected": p.expected,
        "status": norm_po_status(p.status),
        "approvedBy": p.approved_by,
        "lines": lines,
        **_totals(lines)
    }


def _fallback_po_out(p: dict) -> dict:
    lines = [{
        "sku": l["sku"], "name": l["name"], "orderedQty": l["ordered_qty"], "receivedQty": l.get("received_qty", 0.0),
        "cost": l["cost"], "taxRate": l.get("tax_rate", 0.0), "batchNo": l.get("batch_no")
    } for l in p.get("lines", [])]
    return {
        "id": p["id"], "vendorId": p["vendor_id"], "vendorName": p["vendor_id"], "date": p["date"], "expected": p["expected"],
        "status": norm_po_status(p["status"]), "approvedBy": p.get("approved_by"), "lines": lines, **_totals(lines)
    }


def _validate_lines(lines) -> None:
    if not lines:
        raise HTTPException(status_code=400, detail="Add at least one product to the purchase order")
    seen = set()
    for l in lines:
        if not (l.qty > 0):
            raise HTTPException(status_code=400, detail=f"Quantity for {l.sku} must be greater than zero")
        if l.cost < 0:
            raise HTTPException(status_code=400, detail=f"Purchase price for {l.sku} cannot be negative")
        if l.taxRate is not None and not (0 <= l.taxRate <= 100):
            raise HTTPException(status_code=400, detail=f"GST for {l.sku} must be between 0 and 100%")
        if l.sku in seen:
            raise HTTPException(status_code=400, detail=f"{l.sku} is on the purchase order twice")
        seen.add(l.sku)


async def _check_vendor(db, vendor_id: str):
    vendor = await db.vendor.find_unique(where={"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if vendor.status != "Active":
        raise HTTPException(status_code=400, detail=f"{vendor.name} is inactive: activate the vendor before ordering from them")
    return vendor


async def _line_rows(db, lines) -> list:
    """Line data for the database: a blank GST falls back to the item's own tax rate."""
    items = {i.sku: i for i in await db.item.find_many(where={"sku": {"in": [l.sku for l in lines]}})}
    rows = []
    for l in lines:
        tax = l.taxRate if l.taxRate is not None else (items[l.sku].tax_rate if l.sku in items else 0.0)
        rows.append({"sku": l.sku, "name": l.name, "ordered_qty": l.qty, "received_qty": 0.0, "cost": l.cost,
                     "tax_rate": tax, "batch_no": (l.batchNo or "").strip() or None})
    return rows


async def _next_po_id(db, year: str) -> str:
    prefix = f"PO-{year}-"
    numbers = [int(p.id[len(prefix):]) for p in await db.purchaseorder.find_many() if p.id.startswith(prefix) and p.id[len(prefix):].isdigit()]
    return f"{prefix}{str(max(numbers, default=0) + 1).zfill(4)}"


@router.get("")
async def list_purchase_orders(status: Optional[str] = None, search: Optional[str] = None, vendor_id: Optional[str] = None):
    await seed_pos_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            where_clause = {}
            if vendor_id:
                where_clause["vendor_id"] = vendor_id
            pos = await db.purchaseorder.find_many(
                where=where_clause,
                include={"lines": True, "vendor": True},
                order={"created_at": "desc"}
            )
            result = []
            for p in pos:
                if status and norm_po_status(p.status) != status:
                    continue
                vendor_name = p.vendor.name if p.vendor else p.vendor_id
                if search:
                    term = search.lower()
                    if term not in p.id.lower() and term not in vendor_name.lower():
                        continue
                result.append(_po_out(p, vendor_name))
            return result
        except Exception:
            pass

    # Fallback
    return [_fallback_po_out(p) for p in SEED_POS
            if (not status or norm_po_status(p.get("status")) == status) and (not vendor_id or p["vendor_id"] == vendor_id)]


@router.get("/{po_id}")
async def get_purchase_order(po_id: str):
    await seed_pos_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            p = await db.purchaseorder.find_unique(where={"id": po_id}, include={"lines": True, "vendor": True})
            if p:
                return _po_out(p)
        except Exception:
            pass

    for p in SEED_POS:
        if p["id"] == po_id:
            return _fallback_po_out(p)
    raise HTTPException(status_code=404, detail="Purchase Order not found")


@router.post("")
async def create_purchase_order(data: PurchaseOrderCreate, request: Request, current_user=Depends(get_current_user)):
    if data.status not in ("Draft", "Pending"):
        raise HTTPException(status_code=400, detail="A new purchase order is saved as Draft or Pending")
    _validate_lines(data.lines)
    po_date = parse_date(data.date, "PO date") or today()
    expected = parse_date(data.expected, "Expected delivery date")
    if not expected:
        raise HTTPException(status_code=400, detail="Enter the expected delivery date")
    if expected < po_date:
        raise HTTPException(status_code=400, detail="Expected delivery date cannot be before the PO date")
    lock_key = await enforce_idempotency(request, "create_purchase_order", f"{data.vendorId}_{po_date}_{expected}_" + ",".join(f"{l.sku}:{l.qty}" for l in data.lines))
    try:
        db = get_db()
        if db.is_connected():
            try:
                await _check_vendor(db, data.vendorId)
                rows = await _line_rows(db, data.lines)
                po_id = await _next_po_id(db, po_date[:4])
                async with tx(db) as t:
                    await t.purchaseorder.create(data={"id": po_id, "vendor_id": data.vendorId, "date": po_date, "expected": expected,
                                                        "status": data.status, "approved_by": None})
                    for row in rows:
                        await t.purchaseorderline.create(data={"po_id": po_id, **row})
                res = _po_out(await db.purchaseorder.find_unique(where={"id": po_id}, include={"lines": True, "vendor": True}))
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        # Fallback (no database connection)
        po_id = f"PO-{po_date[:4]}-{str(152 + len(SEED_POS)).zfill(4)}"
        line_rows = [{"sku": l.sku, "name": l.name, "ordered_qty": l.qty, "received_qty": 0.0, "cost": l.cost,
                      "tax_rate": l.taxRate or 0.0, "batch_no": l.batchNo} for l in data.lines]
        po = {"id": po_id, "vendor_id": data.vendorId, "date": po_date, "expected": expected, "status": data.status,
              "approved_by": None, "lines": line_rows}
        SEED_POS.append(po)
        res = _fallback_po_out(po)
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res)
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{po_id}")
async def update_purchase_order(po_id: str, data: PurchaseOrderUpdate, request: Request, current_user=Depends(get_current_user)):
    """Edit a Draft or Pending purchase order (vendor, expected delivery date, products)."""
    if data.lines is not None:
        _validate_lines(data.lines)
    expected = parse_date(data.expected, "Expected delivery date") if data.expected else None
    lock_key = await enforce_idempotency(request, f"update_po_{po_id}")
    try:
        db = get_db()
        if db.is_connected():
            try:
                po = await db.purchaseorder.find_unique(where={"id": po_id})
                if not po:
                    raise HTTPException(status_code=404, detail="Purchase order not found")
                if norm_po_status(po.status) not in PO_EDITABLE:
                    raise HTTPException(status_code=400, detail=f"A purchase order that is {norm_po_status(po.status)} can no longer be edited")
                if expected and expected < po.date:
                    raise HTTPException(status_code=400, detail="Expected delivery date cannot be before the PO date")
                changes = {}
                if data.vendorId and data.vendorId != po.vendor_id:
                    await _check_vendor(db, data.vendorId)
                    changes["vendor_id"] = data.vendorId
                if expected:
                    changes["expected"] = expected
                rows = await _line_rows(db, data.lines) if data.lines is not None else None
                async with tx(db) as t:
                    if changes:
                        await t.purchaseorder.update(where={"id": po_id}, data=changes)
                    if rows is not None:
                        await t.purchaseorderline.delete_many(where={"po_id": po_id})
                        for row in rows:
                            await t.purchaseorderline.create(data={"po_id": po_id, **row})
                res = _po_out(await db.purchaseorder.find_unique(where={"id": po_id}, include={"lines": True, "vendor": True}))
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        for p in SEED_POS:
            if p["id"] == po_id:
                if norm_po_status(p["status"]) not in PO_EDITABLE:
                    raise HTTPException(status_code=400, detail=f"A purchase order that is {norm_po_status(p['status'])} can no longer be edited")
                if data.vendorId:
                    p["vendor_id"] = data.vendorId
                if expected:
                    p["expected"] = expected
                if data.lines is not None:
                    p["lines"] = [{"sku": l.sku, "name": l.name, "ordered_qty": l.qty, "received_qty": 0.0, "cost": l.cost,
                                   "tax_rate": l.taxRate or 0.0, "batch_no": l.batchNo} for l in data.lines]
                res = _fallback_po_out(p)
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
        raise HTTPException(status_code=404, detail="Purchase order not found")
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


async def _move_status(po_id: str, target: str, request: Request, current_user, message: str):
    """Moves a purchase order to `target` after checking the allowed transitions (Draft > Pending > Approved > Ordered, or Cancelled)."""
    lock_key = await enforce_idempotency(request, f"po_{target.lower()}_{po_id}")
    try:
        db = get_db()
        actor = getattr(current_user, 'full_name', 'Arjun M.') if not isinstance(current_user, dict) else current_user.get('full_name', 'Arjun M.')
        data = {"status": target}
        if target == "Approved":
            data["approved_by"] = actor
        if db.is_connected():
            try:
                po = await db.purchaseorder.find_unique(where={"id": po_id}, include={"lines": True})
                if not po:
                    raise HTTPException(status_code=404, detail="Purchase order not found")
                check_po_transition(po.status, target)
                if target == "Cancelled" and any(l.received_qty > 0 for l in po.lines):
                    raise HTTPException(status_code=400, detail="Goods have already been received against this purchase order, so it cannot be cancelled")
                updated = await db.purchaseorder.update(where={"id": po_id}, data=data)
                res = {"id": po_id, "status": updated.status, "approvedBy": updated.approved_by, "message": message.format(po=po_id)}
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        for p in SEED_POS:
            if p["id"] == po_id:
                check_po_transition(p["status"], target)
                p["status"] = target
                if target == "Approved":
                    p["approved_by"] = actor
                res = {"id": po_id, "status": target, "approvedBy": p.get("approved_by"), "message": message.format(po=po_id)}
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
        raise HTTPException(status_code=404, detail="Purchase order not found")
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{po_id}/submit")
async def submit_purchase_order(po_id: str, request: Request, current_user=Depends(get_current_user)):
    return await _move_status(po_id, "Pending", request, current_user, "{po} submitted for approval")


@router.post("/{po_id}/approve")
async def approve_purchase_order(po_id: str, request: Request, current_user=Depends(get_current_user)):
    return await _move_status(po_id, "Approved", request, current_user, "{po} approved")


@router.post("/{po_id}/order")
async def mark_purchase_order_ordered(po_id: str, request: Request, current_user=Depends(get_current_user)):
    return await _move_status(po_id, "Ordered", request, current_user, "{po} marked as ordered from the vendor")


@router.post("/{po_id}/cancel")
async def cancel_purchase_order(po_id: str, request: Request, current_user=Depends(get_current_user)):
    return await _move_status(po_id, "Cancelled", request, current_user, "{po} cancelled")
