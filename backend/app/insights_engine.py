"""
AI Insights analytics engine (Phase 2).

Pure-Python, DB-free analytics over plain dictionaries so every insight can be unit-tested.
The router (app/routers/ai_insights_module.py) loads actual PostgreSQL rows through Prisma,
normalises them into a `Dataset` and calls the functions below. Nothing in here invents data:
when the history is too short the functions say so (`status: "insufficient_data"`, `confidence`).

Method summary (all deterministic / explainable, no black-box model):
  * Demand rate         - exponentially weighted moving average of daily net units (sales - returns).
  * Safety stock        - z(95%) * daily demand std-dev * sqrt(lead time).
  * Restock quantity    - order-up-to level (lead + review period demand + safety) - inventory position.
  * Forecasting         - weekday seasonality + damped linear trend on deseasonalised daily series,
                          with an 80% band from residual spread and a hold-out back-test (WAPE).
  * Vendor score        - weighted fill-rate, on-time delivery, quality (returns) and price index.
  * New product score   - velocity vs category benchmark, sell-through, margin, trend and returns.
"""
from __future__ import annotations

import math
import statistics
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

IST = timezone(timedelta(hours=5, minutes=30))

REVIEW_DAYS = 7
SERVICE_Z = 1.65            # ~95% service level
DEFAULT_LEAD_DAYS = 7
OPEN_PO_STATUSES = ("Approved", "Partially Received")
RECEIVED_PO_STATUSES = ("Partially Received", "Received", "Closed")


# --------------------------------------------------------------------------- helpers
def to_ist(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(IST)


def parse_day(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def r2(x: Optional[float]) -> Optional[float]:
    return None if x is None else round(float(x), 2)


def pct(a: float, b: float) -> Optional[float]:
    return round(a / b * 100.0, 1) if b else None


def _mean(xs: List[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def _std(xs: List[float]) -> float:
    return statistics.pstdev(xs) if len(xs) > 1 else 0.0


def _median(xs: List[float]) -> float:
    return statistics.median(xs) if xs else 0.0


def _item_cost(item: dict) -> float:
    return item["landed_cost"] if item.get("landed_cost", 0) > 0 else item.get("cost", 0.0)


# --------------------------------------------------------------------------- dataset
@dataclass
class Dataset:
    today: date
    history_days: int
    items: Dict[str, dict]
    vendors: Dict[str, dict]
    lines: List[dict]        # sale lines: sku,name,day,hour,qty,revenue,taxable,discount,invoice
    bills: List[dict]        # invoice, day, hour, total
    tenders: List[dict]      # invoice, mode, amount
    returns: List[dict]      # sku, day, qty, refund
    pos: List[dict]          # id, vendor_id, date, expected, status, lines[{sku,ordered,received,cost}]
    grns: List[dict]         # id, po_id, vendor_id, date, total, lines[{sku,qty,cost}]
    preturns: List[dict]     # vendor_id, date, lines[{sku,qty,cost}]
    batches: List[dict]      # sku,name,batch_no,expiry,qty
    discounts: List[dict]    # name,type,value,applies_to,skus,start,end,status
    _cache: Dict[str, Any] = field(default_factory=dict)
    is_demo: bool = False    # True only for the in-memory sample dataset (app/insights_demo.py)

    # -- sales index
    def _index(self):
        if "idx" not in self._cache:
            qty: Dict[str, Dict[date, float]] = defaultdict(lambda: defaultdict(float))
            rev: Dict[str, Dict[date, float]] = defaultdict(lambda: defaultdict(float))
            for l in self.lines:
                qty[l["sku"]][l["day"]] += l["qty"]
                rev[l["sku"]][l["day"]] += l["revenue"]
            for r in self.returns:
                qty[r["sku"]][r["day"]] -= r["qty"]
                rev[r["sku"]][r["day"]] -= r["refund"]
            self._cache["idx"] = (qty, rev)
        return self._cache["idx"]

    @property
    def first_sale_day(self) -> Optional[date]:
        if "fsd" not in self._cache:
            self._cache["fsd"] = min((l["day"] for l in self.lines), default=None)
        return self._cache["fsd"]

    @property
    def data_days(self) -> int:
        fsd = self.first_sale_day
        if fsd is None:
            return 0
        return max(1, min(self.history_days, (self.today - fsd).days + 1))

    def window(self, n: int, offset: int = 0) -> List[date]:
        end = self.today - timedelta(days=offset)
        return [end - timedelta(days=n - 1 - i) for i in range(n)]

    def eff_days(self, n: int, offset: int = 0, since: Optional[date] = None) -> int:
        """Days in the window that fall inside the observed sales period (and after `since`, e.g. an item's listing date)."""
        fsd = self.first_sale_day
        if fsd is None:
            return 0
        start = max(fsd, since) if since else fsd
        return sum(1 for d in self.window(n, offset) if d >= start)

    def daily_units(self, sku: str, n: int, offset: int = 0) -> List[float]:
        qty = self._index()[0].get(sku, {})
        return [max(0.0, qty.get(d, 0.0)) for d in self.window(n, offset)]

    def units(self, sku: str, n: int, offset: int = 0) -> float:
        return sum(self.daily_units(sku, n, offset))

    def revenue(self, sku: str, n: int, offset: int = 0) -> float:
        rev = self._index()[1].get(sku, {})
        return sum(max(0.0, rev.get(d, 0.0)) for d in self.window(n, offset))

    def all_skus_sold(self) -> List[str]:
        return list(self._index()[0].keys())

    def store_daily(self, n: int, offset: int = 0) -> Tuple[List[date], List[float], List[float], List[int]]:
        days = self.window(n, offset)
        by_day_rev: Dict[date, float] = defaultdict(float)
        by_day_units: Dict[date, float] = defaultdict(float)
        by_day_bills: Dict[date, int] = defaultdict(int)
        for l in self.lines:
            by_day_rev[l["day"]] += l["revenue"]
            by_day_units[l["day"]] += l["qty"]
        for r in self.returns:
            by_day_rev[r["day"]] -= r["refund"]
            by_day_units[r["day"]] -= r["qty"]
        for b in self.bills:
            by_day_bills[b["day"]] += 1
        return (days,
                [max(0.0, by_day_rev.get(d, 0.0)) for d in days],
                [max(0.0, by_day_units.get(d, 0.0)) for d in days],
                [by_day_bills.get(d, 0) for d in days])


def meta(ds: Dataset) -> dict:
    bills = len(ds.bills)
    dd = ds.data_days
    if dd == 0:
        conf = "none"
    elif dd < 14 or bills < 20:
        conf = "low"
    elif dd < 45 or bills < 100:
        conf = "medium"
    else:
        conf = "high"
    return {
        "generated_at": datetime.now(IST).isoformat(timespec="seconds"),
        "as_of": ds.today.isoformat(),
        "first_sale_date": ds.first_sale_day.isoformat() if ds.first_sale_day else None,
        "data_days": dd,
        "bills_analysed": bills,
        "items_analysed": len(ds.items),
        "confidence": conf,
        "is_demo": ds.is_demo,
        "source": ("SAMPLE DATA — generated in memory for demonstration; not stored and not from your records"
                   if ds.is_demo else
                   "PostgreSQL (sales, inventory, vendors, purchase orders, GRNs, purchase returns, batches)"),
    }


def _no_data(ds: Dataset, message: str, **extra) -> dict:
    return {"status": "insufficient_data", "message": message, "meta": meta(ds), **extra}


# --------------------------------------------------------------------------- demand & stock plan
def demand_rate(ds: Dataset, sku: str, span: int = 14) -> Tuple[float, float]:
    """EWMA daily net units and daily std-dev for a SKU (0,0 when the store has no sales history)."""
    n = ds.data_days
    if n == 0:
        return 0.0, 0.0
    m = min(n, 56)
    vals = ds.daily_units(sku, m)
    alpha = 2.0 / (min(span, m) + 1)
    ew = _mean(vals[: min(7, m)])
    for v in vals[min(7, m):]:
        ew = alpha * v + (1 - alpha) * ew
    return ew, _std(vals[-min(m, 28):])


def vendor_lead_times(ds: Dataset) -> Dict[str, Tuple[float, str]]:
    actual: Dict[str, List[float]] = defaultdict(list)
    promised: Dict[str, List[float]] = defaultdict(list)
    po_by_id = {p["id"]: p for p in ds.pos}
    first_grn: Dict[str, date] = {}
    for g in ds.grns:
        if g["po_id"] and g["date"]:
            cur = first_grn.get(g["po_id"])
            if cur is None or g["date"] < cur:
                first_grn[g["po_id"]] = g["date"]
    for pid, gd in first_grn.items():
        p = po_by_id.get(pid)
        if p and p["date"] and gd >= p["date"]:
            actual[p["vendor_id"]].append((gd - p["date"]).days)
    for p in ds.pos:
        if p["date"] and p["expected"] and p["expected"] >= p["date"]:
            promised[p["vendor_id"]].append((p["expected"] - p["date"]).days)
    out: Dict[str, Tuple[float, str]] = {}
    for vid in ds.vendors:
        if actual.get(vid):
            out[vid] = (round(_mean(actual[vid]), 1), "actual")
        elif promised.get(vid):
            out[vid] = (round(_mean(promised[vid]), 1), "promised")
        else:
            out[vid] = (float(DEFAULT_LEAD_DAYS), "assumed")
    return out


def _open_po_qty(ds: Dataset) -> Tuple[Dict[str, float], Dict[str, float], Dict[str, float]]:
    """Outstanding PO quantity per SKU: (on time, pending approval, overdue).

    Overdue supply (expected date already passed) is reported separately and is NOT counted as
    reliable stock when deciding whether to reorder.
    """
    on_order: Dict[str, float] = defaultdict(float)
    pending: Dict[str, float] = defaultdict(float)
    overdue: Dict[str, float] = defaultdict(float)
    for p in ds.pos:
        for l in p["lines"]:
            outstanding = max(0.0, l["ordered"] - l["received"])
            if p["status"] in OPEN_PO_STATUSES:
                if p["expected"] and p["expected"] < ds.today:
                    overdue[l["sku"]] += outstanding
                else:
                    on_order[l["sku"]] += outstanding
            elif p["status"] == "Pending Approval":
                pending[l["sku"]] += outstanding
    return on_order, pending, overdue


def stock_plan(ds: Dataset) -> Dict[str, dict]:
    if "plan" in ds._cache:
        return ds._cache["plan"]
    leads = vendor_lead_times(ds)
    on_order, pending, overdue = _open_po_qty(ds)
    plan: Dict[str, dict] = {}
    for sku, it in ds.items.items():
        demand, dstd = demand_rate(ds, sku)
        vid = it.get("vendor_id")
        lead, lead_src = leads.get(vid, (float(DEFAULT_LEAD_DAYS), "assumed")) if vid else (float(DEFAULT_LEAD_DAYS), "assumed")
        safety = SERVICE_Z * dstd * math.sqrt(max(lead, 1.0)) if demand > 0 else 0.0
        stock = it["stock"]
        oo = on_order.get(sku, 0.0)
        position = stock + oo
        rop = max(it["min_stock"], demand * lead + safety)
        if demand > 0:
            target = max(demand * (lead + REVIEW_DAYS) + safety, it["min_stock"] * 2)
            basis = "demand"
        else:
            target = it["min_stock"] * 3
            basis = "min_stock_rule"
        low_stock = stock <= it["min_stock"]
        needs = position <= rop or low_stock and oo == 0
        qty = math.ceil(max(0.0, target - position)) if needs else 0
        if needs and qty == 0:
            qty = 1
        cover = (stock / demand) if demand > 0 else None
        until_reorder = ((position - rop) / demand) if demand > 0 else None

        if stock <= 0:
            urgency = "critical"
        elif demand > 0 and cover is not None and cover < lead and oo == 0:
            urgency = "critical"
        elif needs:
            urgency = "high"
        elif until_reorder is not None and until_reorder <= 7:
            urgency = "medium"
        else:
            urgency = "low"

        if until_reorder is None:
            order_by = ds.today if needs else None
        else:
            order_by = ds.today + timedelta(days=max(0, math.floor(until_reorder)))
        cost = _item_cost(it)
        plan[sku] = {
            "sku": sku, "name": it["name"], "category": it["category"], "unit": it["unit"],
            "stock": stock, "min_stock": it["min_stock"], "on_order": oo,
            "pending_approval_qty": pending.get(sku, 0.0), "overdue_on_order": overdue.get(sku, 0.0),
            "inventory_position": position,
            "daily_demand": demand, "demand_std": dstd,
            "lead_time_days": lead, "lead_time_source": lead_src,
            "safety_stock": safety, "reorder_point": rop, "target_level": target,
            "days_of_cover": cover, "days_until_reorder": until_reorder,
            "needs_reorder": needs, "low_stock": low_stock, "recommended_qty": qty,
            "basis": basis, "urgency": urgency,
            "order_by": order_by, "arrival": (order_by + timedelta(days=math.ceil(lead))) if order_by else None,
            "stockout_date": (ds.today + timedelta(days=math.floor(cover))) if cover is not None else None,
            "unit_cost": cost, "est_cost": qty * cost,
            "vendor_id": vid, "vendor_name": ds.vendors.get(vid, {}).get("name") if vid else None,
        }
    ds._cache["plan"] = plan
    return plan


_URG_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _iso(d: Optional[date]) -> Optional[str]:
    return d.isoformat() if d else None


def low_stock_reorder_list(ds: Dataset) -> dict:
    plan = stock_plan(ds)
    rows = [p for p in plan.values() if p["needs_reorder"]]
    rows.sort(key=lambda p: (_URG_RANK[p["urgency"]], p["days_of_cover"] if p["days_of_cover"] is not None else 1e9))
    groups: Dict[str, dict] = {}
    items = []
    for p in rows:
        why = []
        if p["stock"] <= 0:
            why.append("Out of stock")
        elif p["low_stock"]:
            why.append(f"Stock {p['stock']:g} is at/below the minimum level of {p['min_stock']:g}")
        if p["basis"] == "demand" and p["inventory_position"] <= p["reorder_point"]:
            why.append(f"Stock + open orders ({p['inventory_position']:g}) is at/below the reorder point {p['reorder_point']:.0f}")
        if p["on_order"] > 0:
            why.append(f"{p['on_order']:g} already on open purchase orders")
        if p["overdue_on_order"] > 0:
            why.append(f"{p['overdue_on_order']:g} on purchase orders past their expected date — not counted as reliable supply; chase the vendor")
        if p["pending_approval_qty"] > 0:
            why.append(f"{p['pending_approval_qty']:g} on a purchase order still awaiting approval")
        items.append({
            "sku": p["sku"], "name": p["name"], "category": p["category"], "unit": p["unit"],
            "stock": p["stock"], "min_stock": p["min_stock"], "on_order": p["on_order"],
            "overdue_on_order": p["overdue_on_order"],
            "daily_demand": r2(p["daily_demand"]), "days_of_cover": r2(p["days_of_cover"]),
            "urgency": p["urgency"], "suggested_qty": p["recommended_qty"],
            "unit_cost": r2(p["unit_cost"]), "est_cost": r2(p["est_cost"]),
            "vendor_id": p["vendor_id"], "vendor_name": p["vendor_name"],
            "lead_time_days": p["lead_time_days"], "reasons": why,
        })
        key = p["vendor_id"] or "_none"
        g = groups.setdefault(key, {"vendor_id": p["vendor_id"], "vendor_name": p["vendor_name"] or "No preferred vendor",
                                    "item_count": 0, "est_cost": 0.0, "lines": []})
        g["item_count"] += 1
        g["est_cost"] += p["est_cost"]
        g["lines"].append({"sku": p["sku"], "name": p["name"], "qty": p["recommended_qty"], "unit_cost": r2(p["unit_cost"])})
    vendor_groups = sorted(groups.values(), key=lambda g: -g["est_cost"])
    for g in vendor_groups:
        g["est_cost"] = r2(g["est_cost"])
    return {
        "status": "ok", "meta": meta(ds),
        "summary": {
            "items": len(items),
            "critical": sum(1 for i in items if i["urgency"] == "critical"),
            "out_of_stock": sum(1 for i in items if i["stock"] <= 0),
            "est_total_cost": r2(sum(i["est_cost"] or 0 for i in items)),
            "vendors": len(vendor_groups),
        },
        "items": items, "vendor_groups": vendor_groups,
    }


def restock_recommendations(ds: Dataset) -> dict:
    plan = stock_plan(ds)
    rows = [p for p in plan.values() if p["recommended_qty"] > 0]
    rows.sort(key=lambda p: (_URG_RANK[p["urgency"]], -p["est_cost"]))
    out = []
    for p in rows:
        if p["basis"] == "demand":
            explain = (f"Demand {p['daily_demand']:.2f}/day × (lead {p['lead_time_days']:g}d + review {REVIEW_DAYS}d) "
                       f"+ safety {p['safety_stock']:.1f} = target {p['target_level']:.0f}; "
                       f"minus stock {p['stock']:g} and on-order {p['on_order']:g}")
        else:
            explain = (f"No sales history for this item yet, so the minimum-stock rule applies: "
                       f"3 × min level ({p['min_stock']:g}) = {p['target_level']:.0f}, minus stock and on-order")
        out.append({
            "sku": p["sku"], "name": p["name"], "category": p["category"], "unit": p["unit"],
            "stock": p["stock"], "on_order": p["on_order"], "min_stock": p["min_stock"],
            "overdue_on_order": p["overdue_on_order"],
            "daily_demand": r2(p["daily_demand"]), "lead_time_days": p["lead_time_days"],
            "lead_time_source": p["lead_time_source"], "safety_stock": r2(p["safety_stock"]),
            "target_level": r2(p["target_level"]), "recommended_qty": p["recommended_qty"],
            "unit_cost": r2(p["unit_cost"]), "est_cost": r2(p["est_cost"]), "urgency": p["urgency"],
            "basis": p["basis"], "explanation": explain,
            "vendor_id": p["vendor_id"], "vendor_name": p["vendor_name"],
            "confidence": "medium" if p["basis"] == "demand" and ds.data_days >= 14 else "low",
        })
    return {
        "status": "ok", "meta": meta(ds),
        "method": {"service_level": "95%", "review_period_days": REVIEW_DAYS,
                   "formula": "qty = ceil(demand × (lead + review) + z·σ·√lead − (stock + on order))"},
        "summary": {"items": len(out), "total_units": sum(o["recommended_qty"] for o in out),
                    "est_total_cost": r2(sum(o["est_cost"] or 0 for o in out))},
        "items": out,
    }


def reorder_timing(ds: Dataset) -> dict:
    plan = stock_plan(ds)
    rows = []
    for p in plan.values():
        if p["daily_demand"] <= 0 and not p["needs_reorder"]:
            continue
        due = p["days_until_reorder"]
        if p["needs_reorder"]:
            window = "Order now"
        elif due is not None and due <= 3:
            window = "Within 3 days"
        elif due is not None and due <= 7:
            window = "This week"
        elif due is not None and due <= 14:
            window = "Next 2 weeks"
        else:
            window = "Later"
        risk = None
        if p["days_of_cover"] is not None and p["on_order"] == 0 and p["days_of_cover"] < p["lead_time_days"]:
            short = p["lead_time_days"] - p["days_of_cover"]
            risk = f"Likely to run out ~{short:.0f} day(s) before a new order could arrive"
        rows.append({
            "sku": p["sku"], "name": p["name"], "category": p["category"],
            "stock": p["stock"], "on_order": p["on_order"], "daily_demand": r2(p["daily_demand"]),
            "days_of_cover": r2(p["days_of_cover"]), "lead_time_days": p["lead_time_days"],
            "reorder_point": r2(p["reorder_point"]), "days_until_reorder": r2(max(0.0, due)) if due is not None else (0.0 if p["needs_reorder"] else None),
            "order_by": _iso(p["order_by"]), "expected_arrival": _iso(p["arrival"]),
            "projected_stockout": _iso(p["stockout_date"]), "window": window, "urgency": p["urgency"],
            "stockout_risk": risk, "vendor_name": p["vendor_name"], "recommended_qty": p["recommended_qty"],
        })
    order = {"Order now": 0, "Within 3 days": 1, "This week": 2, "Next 2 weeks": 3, "Later": 4}
    rows.sort(key=lambda r: (order[r["window"]], r["days_until_reorder"] if r["days_until_reorder"] is not None else 1e9))
    buckets: Dict[str, int] = defaultdict(int)
    for r in rows:
        buckets[r["window"]] += 1
    return {"status": "ok", "meta": meta(ds), "summary": {k: buckets.get(k, 0) for k in order}, "items": rows}


# --------------------------------------------------------------------------- vendors
def _quotes(ds: Dataset) -> Dict[str, Dict[str, List[dict]]]:
    """sku -> vendor_id -> list of {date,cost,source} from POs (excl. drafts) and GRNs, plus catalog cost."""
    if "quotes" in ds._cache:
        return ds._cache["quotes"]
    q: Dict[str, Dict[str, List[dict]]] = defaultdict(lambda: defaultdict(list))
    for p in ds.pos:
        if p["status"] == "Draft" or not p["date"]:
            continue
        for l in p["lines"]:
            if l["cost"] > 0:
                q[l["sku"]][p["vendor_id"]].append({"date": p["date"], "cost": l["cost"], "source": "PO"})
    for g in ds.grns:
        if not g["date"]:
            continue
        for l in g["lines"]:
            if l["cost"] > 0:
                q[l["sku"]][g["vendor_id"]].append({"date": g["date"], "cost": l["cost"], "source": "GRN"})
    for sku, it in ds.items.items():
        vid = it.get("vendor_id")
        if vid and vid not in q.get(sku, {}) and it.get("cost", 0) > 0:
            q[sku][vid].append({"date": None, "cost": it["cost"], "source": "Catalog"})
    ds._cache["quotes"] = q
    return q


def _latest(qs: List[dict]) -> dict:
    dated = [x for x in qs if x["date"]]
    if not dated:
        return qs[-1]
    return sorted(dated, key=lambda x: (x["date"], x["source"] == "GRN"))[-1]


def _vendor_price_index(ds: Dataset) -> Dict[str, float]:
    per_vendor: Dict[str, List[float]] = defaultdict(list)
    for sku, by_v in _quotes(ds).items():
        if len(by_v) < 2:
            continue
        latest = {v: _latest(qs)["cost"] for v, qs in by_v.items()}
        lo = min(latest.values())
        for v, c in latest.items():
            per_vendor[v].append(c / lo)
    return {v: _mean(xs) for v, xs in per_vendor.items()}


def _vendor_metrics(ds: Dataset) -> Dict[str, dict]:
    if "vm" in ds._cache:
        return ds._cache["vm"]
    price_idx = _vendor_price_index(ds)
    leads = vendor_lead_times(ds)
    grns_by_po: Dict[str, List[dict]] = defaultdict(list)
    for g in ds.grns:
        if g["po_id"]:
            grns_by_po[g["po_id"]].append(g)
    total_grn = sum(g["total"] for g in ds.grns) or 0.0
    out: Dict[str, dict] = {}
    for vid, v in ds.vendors.items():
        pos = [p for p in ds.pos if p["vendor_id"] == vid]
        placed = [p for p in pos if p["status"] not in ("Draft", "Pending Approval")]
        recvd = [p for p in placed if p["status"] in RECEIVED_PO_STATUSES]
        ordered = sum(l["ordered"] for p in recvd for l in p["lines"])
        received = sum(l["received"] for p in recvd for l in p["lines"])
        fill = (received / ordered) if ordered > 0 else None
        on_time = late = overdue_open = 0
        for p in placed:
            gs = [g for g in grns_by_po.get(p["id"], []) if g["date"]]
            outstanding = any(l["received"] < l["ordered"] for l in p["lines"])
            if gs and p["expected"]:
                if min(g["date"] for g in gs) <= p["expected"]:
                    on_time += 1
                else:
                    late += 1
            elif not gs and p["expected"] and p["expected"] < ds.today and p["status"] == "Approved":
                late += 1
            if p["expected"] and p["expected"] < ds.today and p["status"] in OPEN_PO_STATUSES and outstanding:
                overdue_open += 1
        on_time_rate = on_time / (on_time + late) if (on_time + late) else None
        v_grn_qty = sum(l["qty"] for g in ds.grns if g["vendor_id"] == vid for l in g["lines"])
        v_ret_qty = sum(l["qty"] for r in ds.preturns if r["vendor_id"] == vid for l in r["lines"])
        ret_rate = (v_ret_qty / v_grn_qty) if v_grn_qty > 0 else None
        purchases = sum(g["total"] for g in ds.grns if g["vendor_id"] == vid)
        comps = []   # (weight, 0..100)
        if fill is not None:
            comps.append((35, min(1.0, fill) * 100))
        if on_time_rate is not None:
            comps.append((30, on_time_rate * 100))
        if ret_rate is not None:
            comps.append((20, max(0.0, 1 - ret_rate * 5) * 100))
        if vid in price_idx:
            comps.append((15, min(100.0, 100.0 / price_idx[vid])))
        score = round(sum(w * s for w, s in comps) / sum(w for w, _ in comps), 0) if comps else None
        grade = None if score is None else "A" if score >= 85 else "B" if score >= 70 else "C" if score >= 55 else "D"
        notes = []
        if fill is not None and fill < 0.9:
            notes.append(f"Fill rate {fill * 100:.0f}% is below the 90% target")
        if on_time_rate is not None and on_time_rate < 0.8:
            notes.append(f"Only {on_time_rate * 100:.0f}% of orders arrived by the expected date")
        if ret_rate is not None and ret_rate > 0.03:
            notes.append(f"{ret_rate * 100:.1f}% of received units were returned")
        if overdue_open:
            notes.append(f"{overdue_open} open PO(s) are past their expected date")
        if vid in price_idx and price_idx[vid] > 1.05:
            notes.append(f"Prices average {(price_idx[vid] - 1) * 100:.0f}% above the cheapest vendor on shared items")
        if v["payable"] > 0:
            notes.append(f"₹{v['payable']:,.0f} payable ({v['terms']})")
        if not comps:
            notes.append("No completed orders yet — not enough purchase history to score")
        out[vid] = {
            "vendor_id": vid, "name": v["name"], "category": v["category"], "terms": v["terms"], "status": v["status"],
            "po_count": len(pos), "placed_pos": len(placed), "received_pos": len(recvd),
            "po_value": r2(sum(l["ordered"] * l["cost"] for p in placed for l in p["lines"])),
            "purchases_received": r2(purchases), "spend_share_pct": pct(purchases, total_grn),
            "fill_rate_pct": None if fill is None else round(fill * 100, 1),
            "on_time_rate_pct": None if on_time_rate is None else round(on_time_rate * 100, 1),
            "return_rate_pct": None if ret_rate is None else round(ret_rate * 100, 1),
            "avg_lead_days": leads[vid][0], "lead_time_source": leads[vid][1],
            "overdue_open_pos": overdue_open, "payable": r2(v["payable"]),
            "price_index": None if vid not in price_idx else round(price_idx[vid], 3),
            "score": score, "grade": grade, "notes": notes,
            "items_supplied": len({l["sku"] for p in placed for l in p["lines"]} | {s for s, it in ds.items.items() if it.get("vendor_id") == vid}),
        }
    ds._cache["vm"] = out
    return out


def vendor_intelligence(ds: Dataset) -> dict:
    vm = list(_vendor_metrics(ds).values())
    vm.sort(key=lambda v: (-(v["score"] if v["score"] is not None else -1), v["name"]))
    scored = [v for v in vm if v["score"] is not None]
    return {
        "status": "ok", "meta": meta(ds),
        "summary": {
            "vendors": len(vm), "scored": len(scored),
            "avg_score": round(_mean([v["score"] for v in scored]), 0) if scored else None,
            "total_payable": r2(sum(v["payable"] or 0 for v in vm)),
            "overdue_open_pos": sum(v["overdue_open_pos"] for v in vm),
            "best_vendor": scored[0]["name"] if scored else None,
            "weakest_vendor": scored[-1]["name"] if len(scored) > 1 else None,
        },
        "score_weights": {"fill_rate": 35, "on_time_delivery": 30, "quality_returns": 20, "price_index": 15},
        "vendors": vm,
    }


def vendor_price_comparison(ds: Dataset) -> dict:
    quotes = _quotes(ds)
    plan = stock_plan(ds)
    rows = []
    for sku, by_v in quotes.items():
        it = ds.items.get(sku)
        if not it:
            continue
        vendors_out = []
        for vid, qs in by_v.items():
            last = _latest(qs)
            dated = sorted([x for x in qs if x["date"]], key=lambda x: x["date"])
            change = None
            if len(dated) >= 2 and dated[0]["cost"] > 0:
                change = round((dated[-1]["cost"] - dated[0]["cost"]) / dated[0]["cost"] * 100, 1)
            vendors_out.append({
                "vendor_id": vid, "vendor_name": ds.vendors.get(vid, {}).get("name", vid),
                "latest_cost": r2(last["cost"]), "latest_date": _iso(last["date"]), "source": last["source"],
                "avg_cost": r2(_mean([x["cost"] for x in qs])), "min_cost": r2(min(x["cost"] for x in qs)),
                "max_cost": r2(max(x["cost"] for x in qs)), "quotes": len(qs), "price_change_pct": change,
                "is_preferred": vid == it.get("vendor_id"),
            })
        vendors_out.sort(key=lambda v: v["latest_cost"])
        cheapest = vendors_out[0]
        pref = next((v for v in vendors_out if v["is_preferred"]), None)
        save_unit = save_pct = monthly_saving = None
        if pref and pref["latest_cost"] > cheapest["latest_cost"]:
            save_unit = round(pref["latest_cost"] - cheapest["latest_cost"], 2)
            save_pct = round(save_unit / pref["latest_cost"] * 100, 1)
            monthly_saving = r2(save_unit * plan[sku]["daily_demand"] * 30) if sku in plan else None
        rows.append({
            "sku": sku, "name": it["name"], "category": it["category"], "unit": it["unit"],
            "comparable": len(vendors_out) >= 2, "vendors": vendors_out,
            "cheapest_vendor": cheapest["vendor_name"], "cheapest_cost": cheapest["latest_cost"],
            "preferred_vendor": pref["vendor_name"] if pref else None,
            "preferred_cost": pref["latest_cost"] if pref else None,
            "saving_per_unit": save_unit, "saving_pct": save_pct, "est_monthly_saving": monthly_saving,
            "catalog_cost": r2(it.get("cost")),
        })
    rows.sort(key=lambda r: (not r["comparable"], -(r["saving_pct"] or 0), r["name"]))
    comparable = [r for r in rows if r["comparable"]]
    return {
        "status": "ok", "meta": meta(ds),
        "summary": {"items_with_quotes": len(rows), "comparable_items": len(comparable),
                    "items_with_saving": sum(1 for r in comparable if r["saving_per_unit"]),
                    "est_monthly_saving": r2(sum(r["est_monthly_saving"] or 0 for r in comparable))},
        "note": "Costs come from purchase-order and GRN lines (drafts excluded); items with only the catalog cost show a single quote.",
        "items": rows,
    }


def vendor_recommendations(ds: Dataset) -> dict:
    vm = _vendor_metrics(ds)
    quotes = _quotes(ds)
    plan = stock_plan(ds)
    item_recs = []
    for sku, by_v in quotes.items():
        it = ds.items.get(sku)
        if not it or len(by_v) < 2:
            continue
        latest = {v: _latest(qs)["cost"] for v, qs in by_v.items()}
        lo = min(latest.values())
        cand = []
        for v, c in latest.items():
            vs = vm.get(v, {}).get("score")
            comp = 0.5 * (lo / c * 100) + 0.5 * (vs if vs is not None else 60)
            cand.append((comp, v, c, vs))
        cand.sort(reverse=True)
        best = cand[0]
        pv = it.get("vendor_id")
        cur = next((x for x in cand if x[1] == pv), None)
        if cur is None:
            continue
        switch = best[1] != pv and best[0] - cur[0] >= 5 and (best[3] is None or best[3] >= 50)
        if not switch:
            action, reason = "keep", "Preferred vendor offers the best price/performance balance"
        else:
            sv = (cur[2] - best[2]) / cur[2] * 100
            parts = []
            if sv > 0:
                parts.append(f"{sv:.1f}% cheaper (₹{best[2]:g} vs ₹{cur[2]:g})")
            if best[3] is not None and cur[3] is not None and best[3] > cur[3]:
                parts.append(f"vendor score {best[3]:.0f} vs {cur[3]:.0f}")
            action, reason = "switch", "; ".join(parts) or "Better combined price and reliability"
        p = plan.get(sku, {})
        item_recs.append({
            "sku": sku, "name": it["name"], "action": action, "reason": reason,
            "current_vendor": ds.vendors.get(pv, {}).get("name", pv), "current_cost": r2(cur[2]),
            "recommended_vendor": ds.vendors.get(best[1], {}).get("name", best[1]), "recommended_cost": r2(best[2]),
            "saving_pct": r2((cur[2] - best[2]) / cur[2] * 100) if action == "switch" and cur[2] > best[2] else 0,
            "needs_reorder": bool(p.get("needs_reorder")), "urgency": p.get("urgency", "low"),
        })
    item_recs.sort(key=lambda r: (r["action"] != "switch", not r["needs_reorder"], -(r["saving_pct"] or 0)))

    actions = []
    # consolidation of reorder lines
    by_vendor: Dict[str, List[dict]] = defaultdict(list)
    for p in plan.values():
        if p["needs_reorder"] and p["vendor_id"]:
            by_vendor[p["vendor_id"]].append(p)
    for vid, ps in by_vendor.items():
        if len(ps) >= 2:
            total = sum(p["est_cost"] for p in ps)
            actions.append({"type": "consolidate", "priority": "high" if any(p["urgency"] == "critical" for p in ps) else "medium",
                            "vendor": vm[vid]["name"],
                            "title": f"Raise one consolidated PO to {vm[vid]['name']}",
                            "detail": f"{len(ps)} low-stock items share this vendor (≈₹{total:,.0f} total) — one PO saves handling and may earn volume terms.",
                            "evidence": [p["name"] for p in ps[:6]]})
    for v in vm.values():
        if v["score"] is not None and v["score"] < 60 and v["placed_pos"] > 0:
            actions.append({"type": "review_vendor", "priority": "high", "vendor": v["name"],
                            "title": f"Review performance of {v['name']}",
                            "detail": f"Score {v['score']:.0f}/100 (grade {v['grade']}). " + "; ".join(v["notes"][:2]),
                            "evidence": v["notes"]})
        if v["payable"] and v["payable"] > 0:
            actions.append({"type": "payable", "priority": "low", "vendor": v["name"],
                            "title": f"Settle ₹{v['payable']:,.0f} payable to {v['name']}",
                            "detail": f"Terms: {v['terms']}. Paying on time protects supply priority and any early-payment terms.",
                            "evidence": []})
    total_spend = sum(v["purchases_received"] or 0 for v in vm.values())
    for v in vm.values():
        if total_spend > 0 and (v["purchases_received"] or 0) / total_spend > 0.5 and len(vm) > 1:
            actions.append({"type": "concentration", "priority": "medium", "vendor": v["name"],
                            "title": f"Supplier concentration: {v['name']}",
                            "detail": f"{v['spend_share_pct']}% of received purchase value comes from one vendor; qualify a backup supplier.",
                            "evidence": []})
    # single-source risk on top sellers
    top = sorted(ds.items, key=lambda s: -ds.revenue(s, 30))[:10]
    for sku in top:
        if ds.revenue(sku, 30) > 0 and len(quotes.get(sku, {})) == 1:
            actions.append({"type": "second_source", "priority": "low",
                            "vendor": ds.vendors.get(ds.items[sku].get("vendor_id"), {}).get("name"),
                            "title": f"Single-source risk: {ds.items[sku]['name']}",
                            "detail": "Top seller has purchase history with only one vendor — get a competing quote.",
                            "evidence": []})
    rank = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda a: rank[a["priority"]])
    return {
        "status": "ok", "meta": meta(ds),
        "summary": {"switch_suggestions": sum(1 for r in item_recs if r["action"] == "switch"),
                    "vendor_actions": len(actions)},
        "item_recommendations": item_recs, "vendor_actions": actions,
    }


# --------------------------------------------------------------------------- sales visualisations
def sales_visualizations(ds: Dataset, days: int = 30) -> dict:
    if ds.data_days == 0:
        return _no_data(ds, "No sales have been recorded yet, so there is nothing to chart.")
    days_list, rev, units, bills = ds.store_daily(days)
    prev_days, prev_rev, _, _ = ds.store_daily(days, offset=days)
    window_set = set(days_list)
    cat: Dict[str, dict] = defaultdict(lambda: {"revenue": 0.0, "units": 0.0, "taxable": 0.0, "cost": 0.0})
    prod: Dict[str, dict] = {}
    hours: Dict[int, dict] = defaultdict(lambda: {"bills": set(), "revenue": 0.0})
    weekday: Dict[int, dict] = defaultdict(lambda: {"bills": set(), "revenue": 0.0})
    for l in ds.lines:
        if l["day"] not in window_set:
            continue
        it = ds.items.get(l["sku"], {})
        category = it.get("category", "Uncategorised")
        cost = _item_cost(it) * l["qty"] if it else 0.0
        c = cat[category]
        c["revenue"] += l["revenue"]; c["units"] += l["qty"]; c["taxable"] += l["taxable"]; c["cost"] += cost
        p = prod.setdefault(l["sku"], {"sku": l["sku"], "name": l["name"], "category": category,
                                       "revenue": 0.0, "units": 0.0, "taxable": 0.0, "cost": 0.0})
        p["revenue"] += l["revenue"]; p["units"] += l["qty"]; p["taxable"] += l["taxable"]; p["cost"] += cost
        hours[l["hour"]]["revenue"] += l["revenue"]; hours[l["hour"]]["bills"].add(l["invoice"])
        weekday[l["day"].weekday()]["revenue"] += l["revenue"]; weekday[l["day"].weekday()]["bills"].add(l["invoice"])
    total_rev = sum(rev)
    prev_total = sum(prev_rev)
    # only compare with the previous period when most of it lies inside the observed sales history;
    # otherwise "vs previous 90 days" would compare against a couple of days and give absurd growth figures
    prev_covered = ds.eff_days(days, offset=days) >= 0.8 * days
    n_bills = sum(bills)
    tender_mix: Dict[str, float] = defaultdict(float)
    # tenders are not day-tagged in the dataset; restrict via bills in window
    in_window_inv = {b["invoice"] for b in ds.bills if b["day"] in window_set}
    for t in ds.tenders:
        if t["invoice"] in in_window_inv:
            tender_mix[t["mode"]] += t["amount"]
    prod_rows = []
    for p in prod.values():
        has_cost = p["cost"] > 0
        prod_rows.append({
            "sku": p["sku"], "name": p["name"], "category": p["category"],
            "revenue": r2(p["revenue"]), "units": r2(p["units"]),
            "share_pct": pct(p["revenue"], sum(x["revenue"] for x in prod.values())),
            "margin_pct": round((p["taxable"] - p["cost"]) / p["taxable"] * 100, 1) if has_cost and p["taxable"] > 0 else None,
        })
    by_rev = sorted(prod_rows, key=lambda r: -r["revenue"])
    by_units = sorted(prod_rows, key=lambda r: -r["units"])
    cat_rows = []
    cat_total = sum(c["revenue"] for c in cat.values())
    for k, c in sorted(cat.items(), key=lambda kv: -kv[1]["revenue"]):
        cat_rows.append({"category": k, "revenue": r2(c["revenue"]), "units": r2(c["units"]),
                         "share_pct": pct(c["revenue"], cat_total),
                         "margin_pct": round((c["taxable"] - c["cost"]) / c["taxable"] * 100, 1) if c["cost"] > 0 and c["taxable"] > 0 else None})
    wd_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    return {
        "status": "ok", "meta": meta(ds), "days": days,
        "kpis": {
            "revenue": r2(total_rev), "previous_revenue": r2(prev_total) if prev_covered else None,
            "revenue_change_pct": round((total_rev - prev_total) / prev_total * 100, 1) if prev_covered and prev_total > 0 else None,
            "previous_period_covered": prev_covered,
            "units": r2(sum(units)), "bills": n_bills,
            "avg_bill_value": r2(total_rev / n_bills) if n_bills else None,
            "active_products": len(prod_rows),
        },
        "daily": [{"date": d.isoformat(), "revenue": r2(r), "units": r2(u), "bills": b}
                  for d, r, u, b in zip(days_list, rev, units, bills)],
        "categories": cat_rows,
        "top_by_revenue": by_rev[:10], "top_by_units": by_units[:10],
        "bottom_products": [r for r in sorted(prod_rows, key=lambda r: r["revenue"])[:5]],
        "hourly": [{"hour": h, "bills": len(hours[h]["bills"]), "revenue": r2(hours[h]["revenue"])} for h in range(24) if h in hours],
        "weekday": [{"day": wd_names[i], "bills": len(weekday[i]["bills"]), "revenue": r2(weekday[i]["revenue"])} for i in range(7)],
        "payment_mix": [{"mode": m, "amount": r2(a), "share_pct": pct(a, sum(tender_mix.values()))}
                        for m, a in sorted(tender_mix.items(), key=lambda kv: -kv[1])],
    }


# --------------------------------------------------------------------------- trending
def trending_products(ds: Dataset, days: int = 14) -> dict:
    cur_eff = ds.eff_days(days)
    prev_eff = ds.eff_days(days, offset=days)
    if cur_eff == 0 or prev_eff < max(3, days // 2):
        return _no_data(ds, f"Trend detection compares the last {days} days with the {days} days before; "
                            f"only {ds.data_days} day(s) of sales exist so far.",
                        rising=[], cooling=[], new_entrants=[], categories=[])
    plan = stock_plan(ds)
    rising, cooling, entrants = [], [], []
    cat_cur: Dict[str, float] = defaultdict(float)
    cat_prev: Dict[str, float] = defaultdict(float)
    for sku, it in ds.items.items():
        cur_u, prev_u = ds.units(sku, days), ds.units(sku, days, offset=days)
        cat_cur[it["category"]] += ds.revenue(sku, days) / cur_eff
        cat_prev[it["category"]] += ds.revenue(sku, days, offset=days) / prev_eff
        if cur_u < 3 and prev_u < 3:
            continue
        # normalise by the days the item was actually on sale in each window (new listings)
        ce = ds.eff_days(days, since=it.get("created")) or cur_eff
        pe = ds.eff_days(days, offset=days, since=it.get("created"))
        p = plan[sku]
        base = {
            "sku": sku, "name": it["name"], "category": it["category"],
            "recent_units": r2(cur_u), "previous_units": r2(prev_u),
            "recent_revenue": r2(ds.revenue(sku, days)), "previous_revenue": r2(ds.revenue(sku, days, offset=days)),
            "stock": it["stock"], "days_of_cover": r2(p["days_of_cover"]),
        }
        if (prev_u == 0 or pe < 3) and cur_u >= 3:
            base.update(growth_pct=None, label="New entrant",
                        recommendation="Started selling in this period — watch repeat demand before stocking deep.")
            entrants.append(base)
            continue
        rc, rp = cur_u / ce, (prev_u / pe if pe else 0)
        g = (rc - rp) / rp * 100 if rp > 0 else 0
        base["growth_pct"] = round(g, 1)
        if g >= 20 and cur_u >= 5:                       # minimum volume so a few units don't read as a trend
            base["label"] = "Surging" if g >= 50 else "Rising"
            cover = p["days_of_cover"]
            if cover is not None and cover < p["lead_time_days"] + REVIEW_DAYS:
                base["recommendation"] = f"Demand is up {g:.0f}% and cover is only {cover:.0f} days — reorder now and feature at the counter."
            else:
                base["recommendation"] = f"Demand is up {g:.0f}% — give it prime shelf space and review the restock level."
            rising.append(base)
        elif g <= -20 and prev_u >= 5:
            base["label"] = "Cooling"
            base["recommendation"] = f"Demand is down {abs(g):.0f}% — avoid over-ordering; consider a promotion if stock is high."
            cooling.append(base)
    rising.sort(key=lambda r: -(r["growth_pct"] or 0))
    cooling.sort(key=lambda r: (r["growth_pct"] or 0))
    entrants.sort(key=lambda r: -r["recent_units"])
    cats = []
    for c in cat_cur:
        a, b = cat_cur[c], cat_prev[c]
        cats.append({"category": c, "recent_daily_revenue": r2(a), "previous_daily_revenue": r2(b),
                     "growth_pct": round((a - b) / b * 100, 1) if b > 0 else None})
    cats.sort(key=lambda c: -(c["growth_pct"] if c["growth_pct"] is not None else -999))
    return {"status": "ok", "meta": meta(ds), "window_days": days,
            "summary": {"rising": len(rising), "cooling": len(cooling), "new_entrants": len(entrants)},
            "rising": rising[:15], "cooling": cooling[:10], "new_entrants": entrants[:10], "categories": cats}


# --------------------------------------------------------------------------- new products
def new_product_prediction(ds: Dataset, new_days: int = 60) -> dict:
    cutoff = ds.today - timedelta(days=new_days)
    new_items = [s for s, it in ds.items.items() if it.get("created") and it["created"] >= cutoff]
    if not new_items:
        return {"status": "ok", "meta": meta(ds), "new_days": new_days, "summary": {"products": 0},
                "message": f"No products were added in the last {new_days} days.", "items": []}
    w = max(1, min(ds.data_days, 30))
    established = {s: it for s, it in ds.items.items() if s not in new_items}
    vel = {s: ds.units(s, w) / w for s in ds.items}
    out = []
    for sku in new_items:
        it = ds.items[sku]
        start = it["created"]
        if ds.first_sale_day and ds.first_sale_day > start:
            start = ds.first_sale_day
        days_live = max(1, (ds.today - start).days + 1)
        qty_map = ds._index()[0].get(sku, {})
        sold = sum(max(0.0, q) for d, q in qty_map.items() if d >= start)
        txn = sum(1 for l in ds.lines if l["sku"] == sku)
        v = sold / days_live
        peers = [vel[s] for s, e in established.items() if e["category"] == it["category"]]
        basis = "established products in the same category"
        if not peers or _median(peers) <= 0:
            peers = [vel[s] for s, e in ds.items.items() if s != sku and e["category"] == it["category"]]
            basis = "all other products in the same category"
        if not peers or _median(peers) <= 0:
            peers = [x for s, x in vel.items() if s != sku and x > 0]
            basis = "all selling products in the store"
        bench = _median(peers) if peers else 0.0
        ratio = v / bench if bench > 0 else None
        sell_through = sold / (sold + it["stock"]) if (sold + it["stock"]) > 0 else None
        cost = _item_cost(it)
        margin = (it["price"] - cost) / it["price"] if cost > 0 and it["price"] > 0 else None
        trend = None
        if days_live >= 6:
            half = days_live // 2
            mid = ds.today - timedelta(days=days_live - half - 1)
            first = sum(max(0.0, q) for d, q in qty_map.items() if start <= d < mid) / max(1, half)
            second = sum(max(0.0, q) for d, q in qty_map.items() if d >= mid) / max(1, days_live - half)
            trend = 1.0 if (first == 0 and second == 0) else 2.0 if first == 0 else min(2.0, second / first)
        ret_units = sum(r["qty"] for r in ds.returns if r["sku"] == sku)
        ret_rate = ret_units / sold if sold > 0 else None
        comps = []
        if ratio is not None:
            comps.append((45, min(100.0, ratio * 70)))
        if sell_through is not None:
            comps.append((20, min(100.0, sell_through / 0.5 * 100)))
        if margin is not None:
            comps.append((15, max(0.0, min(100.0, margin / 0.35 * 100))))
        if trend is not None:
            comps.append((15, min(100.0, trend * 50)))
        if ret_rate is not None:
            comps.append((5, 100 - min(100.0, ret_rate * 500)))
        score = round(sum(wt * s for wt, s in comps) / sum(wt for wt, _ in comps)) if comps else None
        early = days_live < 5 or (sold == 0 and days_live < 7)
        if early:
            verdict = "Too early to call"
        elif sold == 0:
            verdict = "At risk"
        else:
            verdict = "Likely success" if score >= 70 else "Watch" if score >= 45 else "At risk"
        factors = []
        if ratio is not None:
            factors.append(f"Sells {v:.2f}/day vs benchmark {bench:.2f}/day ({ratio * 100:.0f}% of {basis})")
        elif bench == 0:
            factors.append("No comparable products have sales yet, so there is no velocity benchmark")
        if sell_through is not None:
            factors.append(f"Sell-through {sell_through * 100:.0f}% ({sold:g} sold, {it['stock']:g} left)")
        if margin is not None:
            factors.append(f"Gross margin {margin * 100:.0f}% on list price")
        if trend is not None:
            factors.append("Sales accelerating" if trend > 1.15 else "Sales slowing" if trend < 0.85 else "Sales steady")
        if ret_rate:
            factors.append(f"{ret_rate * 100:.0f}% of units returned")
        rec = {"Likely success": "Build stock depth and keep it on prime shelf space.",
               "Watch": "Hold current stock; consider a launch promotion or better placement to lift velocity.",
               "At risk": "Do not reorder yet — run a promotion or review the listing before committing more capital.",
               "Too early to call": "Not enough selling days yet; re-check after a week of sales."}[verdict]
        conf = "high" if days_live >= 21 and txn >= 20 else "medium" if days_live >= 10 and txn >= 5 else "low"
        out.append({
            "sku": sku, "name": it["name"], "category": it["category"], "added_on": _iso(it["created"]),
            "days_on_shelf": days_live, "units_sold": r2(sold), "stock": it["stock"],
            "daily_velocity": r2(v), "benchmark_velocity": r2(bench), "velocity_vs_benchmark_pct": None if ratio is None else round(ratio * 100),
            "sell_through_pct": None if sell_through is None else round(sell_through * 100, 1),
            "margin_pct": None if margin is None else round(margin * 100, 1),
            "success_score": None if early and score is None else score, "verdict": verdict,
            "confidence": conf, "factors": factors, "recommendation": rec,
        })
    order = {"Likely success": 0, "Watch": 1, "At risk": 2, "Too early to call": 3}
    out.sort(key=lambda r: (order[r["verdict"]], -(r["success_score"] or 0)))
    counts: Dict[str, int] = defaultdict(int)
    for o in out:
        counts[o["verdict"]] += 1
    return {"status": "ok", "meta": meta(ds), "new_days": new_days,
            "method": "Rule-based success score (0-100): velocity vs category benchmark 45%, sell-through 20%, margin 15%, trend 15%, returns 5%.",
            "summary": {"products": len(out), **{k: counts.get(k, 0) for k in order}}, "items": out}


# --------------------------------------------------------------------------- discounts
def _active_discounts(ds: Dataset, sku: str) -> List[str]:
    names = []
    for d in ds.discounts:
        if d["status"] != "active":
            continue
        if d["start"] and d["start"] > ds.today:
            continue
        if d["end"] and d["end"] < ds.today:
            continue
        if d["applies_to"] == "all" or sku in d["skus"]:
            names.append(d["name"])
    return names


def discount_recommendations(ds: Dataset) -> dict:
    plan = stock_plan(ds)
    recs: List[dict] = []
    seen = set()

    def build(sku: str, reason: str, detail: str, base_pct: float, extra: dict):
        it = ds.items[sku]
        cost = _item_cost(it)
        price = it["price"]
        margin = (price - cost) / price * 100 if cost > 0 and price > 0 else None
        if margin is None:
            disc, cap_note = base_pct, "Cost unknown — capped suggestion at 10%"
            disc = min(disc, 10.0)
        else:
            cap = max(0.0, margin * 0.6)          # keep at least 40% of the unit margin
            disc = min(base_pct, cap)
            cap_note = f"Capped to keep ≥40% of the {margin:.0f}% margin" if disc < base_pct else f"Within margin ({margin:.0f}%)"
        disc = math.floor(disc / 5) * 5 if disc >= 5 else round(disc, 1)   # floor so the margin cap is never exceeded
        if disc <= 0:
            return
        new_price = price * (1 - disc / 100)
        uplift = None
        if margin is not None and price - cost > 0 and new_price - cost > 0:
            uplift = round(((price - cost) / (new_price - cost) - 1) * 100)
        p = plan[sku]
        recs.append({
            "sku": sku, "name": it["name"], "category": it["category"], "reason": reason, "detail": detail,
            "stock": it["stock"], "price": r2(price), "unit_cost": r2(cost),
            "suggested_discount_pct": disc, "suggested_price": r2(new_price), "margin_note": cap_note,
            "break_even_unit_uplift_pct": uplift,
            "capital_tied": r2(it["stock"] * cost), "days_of_cover": r2(p["days_of_cover"]),
            "active_discounts": _active_discounts(ds, sku), **extra,
        })

    # expiring batches
    for b in ds.batches:
        sku = b["sku"]
        if sku not in ds.items or not b["expiry"] or b["qty"] <= 0:
            continue
        left = (b["expiry"] - ds.today).days
        if left > 30:
            continue
        demand = plan[sku]["daily_demand"]
        at_risk = max(0.0, b["qty"] - demand * max(left, 0))
        if left < 0:
            recs.append({
                "sku": sku, "name": ds.items[sku]["name"], "category": ds.items[sku]["category"],
                "reason": "Expired batch", "detail": f"Batch {b['batch_no']} expired {abs(left)} day(s) ago with {b['qty']:g} units — withdraw from sale and write off via Stock Adjustment; do not discount.",
                "stock": ds.items[sku]["stock"], "price": r2(ds.items[sku]["price"]), "unit_cost": r2(_item_cost(ds.items[sku])),
                "suggested_discount_pct": 0, "suggested_price": r2(ds.items[sku]["price"]), "margin_note": "Not sellable",
                "break_even_unit_uplift_pct": None, "capital_tied": r2(b["qty"] * _item_cost(ds.items[sku])),
                "days_of_cover": None, "active_discounts": [], "batch_no": b["batch_no"], "days_to_expiry": left,
                "units_at_risk": b["qty"], "priority": "high", "type": "write_off"})
            continue
        if at_risk <= 0:
            continue
        base = 30.0 if left <= 7 else 20.0 if left <= 14 else 10.0
        seen.add(sku)
        build(sku, "Expiring stock",
              f"Batch {b['batch_no']}: {b['qty']:g} units expire in {left} day(s); at the current {demand:.2f}/day only ≈{demand * left:.0f} will sell.",
              base, {"batch_no": b["batch_no"], "days_to_expiry": left, "units_at_risk": round(at_risk, 1),
                     "priority": "high" if left <= 7 else "medium", "type": "expiry"})

    # excess / slow stock
    for sku, p in plan.items():
        if sku in seen or p["stock"] <= 0:
            continue
        it = ds.items[sku]
        older_than_window = it.get("created") and (ds.today - it["created"]).days >= 14
        if ds.data_days < 14 and p["daily_demand"] == 0:
            continue
        cover = p["days_of_cover"]
        if cover is None:
            if not older_than_window and ds.data_days < 30:
                continue
            base, detail = 20.0, f"{p['stock']:g} units in stock but no sales recorded in the last {min(ds.data_days, 56)} days."
        elif cover > 60:
            base = 10.0 if cover <= 90 else 15.0 if cover <= 180 else 20.0
            detail = f"{p['stock']:g} units = {cover:.0f} days of cover at {p['daily_demand']:.2f}/day (healthy is ≤ {p['lead_time_days'] + REVIEW_DAYS:.0f})."
        else:
            continue
        build(sku, "Slow-moving / excess stock", detail, base, {"priority": "medium", "type": "excess"})

    rank = {"high": 0, "medium": 1, "low": 2}
    recs.sort(key=lambda r: (rank[r["priority"]], -(r["capital_tied"] or 0)))
    return {"status": "ok", "meta": meta(ds),
            "summary": {"recommendations": len(recs),
                        "expiring": sum(1 for r in recs if r["type"] == "expiry"),
                        "excess": sum(1 for r in recs if r["type"] == "excess"),
                        "write_offs": sum(1 for r in recs if r["type"] == "write_off"),
                        "capital_tied": r2(sum(r["capital_tied"] or 0 for r in recs))},
            "method": "Discount depth scales with days-to-expiry / days-of-cover and is capped so ≥40% of unit margin is kept. "
                      "break_even_unit_uplift_pct is the extra unit volume needed to keep the same total profit.",
            "items": recs}


# --------------------------------------------------------------------------- forecasting
def _ols(ys: List[float]) -> Tuple[float, float]:
    n = len(ys)
    if n < 2:
        return (ys[0] if ys else 0.0), 0.0
    xs = list(range(n))
    mx, my = _mean(xs), _mean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else 0.0
    return my - slope * mx, slope


def _fit_forecast(vals: List[float], start_day: date, horizon: int) -> dict:
    n = len(vals)
    days = [start_day + timedelta(days=i) for i in range(n)]
    idx: Dict[int, float] = {}
    if n >= 14 and _mean(vals) > 0:
        overall = _mean(vals)
        by_dow: Dict[int, List[float]] = defaultdict(list)
        for d, v in zip(days, vals):
            by_dow[d.weekday()].append(v)
        for k, xs in by_dow.items():
            raw = _mean(xs) / overall
            idx[k] = 1 + (raw - 1) * len(xs) / (len(xs) + 1.0)      # shrink towards 1 for few observations
        m = _mean([idx.get(k, 1.0) for k in range(7)])
        idx = {k: idx.get(k, 1.0) / m for k in range(7)}
    deseason = [v / max(idx.get(d.weekday(), 1.0), 0.2) for d, v in zip(days, vals)]
    m = min(n, 14)
    tn = min(n, 28)
    intercept, slope = _ols(deseason[-tn:])
    damp = 0.5 if tn >= 10 else 0.0
    level = _mean(deseason[-m:])
    resid = [y - (intercept + slope * i) for i, y in enumerate(deseason[-tn:])]
    sigma = _std(resid)
    fc = []
    for h in range(1, horizon + 1):
        d = start_day + timedelta(days=n - 1 + h)
        s = idx.get(d.weekday(), 1.0)
        base = level + slope * damp * ((m - 1) / 2 + h)
        mid = max(0.0, base * s)
        band = 1.28 * sigma * s
        fc.append({"date": d.isoformat(), "value": mid, "low": max(0.0, mid - band), "high": mid + band})
    return {"forecast": fc, "seasonal": bool(idx), "trend_per_day": slope * damp, "sigma": sigma}


def demand_forecast(ds: Dataset, horizon: int = 14) -> dict:
    n_hist = min(ds.data_days, 56)
    if n_hist < 7:
        return _no_data(ds, f"Forecasting needs at least 7 days of sales history; {ds.data_days} day(s) recorded so far.",
                        history=[], forecast=[], items=[])
    days, rev, units, _ = ds.store_daily(n_hist)
    start = days[0]
    span = max(horizon, 14)                      # summary cards need 14 days whatever horizon the table shows
    fr = _fit_forecast(rev, start, span)
    fu = _fit_forecast(units, start, span)
    wape = None
    if n_hist >= 21:
        bt = _fit_forecast(rev[:-7], start, 7)
        actual = rev[-7:]
        if sum(actual) > 0:
            wape = round(sum(abs(a - f["value"]) for a, f in zip(actual, bt["forecast"])) / sum(actual) * 100, 1)
    forecast_rows = [{"date": a["date"], "revenue": r2(a["value"]), "revenue_low": r2(a["low"]), "revenue_high": r2(a["high"]),
                      "units": r2(b["value"]), "units_low": r2(b["low"]), "units_high": r2(b["high"])}
                     for a, b in list(zip(fr["forecast"], fu["forecast"]))[:horizon]]
    last7 = sum(rev[-7:])
    next7 = sum(f["value"] for f in fr["forecast"][:7])
    plan = stock_plan(ds)
    top = sorted(ds.items, key=lambda s: -ds.revenue(s, 30))[:12]
    item_rows = []
    for sku in top:
        p = plan[sku]
        if p["daily_demand"] <= 0:
            continue
        f7, f14 = p["daily_demand"] * 7, p["daily_demand"] * 14
        avail = p["stock"] + p["on_order"]
        item_rows.append({
            "sku": sku, "name": p["name"], "daily_demand": r2(p["daily_demand"]),
            "forecast_7d": r2(f7), "forecast_14d": r2(f14), "stock": p["stock"], "on_order": p["on_order"],
            "shortfall_7d": r2(max(0.0, f7 - avail)), "shortfall_14d": r2(max(0.0, f14 - avail)),
            "days_of_cover": r2(p["days_of_cover"]),
        })
    conf = "high" if n_hist >= 42 and (wape is not None and wape < 25) else "medium" if n_hist >= 21 else "low"
    return {
        "status": "ok", "meta": meta(ds), "horizon_days": horizon,
        "method": "Weekday seasonality + damped linear trend on the deseasonalised daily series; band = ±1.28σ (≈80%).",
        "model": {"seasonal": fr["seasonal"], "history_days": n_hist, "backtest_wape_pct": wape, "confidence": conf},
        "summary": {"next_7d_revenue": r2(next7), "last_7d_revenue": r2(last7),
                    "change_pct": round((next7 - last7) / last7 * 100, 1) if last7 > 0 else None,
                    "next_14d_revenue": r2(sum(f["value"] for f in fr["forecast"][:14])),
                    "next_7d_units": r2(sum(f["value"] for f in fu["forecast"][:7]))},
        "history": [{"date": d.isoformat(), "revenue": r2(r), "units": r2(u)} for d, r, u in zip(days, rev, units)],
        "forecast": forecast_rows, "items": item_rows,
    }


# --------------------------------------------------------------------------- business summary
def business_summary(ds: Dataset, days: int = 30) -> dict:
    if ds.data_days == 0 and not ds.items:
        return _no_data(ds, "No items or sales found in the database yet.")
    viz = sales_visualizations(ds, days) if ds.data_days else None
    reorder = low_stock_reorder_list(ds)
    vend = vendor_intelligence(ds)
    disc = discount_recommendations(ds)
    trend = trending_products(ds, min(14, days))
    kpis: Dict[str, Any] = {}
    sections: List[dict] = []
    priorities: List[dict] = []

    # Sales
    if viz and viz.get("status") == "ok":
        k = viz["kpis"]
        kpis.update(revenue=k["revenue"], bills=k["bills"], avg_bill_value=k["avg_bill_value"],
                    revenue_change_pct=k["revenue_change_pct"])
        top_cat = viz["categories"][0] if viz["categories"] else None
        top_prod = viz["top_by_revenue"][0] if viz["top_by_revenue"] else None
        chg = k["revenue_change_pct"]
        text = f"Sales of ₹{k['revenue']:,.0f} across {k['bills']} bills (average ₹{k['avg_bill_value'] or 0:,.0f} per bill) in the last {days} days"
        if chg is not None:
            text += f", {'up' if chg >= 0 else 'down'} {abs(chg):.1f}% on the previous {days} days."
        else:
            text += "; there is no earlier period to compare against yet."
        if top_cat:
            text += f" {top_cat['category']} leads with {top_cat['share_pct']}% of revenue"
            if top_prod:
                text += f", and {top_prod['name']} is the top product (₹{top_prod['revenue']:,.0f})."
        status = "good" if chg is None or chg >= 0 else "watch" if chg > -15 else "risk"
        sections.append({"title": "Sales performance", "status": status, "text": text})
        margins = [c for c in viz["categories"] if c["margin_pct"] is not None]
        if margins:
            w = sum(c["revenue"] for c in margins)
            blended = sum(c["margin_pct"] * c["revenue"] for c in margins) / w if w else 0
            kpis["blended_margin_pct"] = round(blended, 1)
            best = max(margins, key=lambda c: c["margin_pct"])
            worst = min(margins, key=lambda c: c["margin_pct"])
            sections.append({"title": "Profitability", "status": "good" if blended >= 20 else "watch",
                             "text": f"Blended gross margin is about {blended:.1f}% (on catalogue cost). {best['category']} is the most profitable category "
                                     f"({best['margin_pct']}%); {worst['category']} is the thinnest ({worst['margin_pct']}%)."})
    else:
        sections.append({"title": "Sales performance", "status": "watch",
                         "text": "No sales have been recorded yet, so revenue insights will appear after the first bills are rung up."})

    # Inventory
    rs = reorder["summary"]
    kpis.update(low_stock_items=rs["items"], out_of_stock=rs["out_of_stock"], reorder_value=rs["est_total_cost"])
    inv_status = "risk" if rs["critical"] else "watch" if rs["items"] else "good"
    if rs["items"]:
        first = reorder["items"][0]
        itxt = (f"{rs['items']} item(s) need reordering ({rs['critical']} critical, {rs['out_of_stock']} out of stock) — "
                f"an estimated ₹{rs['est_total_cost']:,.0f} to restock. Most urgent: {first['name']}.")
        priorities.append({"area": "Inventory", "title": f"Reorder {rs['items']} low-stock item(s)",
                           "detail": f"Est. ₹{rs['est_total_cost']:,.0f}; start with {first['name']} ({first['urgency']}).", "link": "low-stock"})
    else:
        itxt = "All items are above their reorder points."
    sections.append({"title": "Inventory health", "status": inv_status, "text": itxt})

    ds_sum = disc["summary"]
    kpis.update(capital_at_risk=ds_sum["capital_tied"])
    if ds_sum["recommendations"]:
        top_d = disc["items"][0]
        sections.append({"title": "Stock at risk", "status": "watch" if not ds_sum["write_offs"] else "risk",
                         "text": f"{ds_sum['expiring']} expiring-batch and {ds_sum['excess']} slow-moving recommendation(s), with ≈₹{ds_sum['capital_tied']:,.0f} of stock value involved. "
                                 f"Top case: {top_d['name']} — {top_d['reason'].lower()}."})
        priorities.append({"area": "Discounts", "title": f"Act on {ds_sum['recommendations']} stock-at-risk item(s)",
                           "detail": f"{top_d['name']}: {top_d['detail']}", "link": "discounts"})

    # Procurement / vendors
    vs = vend["summary"]
    kpis.update(total_payable=vs["total_payable"], vendor_avg_score=vs["avg_score"])
    vtxt = f"₹{vs['total_payable']:,.0f} is payable across {vs['vendors']} vendors."
    if vs["avg_score"] is not None:
        vtxt += f" Average vendor score is {vs['avg_score']:.0f}/100 (best: {vs['best_vendor']}"
        vtxt += f", weakest: {vs['weakest_vendor']})." if vs["weakest_vendor"] else ")."
    if vs["overdue_open_pos"]:
        vtxt += f" {vs['overdue_open_pos']} open purchase order(s) are past their expected date."
        priorities.append({"area": "Procurement", "title": f"Chase {vs['overdue_open_pos']} overdue purchase order(s)",
                           "detail": "Open POs past their expected delivery date.", "link": "vendors"})
    sections.append({"title": "Vendors & payables", "status": "watch" if vs["overdue_open_pos"] else "good", "text": vtxt})

    # Trends
    if trend.get("status") == "ok" and (trend["rising"] or trend["cooling"]):
        parts = []
        if trend["rising"]:
            r = trend["rising"][0]
            parts.append(f"{r['name']} is {r['label'].lower()} (+{r['growth_pct']:.0f}%)")
            priorities.append({"area": "Trends", "title": f"Back the rising product: {r['name']}",
                               "detail": r["recommendation"], "link": "trending"})
        if trend["cooling"]:
            c = trend["cooling"][0]
            parts.append(f"{c['name']} is cooling ({c['growth_pct']:.0f}%)")
        sections.append({"title": "Momentum", "status": "good", "text": "; ".join(parts) + "."})

    rank = {"Inventory": 0, "Discounts": 1, "Procurement": 2, "Trends": 3}
    priorities.sort(key=lambda p: rank.get(p["area"], 9))
    statuses = [s["status"] for s in sections]
    overall = "risk" if "risk" in statuses else "watch" if "watch" in statuses else "good"
    headline = {"good": "The business is in good shape.", "watch": "A few areas need attention.",
                "risk": "Some areas need urgent attention."}[overall]
    return {"status": "ok", "meta": meta(ds), "window_days": days, "headline": headline, "overall": overall,
            "kpis": kpis, "sections": sections, "priorities": priorities[:6],
            "note": ("SAMPLE DATA — generated demo figures, not your business records."
                     if ds.is_demo else
                     "Generated by rule-based analysis of live database records; figures refresh on every load.")}
