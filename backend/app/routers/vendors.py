from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db, is_default_store
from app.tenant_scoped import TenantList, TenantDict
from app.schemas import VendorCreate, VendorUpdate, VendorSchema, VendorPaymentCreate
from app.security import get_current_user
from app.security import require_module
from app.idempotency import enforce_idempotency, idempotency_manager
from app.procurement import clean_gstin, today, db_error, tx, model_has_field
from app.vendor_finance import build_vendor_summary
from datetime import date

router = APIRouter(prefix="/vendors", tags=["vendors"])

# Seed vendors data if database is empty
_DEMO_VENDORS = [
    { "id": "V-001", "name": "Sunrise Distributors", "category": "Grocery & Staples", "contact": "Ramesh Gupta", "phone": "+91 98200 11223", "email": "ramesh@sunrisedist.in", "terms": "Net 30", "status": "Active", "payable": 84500.0 },
    { "id": "V-002", "name": "Coastal Beverages Co.", "category": "Beverages", "contact": "Anita Fernandes", "phone": "+91 90040 55211", "email": "anita@coastalbev.in", "terms": "Net 15", "status": "Active", "payable": 32100.0 },
    { "id": "V-003", "name": "Dairy Fresh Farms", "category": "Dairy", "contact": "Suresh Nair", "phone": "+91 89393 40021", "email": "suresh@dairyfresh.in", "terms": "Net 7", "status": "Active", "payable": 18450.0 },
    { "id": "V-004", "name": "GoldenCrust Bakers", "category": "Bakery", "contact": "Imran Sheikh", "phone": "+91 91234 87765", "email": "imran@goldencrust.in", "terms": "Net 15", "status": "Active", "payable": 9800.0 },
    { "id": "V-005", "name": "SnackTime Foods", "category": "Snacks", "contact": "Kavita Rao", "phone": "+91 97865 22110", "email": "kavita@snacktime.in", "terms": "Net 30", "status": "Active", "payable": 46200.0 },
    { "id": "V-006", "name": "CarePlus Toiletries", "category": "Personal Care", "contact": "Deepak Malhotra", "phone": "+91 99887 65432", "email": "deepak@careplus.in", "terms": "Net 45", "status": "Active", "payable": 61250.0 },
    { "id": "V-007", "name": "QuickPack Wholesale", "category": "General / Mixed", "contact": "Sana Iyer", "phone": "+91 96543 21098", "email": "sana@quickpack.in", "terms": "Net 30", "status": "Active", "payable": 0.0 },
    { "id": "V-008", "name": "Metro Cash & Carry", "category": "Ad-hoc Supply", "contact": "Walk-in Counter", "phone": "+91 98111 22334", "email": "—", "terms": "Due on Delivery", "status": "Active", "payable": 5400.0 }
]

# per-tenant view of the vendor list used when the database cannot be reached: the original store keeps the demo vendors,
# every other tenant starts empty and never shares entries with another tenant
SEED_VENDORS = TenantList(_DEMO_VENDORS)

async def seed_vendors_if_needed():
    if not is_default_store():          # a new tenant starts with NO vendors
        return
    db = get_db()
    if db.is_connected():
        try:
            count = await db.vendor.count()
            if count == 0:
                for v in SEED_VENDORS:
                    await db.vendor.create(data=v)
        except Exception:
            pass

@router.get("", response_model=List[VendorSchema])
async def list_vendors(search: Optional[str] = None):
    await seed_vendors_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            vendors = await db.vendor.find_many(order={"id": "asc"})
            if search:
                term = search.lower()
                vendors = [v for v in vendors if term in v.name.lower() or term in v.category.lower() or term in v.id.lower()]
            return vendors
        except Exception:
            pass
            
    # Fallback
    vendors = [VendorSchema(**v) for v in SEED_VENDORS]
    if search:
        term = search.lower()
        vendors = [v for v in vendors if term in v.name.lower() or term in v.category.lower() or term in v.id.lower()]
    return vendors

@router.get("/{vendor_id}", response_model=VendorSchema)
async def get_vendor(vendor_id: str):
    await seed_vendors_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            vendor = await db.vendor.find_unique(where={"id": vendor_id})
            if vendor:
                return vendor
        except Exception:
            pass
            
    for v in SEED_VENDORS:
        if v["id"] == vendor_id:
            return VendorSchema(**v)
    raise HTTPException(status_code=404, detail="Vendor not found")

@router.post("", response_model=VendorSchema, dependencies=[Depends(require_module("vendors"))])
async def create_vendor(data: VendorCreate, request: Request, current_user=Depends(get_current_user)):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Enter the vendor name")
    gstin = clean_gstin(data.gstin)
    lock_key = await enforce_idempotency(request, "create_vendor", data.id or data.name)
    try:
        db = get_db()
        vendor_id = data.id
        if db.is_connected():
            try:
                if not vendor_id:
                    numbers = [int(v.id[2:]) for v in await db.vendor.find_many() if v.id[:2] == "V-" and v.id[2:].isdigit()]
                    vendor_id = f"V-{str(max(numbers, default=0) + 1).zfill(3)}"
                elif await db.vendor.find_unique(where={"id": vendor_id}):
                    raise HTTPException(status_code=400, detail="A vendor with this ID already exists")

                vendor = await db.vendor.create(
                    data={
                        "id": vendor_id,
                        "name": data.name.strip(),
                        "category": data.category,
                        "contact": data.contact,
                        "phone": data.phone,
                        "email": data.email,
                        "terms": data.terms,
                        "status": data.status,
                        "payable": data.payable,
                        "gstin": gstin
                    }
                )
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, vendor.dict())
                return vendor
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        # Fallback (no database connection)
        if not vendor_id:
            vendor_id = f"V-{str(len(SEED_VENDORS) + 1).zfill(3)}"
        new_v = VendorSchema(
            id=vendor_id,
            name=data.name,
            category=data.category,
            contact=data.contact,
            phone=data.phone,
            email=data.email,
            terms=data.terms,
            status=data.status,
            payable=data.payable,
            gstin=gstin
        )
        SEED_VENDORS.append(new_v.dict())
        if lock_key:
            await idempotency_manager.release_lock(lock_key, new_v.dict())
        return new_v
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{vendor_id}", response_model=VendorSchema, dependencies=[Depends(require_module("vendors"))])
async def update_vendor(vendor_id: str, data: VendorUpdate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, f"update_vendor_{vendor_id}")
    try:
        db = get_db()
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if "gstin" in update_data:
            update_data["gstin"] = clean_gstin(update_data["gstin"])
        if "name" in update_data and not update_data["name"].strip():
            raise HTTPException(status_code=400, detail="Enter the vendor name")
        if update_data.get("status") not in (None, "Active", "Inactive"):
            raise HTTPException(status_code=400, detail="Status must be Active or Inactive")
        if db.is_connected():
            try:
                if not await db.vendor.find_unique(where={"id": vendor_id}):
                    raise HTTPException(status_code=404, detail="Vendor not found")
                vendor = await db.vendor.update(where={"id": vendor_id}, data=update_data)
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, vendor.dict())
                return vendor
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        for v in SEED_VENDORS:
            if v["id"] == vendor_id:
                v.update(update_data)
                res = VendorSchema(**v)
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res.dict())
                return res
        raise HTTPException(status_code=404, detail="Vendor not found")
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{vendor_id}/products")
async def get_vendor_products(vendor_id: str):
    """Products this vendor supplies: items that name it as preferred vendor plus every SKU on its purchase orders / receipts."""
    db = get_db()
    if not db.is_connected():
        return []
    vendor = await db.vendor.find_unique(where={"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    products: dict = {}

    def entry(sku, name):
        return products.setdefault(sku, {"sku": sku, "name": name, "preferred": False, "orderedQty": 0.0, "receivedQty": 0.0,
                                         "lastCost": None, "lastDate": ""})

    for it in await db.item.find_many(where={"preferred_vendor_id": vendor_id}):
        entry(it.sku, it.name)["preferred"] = True
    for po in await db.purchaseorder.find_many(where={"vendor_id": vendor_id}, include={"lines": True}):
        for l in po.lines:
            e = entry(l.sku, l.name)
            e["orderedQty"] += l.ordered_qty
            e["receivedQty"] += l.received_qty
            if po.date >= e["lastDate"]:
                e["lastDate"], e["lastCost"] = po.date, l.cost
    for g in await db.goodsreceiptnote.find_many(where={"vendor_id": vendor_id}, include={"lines": True}):
        for l in g.lines:
            e = entry(l.sku, l.name)
            if g.date >= e["lastDate"]:
                e["lastDate"], e["lastCost"] = g.date, l.cost
    stock = {i.sku: i.stock for i in await db.item.find_many(where={"sku": {"in": list(products)}})} if products else {}
    for sku, e in products.items():
        e["stock"] = stock.get(sku)
    return sorted(products.values(), key=lambda e: e["sku"])

async def _finance(db, vendor) -> dict:
    """Loads a vendor's receipts, returns, payments and purchase orders and builds the finance summary from them."""
    grns = await db.goodsreceiptnote.find_many(where={"vendor_id": vendor.id}, include={"lines": True})
    returns = await db.purchasereturn.find_many(where={"vendor_id": vendor.id}, include={"lines": True})
    payments = await db.vendorpayment.find_many(where={"vendor_id": vendor.id})
    pos = await db.purchaseorder.find_many(where={"vendor_id": vendor.id}, include={"lines": True})
    # a draft return has not gone back yet: it is neither stock nor money
    returns = [r for r in returns if (getattr(r, "status", None) or "Processed") != "Draft"]
    return build_vendor_summary(
        payable=vendor.payable, terms=vendor.terms, today=date.today(),
        grns=[{"id": g.id, "date": g.date, "total": g.total, "po_id": g.po_id,
               "lines": [{"sku": l.sku, "name": l.name, "qty": l.qty, "cost": l.cost} for l in g.lines]} for g in grns],
        returns=[{"id": r.id, "date": r.date, "total": r.total, "lines": [{"qty": l.qty} for l in r.lines]} for r in returns],
        payments=[{"id": p.id, "date": p.date, "amount": p.amount, "mode": p.mode, "reference": getattr(p, "reference", None)} for p in payments],
        pos=[{"id": p.id, "date": p.date, "expected": p.expected, "status": p.status,
              "lines": [{"sku": l.sku, "name": l.name, "ordered_qty": l.ordered_qty, "received_qty": l.received_qty, "cost": l.cost} for l in p.lines]}
             for p in pos],
    )


@router.get("/{vendor_id}/summary")
async def get_vendor_summary(vendor_id: str):
    """Finance summary of one vendor: outstanding / due / overdue, payable aging, purchases, PO counts, payment history,
    performance, price history and alerts. Due dates are the receipt date plus the vendor's payment terms."""
    db = get_db()
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="The database is not connected")
    vendor = await db.vendor.find_unique(where={"id": vendor_id})
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return await _finance(db, vendor)


@router.get("/{vendor_id}/ledger")
async def get_vendor_ledger(vendor_id: str):
    await seed_vendors_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            vendor = await db.vendor.find_unique(where={"id": vendor_id})
            if not vendor:
                raise HTTPException(status_code=404, detail="Vendor not found")
            summary = await _finance(db, vendor)
            open_pos_count = await db.purchaseorder.count(
                where={
                    "vendor_id": vendor_id,
                    "status": {"not_in": ["Closed", "Received", "Cancelled"]}
                }
            )
            return {
                "vendor": vendor,
                "payable": vendor.payable,
                "open_pos": open_pos_count,
                "opening_balance": summary["financial"]["openingBalance"],
                "ledger": summary["ledger"]
            }
        except HTTPException:
            raise
        except Exception:
            pass

    for v in SEED_VENDORS:
        if v["id"] == vendor_id:
            return {
                "vendor": v,
                "payable": v["payable"],
                "open_pos": 1,
                "ledger": [
                    { "date": "2026-09-05", "type": "Payment", "ref": "PMT-1001 (Bank Transfer)", "amount": -1000.0 }
                ]
            }
    raise HTTPException(status_code=404, detail="Vendor not found")

@router.post("/{vendor_id}/payments", dependencies=[Depends(require_module("vendors"))])
async def record_vendor_payment(vendor_id: str, data: VendorPaymentCreate, request: Request, current_user=Depends(get_current_user)):
    if not (data.amount > 0):
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    reference = (data.reference or "").strip() or None
    if reference and not model_has_field("VendorPayment", "reference"):
        raise HTTPException(status_code=500, detail="The payment reference cannot be saved yet. Run `prisma generate` and `prisma db push`, then restart the API.")
    lock_key = await enforce_idempotency(request, "vendor_payment", f"{vendor_id}_{data.amount}_{data.mode}_{reference or ''}")
    try:
        db = get_db()
        if db.is_connected():
            try:
                vendor = await db.vendor.find_unique(where={"id": vendor_id})
                if not vendor:
                    raise HTTPException(status_code=404, detail="Vendor not found")

                numbers = [int(p.id[4:]) for p in await db.vendorpayment.find_many() if p.id[:4] == "PMT-" and p.id[4:].isdigit()]
                pmt_id = f"PMT-{max(numbers, default=1000) + 1}"
                new_payable = max(0.0, vendor.payable - data.amount)
                async with tx(db) as t:
                    pay = {"id": pmt_id, "vendor_id": vendor_id, "date": today(), "amount": data.amount, "mode": data.mode}
                    if reference:
                        pay["reference"] = reference
                    await t.vendorpayment.create(data=pay)
                    await t.vendor.update(where={"id": vendor_id}, data={"payable": new_payable})

                res = {
                    "id": pmt_id,
                    "message": f"{pmt_id} recorded — payable balance updated",
                    "new_payable": new_payable
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res
            except HTTPException:
                raise
            except Exception as exc:
                raise db_error(exc)

        # Fallback (no database connection)
        pmt_id = f"PMT-{str(1001 + len(SEED_VENDORS))}"
        for v in SEED_VENDORS:
            if v["id"] == vendor_id:
                v["payable"] = max(0.0, v["payable"] - data.amount)
                res = {
                    "id": pmt_id,
                    "message": f"{pmt_id} recorded — payable balance updated",
                    "new_payable": v["payable"]
                }
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, res)
                return res

        raise HTTPException(status_code=404, detail="Vendor not found")
    except Exception as e:
        if lock_key:
            await idempotency_manager.release_lock(lock_key)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))
