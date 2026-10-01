from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from typing import List, Optional
import csv
import io
from app.schemas import ItemSchema, ItemCreate, ItemUpdate, CategorySchema, CategoryCreate, UploadPreviewResult
from app.security import get_current_user, require_admin
from app.database import db

router = APIRouter(prefix="/catalog", tags=["Catalog"])

DEFAULT_CATEGORIES = ["Beverages", "Snacks", "Dairy", "Bakery", "Grocery", "Personal Care"]

@router.get("/items", response_model=List[ItemSchema])
async def get_items(category: Optional[str] = None, search: Optional[str] = None):
    items = await db.item.find_many(where={"is_active": True})
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
            is_active=i.is_active
        ))
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
        pricing_method=i.pricing_method, unit=i.unit, is_active=i.is_active
    )

@router.post("/items", response_model=ItemSchema)
async def create_item(item: ItemCreate, user = Depends(require_admin)):
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
        "is_active": True
    })
    return ItemSchema(
        sku=i.sku, barcode=i.barcode, name=i.name, category_name=i.category_name,
        price=i.price, wholesale_price=i.wholesale_price, cost_price=i.cost_price,
        tax_rate=i.tax_rate, stock=i.stock, min_stock=i.min_stock,
        pricing_method=i.pricing_method, unit=i.unit, is_active=i.is_active
    )

@router.put("/items/{sku}", response_model=ItemSchema)
async def update_item(sku: str, item: ItemUpdate, user = Depends(require_admin)):
    existing = await db.item.find_unique(where={"sku": sku})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    data = item.dict(exclude_unset=True)
    i = await db.item.update(where={"sku": sku}, data=data)
    return ItemSchema(
        sku=i.sku, barcode=i.barcode, name=i.name, category_name=i.category_name,
        price=i.price, wholesale_price=i.wholesale_price, cost_price=i.cost_price,
        tax_rate=i.tax_rate, stock=i.stock, min_stock=i.min_stock,
        pricing_method=i.pricing_method, unit=i.unit, is_active=i.is_active
    )

@router.get("/categories", response_model=List[str])
async def get_categories():
    db_cats = await db.category.find_many()
    custom = [c.name for c in db_cats]
    merged = list(dict.fromkeys(DEFAULT_CATEGORIES + custom))
    return merged

@router.post("/categories", response_model=CategorySchema)
async def create_category(req: CategoryCreate, user = Depends(require_admin)):
    existing = await db.category.find_unique(where={"name": req.name})
    if existing:
        return CategorySchema(id=existing.id, name=existing.name)
    c = await db.category.create(data={"name": req.name})
    return CategorySchema(id=c.id, name=c.name)

@router.post("/upload/preview", response_model=UploadPreviewResult)
async def upload_preview(file: UploadFile = File(...), user = Depends(require_admin)):
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
async def upload_commit(payload: List[dict], user = Depends(require_admin)):
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
        
        existing = await db.item.find_unique(where={"sku": sku})
        if existing:
            await db.item.update(where={"sku": sku}, data={"stock": stock, "price": price if price > 0 else existing.price})
        else:
            await db.item.create(data={
                "sku": sku,
                "barcode": barcode,
                "name": name,
                "category_name": category,
                "price": price,
                "tax_rate": tax,
                "stock": stock,
                "min_stock": max(10.0, stock * 0.2),
                "pricing_method": "qty",
                "unit": "pcs",
                "is_active": True
            })
        applied += 1
    return {"message": f"{applied} stock item(s) committed successfully", "applied_count": applied}
