from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db
from app.schemas import PurchaseOrderCreate
from app.security import get_current_user
from app.idempotency import enforce_idempotency, idempotency_manager

router = APIRouter(prefix="/purchase-orders", tags=["purchase-orders"])

SEED_POS = [
    {
        "id": "PO-2026-0139", "vendor_id": "V-004", "date": "2026-08-20", "expected": "2026-08-24", "status": "Closed", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "BAK-001", "name": "White Bread 400g", "ordered_qty": 60.0, "received_qty": 60.0, "cost": 28.0 },
            { "sku": "BAK-002", "name": "Brown Bread 400g", "ordered_qty": 60.0, "received_qty": 60.0, "cost": 32.0 },
            { "sku": "BAK-003", "name": "Croissant (pc)", "ordered_qty": 100.0, "received_qty": 100.0, "cost": 22.0 }
        ]
    },
    {
        "id": "PO-2026-0142", "vendor_id": "V-001", "date": "2026-08-28", "expected": "2026-09-02", "status": "Closed", "approved_by": "Arjun M.",
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
        "id": "PO-2026-0150", "vendor_id": "V-005", "date": "2026-09-06", "expected": "2026-09-10", "status": "Pending Approval", "approved_by": None,
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

async def seed_pos_if_needed():
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

@router.get("")
async def list_purchase_orders(status: Optional[str] = None, search: Optional[str] = None):
    await seed_pos_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            where_clause = {}
            if status:
                where_clause["status"] = status
            
            pos = await db.purchaseorder.find_many(
                where=where_clause,
                include={"lines": True, "vendor": True},
                order={"created_at": "desc"}
            )
            
            result = []
            for p in pos:
                vendor_name = p.vendor.name if p.vendor else p.vendor_id
                if search:
                    term = search.lower()
                    if term not in p.id.lower() and term not in vendor_name.lower():
                        continue
                result.append({
                    "id": p.id,
                    "vendorId": p.vendor_id,
                    "vendorName": vendor_name,
                    "date": p.date,
                    "expected": p.expected,
                    "status": p.status,
                    "approvedBy": p.approved_by,
                    "lines": [
                        {
                            "sku": l.sku,
                            "name": l.name,
                            "orderedQty": l.ordered_qty,
                            "receivedQty": l.received_qty,
                            "cost": l.cost
                        } for l in p.lines
                    ]
                })
            return result
        except Exception:
            pass
            
    # Fallback
    res = []
    for p in SEED_POS:
        if status and p.get("status") != status:
            continue
        res.append({
            "id": p["id"],
            "vendorId": p["vendor_id"],
            "vendorName": p["vendor_id"],
            "date": p["date"],
            "expected": p["expected"],
            "status": p["status"],
            "approvedBy": p.get("approved_by"),
            "lines": [
                {
                    "sku": l["sku"],
                    "name": l["name"],
                    "orderedQty": l["ordered_qty"],
                    "receivedQty": l.get("received_qty", 0.0),
                    "cost": l["cost"]
                } for l in p.get("lines", [])
            ]
        })
    return res

@router.get("/{po_id}")
async def get_purchase_order(po_id: str):
    await seed_pos_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            p = await db.purchaseorder.find_unique(
                where={"id": po_id},
                include={"lines": True, "vendor": True}
            )
            if p:
                return {
                    "id": p.id,
                    "vendorId": p.vendor_id,
                    "vendorName": p.vendor.name if p.vendor else p.vendor_id,
                    "date": p.date,
                    "expected": p.expected,
                    "status": p.status,
                    "approvedBy": p.approved_by,
                    "lines": [
                        {
                            "sku": l.sku,
                            "name": l.name,
                            "orderedQty": l.ordered_qty,
                            "receivedQty": l.received_qty,
                            "cost": l.cost
                        } for l in p.lines
                    ]
                }
        except Exception:
            pass
            
    for p in SEED_POS:
        if p["id"] == po_id:
            return {
                "id": p["id"],
                "vendorId": p["vendor_id"],
                "vendorName": p["vendor_id"],
                "date": p["date"],
                "expected": p["expected"],
                "status": p["status"],
                "approvedBy": p.get("approved_by"),
                "lines": [
                    {
                        "sku": l["sku"],
                        "name": l["name"],
                        "orderedQty": l["ordered_qty"],
                        "receivedQty": l.get("received_qty", 0.0),
                        "cost": l["cost"]
                    } for l in p.get("lines", [])
                ]
            }
    raise HTTPException(status_code=404, detail="Purchase Order not found")

@router.post("")
async def create_purchase_order(data: PurchaseOrderCreate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, "create_purchase_order", f"{data.vendorId}_{len(data.lines)}")
    try:
        db = get_db()
        if db.is_connected():
            try:
                count = await db.purchaseorder.count()
                po_seq = 152 + count
                po_id = f"PO-2026-0{po_seq}"
                
                po = await db.purchaseorder.create(
                    data={
                        "id": po_id,
                        "vendor_id": data.vendorId,
                        "date": "2026-09-07",
                        "expected": data.expected,
                        "status": "Pending Approval",
                        "approved_by": None
                    }
                )
                
                lines_created = []
                for line in data.lines:
                    l = await db.purchaseorderline.create(
                        data={
                            "po_id": po_id,
                            "sku": line.sku,
                            "name": line.name,
                            "ordered_qty": line.qty,
                            "received_qty": 0.0,
                            "cost": line.cost
                        }
                    )
                    lines_created.append({
                        "sku": l.sku,
                        "name": l.name,
                        "orderedQty": l.ordered_qty,
                        "receivedQty": l.received_qty,
                        "cost": l.cost
                    })
                    
                res = {
                    "id": po_id,
                    "vendorId": data.vendorId,
                    "date": po.date,
                    "expected": po.expected,
                    "status": po.status,
                    "lines": lines_created
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except Exception:
                pass
                
        # Fallback
        po_seq = 152 + len(SEED_POS)
        po_id = f"PO-2026-0{po_seq}"
        lines_created = [
            {"sku": l.sku, "name": l.name, "orderedQty": l.qty, "receivedQty": 0.0, "cost": l.cost}
            for l in data.lines
        ]
        res = {
            "id": po_id,
            "vendorId": data.vendorId,
            "date": "2026-09-07",
            "expected": data.expected,
            "status": "Pending Approval",
            "lines": lines_created
        }
        SEED_POS.append({
            "id": po_id, "vendor_id": data.vendorId, "date": "2026-09-07", "expected": data.expected,
            "status": "Pending Approval", "approved_by": None, "lines": lines_created
        })
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res)
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{po_id}/approve")
async def approve_purchase_order(po_id: str, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, f"approve_po_{po_id}")
    try:
        db = get_db()
        approver = getattr(current_user, 'full_name', 'Arjun M.') if not isinstance(current_user, dict) else current_user.get('full_name', 'Arjun M.')
        if db.is_connected():
            try:
                po = await db.purchaseorder.find_unique(where={"id": po_id})
                if not po:
                    raise HTTPException(status_code=404, detail="Purchase order not found")
                
                updated_po = await db.purchaseorder.update(
                    where={"id": po_id},
                    data={
                        "status": "Approved",
                        "approved_by": approver
                    }
                )
                res = {
                    "id": po_id,
                    "status": updated_po.status,
                    "approvedBy": updated_po.approved_by,
                    "message": f"{po_id} approved and sent to vendor"
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception:
                pass
                
        # Fallback
        for p in SEED_POS:
            if p["id"] == po_id:
                p["status"] = "Approved"
                p["approved_by"] = approver
                res = {
                    "id": po_id,
                    "status": "Approved",
                    "approvedBy": approver,
                    "message": f"{po_id} approved and sent to vendor"
                }
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

