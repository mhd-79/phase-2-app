from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
import json
from app.schemas import DiscountSchema, DiscountCreate
from app.security import require_admin
from app.database import db
from app.idempotency import idempotency_manager, generate_fingerprint

router = APIRouter(prefix="/discounts", tags=["Discounts"])

@router.get(
    "",
    response_model=List[DiscountSchema],
    summary="List Active & Inactive Discount Rules",
    description="Retrieves all configured promotional discount rules (flat or percentage), target product SKUs, and validity dates."
)
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

@router.post(
    "",
    response_model=DiscountSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create Promotional Discount Rule",
    description="Admin-only endpoint to create a new discount rule (flat amount or percentage rate) applying to all products or selected SKUs."
)
async def create_discount(req: DiscountCreate, user = Depends(require_admin)):
    idem_key = generate_fingerprint("create_discount", user.username, req)

    async def do_create():
        # Check if identical active discount exists
        existing = await db.discount.find_first(where={"name": req.name, "type": req.type, "value": req.value})
        if existing:
            skus = []
            try:
                skus = json.loads(existing.product_skus or "[]")
            except Exception:
                pass
            return DiscountSchema(
                id=existing.id, name=existing.name, type=existing.type, value=existing.value,
                applies_to=existing.applies_to, product_skus=skus,
                start_date=existing.start_date, end_date=existing.end_date, status=existing.status
            )

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

    res, _ = await idempotency_manager.execute(idem_key, do_create, status_code=status.HTTP_201_CREATED)
    return res

@router.put(
    "/{discount_id}",
    response_model=DiscountSchema,
    summary="Update Discount Rule",
    description="Admin-only endpoint to update an existing discount rule configuration, percentage/flat value, status, or date range."
)
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

@router.delete(
    "/{discount_id}",
    summary="Delete Discount Rule",
    description="Admin-only endpoint to permanently remove a promotional discount rule."
)
async def delete_discount(discount_id: str, user = Depends(require_admin)):
    existing = await db.discount.find_unique(where={"id": discount_id})
    if existing:
        await db.discount.delete(where={"id": discount_id})
    return {"message": "Discount rule deleted"}
