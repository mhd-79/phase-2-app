from fastapi import APIRouter, HTTPException, Depends
from typing import List
import json
from app.schemas import DiscountSchema, DiscountCreate
from app.security import require_admin
from app.database import db

router = APIRouter(prefix="/discounts", tags=["Discounts"])

@router.get("", response_model=List[DiscountSchema])
async def get_discounts():
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

@router.post("", response_model=DiscountSchema)
async def create_discount(req: DiscountCreate, user = Depends(require_admin)):
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
    return DiscountSchema(
        id=d.id, name=d.name, type=d.type, value=d.value,
        applies_to=d.applies_to, product_skus=req.product_skus,
        start_date=d.start_date, end_date=d.end_date, status=d.status
    )

@router.put("/{discount_id}", response_model=DiscountSchema)
async def update_discount(discount_id: str, req: DiscountCreate, user = Depends(require_admin)):
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
    return DiscountSchema(
        id=d.id, name=d.name, type=d.type, value=d.value,
        applies_to=d.applies_to, product_skus=req.product_skus,
        start_date=d.start_date, end_date=d.end_date, status=d.status
    )

@router.delete("/{discount_id}")
async def delete_discount(discount_id: str, user = Depends(require_admin)):
    existing = await db.discount.find_unique(where={"id": discount_id})
    if existing:
        await db.discount.delete(where={"id": discount_id})
    return {"message": "Discount rule deleted"}
