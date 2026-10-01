import random
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db
from app.schemas import PurchaseReturnCreate
from app.security import get_current_user
from app.idempotency import enforce_idempotency, idempotency_manager

router = APIRouter(prefix="/purchase-returns", tags=["purchase-returns"])

_FALLBACK_RETURNS = []

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
                        
                pr = await db.purchasereturn.create(
                    data={
                        "id": dn_id,
                        "vendor_id": data.vendorId,
                        "date": "2026-09-07",
                        "reason": data.reason,
                        "total": total_refund
                    }
                )
                
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
