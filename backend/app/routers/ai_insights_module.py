"""
AI Insights module (Phase 2) — dedicated endpoints under /api/v1/ai-insights/*.

Every endpoint loads actual PostgreSQL rows via Prisma, normalises them into an
`insights_engine.Dataset` and returns the engine's result. There is no seeded or fallback data:
if the database is unreachable the endpoints answer 503 instead of inventing numbers.

The pre-existing Reports tab endpoint (/reports/ai-insights in routers/ai_insights.py) is unchanged.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from app.database import get_db
from app import insights_engine as eng
from app.insights_demo import build_demo_dataset
from app import customer_insights as cbi
from app.security import require_module

logger = logging.getLogger("uvicorn.error")

_SCHEMA_HINT = ("The generated Prisma client or the database schema is out of date with prisma/schema.prisma — "
                "run `prisma generate` and `prisma db push` in backend/ and restart the API.")


def _looks_like_schema_drift(exc: Exception) -> bool:
    text = f"{type(exc).__module__}.{type(exc).__name__} {exc}".lower()
    return (type(exc).__module__.startswith("prisma") or isinstance(exc, AttributeError)
            or "does not exist" in text or "unknown argument" in text or "no attribute" in text)


class _JsonErrorRoute(APIRoute):
    """Unexpected failures answer with a JSON {"detail": ...} (not a bare 'Internal Server Error') so the UI can say why."""

    def get_route_handler(self):
        original = super().get_route_handler()

        async def handler(request: Request):
            try:
                return await original(request)
            except HTTPException:
                raise
            except Exception as exc:                       # noqa: BLE001 - reported to the client and logged
                if type(exc).__name__ == "RequestValidationError":
                    raise
                logger.exception("AI Insights endpoint %s failed", request.url.path)
                hint = f" {_SCHEMA_HINT}" if _looks_like_schema_drift(exc) else ""
                return JSONResponse(status_code=500, content={
                    "detail": f"AI Insights could not calculate this insight ({type(exc).__name__}: {str(exc)[:200]}).{hint}"})
        return handler


router = APIRouter(prefix="/ai-insights", tags=["AI Insights"], dependencies=[Depends(require_module("ai_insights"))],
                   route_class=_JsonErrorRoute)

HISTORY_DAYS = 190      # 90-day view + the 90 days before it (for the period-over-period comparison)


async def load_dataset(history_days: int = HISTORY_DAYS) -> eng.Dataset:
    db = get_db()
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="Database unavailable — AI Insights needs live PostgreSQL data. "
                                                    "Check DATABASE_URL in backend/.env and that PostgreSQL is reachable.")
    try:
        return await _read_dataset(db, history_days)
    except HTTPException:
        raise
    except Exception as exc:                               # noqa: BLE001
        logger.exception("AI Insights could not read PostgreSQL data")
        raise HTTPException(status_code=503, detail=(
            f"Could not read the AI Insights data from PostgreSQL ({type(exc).__name__}: {str(exc)[:220]}). "
            f"If this mentions a missing model, attribute or column: {_SCHEMA_HINT}"))


async def _read_dataset(db, history_days: int) -> eng.Dataset:
    now = datetime.now(eng.IST)
    today = now.date()
    cutoff = datetime.now(timezone.utc) - timedelta(days=history_days + 1)

    items = await db.item.find_many(where={"is_active": True})
    vendors = await db.vendor.find_many()
    sales = await db.sale.find_many(where={"time": {"gte": cutoff}}, include={"items": True, "tenders": True})
    returns = await db.salereturn.find_many(where={"time": {"gte": cutoff}}, include={"items": True})
    pos = await db.purchaseorder.find_many(include={"lines": True})
    grns = await db.goodsreceiptnote.find_many(include={"lines": True})
    preturns = await db.purchasereturn.find_many(include={"lines": True})
    batches = await db.batch.find_many()
    discounts = await db.discount.find_many()

    lines, bills, tenders = [], [], []
    for s in sales:
        t = eng.to_ist(s.time)
        day = t.date()
        if (today - day).days >= history_days:
            continue
        bills.append({"invoice": s.invoice_no, "day": day, "hour": t.hour, "total": s.grand_total})
        for si in s.items:
            lines.append({"sku": si.sku, "name": si.name, "day": day, "hour": t.hour, "qty": si.qty,
                          "revenue": si.final_amount, "taxable": si.taxable_amount,
                          "discount": si.discount_amount, "invoice": s.invoice_no})
        for tn in s.tenders:
            tenders.append({"invoice": s.invoice_no, "mode": tn.mode, "amount": tn.amount})

    ret_rows = []
    for r in returns:
        day = eng.to_ist(r.time).date()
        for ri in r.items:
            ret_rows.append({"sku": ri.sku, "day": day, "qty": ri.qty, "refund": ri.refund_amount})

    def _skus(raw):
        try:
            return set(json.loads(raw or "[]"))
        except (ValueError, TypeError):
            return set()

    return eng.Dataset(
        today=today,
        history_days=history_days,
        items={i.sku: {
            "sku": i.sku, "name": i.name, "category": i.category_name, "price": i.price,
            "cost": i.cost_price, "landed_cost": i.landed_cost, "stock": i.stock, "min_stock": i.min_stock,
            "unit": i.unit, "vendor_id": i.preferred_vendor_id,
            "created": eng.to_ist(i.created_at).date() if i.created_at else None,
        } for i in items},
        vendors={v.id: {"id": v.id, "name": v.name, "category": v.category, "terms": v.terms,
                        "status": v.status, "payable": v.payable} for v in vendors},
        lines=lines, bills=bills, tenders=tenders, returns=ret_rows,
        pos=[{"id": p.id, "vendor_id": p.vendor_id, "date": eng.parse_day(p.date), "expected": eng.parse_day(p.expected),
              "status": p.status,
              "lines": [{"sku": l.sku, "ordered": l.ordered_qty, "received": l.received_qty, "cost": l.cost} for l in p.lines]}
             for p in pos],
        grns=[{"id": g.id, "po_id": g.po_id, "vendor_id": g.vendor_id, "date": eng.parse_day(g.date), "total": g.total,
               "lines": [{"sku": l.sku, "qty": l.qty, "cost": l.cost} for l in g.lines]} for g in grns],
        preturns=[{"vendor_id": r.vendor_id, "date": eng.parse_day(r.date),
                   "lines": [{"sku": l.sku, "qty": l.qty, "cost": l.cost} for l in r.lines]} for r in preturns],
        batches=[{"sku": b.sku, "name": b.name, "batch_no": b.batch_no, "expiry": eng.parse_day(b.expiry_date), "qty": b.qty}
                 for b in batches],
        discounts=[{"name": d.name, "type": d.type, "value": d.value, "applies_to": d.applies_to, "skus": _skus(d.product_skus),
                    "start": eng.parse_day(d.start_date), "end": eng.parse_day(d.end_date), "status": d.status}
                   for d in discounts],
    )


async def get_dataset(demo: bool) -> eng.Dataset:
    """Live PostgreSQL data, or (demo=true) an in-memory sample dataset that never touches the database."""
    if demo:
        return build_demo_dataset(datetime.now(eng.IST).date())
    return await load_dataset()


DemoFlag = Query(False, description="Use the in-memory SAMPLE dataset instead of live data (no DB access).")


@router.get("/vendor-intelligence")
async def vendor_intelligence(demo: bool = DemoFlag):
    return eng.vendor_intelligence(await get_dataset(demo))


@router.get("/new-product-prediction")
async def new_product_prediction(new_days: int = Query(60, ge=7, le=365), demo: bool = DemoFlag):
    return eng.new_product_prediction(await get_dataset(demo), new_days)


@router.get("/low-stock-reorder-list")
async def low_stock_reorder_list(demo: bool = DemoFlag):
    return eng.low_stock_reorder_list(await get_dataset(demo))


@router.get("/restock-recommendations")
async def restock_recommendations(demo: bool = DemoFlag):
    return eng.restock_recommendations(await get_dataset(demo))


@router.get("/sales-visualizations")
async def sales_visualizations(days: int = Query(30, ge=7, le=90), demo: bool = DemoFlag):
    return eng.sales_visualizations(await get_dataset(demo), days)


@router.get("/vendor-recommendations")
async def vendor_recommendations(demo: bool = DemoFlag):
    return eng.vendor_recommendations(await get_dataset(demo))


@router.get("/discount-recommendations")
async def discount_recommendations(demo: bool = DemoFlag):
    return eng.discount_recommendations(await get_dataset(demo))


@router.get("/trending-products")
async def trending_products(days: int = Query(14, ge=7, le=30), demo: bool = DemoFlag):
    return eng.trending_products(await get_dataset(demo), days)


@router.get("/demand-forecast")
async def demand_forecast(horizon: int = Query(14, ge=7, le=28), demo: bool = DemoFlag):
    return eng.demand_forecast(await get_dataset(demo), horizon)


@router.get("/vendor-price-comparison")
async def vendor_price_comparison(demo: bool = DemoFlag):
    return eng.vendor_price_comparison(await get_dataset(demo))


@router.get("/business-summary")
async def business_summary(days: int = Query(30, ge=7, le=90), demo: bool = DemoFlag):
    return eng.business_summary(await get_dataset(demo), days)


@router.get("/customer-behavior")
async def customer_behavior(days: int = Query(90, ge=0, le=730, description="0 = all time"), demo: bool = DemoFlag):
    """Customer behaviour from completed invoices that carry a customer (Phase 2)."""
    today = datetime.now(eng.IST).date()
    if demo:
        return {"status": "insufficient_data", "meta": cbi._meta(0, 0, 0, None, today, True),
                "message": "Customer behaviour is built from your real customer invoices, so it is not part of the sample data. Switch Sample data off to see it."}
    db = get_db()
    if not db.is_connected():
        raise HTTPException(status_code=503, detail="Database unavailable — AI Insights needs live PostgreSQL data.")
    return await cbi.customer_behavior(db, days)


@router.get("/reorder-timing")
async def reorder_timing(demo: bool = DemoFlag):
    return eng.reorder_timing(await get_dataset(demo))
