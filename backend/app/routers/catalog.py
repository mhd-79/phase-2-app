from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from typing import List, Optional
import csv
import io
from datetime import date, datetime, timezone
from app.schemas import ItemSchema, ItemCreate, ItemUpdate, CategorySchema, CategoryCreate, UploadPreviewResult
from app.security import get_current_user, require_module
from app.database import db, is_default_store

router = APIRouter(prefix="/catalog", tags=["Catalog"])

DEFAULT_CATEGORIES = ["Beverages", "Snacks", "Dairy", "Bakery", "Grocery", "Personal Care"]

def _to_dt(d: Optional[date]) -> Optional[datetime]:
    """Calendar date -> midnight UTC datetime (how Mfg / Exp dates are stored)."""
    return datetime(d.year, d.month, d.day, tzinfo=timezone.utc) if d else None

def _to_date(v: Optional[datetime]) -> Optional[date]:
    return v.date() if v else None

def _batch_no_supported() -> bool:
    """False while the generated Prisma client predates Item.batch_no (run `prisma generate` + `prisma db push`)."""
    try:
        from prisma.models import Item as _ItemModel
        return "batch_no" in _ItemModel.model_fields
    except Exception:
        return False

def _clean_batch_no(v: Optional[str]) -> Optional[str]:
    return (v or "").strip() or None

def _batch_data(batch_no: Optional[str]) -> dict:
    """Item.batch_no for a create / update; blank clears it. Without the column, a blank value is simply not stored."""
    value = _clean_batch_no(batch_no)
    if _batch_no_supported():
        return {"batch_no": value}
    if value:
        raise HTTPException(status_code=500, detail="Batch No. cannot be saved yet. Run `prisma generate` and `prisma db push`, then restart the API.")
    return {}

@router.get("/items", response_model=List[ItemSchema])
async def get_items(category: Optional[str] = None, search: Optional[str] = None):
    items = await db.item.find_many(where={"is_active": True})
    # an item without its own batch number shows its earliest-expiring open batch (from goods receipts / the Batch table)
    batch_by_sku: dict = {}
    try:
        for b in sorted(await db.batch.find_many(where={"qty": {"gt": 0}}), key=lambda x: x.expiry_date or "9999"):
            batch_by_sku.setdefault(b.sku, b.batch_no)
    except Exception:
        batch_by_sku = {}
    result = []
    for i in items:
        if category and category != "All" and i.category_name != category:
            continue
        if search:
            term = search.lower()
            if term not in i.name.lower() and term not in i.sku.lower() and term not in i.barcode.lower():
                continue
        result.append(ItemSchema(
            sku=i.sku,
            barcode=i.barcode,
            name=i.name,
            category_name=i.category_name,
            price=i.price,
            wholesale_price=i.wholesale_price,
            cost_price=i.cost_price,
            tax_rate=i.tax_rate,
            stock=i.stock,
            min_stock=i.min_stock,
            pricing_method=i.pricing_method,
            unit=i.unit,
            is_active=i.is_active, mfg_date=_to_date(getattr(i, "mfg_date", None)), exp_date=_to_date(getattr(i, "exp_date", None)),
            batch_no=getattr(i, "batch_no", None) or batch_by_sku.get(i.sku)
        ))
    result.sort(key=lambda r: r.sku)      # Item Master default order: SKU ascending
    return result

@router.get("/items/{sku}", response_model=ItemSchema)
async def get_item_by_sku(sku: str):
    i = await db.item.find_unique(where={"sku": sku})
    if not i:
        raise HTTPException(status_code=404, detail="Item not found")
    return ItemSchema(
        sku=i.sku, barcode=i.barcode, name=i.name, category_name=i.category_name,
        price=i.price, wholesale_price=i.wholesale_price, cost_price=i.cost_price,
        tax_rate=i.tax_rate, stock=i.stock, min_stock=i.min_stock,
        pricing_method=i.pricing_method, unit=i.unit, is_active=i.is_active, mfg_date=_to_date(getattr(i, "mfg_date", None)), exp_date=_to_date(getattr(i, "exp_date", None)),
        batch_no=getattr(i, "batch_no", None)
    )

@router.post("/items", response_model=ItemSchema)
async def create_item(item: ItemCreate, user = Depends(require_module("items_stock", "stock_upload"))):
    existing = await db.item.find_unique(where={"sku": item.sku})
    if existing:
        raise HTTPException(status_code=400, detail="Item SKU already exists")
    i = await db.item.create(data={
        "sku": item.sku,
        "barcode": item.barcode,
        "name": item.name,
        "category_name": item.category_name,
        "price": item.price,
        "wholesale_price": item.wholesale_price,
        "cost_price": item.cost_price,
        "tax_rate": item.tax_rate,
        "stock": item.stock,
        "min_stock": item.min_stock,
        "pricing_method": item.pricing_method,
        "unit": item.unit,
        "mfg_date": _to_dt(item.mfg_date),
        "exp_date": _to_dt(item.exp_date),
        **_batch_data(item.batch_no),
        "is_active": True
    })
    return ItemSchema(
        sku=i.sku, barcode=i.barcode, name=i.name, category_name=i.category_name,
        price=i.price, wholesale_price=i.wholesale_price, cost_price=i.cost_price,
        tax_rate=i.tax_rate, stock=i.stock, min_stock=i.min_stock,
        pricing_method=i.pricing_method, unit=i.unit, is_active=i.is_active, mfg_date=_to_date(getattr(i, "mfg_date", None)), exp_date=_to_date(getattr(i, "exp_date", None)),
        batch_no=getattr(i, "batch_no", None)
    )

@router.put("/items/{sku}", response_model=ItemSchema)
async def update_item(sku: str, item: ItemUpdate, user = Depends(require_module("items_stock", "stock_upload"))):
    existing = await db.item.find_unique(where={"sku": sku})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    data = item.dict(exclude_unset=True)
    if "batch_no" in data:
        data.pop("batch_no")
        data.update(_batch_data(item.batch_no))
    if "mfg_date" in data or "exp_date" in data:
        mfg = data["mfg_date"] if "mfg_date" in data else _to_date(getattr(existing, "mfg_date", None))
        exp = data["exp_date"] if "exp_date" in data else _to_date(getattr(existing, "exp_date", None))
        if mfg and exp and exp < mfg:
            raise HTTPException(status_code=400, detail="Expiry Date cannot be earlier than Manufacturing Date")
        for key in ("mfg_date", "exp_date"):
            if key in data:
                data[key] = _to_dt(data[key])
    i = await db.item.update(where={"sku": sku}, data=data)
    return ItemSchema(
        sku=i.sku, barcode=i.barcode, name=i.name, category_name=i.category_name,
        price=i.price, wholesale_price=i.wholesale_price, cost_price=i.cost_price,
        tax_rate=i.tax_rate, stock=i.stock, min_stock=i.min_stock,
        pricing_method=i.pricing_method, unit=i.unit, is_active=i.is_active, mfg_date=_to_date(getattr(i, "mfg_date", None)), exp_date=_to_date(getattr(i, "exp_date", None)),
        batch_no=getattr(i, "batch_no", None)
    )

@router.delete("/items/{sku}")
async def delete_item(sku: str, user = Depends(require_module("items_stock"))):
    existing = await db.item.find_unique(where={"sku": sku})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.item.delete(where={"sku": sku})
    return {"message": f"Item {sku} deleted", "sku": sku}

@router.get("/categories", response_model=List[str])
async def get_categories():
    db_cats = await db.category.find_many()
    custom = [c.name for c in db_cats]
    merged = list(dict.fromkeys((DEFAULT_CATEGORIES if is_default_store() else []) + custom))
    return merged

@router.post("/categories", response_model=CategorySchema)
async def create_category(req: CategoryCreate, user = Depends(require_module("items_stock", "stock_upload"))):
    existing = await db.category.find_unique(where={"name": req.name})
    if existing:
        return CategorySchema(id=existing.id, name=existing.name)
    c = await db.category.create(data={"name": req.name})
    return CategorySchema(id=c.id, name=c.name)

def _num(v) -> Optional[float]:
    """Optional numeric upload cell: blank / non-numeric -> None (meaning 'leave unchanged' for an existing item)."""
    try:
        return float(str(v).strip()) if str(v).strip() != "" else None
    except ValueError:
        return None

@router.post("/upload/preview", response_model=UploadPreviewResult)
async def upload_preview(file: UploadFile = File(...), user = Depends(require_module("stock_upload"))):
    contents = await file.read()
    text = contents.decode("utf-8-sig", errors="ignore")
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    
    existing_items = await db.item.find_many()
    existing_skus = {i.sku: i for i in existing_items}
    
    results = []
    counts = {"new": 0, "update": 0, "error": 0}
    
    for row in rows:
        norm = {k.strip().lower(): (v or "").strip() for k, v in row.items() if k}
        sku = norm.get("sku", "")
        name = norm.get("name", "")
        sp = norm.get("selling_price", norm.get("price", ""))
        qty = norm.get("opening_qty", norm.get("stock", ""))
        cp = norm.get("cost_price", norm.get("cost", ""))
        wp = norm.get("wholesale_price", norm.get("wholesale", ""))
        
        missing = []
        if not sku: missing.append("sku")
        if not name: missing.append("name")
        if not sp: missing.append("selling_price")
        if not qty: missing.append("opening_qty")
        
        row_dict = {
            "sku": sku,
            "barcode": norm.get("barcode", ""),
            "name": name,
            "category": norm.get("category", "Grocery"),
            "selling_price": float(sp) if sp and sp.replace(".","",1).isdigit() else 0.0,
            "cost_price": _num(cp),
            "wholesale_price": _num(wp),
            "tax_rate": float(norm.get("tax_rate", norm.get("tax", 0))) if norm.get("tax_rate", norm.get("tax")) else 0.0,
            "opening_qty": float(qty) if qty and qty.replace(".","",1).isdigit() else 0.0
        }
        
        if missing:
            counts["error"] += 1
            results.append({"status": "error", "reason": f"Missing {', '.join(missing)}", "row": row_dict})
        elif sku in existing_skus:
            counts["update"] += 1
            results.append({"status": "update", "reason": "Existing item - stock refresh", "row": row_dict})
        else:
            counts["new"] += 1
            results.append({"status": "new", "reason": "New SKU entry", "row": row_dict})
            
    return UploadPreviewResult(
        total_rows=len(rows),
        new_count=counts["new"],
        update_count=counts["update"],
        error_count=counts["error"],
        rows=results
    )

@router.post("/upload/commit")
async def upload_commit(payload: List[dict], user = Depends(require_module("stock_upload"))):
    applied = 0
    for r in payload:
        status = r.get("status")
        row = r.get("row", {})
        sku = row.get("sku")
        if not sku or status == "error":
            continue
        
        price = float(row.get("selling_price", 0))
        tax = float(row.get("tax_rate", 0))
        stock = float(row.get("opening_qty", 0))
        name = row.get("name", sku)
        category = row.get("category", "Grocery")
        barcode = row.get("barcode", "")
        
        cost = _num(row.get("cost_price"))
        wholesale = _num(row.get("wholesale_price"))

        if category and not await db.category.find_unique(where={"name": category}) and category not in DEFAULT_CATEGORIES:
            await db.category.create(data={"name": category})   # a category first seen in an upload is added to the database

        existing = await db.item.find_unique(where={"sku": sku})
        if existing:
            # Existing item: refresh quantity, selling price, cost price and wholesale price (blank cells leave a value as is)
            update = {"stock": stock, "price": price if price > 0 else existing.price}
            if cost is not None:
                update["cost_price"] = cost
            if wholesale is not None:
                update["wholesale_price"] = wholesale
            await db.item.update(where={"sku": sku}, data=update)
        else:
            await db.item.create(data={
                "sku": sku,
                "barcode": barcode,
                "name": name,
                "category_name": category,
                "price": price,
                "cost_price": cost if cost is not None else 0.0,
                "wholesale_price": wholesale,
                "tax_rate": tax,
                "stock": stock,
                "min_stock": max(10.0, stock * 0.2),
                "pricing_method": "qty",
                "unit": "pcs",
                "is_active": True
            })
        applied += 1
    return {"message": f"{applied} stock item(s) committed successfully", "applied_count": applied}
