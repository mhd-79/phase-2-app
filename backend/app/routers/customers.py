import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from app.database import db
from app.schemas import CustomerCreate, CustomerUpdate
from app.routers.reports import _day_range, _time_filter, _payment_label

# Customer Management (Phase 2). Registered in main.py behind require_phase2 + require_admin, so every route here is
# limited to a Phase 2 admin. Customer selection on a bill is validated again in billing.py.
router = APIRouter(prefix="/customers", tags=["Customers"])


def _normalize_mobile(raw: str) -> str:
    digits = re.sub(r"[\s\-()]", "", raw or "")
    digits = re.sub(r"^(\+91|91|0)(?=\d{10}$)", "", digits)
    if not re.fullmatch(r"[6-9]\d{9}", digits):
        raise HTTPException(status_code=400, detail="Enter a valid 10-digit mobile number")
    return digits


def _clean(value: Optional[str]) -> Optional[str]:
    value = (value or "").strip()
    return value or None


def _view(c) -> Dict[str, Any]:
    return {
        "id": c.id, "name": c.name, "mobile": c.mobile, "email": c.email, "address": c.address,
        "customerType": c.customer_type, "createdAt": c.created_at.isoformat(),
    }


async def _next_id() -> str:
    last = await db.customer.find_first(order={"id": "desc"})
    n = int(last.id.split("-")[-1]) + 1 if last and last.id.split("-")[-1].isdigit() else 1
    return f"CUST-{n:04d}"


@router.get("")
async def list_customers(search: Optional[str] = None, customer_type: Optional[str] = None, limit: int = 200):
    """Customers, newest first. `search` matches name, mobile number or customer id."""
    where: Dict[str, Any] = {}
    if customer_type and customer_type != "All":
        where["customer_type"] = customer_type
    if search and search.strip():
        term = search.strip()
        where["OR"] = [
            {"name": {"contains": term, "mode": "insensitive"}},
            {"mobile": {"contains": term}},
            {"id": {"contains": term, "mode": "insensitive"}},
        ]
    rows = await db.customer.find_many(where=where, order={"created_at": "desc"}, take=max(1, min(limit, 1000)))
    return [_view(c) for c in rows]


@router.post("")
async def create_customer(data: CustomerCreate):
    mobile = _normalize_mobile(data.mobile)
    if await db.customer.find_unique(where={"mobile": mobile}):
        raise HTTPException(status_code=400, detail="A customer with this mobile number already exists")
    c = await db.customer.create(data={
        "id": await _next_id(), "name": data.name.strip(), "mobile": mobile, "email": _clean(data.email),
        "address": _clean(data.address), "customer_type": data.customerType,
    })
    return _view(c)


# --- Customer-wise report (declared before "/{customer_id}" so "reports" is not read as an id) ---
@router.get("/reports/summary")
async def customer_report(from_date: Optional[str] = None, to_date: Optional[str] = None, tz_offset: int = 0):
    """Total customers plus, for the date range, each customer's purchases, total amount and how often they buy."""
    start, end = _day_range(from_date, to_date, tz_offset)
    customers = await db.customer.find_many()
    sales = await db.sale.find_many(where={"customer_id": {"not": None}, **_time_filter(start, end)}, order={"time": "asc"})
    by_customer: Dict[str, List[Any]] = {}
    for s in sales:
        by_customer.setdefault(s.customer_id, []).append(s)

    period_months = 1.0
    if from_date and to_date:
        days = (datetime.strptime(to_date, "%Y-%m-%d") - datetime.strptime(from_date, "%Y-%m-%d")).days + 1
        period_months = max(days / 30.4, 1.0)

    known = {c.id: c for c in customers}
    rows = []
    for cid, group in by_customer.items():
        c = known.get(cid)
        total = sum(s.grand_total for s in group)
        gaps = [(b.time - a.time).total_seconds() / 86400 for a, b in zip(group, group[1:])]
        rows.append({
            "id": cid,
            "name": c.name if c else (group[-1].customer_name or cid),
            "mobile": c.mobile if c else "—",
            "customerType": c.customer_type if c else "—",
            "invoices": len(group),
            "totalAmount": round(total, 2),
            "avgBill": round(total / len(group), 2),
            "firstPurchase": group[0].time.isoformat(),
            "lastPurchase": group[-1].time.isoformat(),
            "purchasesPerMonth": round(len(group) / period_months, 2),
            "avgDaysBetween": round(sum(gaps) / len(gaps), 1) if gaps else None,
        })
    rows.sort(key=lambda r: r["totalAmount"], reverse=True)
    total_amount = round(sum(r["totalAmount"] for r in rows), 2)
    total_invoices = sum(r["invoices"] for r in rows)
    return {
        "totalCustomers": len(customers),
        "customersWhoPurchased": len(rows),
        "totalInvoices": total_invoices,
        "totalAmount": total_amount,
        "avgPurchasesPerCustomer": round(total_invoices / len(rows), 2) if rows else 0,
        "rows": rows,
    }


@router.get("/{customer_id}")
async def get_customer(customer_id: str):
    c = await db.customer.find_unique(where={"id": customer_id})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _view(c)


@router.put("/{customer_id}")
async def update_customer(customer_id: str, data: CustomerUpdate):
    c = await db.customer.find_unique(where={"id": customer_id})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    update: Dict[str, Any] = {}
    sent = data.model_dump(exclude_unset=True)
    if "name" in sent and data.name is not None:
        update["name"] = data.name.strip()
    if "mobile" in sent and data.mobile is not None:
        mobile = _normalize_mobile(data.mobile)
        other = await db.customer.find_unique(where={"mobile": mobile})
        if other and other.id != customer_id:
            raise HTTPException(status_code=400, detail="A customer with this mobile number already exists")
        update["mobile"] = mobile
    if "email" in sent:
        update["email"] = _clean(data.email)
    if "address" in sent:
        update["address"] = _clean(data.address)
    if "customerType" in sent and data.customerType is not None:
        update["customer_type"] = data.customerType
    if update:
        c = await db.customer.update(where={"id": customer_id}, data=update)
    return _view(c)


@router.delete("/{customer_id}")
async def delete_customer(customer_id: str):
    """Removes the customer. Invoices already billed to them keep the customer's name (it is saved on the sale)."""
    c = await db.customer.find_unique(where={"id": customer_id})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    await db.customer.delete(where={"id": customer_id})
    return {"message": f"Customer {customer_id} deleted", "id": customer_id}


@router.get("/{customer_id}/purchases")
async def customer_purchases(customer_id: str, from_date: Optional[str] = None, to_date: Optional[str] = None,
                             tz_offset: int = 0, limit: int = 500):
    """Purchase history of one customer: invoices with date/time, items, total and payment method."""
    c = await db.customer.find_unique(where={"id": customer_id})
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    start, end = _day_range(from_date, to_date, tz_offset)
    sales = await db.sale.find_many(
        where={"customer_id": customer_id, **_time_filter(start, end)}, order={"time": "desc"},
        include={"items": True, "tenders": True}, take=max(1, min(limit, 2000)))
    refunds: Dict[str, float] = {}
    if sales:
        for r in await db.salereturn.find_many(where={"sale_id": {"in": [s.id for s in sales]}}):
            refunds[r.sale_id] = refunds.get(r.sale_id, 0.0) + r.total_refund
    invoices = [{
        "invoiceNo": s.invoice_no,
        "time": s.time.isoformat(),
        "counterName": s.counter_name,
        "items": [{"sku": i.sku, "name": i.name, "qty": i.qty, "unit": i.unit, "price": i.price, "amount": round(i.final_amount, 2)} for i in s.items],
        "itemCount": len(s.items),
        "total": round(s.grand_total, 2),
        "paymentMethod": _payment_label(s.tenders),
        "tenders": [{"mode": t.mode, "amount": round(t.amount, 2)} for t in s.tenders],
        "status": s.status,
        "refunded": round(refunds.get(s.id, 0.0), 2),
    } for s in sales]
    total = round(sum(i["total"] for i in invoices), 2)
    return {
        "customer": _view(c),
        "summary": {"invoices": len(invoices), "totalAmount": total, "refunded": round(sum(i["refunded"] for i in invoices), 2),
                    "avgBill": round(total / len(invoices), 2) if invoices else 0,
                    "lastPurchase": invoices[0]["time"] if invoices else None},
        "invoices": invoices,
    }
