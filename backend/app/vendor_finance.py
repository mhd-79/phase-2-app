"""Vendor finance summary: due dates, payable aging, purchase / PO / payment summaries, performance, price history and alerts.

Pure functions over plain dicts so the numbers can be unit-tested without a database. Dates are YYYY-MM-DD strings.

Inputs (all lists of dicts):
  grns      {id, date, total, po_id, lines: [{sku, name, qty, cost}]}
  returns   {id, date, total, lines: [{qty}]}
  payments  {id, date, amount, mode, reference}
  pos       {id, date, expected, status, lines: [{sku, name, ordered_qty, received_qty, cost}]}
"""
import re
from datetime import date, datetime, timedelta
from typing import Optional

from app.procurement import norm_po_status

RETURN_RATE_ALERT = 5.0          # % of received units sent back
PRICE_RISE_ALERT = 10.0          # % rise against the previous purchase price
AGING_BUCKETS = ("current", "d1_30", "d31_60", "d61_90", "d90_plus")
OPEN_PO = {"Approved", "Ordered", "Partially Received"}      # waiting for goods


def _d(value: Optional[str]) -> Optional[date]:
    try:
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date() if value else None
    except ValueError:
        return None


def terms_days(terms: Optional[str]) -> int:
    """'Net 30' -> 30, 'Due on Delivery' -> 0; anything unreadable counts as due on delivery."""
    m = re.search(r"(\d+)", terms or "")
    return int(m.group(1)) if m else 0


def _r2(x: float) -> float:
    return round(x + 0.0, 2)


def _bucket(days_overdue: int) -> str:
    if days_overdue <= 0:
        return "current"
    if days_overdue <= 30:
        return "d1_30"
    if days_overdue <= 60:
        return "d31_60"
    if days_overdue <= 90:
        return "d61_90"
    return "d90_plus"


def _running_ledger(opening: float, grns: list, returns: list, payments: list) -> list:
    """Every purchase, return and payment in date order with the balance owed after it (newest first)."""
    events = [(g["date"], 0, "Purchase", g["id"], g["total"], g.get("po_id")) for g in grns]
    events += [(r["date"], 1, "Return", r["id"], -r["total"], None) for r in returns]
    events += [(p["date"], 2, "Payment", p["id"], -p["amount"], p) for p in payments]
    events.sort(key=lambda e: (e[0] or "", e[1], e[3]))
    balance, out = opening, []
    for day, _, kind, ref, amount, extra in events:
        balance += amount
        if kind == "Purchase":
            label = f"{ref} ({extra})" if extra else f"{ref} (direct)"
        elif kind == "Payment":
            label = f"{ref} ({extra.get('mode') or ''}{' · ' + extra['reference'] if extra.get('reference') else ''})"
        else:
            label = ref
        out.append({"date": day, "type": kind, "ref": label, "amount": _r2(amount), "balance": _r2(balance)})
    out.reverse()
    return out


def build_vendor_summary(*, payable: float, terms: str, today: date, grns: list, returns: list, payments: list, pos: list) -> dict:
    grns = sorted(grns, key=lambda g: (g["date"] or "", g["id"]))
    net_days = terms_days(terms)
    purchases_total = sum(g["total"] for g in grns)
    returns_total = sum(r["total"] for r in returns)
    payments_total = sum(p["amount"] for p in payments)
    # a payable that predates the ledger records (e.g. a seeded balance): no due date is known, so it counts as Current
    opening = max(0.0, payable - (purchases_total - returns_total - payments_total))

    # ---- oldest-first allocation of returns and payments, then aging of what is left on each receipt
    credit = returns_total + payments_total
    to_cover = opening
    used = min(credit, to_cover)
    opening_left = to_cover - used
    credit -= used
    aging = {k: 0.0 for k in AGING_BUCKETS}
    aging["current"] += opening_left
    due_items = []                      # (due date, amount) of what is still unpaid on receipts
    for g in grns:
        left = g["total"] - min(credit, g["total"])
        credit -= min(credit, g["total"])
        if left <= 0.005:
            continue
        gd = _d(g["date"])
        due = (gd + timedelta(days=net_days)) if gd else today
        aging[_bucket((today - due).days)] += left
        due_items.append((due, left))

    overdue_amt = sum(a for d, a in due_items if d < today)
    due_today = sum(a for d, a in due_items if d == today)
    due_week = sum(a for d, a in due_items if today <= d <= today + timedelta(days=6))
    upcoming = sorted(d for d, _ in due_items if d >= today)
    oldest_overdue = min((d for d, _ in due_items if d < today), default=None)

    financial = {
        "totalOutstanding": _r2(payable),
        "dueToday": _r2(due_today),
        "dueThisWeek": _r2(due_week),
        "overdue": _r2(overdue_amt),
        "nextDueDate": upcoming[0].isoformat() if upcoming else None,
        "totalPurchases": _r2(purchases_total),
        "totalReturns": _r2(returns_total),
        "totalPayments": _r2(payments_total),
        "openingBalance": _r2(opening),
        "paymentTerms": terms,
    }
    aging_out = {**{k: _r2(v) for k, v in aging.items()}, "total": _r2(sum(aging.values()))}

    purchase = {
        "purchaseValue": _r2(purchases_total),
        "purchaseCount": len(grns),
        "returnValue": _r2(returns_total),
        "returnCount": len(returns),
        "netPurchases": _r2(purchases_total - returns_total),
        "netPayable": _r2(payable),
    }

    # ---- purchase orders
    po_counts = {"pending": 0, "partiallyReceived": 0, "received": 0, "overdue": 0}
    overdue_pos = []
    first_grn: dict = {}
    for g in grns:
        if g.get("po_id") and g["po_id"] not in first_grn:
            first_grn[g["po_id"]] = _d(g["date"])
    for p in pos:
        status = norm_po_status(p["status"])
        if status in ("Pending", "Approved", "Ordered"):
            po_counts["pending"] += 1
        elif status == "Partially Received":
            po_counts["partiallyReceived"] += 1
        elif status == "Received":
            po_counts["received"] += 1
        exp = _d(p.get("expected"))
        waiting = any(l["received_qty"] < l["ordered_qty"] for l in p["lines"])
        if status in OPEN_PO and waiting and exp and exp < today:
            po_counts["overdue"] += 1
            overdue_pos.append({"id": p["id"], "expected": p["expected"], "daysOverdue": (today - exp).days, "status": status})
    overdue_pos.sort(key=lambda o: -o["daysOverdue"])

    # ---- performance
    on_time = late = 0
    delivery_days = []
    ordered_qty = received_qty = 0.0
    for p in pos:
        status = norm_po_status(p["status"])
        got = sum(l["received_qty"] for l in p["lines"])
        if got > 0 or status in ("Received", "Partially Received"):
            ordered_qty += sum(l["ordered_qty"] for l in p["lines"])
            received_qty += got
        fd, exp, pd = first_grn.get(p["id"]), _d(p.get("expected")), _d(p.get("date"))
        if fd and exp:
            if fd <= exp:
                on_time += 1
            else:
                late += 1
        if fd and pd:
            delivery_days.append((fd - pd).days)
    units_received = sum(l["qty"] for g in grns for l in g["lines"])
    units_returned = sum(l["qty"] for r in returns for l in r["lines"])
    performance = {
        "onTimePct": round(on_time * 100.0 / (on_time + late), 1) if (on_time + late) else None,
        "fulfillmentPct": round(min(100.0, received_qty * 100.0 / ordered_qty), 1) if ordered_qty > 0 else None,
        "returnRatePct": round(units_returned * 100.0 / units_received, 1) if units_received > 0 else None,
        "avgDeliveryDays": round(sum(delivery_days) / len(delivery_days), 1) if delivery_days else None,
        "deliveredPos": on_time + late,
    }

    # ---- price history: what was actually paid on receipts, plus ordered prices on POs that have no receipt yet
    points: dict = {}
    for g in grns:
        for l in g["lines"]:
            points.setdefault(l["sku"], {"name": l["name"], "pts": []})["pts"].append((g["date"] or "", l["cost"], g["id"]))
    for p in pos:
        if p["id"] in first_grn or norm_po_status(p["status"]) in ("Draft", "Cancelled"):
            continue
        for l in p["lines"]:
            points.setdefault(l["sku"], {"name": l["name"], "pts": []})["pts"].append((p["date"] or "", l["cost"], p["id"]))
    price_history = []
    for sku, info in points.items():
        pts = sorted(info["pts"], key=lambda x: x[0])
        changes = []                       # only the points where the price moved
        for day, cost, ref in pts:
            if not changes or abs(changes[-1]["cost"] - cost) > 1e-9:
                changes.append({"date": day, "cost": cost, "ref": ref})
        current = changes[-1]["cost"]
        previous = changes[-2]["cost"] if len(changes) > 1 else None
        change_pct = round((current - previous) * 100.0 / previous, 1) if previous else None
        price_history.append({"sku": sku, "name": info["name"], "current": current, "previous": previous, "changePct": change_pct,
                              "lastChange": changes[-1]["date"] if previous is not None else None, "history": changes[-6:]})
    price_history.sort(key=lambda r: (-(abs(r["changePct"]) if r["changePct"] is not None else -1), r["sku"]))

    # ---- payment history with the balance left after each payment
    ledger = _running_ledger(opening, grns, returns, payments)
    balance_after = {e["ref"].split(" ")[0]: e["balance"] for e in ledger if e["type"] == "Payment"}
    payment_history = sorted(
        ({"id": p["id"], "date": p["date"], "amount": _r2(p["amount"]), "mode": p.get("mode"), "reference": p.get("reference"),
          "balanceAfter": balance_after.get(p["id"])} for p in payments),
        key=lambda p: (p["date"] or "", p["id"]), reverse=True)

    # ---- alerts
    alerts = []
    if overdue_amt > 0.005:
        days = (today - oldest_overdue).days if oldest_overdue else 0
        alerts.append({"type": "overdue_payment", "severity": "danger",
                       "message": f"₹{overdue_amt:,.2f} is overdue for payment (oldest {days} day{'s' if days != 1 else ''} past due)"})
    if overdue_pos:
        worst = overdue_pos[0]
        alerts.append({"type": "overdue_po", "severity": "warning",
                       "message": f"{len(overdue_pos)} purchase order{'s are' if len(overdue_pos) != 1 else ' is'} past the expected delivery date (latest: {worst['id']}, {worst['daysOverdue']} days late)"})
    if performance["returnRatePct"] is not None and performance["returnRatePct"] > RETURN_RATE_ALERT:
        alerts.append({"type": "high_return_rate", "severity": "warning",
                       "message": f"{performance['returnRatePct']}% of received units were returned (alert above {RETURN_RATE_ALERT:g}%)"})
    for row in price_history:
        if row["changePct"] is not None and row["changePct"] >= PRICE_RISE_ALERT:
            alerts.append({"type": "price_increase", "severity": "warning",
                           "message": f"{row['name']} ({row['sku']}) price rose {row['changePct']}%: ₹{row['previous']:.2f} to ₹{row['current']:.2f}"})

    return {
        "financial": financial, "aging": aging_out, "purchase": purchase,
        "purchaseOrders": {**po_counts, "overdueList": overdue_pos},
        "performance": performance, "priceHistory": price_history,
        "paymentHistory": payment_history, "ledger": ledger, "alerts": alerts,
    }
