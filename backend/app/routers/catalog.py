from fastapi import APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.responses import Response
from typing import List, Optional
import csv
import io
from app.schemas import ItemSchema, ItemCreate, ItemUpdate, CategorySchema, CategoryCreate, UploadPreviewResult
from app.security import get_current_user, require_admin
from app.database import db

router = APIRouter(prefix="/catalog", tags=["Catalog"])

DEFAULT_CATEGORIES = ["Beverages", "Snacks", "Dairy", "Bakery", "Grocery", "Personal Care"]

@router.get(
    "/items",
    response_model=List[ItemSchema],
    summary="List Active Catalog Items",
    description="Retrieves active stock catalog items with optional filtering by category name or search keyword (name, SKU, barcode)."
)
async def get_items(category: Optional[str] = None, search: Optional[str] = None):
    items = await db.item.find_many(where={"is_active": True})
    result = []
    for i in items:
        if category and category != "All" and i.category_name != category:
            continue
        if search:
            term = search.lower().strip()
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

@router.get(
    "/items/{sku}",
    response_model=ItemSchema,
    summary="Get Item Details by SKU",
    description="Fetch single product item details, price, tax rate, and stock level by unique SKU."
)
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

@router.post(
    "/items",
    response_model=ItemSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create Single Item (Quick-Add)",
    description="Admin-only endpoint to quick-add a single product item with SKU, barcode, name, category, pricing, tax rate, and opening quantity."
)
async def create_item(item: ItemCreate, user = Depends(require_admin)):
    existing = await db.item.find_unique(where={"sku": item.sku})
    if existing:
        raise HTTPException(status_code=400, detail="Item SKU already exists")
        
    # Ensure category exists in DB
    cat = await db.category.find_unique(where={"name": item.category_name})
    if not cat:
        await db.category.create(data={"name": item.category_name})
        
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

@router.put(
    "/items/{sku}",
    response_model=ItemSchema,
    summary="Update Item Details",
    description="Admin-only endpoint to update product pricing, stock quantity, category, or tax slab."
)
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

@router.get(
    "/categories",
    response_model=List[str],
    summary="Get List of Item Categories",
    description="Returns all default and custom categories stored permanently in database."
)
async def get_categories():
    db_cats = await db.category.find_many()
    items = await db.item.find_many()
    custom = [c.name for c in db_cats if c.name] + [i.category_name for i in items if i.category_name]
    merged = list(dict.fromkeys(DEFAULT_CATEGORIES + custom))
    return merged

@router.post(
    "/categories",
    response_model=CategorySchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create New Product Category",
    description="Admin-only endpoint to permanently save a new category in database, immediately making it available for item creation and filtering."
)
async def create_category(req: CategoryCreate, user = Depends(require_admin)):
    name_clean = req.name.strip()
    if not name_clean:
        raise HTTPException(status_code=400, detail="Category name cannot be empty")
    existing = await db.category.find_unique(where={"name": name_clean})
    if existing:
        return CategorySchema(id=existing.id, name=existing.name)
    c = await db.category.create(data={"name": name_clean})
    return CategorySchema(id=c.id, name=c.name)

@router.get(
    "/upload/sample",
    summary="Download Sample Stock Upload Template (CSV)",
    description="Provides a downloadable sample CSV template containing exact required Phase 1 upload fields, with clear sample data and correct column names."
)
async def get_sample_template():
    csv_content = (
        "sku,barcode,name,category_name,cost_price,price,wholesale_price,tax_rate,stock,min_stock,pricing_method,unit\n"
        "BEV-005,8901030875069,Lemon Iced Tea 500ml,Beverages,32.0,55.0,46.0,12.0,60.0,15.0,qty,pcs\n"
        "SNK-005,8901030876189,Trail Mix 120g,Snacks,38.0,70.0,58.0,12.0,45.0,10.0,qty,pcs\n"
        "DAI-005,8901030877285,Greek Yogurt 100g,Dairy,22.0,39.0,32.0,0.0,80.0,16.0,qty,pcs\n"
        "GRO-006,8901030879500,Red Kidney Beans 500g,Grocery,48.0,89.0,75.0,5.0,36.0,10.0,weight,kg\n"
        "PC-005,8901030880605,Face Wash 100ml,Personal Care,72.0,149.0,125.0,18.0,25.0,10.0,qty,pcs\n"
    )
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=stock_upload_sample.csv"}
    )

@router.post(
    "/upload/preview",
    response_model=UploadPreviewResult,
    summary="Preview Bulk Stock CSV Upload",
    description="Admin-only endpoint parsing an uploaded stock CSV file, checking existing SKUs, and returning a pre-commit validation preview."
)
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
        sp = norm.get("price", norm.get("selling_price", ""))
        qty = norm.get("stock", norm.get("opening_qty", ""))
        cp = norm.get("cost_price", "0.0")
        wp = norm.get("wholesale_price", "")
        tax = norm.get("tax_rate", norm.get("tax", "0.0"))
        cat = norm.get("category_name", norm.get("category", "Grocery"))
        unit = norm.get("unit", "pcs")
        pm = norm.get("pricing_method", "qty")
        
        missing = []
        if not sku: missing.append("sku")
        if not name: missing.append("name")
        if not sp: missing.append("price")
        if not qty: missing.append("stock")
        
        row_dict = {
            "sku": sku,
            "barcode": norm.get("barcode", ""),
            "name": name,
            "category_name": cat,
            "price": float(sp) if sp and sp.replace(".","",1).isdigit() else 0.0,
            "cost_price": float(cp) if cp and cp.replace(".","",1).isdigit() else 0.0,
            "wholesale_price": float(wp) if wp and wp.replace(".","",1).isdigit() else None,
            "tax_rate": float(tax) if tax and tax.replace(".","",1).isdigit() else 0.0,
            "stock": float(qty) if qty and qty.replace(".","",1).isdigit() else 0.0,
            "min_stock": float(norm.get("min_stock", 10.0)) if norm.get("min_stock") else 10.0,
            "unit": unit,
            "pricing_method": pm
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

@router.post(
    "/upload/commit",
    summary="Commit Bulk Stock Upload to Database",
    description="Admin-only endpoint committing previewed CSV items and top-up stock quantities permanently to database."
)
async def upload_commit(payload: List[dict], user = Depends(require_admin)):
    applied = 0
    for r in payload:
        status_val = r.get("status")
        row = r.get("row", r) # support raw row or wrapped row
        sku = row.get("sku")
        if not sku or status_val == "error":
            continue
        
        price = float(row.get("price", row.get("selling_price", 0)))
        cost_price = float(row.get("cost_price", 0))
        tax = float(row.get("tax_rate", 0))
        stock = float(row.get("stock", row.get("opening_qty", 0)))
        name = row.get("name", sku)
        category = row.get("category_name", row.get("category", "Grocery"))
        barcode = row.get("barcode", "")
        unit = row.get("unit", "pcs")
        pm = row.get("pricing_method", "qty")
        
        # Save category if new
        existing_cat = await db.category.find_unique(where={"name": category})
        if not existing_cat:
            await db.category.create(data={"name": category})
        
        existing = await db.item.find_unique(where={"sku": sku})
        if existing:
            await db.item.update(where={"sku": sku}, data={
                "stock": stock,
                "price": price if price > 0 else existing.price,
                "cost_price": cost_price if cost_price > 0 else existing.cost_price,
                "tax_rate": tax
            })
        else:
            await db.item.create(data={
                "sku": sku,
                "barcode": barcode,
                "name": name,
                "category_name": category,
                "price": price,
                "cost_price": cost_price,
                "tax_rate": tax,
                "stock": stock,
                "min_stock": max(10.0, stock * 0.2),
                "pricing_method": pm,
                "unit": unit,
                "is_active": True
            })
        applied += 1
    return {"message": f"{applied} stock item(s) committed successfully", "applied_count": applied}
