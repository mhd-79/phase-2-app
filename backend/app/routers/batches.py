from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from datetime import datetime
from app.database import get_db
from app.schemas import BatchCreate
from app.security import get_current_user

router = APIRouter(prefix="/batches", tags=["batches"])

SEED_BATCHES = [
    { "sku": "DAI-002", "name": "Curd Cup 200g", "batch_no": "B-CUR-2409A", "mfg_date": "2026-09-01", "expiry_date": "2026-09-09", "qty": 5.0 },
    { "sku": "DAI-003", "name": "Paneer 200g", "batch_no": "B-PNR-2408C", "mfg_date": "2026-08-30", "expiry_date": "2026-09-13", "qty": 18.0 },
    { "sku": "DAI-001", "name": "Toned Milk 500ml", "batch_no": "B-MLK-2409D", "mfg_date": "2026-09-06", "expiry_date": "2026-09-10", "qty": 64.0 },
    { "sku": "DAI-004", "name": "Butter 100g", "batch_no": "B-BTR-2408A", "mfg_date": "2026-08-15", "expiry_date": "2026-11-15", "qty": 30.0 },
    { "sku": "BAK-001", "name": "White Bread 400g", "batch_no": "B-WBR-2409G", "mfg_date": "2026-09-06", "expiry_date": "2026-09-11", "qty": 27.0 },
    { "sku": "BAK-003", "name": "Croissant (pc)", "batch_no": "B-CRS-2409H", "mfg_date": "2026-09-06", "expiry_date": "2026-09-09", "qty": 16.0 },
    { "sku": "GRO-001", "name": "Basmati Rice 1kg", "batch_no": "B-RIC-2408X", "mfg_date": "2026-06-01", "expiry_date": "2027-06-01", "qty": 48.0 },
    { "sku": "SNK-001", "name": "Potato Chips 90g", "batch_no": "B-CHP-2408Y", "mfg_date": "2026-07-10", "expiry_date": "2026-10-10", "qty": 120.0 }
]

async def seed_batches_if_needed():
    db = get_db()
    count = await db.batch.count()
    if count == 0:
        for b in SEED_BATCHES:
            await db.batch.create(data=b)

@router.get("")
async def list_batches(status: Optional[str] = None, sku: Optional[str] = None):
    await seed_batches_if_needed()
    db = get_db()
    ref_date = datetime.strptime("2026-09-07", "%Y-%m-%d")
    
    where_clause = {}
    if sku:
        where_clause["sku"] = sku
        
    batches = await db.batch.find_many(where=where_clause)
    
    result = []
    for b in batches:
        exp_date = datetime.strptime(b.expiry_date, "%Y-%m-%d")
        days_to_expiry = (exp_date - ref_date).days
        
        # Expiry status filter
        if status == "expired" and days_to_expiry >= 0:
            continue
        if status == "expiring_soon" and (days_to_expiry < 0 or days_to_expiry > 30):
            continue
        if status == "good" and days_to_expiry <= 30:
            continue
            
        result.append({
            "id": b.id,
            "sku": b.sku,
            "name": b.name,
            "batch": b.batch_no,
            "mfgDate": b.mfg_date,
            "expiryDate": b.expiry_date,
            "qty": b.qty,
            "daysToExpiry": days_to_expiry
        })
        
    # FEFO sorting: earliest expiring batch first
    result.sort(key=lambda x: x["daysToExpiry"])
    return result

@router.post("")
async def add_batch(data: BatchCreate, current_user=Depends(get_current_user)):
    db = get_db()
    item = await db.item.find_unique(where={"sku": data.sku})
    item_name = data.name or (item.name if item else "Item")
    
    batch = await db.batch.create(
        data={
            "sku": data.sku,
            "name": item_name,
            "batch_no": data.batch,
            "mfg_date": data.mfgDate,
            "expiry_date": data.expiryDate,
            "qty": data.qty
        }
    )
    
    ref_date = datetime.strptime("2026-09-07", "%Y-%m-%d")
    exp_date = datetime.strptime(data.expiryDate, "%Y-%m-%d")
    days = (exp_date - ref_date).days
    
    return {
        "id": batch.id,
        "sku": batch.sku,
        "name": batch.name,
        "batch": batch.batch_no,
        "mfgDate": batch.mfg_date,
        "expiryDate": batch.expiry_date,
        "qty": batch.qty,
        "daysToExpiry": days,
        "message": "Batch added successfully"
    }

@router.get("/issue-fefo/{sku}")
async def get_fefo_issue_batch(sku: str, qty_required: float = 1.0):
    await seed_batches_if_needed()
    db = get_db()
    batches = await db.batch.find_many(where={"sku": sku, "qty": {"gt": 0}})
    
    ref_date = datetime.strptime("2026-09-07", "%Y-%m-%d")
    valid_batches = []
    for b in batches:
        exp = datetime.strptime(b.expiry_date, "%Y-%m-%d")
        if exp >= ref_date:
            valid_batches.append((exp, b))
            
    valid_batches.sort(key=lambda x: x[0])
    
    if not valid_batches:
        return {"sku": sku, "batch": None, "message": "No valid non-expired batch found for FEFO issue"}
        
    selected_batch = valid_batches[0][1]
    return {
        "sku": sku,
        "recommendedBatch": selected_batch.batch_no,
        "expiryDate": selected_batch.expiry_date,
        "availableQty": selected_batch.qty,
        "message": f"Issue from batch {selected_batch.batch_no} expiring on {selected_batch.expiry_date} (FEFO)"
    }
