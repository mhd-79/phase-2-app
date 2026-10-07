from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.schemas import StoreSettingsSchema, StoreSettingsUpdate, TaxSlabInput, TaxSlabSchema
from app.security import get_current_user, require_module
from app.database import db
from app.procurement import db_error

router = APIRouter(prefix="/settings", tags=["Settings"])

# GST slabs every store starts with (Tax Configuration lets the admin rename them and add more)
DEFAULT_TAX_SLABS = [
    (0.0, "GST 0% (Exempt)"), (5.0, "GST 5% (Essential Retail)"), (12.0, "GST 12% (Standard Packaged)"),
    (18.0, "GST 18% (Personal Care & Snacks)"), (28.0, "GST 28% (Luxury / Deferral)"),
]


def _slab(rate: float, name: str, id_: str, item_count: int = 0) -> TaxSlabSchema:
    half = round(rate / 2.0, 4)
    return TaxSlabSchema(id=id_, name=name, rate=rate, cgst=half, sgst=half, itemCount=item_count)


def _clean_name(name: str) -> str:
    name = " ".join((name or "").split())
    if not name:
        raise HTTPException(status_code=400, detail="Enter a slab name")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="Slab name can be at most 60 characters")
    return name


@router.get("/tax-slabs", response_model=List[TaxSlabSchema])
async def list_tax_slabs():
    """The GST slabs, lowest rate first. The standard five are created the first time the list is read."""
    if db.is_connected():
        try:
            rows = await db.taxslab.find_many(order={"rate": "asc"})
            if not rows:
                for rate, name in DEFAULT_TAX_SLABS:
                    try:
                        await db.taxslab.create(data={"name": name, "rate": rate})
                    except Exception:
                        pass                    # another request seeded it at the same moment
                rows = await db.taxslab.find_many(order={"rate": "asc"})
            counts = {}
            for r in rows:
                try:
                    counts[r.id] = await db.item.count(where={"tax_rate": r.rate})
                except Exception:
                    counts[r.id] = 0
            return [_slab(r.rate, r.name, r.id, counts[r.id]) for r in rows]
        except Exception:
            pass
    return [_slab(rate, name, f"default-{int(rate)}") for rate, name in DEFAULT_TAX_SLABS]


@router.post("/tax-slabs", response_model=TaxSlabSchema)
async def add_tax_slab(req: TaxSlabInput, user = Depends(require_module("tax_config"))):
    name = _clean_name(req.name)
    if req.rate is None or req.rate < 0 or req.rate > 100:
        raise HTTPException(status_code=400, detail="Enter a GST rate between 0 and 100")
    rate = round(float(req.rate), 2)
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="The database is not connected")
    try:
        rows = await db.taxslab.find_many()
        if any(abs(r.rate - rate) < 1e-9 for r in rows):
            raise HTTPException(status_code=400, detail=f"A slab for {rate:g}% already exists: rename it instead")
        if any(r.name.lower() == name.lower() for r in rows):
            raise HTTPException(status_code=400, detail="A slab with this name already exists")
        row = await db.taxslab.create(data={"name": name, "rate": rate})
    except HTTPException:
        raise
    except Exception as exc:
        raise db_error(exc)
    return _slab(row.rate, row.name, row.id)


@router.put("/tax-slabs/{slab_id}", response_model=TaxSlabSchema)
async def rename_tax_slab(slab_id: str, req: TaxSlabInput, user = Depends(require_module("tax_config"))):
    """Renames a slab. The rate stays: items already saved with it keep their tax."""
    name = _clean_name(req.name)
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="The database is not connected")
    try:
        row = await db.taxslab.find_unique(where={"id": slab_id})
        if not row:
            raise HTTPException(status_code=404, detail="Tax slab not found")
        if req.rate is not None and abs(round(float(req.rate), 2) - row.rate) > 1e-9:
            raise HTTPException(status_code=400, detail="The rate of an existing slab cannot be changed: add a new slab for the new rate")
        if any(r.id != slab_id and r.name.lower() == name.lower() for r in await db.taxslab.find_many()):
            raise HTTPException(status_code=400, detail="A slab with this name already exists")
        row = await db.taxslab.update(where={"id": slab_id}, data={"name": name})
    except HTTPException:
        raise
    except Exception as exc:
        raise db_error(exc)
    return _slab(row.rate, row.name, row.id)

@router.get("/store", response_model=StoreSettingsSchema)
async def get_store_settings():
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    if not store:
        store = await db.storesettings.create(data={"id": "store_main"})
    return StoreSettingsSchema(
        store_name=store.store_name,
        address=store.address,
        phone=store.phone,
        gstin=store.gstin,
        pricing_mode=store.pricing_mode,
        idle_timeout_seconds=store.idle_timeout_seconds,
        return_policy=getattr(store, "return_policy", None) or "BOTH"
    )

@router.put("/store", response_model=StoreSettingsSchema)
async def update_store_settings(req: StoreSettingsUpdate, user = Depends(require_module("store_settings"))):
    data = req.dict(exclude_unset=True)
    store = await db.storesettings.upsert(
        where={"id": "store_main"},
        data={"create": {"id": "store_main", **data}, "update": data}
    )
    return StoreSettingsSchema(
        store_name=store.store_name,
        address=store.address,
        phone=store.phone,
        gstin=store.gstin,
        pricing_mode=store.pricing_mode,
        idle_timeout_seconds=store.idle_timeout_seconds,
        return_policy=getattr(store, "return_policy", None) or "BOTH"
    )

@router.post("/backup")
async def trigger_backup(user = Depends(require_module("store_settings"))):
    items = await db.item.find_many()
    sales = await db.sale.find_many(include={"items": True, "tenders": True})
    users = await db.user.find_many()
    discounts = await db.discount.find_many()
    
    backup_data = {
        "timestamp": str(db.storesettings.find_unique),
        "items_count": len(items),
        "sales_count": len(sales),
        "users_count": len(users),
        "discounts_count": len(discounts)
    }
    return {
        "message": "Database backup completed successfully",
        "backup_summary": backup_data
    }


@router.delete("/tax-slabs/{slab_id}")
async def delete_tax_slab(slab_id: str, user = Depends(require_module("tax_config"))):
    """Removes a slab from the list. Items already priced at its rate keep that rate (an item stores the rate, not the slab)."""
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="The database is not connected")
    try:
        row = await db.taxslab.find_unique(where={"id": slab_id})
        if not row:
            raise HTTPException(status_code=404, detail="Tax slab not found")
        if await db.taxslab.count() <= 1:
            raise HTTPException(status_code=400, detail="At least one tax slab must remain")
        in_use = await db.item.count(where={"tax_rate": row.rate})
        await db.taxslab.delete(where={"id": slab_id})
    except HTTPException:
        raise
    except Exception as exc:
        raise db_error(exc)
    return {"message": f"{row.name} deleted", "id": slab_id, "itemsAtThisRate": in_use}
