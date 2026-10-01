import json
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List
from app.schemas import DiscountSchema, DiscountCreate
from app.security import require_admin
from app.database import db
from app.idempotency import enforce_idempotency, idempotency_manager

router = APIRouter(prefix="/discounts", tags=["Discounts"])

_FALLBACK_DISCOUNTS = []

@router.get("", response_model=List[DiscountSchema])
async def get_discounts():
    if db.is_connected():
        try:
            discounts = await db.discount.find_many()
            result = []
            for d in discounts:
                skus = []
                try:
                    skus = json.loads(d.product_skus or "[]")
                except Exception:
                    skus = []
                result.append(DiscountSchema(
                    id=d.id,
                    name=d.name,
                    type=d.type,
                    value=d.value,
                    applies_to=d.applies_to,
                    product_skus=skus,
                    start_date=d.start_date,
                    end_date=d.end_date,
                    status=d.status
                ))
            return result
        except Exception:
            pass
    return _FALLBACK_DISCOUNTS

@router.post("", response_model=DiscountSchema)
async def create_discount(req: DiscountCreate, request: Request, user = Depends(require_admin)):
    lock_key = await enforce_idempotency(request, "create_discount", req.name)
    try:
        if db.is_connected():
            try:
                d = await db.discount.create(data={
                    "name": req.name,
                    "type": req.type,
                    "value": req.value,
                    "applies_to": req.applies_to,
                    "product_skus": json.dumps(req.product_skus or []),
                    "start_date": req.start_date,
                    "end_date": req.end_date,
                    "status": req.status
                })
                res = DiscountSchema(
                    id=d.id, name=d.name, type=d.type, value=d.value,
                    applies_to=d.applies_to, product_skus=req.product_skus,
                    start_date=d.start_date, end_date=d.end_date, status=d.status
                )
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res.dict())
                return res
            except Exception:
                pass
                
        # Fallback
        res = DiscountSchema(
            id=f"disc-{len(_FALLBACK_DISCOUNTS)+1}",
            name=req.name,
            type=req.type,
            value=req.value,
            applies_to=req.applies_to,
            product_skus=req.product_skus or [],
            start_date=req.start_date,
            end_date=req.end_date,
            status=req.status
        )
        _FALLBACK_DISCOUNTS.append(res)
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res.dict())
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{discount_id}", response_model=DiscountSchema)
async def update_discount(discount_id: str, req: DiscountCreate, request: Request, user = Depends(require_admin)):
    lock_key = await enforce_idempotency(request, f"update_discount_{discount_id}")
    try:
        if db.is_connected():
            try:
                existing = await db.discount.find_unique(where={"id": discount_id})
                if not existing:
                    raise HTTPException(status_code=404, detail="Discount not found")
                d = await db.discount.update(
                    where={"id": discount_id},
                    data={
                        "name": req.name,
                        "type": req.type,
                        "value": req.value,
                        "applies_to": req.applies_to,
                        "product_skus": json.dumps(req.product_skus or []),
                        "start_date": req.start_date,
                        "end_date": req.end_date,
                        "status": req.status
                    }
                )
                res = DiscountSchema(
                    id=d.id, name=d.name, type=d.type, value=d.value,
                    applies_to=d.applies_to, product_skus=req.product_skus,
                    start_date=d.start_date, end_date=d.end_date, status=d.status
                )
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res.dict())
                return res
            except HTTPException:
                raise
            except Exception:
                pass
                
        # Fallback
        for d in _FALLBACK_DISCOUNTS:
            if d.id == discount_id:
                d.name = req.name
                d.type = req.type
                d.value = req.value
                d.applies_to = req.applies_to
                d.product_skus = req.product_skus or []
                d.start_date = req.start_date
                d.end_date = req.end_date
                d.status = req.status
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, d.dict())
                return d
                
        res = DiscountSchema(
            id=discount_id, name=req.name, type=req.type, value=req.value,
            applies_to=req.applies_to, product_skus=req.product_skus or [],
            start_date=req.start_date, end_date=req.end_date, status=req.status
        )
        _FALLBACK_DISCOUNTS.append(res)
        if lock_key:
            await idempotency_manager.release_lock(lock_key, res.dict())
        return res
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{discount_id}")
async def delete_discount(discount_id: str, user = Depends(require_admin)):
    if db.is_connected():
        try:
            existing = await db.discount.find_unique(where={"id": discount_id})
            if existing:
                await db.discount.delete(where={"id": discount_id})
        except Exception:
            pass
            
    global _FALLBACK_DISCOUNTS
    _FALLBACK_DISCOUNTS = [d for d in _FALLBACK_DISCOUNTS if d.id != discount_id]
    return {"message": "Discount rule deleted"}
