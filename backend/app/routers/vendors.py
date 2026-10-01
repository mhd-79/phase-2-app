from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Optional
from app.database import get_db
from app.schemas import VendorCreate, VendorUpdate, VendorSchema, VendorPaymentCreate
from app.security import get_current_user
from app.idempotency import enforce_idempotency, idempotency_manager

router = APIRouter(prefix="/vendors", tags=["vendors"])

# Seed vendors data if database is empty
SEED_VENDORS = [
    { "id": "V-001", "name": "Sunrise Distributors", "category": "Grocery & Staples", "contact": "Ramesh Gupta", "phone": "+91 98200 11223", "email": "ramesh@sunrisedist.in", "terms": "Net 30", "status": "Active", "payable": 84500.0 },
    { "id": "V-002", "name": "Coastal Beverages Co.", "category": "Beverages", "contact": "Anita Fernandes", "phone": "+91 90040 55211", "email": "anita@coastalbev.in", "terms": "Net 15", "status": "Active", "payable": 32100.0 },
    { "id": "V-003", "name": "Dairy Fresh Farms", "category": "Dairy", "contact": "Suresh Nair", "phone": "+91 89393 40021", "email": "suresh@dairyfresh.in", "terms": "Net 7", "status": "Active", "payable": 18450.0 },
    { "id": "V-004", "name": "GoldenCrust Bakers", "category": "Bakery", "contact": "Imran Sheikh", "phone": "+91 91234 87765", "email": "imran@goldencrust.in", "terms": "Net 15", "status": "Active", "payable": 9800.0 },
    { "id": "V-005", "name": "SnackTime Foods", "category": "Snacks", "contact": "Kavita Rao", "phone": "+91 97865 22110", "email": "kavita@snacktime.in", "terms": "Net 30", "status": "Active", "payable": 46200.0 },
    { "id": "V-006", "name": "CarePlus Toiletries", "category": "Personal Care", "contact": "Deepak Malhotra", "phone": "+91 99887 65432", "email": "deepak@careplus.in", "terms": "Net 45", "status": "Active", "payable": 61250.0 },
    { "id": "V-007", "name": "QuickPack Wholesale", "category": "General / Mixed", "contact": "Sana Iyer", "phone": "+91 96543 21098", "email": "sana@quickpack.in", "terms": "Net 30", "status": "Active", "payable": 0.0 },
    { "id": "V-008", "name": "Metro Cash & Carry", "category": "Ad-hoc Supply", "contact": "Walk-in Counter", "phone": "+91 98111 22334", "email": "—", "terms": "Due on Delivery", "status": "Active", "payable": 5400.0 }
]

async def seed_vendors_if_needed():
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

@router.post("", response_model=VendorSchema)
async def create_vendor(data: VendorCreate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, "create_vendor", data.id or data.name)
    try:
        db = get_db()
        vendor_id = data.id
        if db.is_connected():
            try:
                if not vendor_id:
                    count = await db.vendor.count()
                    vendor_id = f"V-{str(count + 1).zfill(3)}"
                
                vendor = await db.vendor.create(
                    data={
                        "id": vendor_id,
                        "name": data.name,
                        "category": data.category,
                        "contact": data.contact,
                        "phone": data.phone,
                        "email": data.email,
                        "terms": data.terms,
                        "status": data.status,
                        "payable": data.payable
                    }
                )
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, vendor.dict())
                return vendor
            except Exception:
                pass
                
        # Fallback
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
            payable=data.payable
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

@router.put("/{vendor_id}", response_model=VendorSchema)
async def update_vendor(vendor_id: str, data: VendorUpdate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, f"update_vendor_{vendor_id}")
    try:
        db = get_db()
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if db.is_connected():
            try:
                vendor = await db.vendor.update(
                    where={"id": vendor_id},
                    data=update_data
                )
                if not vendor:
                    raise HTTPException(status_code=404, detail="Vendor not found")
                if lock_key:
                    await idempotency_manager.release_lock(lock_key, vendor.dict())
                return vendor
            except HTTPException:
                raise
            except Exception:
                pass
                
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

@router.get("/{vendor_id}/ledger")
async def get_vendor_ledger(vendor_id: str):
    await seed_vendors_if_needed()
    db = get_db()
    if db.is_connected():
        try:
            vendor = await db.vendor.find_unique(where={"id": vendor_id})
            if not vendor:
                raise HTTPException(status_code=404, detail="Vendor not found")
            
            grns = await db.goodsreceiptnote.find_many(where={"vendor_id": vendor_id})
            returns = await db.purchasereturn.find_many(where={"vendor_id": vendor_id})
            payments = await db.vendorpayment.find_many(where={"vendor_id": vendor_id})
            
            entries = []
            for g in grns:
                entries.append({
                    "date": g.date,
                    "type": "Purchase",
                    "ref": f"{g.id} ({g.po_id})" if g.po_id else f"{g.id} (direct)",
                    "amount": g.total
                })
            for r in returns:
                entries.append({
                    "date": r.date,
                    "type": "Return",
                    "ref": r.id,
                    "amount": -r.total
                })
            for p in payments:
                entries.append({
                    "date": p.date,
                    "type": "Payment",
                    "ref": f"{p.id} ({p.mode})",
                    "amount": -p.amount
                })
            
            entries.sort(key=lambda x: x["date"], reverse=True)
            
            open_pos_count = await db.purchaseorder.count(
                where={
                    "vendor_id": vendor_id,
                    "status": {"not_in": ["Closed", "Received"]}
                }
            )
            
            return {
                "vendor": vendor,
                "payable": vendor.payable,
                "open_pos": open_pos_count,
                "ledger": entries
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

@router.post("/{vendor_id}/payments")
async def record_vendor_payment(vendor_id: str, data: VendorPaymentCreate, request: Request, current_user=Depends(get_current_user)):
    lock_key = await enforce_idempotency(request, "vendor_payment", f"{vendor_id}_{data.amount}_{data.mode}")
    try:
        db = get_db()
        if db.is_connected():
            try:
                vendor = await db.vendor.find_unique(where={"id": vendor_id})
                if not vendor:
                    raise HTTPException(status_code=404, detail="Vendor not found")
                
                count = await db.vendorpayment.count()
                pmt_id = f"PMT-{str(1001 + count)}"
                
                await db.vendorpayment.create(
                    data={
                        "id": pmt_id,
                        "vendor_id": vendor_id,
                        "date": "2026-09-07",
                        "amount": data.amount,
                        "mode": data.mode
                    }
                )
                
                new_payable = max(0.0, vendor.payable - data.amount)
                await db.vendor.update(
                    where={"id": vendor_id},
                    data={"payable": new_payable}
                )
                
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
            except Exception:
                pass
                
        # Fallback
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

