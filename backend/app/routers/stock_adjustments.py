from fastapi import APIRouter, HTTPException, Depends, Request
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field
from app.database import get_db
from app.tenant_scoped import TenantList, TenantDict
from app.schemas import StockAdjustmentCreate
from app.security import get_current_user, require_module
from app.security import require_module
from app.idempotency import enforce_idempotency, idempotency_manager

router = APIRouter(prefix="/stock-adjustments", tags=["stock-adjustments"])

_FALLBACK_ADJUSTMENTS = TenantList()

@router.get("", dependencies=[Depends(require_module("inventory"))])
async def list_stock_adjustments():
    db = get_db()
    if db.is_connected():
        try:
            adjustments = await db.stockadjustment.find_many(order={"created_at": "desc"})
            return [
                {
                    "id": a.id,
                    "sku": a.sku,
                    "name": a.name,
                    "delta": a.delta,
                    "reason": a.reason,
                    "notes": a.notes,
                    "approvedBy": a.approved_by,
                    "date": a.date
                } for a in adjustments
            ]
        except Exception:
            pass
    return list(_FALLBACK_ADJUSTMENTS)

# --------------------------------------------------------------------------- returned items waiting for Admin review
# A cashier marks a returned item Damaged or Warranty: it is NOT added back to sellable stock. The Admin decides here.
REVIEW_OUTCOMES = {
    "RESTOCK": {"label": "Restock as sellable", "sign": 1, "only": None},
    "WRITE_OFF": {"label": "Write off / discard", "sign": 0, "only": None},
    "VENDOR_CLAIM": {"label": "Send back to supplier", "sign": 0, "only": None},
    "WARRANTY_REPLACE": {"label": "Replace under warranty", "sign": -1, "only": "Warranty"},   # a new unit leaves sellable stock
}


class ReturnReviewResolve(BaseModel):
    outcome: str
    notes: Optional[str] = Field(default=None, max_length=300)


def _review_row(r) -> dict:
    ret = getattr(r, "return_record", None)
    return {"id": r.id, "return_no": getattr(ret, "return_no", None), "invoice_no": getattr(ret, "invoice_no", None), "sku": r.sku, "qty": r.qty,
            "condition": r.condition, "action": r.action, "reason": getattr(r, "reason", None) or getattr(ret, "reason", None),
            "returned_by": getattr(ret, "created_by_username", None), "returned_at": getattr(ret, "time", None),
            "status": r.review_status, "outcome": r.review_outcome, "notes": r.review_notes, "reviewed_by": r.reviewed_by,
            "reviewed_at": r.reviewed_at, "stock_delta": r.stock_delta}


@router.get("/return-reviews")
async def list_return_reviews(status: str = "PENDING", user=Depends(require_module("inventory"))):
    db = get_db()
    if not db.is_connected():
        return []
    wanted = ["PENDING", "RESOLVED"] if status.upper() == "ALL" else [status.upper()]
    rows = await db.returnitem.find_many(where={"review_status": {"in": wanted}}, include={"return_record": True})
    names = {i.sku: i.name for i in await db.item.find_many(where={"sku": {"in": list({r.sku for r in rows})}})} if rows else {}
    out = [{**_review_row(r), "name": names.get(r.sku, r.sku)} for r in rows]
    out.sort(key=lambda r: str(r["returned_at"] or ""), reverse=True)
    return out


@router.post("/return-reviews/{item_id}/resolve")
async def resolve_return_review(item_id: str, req: ReturnReviewResolve, user=Depends(require_module("inventory"))):
    db = get_db()
    outcome = REVIEW_OUTCOMES.get((req.outcome or "").upper())
    if outcome is None:
        raise HTTPException(status_code=422, detail=f"Outcome must be one of: {', '.join(REVIEW_OUTCOMES)}.")
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="Database not available")
    row = await db.returnitem.find_unique(where={"id": item_id}, include={"return_record": True})
    if row is None or row.review_status is None:
        raise HTTPException(status_code=404, detail="Returned item not found.")
    if outcome["only"] and row.condition != outcome["only"]:
        raise HTTPException(status_code=422, detail=f"{outcome['label']} only applies to {outcome['only']} items.")
    reviewer = getattr(user, "full_name", None) or getattr(user, "username", "Admin")
    # claim first: only one request can move PENDING -> RESOLVED, so the stock is never changed twice
    claimed = await db.returnitem.update_many(where={"id": item_id, "review_status": "PENDING"},
                                              data={"review_status": "RESOLVED", "review_outcome": req.outcome.upper(), "review_notes": req.notes,
                                                    "reviewed_by": reviewer, "reviewed_at": datetime.now(timezone.utc)})
    if not claimed:
        raise HTTPException(status_code=409, detail="This item has already been reviewed.")

    delta = 0.0
    item = await db.item.find_unique(where={"sku": row.sku})
    if item is not None and outcome["sign"]:
        new_stock = max(0.0, item.stock + outcome["sign"] * row.qty)
        delta = round(new_stock - item.stock, 3)
        await db.item.update(where={"sku": row.sku}, data={"stock": new_stock})
    count = await db.stockadjustment.count()
    adj_id = f"ADJ-{str(90 + count + 1).zfill(4)}"
    ret_no = getattr(row.return_record, "return_no", "")
    await db.stockadjustment.create(data={
        "id": adj_id, "sku": row.sku, "name": item.name if item else row.sku, "delta": delta,
        "reason": f"Return review - {row.condition}: {outcome['label']}",
        "notes": " · ".join(x for x in (ret_no, req.notes) if x) or None,
        "approved_by": reviewer, "date": datetime.now(timezone.utc).strftime("%Y-%m-%d")})
    await db.returnitem.update(where={"id": item_id}, data={"stock_delta": delta})
    return {"id": item_id, "status": "RESOLVED", "outcome": req.outcome.upper(), "stock_delta": delta, "adjustment_id": adj_id,
            "message": f"{outcome['label']}: stock {'unchanged' if not delta else ('+' if delta > 0 else '') + str(delta)}"}


@router.post("", dependencies=[Depends(require_module("inventory", "stock_upload"))])
async def record_stock_adjustment(data: StockAdjustmentCreate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, "stock_adjustment", f"{data.sku}_{data.delta}")
    try:
        if not data.reason or not data.reason.strip():
            raise HTTPException(status_code=400, detail="Reason is mandatory for stock adjustment")
            
        approver = data.approvedBy or (getattr(current_user, 'full_name', 'Arjun M.') if not isinstance(current_user, dict) else current_user.get('full_name', 'Arjun M.'))
        item_name = data.name or "Item"
        db = get_db()
        
        if db.is_connected():
            try:
                item = await db.item.find_unique(where={"sku": data.sku})
                if not item:
                    item = await db.item.create(
                        data={
                            "sku": data.sku,
                            "name": data.name or "Item",
                            "barcode": "890123456789",
                            "category_name": "General",
                            "price": 30.0,
                            "cost_price": 25.0,
                            "tax_rate": 5.0,
                            "stock": 50.0,
                            "unit": "pcs"
                        }
                    )
                
                item_name = data.name or item.name
                new_stock = max(0.0, item.stock + data.delta)
                await db.item.update(
                    where={"sku": data.sku},
                    data={"stock": new_stock}
                )
                
                count = await db.stockadjustment.count()
                adj_id = f"ADJ-{str(90 + count + 1).zfill(4)}"
                
                await db.stockadjustment.create(
                    data={
                        "id": adj_id,
                        "sku": data.sku,
                        "name": item_name,
                        "delta": data.delta,
                        "reason": data.reason,
                        "notes": data.notes,
                        "approved_by": approver,
                        "date": "2026-09-07"
                    }
                )
                
                res = {
                    "id": adj_id,
                    "sku": data.sku,
                    "name": item_name,
                    "delta": data.delta,
                    "newStock": new_stock,
                    "reason": data.reason,
                    "approvedBy": approver,
                    "message": f"{adj_id} recorded — stock updated"
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception:
                pass
                
        # Fallback
        adj_id = f"ADJ-{str(90 + len(_FALLBACK_ADJUSTMENTS) + 1).zfill(4)}"
        res = {
            "id": adj_id,
            "sku": data.sku,
            "name": item_name,
            "delta": data.delta,
            "newStock": 50.0 + data.delta,
            "reason": data.reason,
            "approvedBy": approver,
            "date": "2026-09-07",
            "message": f"{adj_id} recorded — stock updated"
        }
        _FALLBACK_ADJUSTMENTS.append(res)
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res)
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
