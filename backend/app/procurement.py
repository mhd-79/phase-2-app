"""Shared rules for the procurement routers (vendors, purchase orders, goods receipts, purchase returns)."""
import random
import re
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException

# ---- Purchase order statuses ------------------------------------------------------------------------------------------
PO_STATUSES = ("Draft", "Pending", "Approved", "Ordered", "Partially Received", "Received", "Cancelled")
_LEGACY_PO_STATUS = {"Pending Approval": "Pending", "Closed": "Received"}      # values stored by earlier releases
PO_TRANSITIONS = {
    "Draft": {"Pending", "Cancelled"},
    "Pending": {"Approved", "Cancelled"},
    "Approved": {"Ordered", "Cancelled"},
    "Ordered": {"Cancelled"},
}
PO_RECEIVABLE = {"Approved", "Ordered", "Partially Received"}       # stock can be received against a PO in these statuses
PO_EDITABLE = {"Draft", "Pending"}


def norm_po_status(status: Optional[str]) -> str:
    return _LEGACY_PO_STATUS.get(status or "", status or "")


def stored_po_statuses(status: str) -> list:
    """Every stored value that means `status` (so a filter on 'Pending' also finds rows saved as 'Pending Approval')."""
    return [status] + [old for old, new in _LEGACY_PO_STATUS.items() if new == status]


def check_po_transition(current: str, target: str) -> None:
    current = norm_po_status(current)
    if target not in PO_TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=400, detail=f"A purchase order that is {current} cannot be moved to {target}")


# ---- Purchase return reasons ------------------------------------------------------------------------------------------
RETURN_REASONS = ("Damaged", "Wrong Product", "Wrong Quantity", "Expired", "Quality Issue", "Warranty")


# ---- Dates / ids ------------------------------------------------------------------------------------------------------
def today() -> str:
    return date.today().isoformat()


def parse_date(value: Optional[str], label: str) -> Optional[str]:
    """YYYY-MM-DD or None; raises a 400 for anything else."""
    if not value or not str(value).strip():
        return None
    try:
        return datetime.strptime(str(value).strip()[:10], "%Y-%m-%d").date().isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail=f"{label} must be a valid date (YYYY-MM-DD)")


async def unique_id(prefix: str, exists) -> str:
    """PREFIX-1234 with a random 4-digit suffix that no existing record uses. `exists` is an async callable taking the candidate id."""
    for _ in range(50):
        candidate = f"{prefix}-{random.randint(1000, 9999)}"
        if not await exists(candidate):
            return candidate
    return f"{prefix}-{random.randint(100000, 999999)}"


_GSTIN = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")


def clean_gstin(value: Optional[str]) -> Optional[str]:
    """Upper-cased GSTIN, None when blank; raises a 400 when it is not a valid 15-character GSTIN."""
    v = (value or "").strip().upper()
    if not v:
        return None
    if not _GSTIN.match(v):
        raise HTTPException(status_code=400, detail="Enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5)")
    return v


def with_gst(amount: float, tax_rate: float) -> float:
    return round(amount * (1 + (tax_rate or 0.0) / 100.0), 2)


def tx(db):
    """An interactive database transaction with room for the round trips to a remote database."""
    return db.tx(max_wait=timedelta(seconds=10), timeout=timedelta(seconds=45))


def db_error(exc: Exception) -> HTTPException:
    """A database failure while connected is reported, never hidden behind in-memory data."""
    return HTTPException(status_code=500, detail=f"The database could not save this change ({type(exc).__name__}). Nothing was changed; please try again.")


def batch_no_supported() -> bool:
    """False while the generated Prisma client predates Item.batch_no."""
    try:
        from prisma.models import Item as _ItemModel
        return "batch_no" in _ItemModel.model_fields
    except Exception:
        return False


def model_has_field(model: str, field: str) -> bool:
    """False while the generated Prisma client predates a column (run `prisma generate` + `prisma db push`)."""
    try:
        import prisma.models as m
        return field in getattr(m, model).model_fields
    except Exception:
        return False
