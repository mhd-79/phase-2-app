"""
Customer behaviour analysis for AI Insights (Phase 2).

Built only from what billing already records: completed invoices that carry a customer (Sale.customer_id), their line items,
payment tenders and the item categories. Nothing is estimated or invented: with no customer invoices the result says so.
"""
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from itertools import combinations
from statistics import median
from typing import Any, Dict, List, Optional

from app import insights_engine as eng

ACTIVE_DAYS = 14          # bought within the last 14 days -> active
LESS_ACTIVE_DAYS = 30     # 15-30 days -> less active; beyond that -> inactive
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _meta(bills: int, data_days: int, items: int, first_day, today, is_demo: bool = False) -> Dict[str, Any]:
    if data_days == 0:
        conf = "none"
    elif data_days < 14 or bills < 20:
        conf = "low"
    elif data_days < 45 or bills < 100:
        conf = "medium"
    else:
        conf = "high"
    return {
        "generated_at": datetime.now(eng.IST).isoformat(timespec="seconds"),
        "as_of": today.isoformat(),
        "first_sale_date": first_day.isoformat() if first_day else None,
        "data_days": data_days,
        "bills_analysed": bills,
        "items_analysed": items,
        "confidence": conf,
        "is_demo": is_demo,
        "source": "PostgreSQL (completed invoices that carry a customer, with their items, payments and item categories)",
    }


def _pct(part: float, whole: float) -> Optional[float]:
    return round(part / whole * 100, 1) if whole else None


async def customer_behavior(db, days: int = 90) -> Dict[str, Any]:
    now = datetime.now(eng.IST)
    today = now.date()

    customers = await db.customer.find_many()
    cust = {c.id: c for c in customers}
    items = await db.item.find_many()
    category_of = {i.sku: i.category_name for i in items}
    sales_all = await db.sale.find_many(where={"customer_id": {"not": None}}, order={"time": "asc"}, include={"items": True, "tenders": True})

    def local(s):
        return s.time.astimezone(eng.IST)

    if not sales_all:
        return {"status": "insufficient_data", "meta": _meta(0, 0, len(items), None, today),
                "message": "No invoices with a customer yet. Attach a customer to a bill at Billing (search by customer number or mobile, "
                           "or add a new one) and this analysis builds itself from those invoices.",
                "kpis": {"customers_registered": len(customers)}}

    first_day = local(sales_all[0]).date()
    data_days = (today - first_day).days + 1
    cutoff = None if days == 0 else now - timedelta(days=days)
    sales = [s for s in sales_all if cutoff is None or local(s) >= cutoff]

    if not sales:
        return {"status": "insufficient_data", "meta": _meta(0, data_days, len(items), first_day, today),
                "message": f"No customer invoices in the last {days} days. Choose a longer period to see the analysis.",
                "kpis": {"customers_registered": len(customers)}}

    # ---------------- per customer (selected period) ----------------
    by_cust: Dict[str, List[Any]] = defaultdict(list)
    for s in sales:
        by_cust[s.customer_id].append(s)

    def cname(cid: str, fallback_sale=None) -> str:
        c = cust.get(cid)
        if c:
            return c.name
        return (fallback_sale.customer_name if fallback_sale is not None and fallback_sale.customer_name else cid)

    spend = {cid: sum(s.grand_total for s in group) for cid, group in by_cust.items()}
    total_revenue = sum(spend.values())
    n_customers = len(by_cust)
    repeat_ids = [cid for cid, g in by_cust.items() if len(g) >= 2]
    gaps_by_cust: Dict[str, List[float]] = {}
    for cid, g in by_cust.items():
        gaps_by_cust[cid] = [(local(b) - local(a)).total_seconds() / 86400 for a, b in zip(g, g[1:])]
    all_gaps = [x for v in gaps_by_cust.values() for x in v]
    window_days = days if days else max(data_days, 1)
    months = max(window_days / 30.4, 1.0)

    # ---------------- products & categories ----------------
    prod: Dict[str, Dict[str, Any]] = {}
    cat: Dict[str, Dict[str, Any]] = {}
    cust_prod: Dict[str, Counter] = defaultdict(Counter)
    cust_cat: Dict[str, Counter] = defaultdict(Counter)
    cust_pay: Dict[str, Counter] = defaultdict(Counter)
    pay_mix: Counter = Counter()
    pair_counts: Counter = Counter()
    names: Dict[str, str] = {}
    for s in sales:
        skus_in_bill = set()
        for it in s.items:
            names[it.sku] = it.name
            p = prod.setdefault(it.sku, {"sku": it.sku, "name": it.name, "qty": 0.0, "revenue": 0.0, "customers": set(), "bills": set(), "per_cust": Counter()})
            p["qty"] += it.qty
            p["revenue"] += it.final_amount
            p["customers"].add(s.customer_id)
            p["bills"].add(s.id)
            p["per_cust"][s.customer_id] += 1
            cname_cat = category_of.get(it.sku, "General")
            c = cat.setdefault(cname_cat, {"category": cname_cat, "qty": 0.0, "revenue": 0.0, "customers": set()})
            c["qty"] += it.qty
            c["revenue"] += it.final_amount
            c["customers"].add(s.customer_id)
            cust_prod[s.customer_id][it.sku] += it.qty
            cust_cat[s.customer_id][cname_cat] += it.final_amount
            skus_in_bill.add(it.sku)
        for t in s.tenders:
            pay_mix[t.mode] += t.amount
            cust_pay[s.customer_id][t.mode] += t.amount
        if 2 <= len(skus_in_bill) <= 15:
            for a, b in combinations(sorted(skus_in_bill), 2):
                pair_counts[(a, b)] += 1

    top_products = sorted(prod.values(), key=lambda p: (-p["qty"], -p["revenue"]))[:10]
    products_out = [{
        "sku": p["sku"], "name": p["name"], "qty": round(p["qty"], 2), "revenue": round(p["revenue"], 2),
        "customers": len(p["customers"]), "bills": len(p["bills"]),
        "repeat_buyers": sum(1 for n in p["per_cust"].values() if n >= 2),
    } for p in top_products]

    for name in {category_of.get(i.sku, "General") for i in items} - set(cat):
        cat[name] = {"category": name, "qty": 0.0, "revenue": 0.0, "customers": set()}
    cats_sorted = sorted(cat.values(), key=lambda c: (-c["revenue"], c["category"]))
    cat_total = sum(c["revenue"] for c in cats_sorted) or 1.0
    cat_out = [{"category": c["category"], "qty": round(c["qty"], 2), "revenue": round(c["revenue"], 2),
                "share": round(c["revenue"] / cat_total * 100, 1), "customers": len(c["customers"])} for c in cats_sorted]
    sold_cats = [c for c in cat_out if c["revenue"] > 0]
    most_cats = sold_cats[:5]
    least_cats = sorted(cat_out, key=lambda c: (c["revenue"], c["category"]))[:5]

    # ---------------- frequency, spending, repeat ----------------
    buckets = {"1 purchase": 0, "2-3 purchases": 0, "4-6 purchases": 0, "7+ purchases": 0}
    for g in by_cust.values():
        n = len(g)
        buckets["1 purchase" if n == 1 else "2-3 purchases" if n <= 3 else "4-6 purchases" if n <= 6 else "7+ purchases"] += 1
    frequency = {
        "distribution": [{"label": k, "customers": v, "share": _pct(v, n_customers)} for k, v in buckets.items()],
        "avg_purchases_per_customer": round(len(sales) / n_customers, 2),
        "purchases_per_customer_per_month": round(len(sales) / n_customers / months, 2),
        "avg_days_between_purchases": round(sum(all_gaps) / len(all_gaps), 1) if all_gaps else None,
        "median_days_between_purchases": round(median(all_gaps), 1) if all_gaps else None,
    }

    values = sorted(spend.values())
    bands = [("Under ₹500", 0, 500), ("₹500 - ₹2,000", 500, 2000), ("₹2,000 - ₹5,000", 2000, 5000), ("₹5,000 and above", 5000, float("inf"))]
    spending = {
        "avg_per_customer": round(total_revenue / n_customers, 2),
        "median_per_customer": round(median(values), 2),
        "avg_bill_value": round(total_revenue / len(sales), 2),
        "bands": [{"label": lbl, "customers": sum(1 for v in values if lo <= v < hi)} for lbl, lo, hi in bands],
        "top_spenders": [{"id": cid, "name": cname(cid, by_cust[cid][-1]), "invoices": len(by_cust[cid]), "total": round(v, 2),
                          "share": _pct(v, total_revenue)} for cid, v in sorted(spend.items(), key=lambda kv: -kv[1])[:5]],
    }

    wd_inv = Counter(local(s).weekday() for s in sales)
    wd_rev: Dict[int, float] = defaultdict(float)
    for s in sales:
        wd_rev[local(s).weekday()] += s.grand_total

    def favourite(counter: Counter, label=lambda k: k) -> Optional[str]:
        return label(counter.most_common(1)[0][0]) if counter else None

    repeat_rows = []
    for cid in sorted(repeat_ids, key=lambda c: (-len(by_cust[c]), -spend[c]))[:10]:
        g = by_cust[cid]
        gaps = gaps_by_cust[cid]
        repeat_rows.append({
            "id": cid, "name": cname(cid, g[-1]), "invoices": len(g), "total": round(spend[cid], 2),
            "avg_days_between": round(sum(gaps) / len(gaps), 1) if gaps else None,
            "last_purchase": local(g[-1]).date().isoformat(),
            "favourite_product": favourite(cust_prod[cid], lambda sku: names.get(sku, sku)),
        })
    repeat_revenue = sum(spend[c] for c in repeat_ids)
    repeat = {
        "repeat_customers": len(repeat_ids),
        "one_time_customers": n_customers - len(repeat_ids),
        "repeat_rate": _pct(len(repeat_ids), n_customers),
        "repeat_revenue_share": _pct(repeat_revenue, total_revenue),
        "customers": repeat_rows,
        "by_weekday": [{"day": WEEKDAYS[i], "invoices": wd_inv.get(i, 0), "revenue": round(wd_rev.get(i, 0.0), 2)} for i in range(7)],
    }

    # ---------------- combinations ----------------
    combos = [{"a": names.get(a, a), "b": names.get(b, b), "bills": n, "share": _pct(n, len(sales))}
              for (a, b), n in pair_counts.most_common(8) if n >= 2]

    # ---------------- recent trend: last 8 weeks (independent of the period chip) ----------------
    first_seen = {}
    for s in sales_all:
        first_seen.setdefault(s.customer_id, local(s).date())
    monday = today - timedelta(days=today.weekday())
    weeks = []
    for k in range(7, -1, -1):
        start = monday - timedelta(weeks=k)
        end = start + timedelta(days=7)
        ws = [s for s in sales_all if start <= local(s).date() < end]
        weeks.append({
            "week_start": start.isoformat(), "revenue": round(sum(s.grand_total for s in ws), 2), "invoices": len(ws),
            "customers": len({s.customer_id for s in ws}),
            "new_customers": sum(1 for c, d in first_seen.items() if start <= d < end),
        })
    last4, prev4 = weeks[4:], weeks[:4]

    def delta(key: str) -> Optional[float]:
        a, b = sum(w[key] for w in last4), sum(w[key] for w in prev4)
        return round((a - b) / b * 100, 1) if b else None
    trend = {"weeks": weeks, "revenue_change_pct": delta("revenue"), "invoices_change_pct": delta("invoices"),
             "customers_change_pct": delta("customers"), "new_customers_last4": sum(w["new_customers"] for w in last4)}

    # ---------------- buying preferences (top customers by spend) ----------------
    preferences = [{
        "id": cid, "name": cname(cid, by_cust[cid][-1]), "invoices": len(by_cust[cid]), "total": round(spend[cid], 2),
        "avg_bill": round(spend[cid] / len(by_cust[cid]), 2),
        "favourite_category": favourite(cust_cat[cid]),
        "favourite_product": favourite(cust_prod[cid], lambda sku: names.get(sku, sku)),
        "preferred_payment": favourite(cust_pay[cid]),
    } for cid, _ in sorted(spend.items(), key=lambda kv: -kv[1])[:10]]
    pay_total = sum(pay_mix.values()) or 1.0
    payment_mix = [{"mode": m, "amount": round(v, 2), "share": round(v / pay_total * 100, 1)} for m, v in pay_mix.most_common()]

    # ---------------- inactive / less active (uses ALL customer invoices, not just the period) ----------------
    last_buy: Dict[str, Any] = {}
    life_spend: Dict[str, float] = defaultdict(float)
    life_inv: Counter = Counter()
    for s in sales_all:
        last_buy[s.customer_id] = local(s).date()
        life_spend[s.customer_id] += s.grand_total
        life_inv[s.customer_id] += 1
    active = less_active = inactive = 0
    inactive_rows = []
    for cid, d in last_buy.items():
        since = (today - d).days
        if since <= ACTIVE_DAYS:
            active += 1
        elif since <= LESS_ACTIVE_DAYS:
            less_active += 1
        else:
            inactive += 1
        if since > ACTIVE_DAYS:
            inactive_rows.append({"id": cid, "name": cname(cid), "status": "Less active" if since <= LESS_ACTIVE_DAYS else "Inactive",
                                  "last_purchase": d.isoformat(), "days_since": since, "invoices": life_inv[cid], "lifetime_spend": round(life_spend[cid], 2)})
    inactive_rows.sort(key=lambda r: (-r["lifetime_spend"]))
    activity = {
        "active": active, "less_active": less_active, "inactive": inactive,
        "never_purchased": sum(1 for c in customers if c.id not in last_buy),
        "active_days": ACTIVE_DAYS, "inactive_days": LESS_ACTIVE_DAYS,
        "customers": inactive_rows[:10],
    }

    # ---------------- headline observations (plain-language, every number comes from the data above) ----------------
    notes: List[Dict[str, str]] = []
    if repeat["repeat_rate"] is not None:
        notes.append({"status": "good" if repeat["repeat_rate"] >= 40 else "watch",
                      "text": f"{repeat['repeat_rate']}% of customers bought more than once ({len(repeat_ids)} of {n_customers}); they bring {repeat['repeat_revenue_share']}% of customer sales."})
    if frequency["avg_days_between_purchases"] is not None:
        notes.append({"status": "good", "text": f"Repeat customers typically come back every {frequency['avg_days_between_purchases']} days."})
    if products_out:
        notes.append({"status": "good", "text": f"{products_out[0]['name']} is the most purchased product ({products_out[0]['qty']:g} units across {products_out[0]['customers']} customer(s))."})
    if sold_cats:
        notes.append({"status": "good", "text": f"{sold_cats[0]['category']} leads with {sold_cats[0]['share']}% of customer spend; {least_cats[0]['category']} sells least."})
    if combos:
        notes.append({"status": "good", "text": f"{combos[0]['a']} and {combos[0]['b']} are bought together most often ({combos[0]['bills']} bills): a natural bundle or shelf pairing."})
    if wd_inv:
        peak = max(wd_inv, key=lambda k: wd_inv[k])
        notes.append({"status": "good", "text": f"{WEEKDAYS[peak]} is the busiest day for customer purchases ({wd_inv[peak]} invoices)."})
    if trend["revenue_change_pct"] is not None:
        notes.append({"status": "good" if trend["revenue_change_pct"] >= 0 else "watch",
                      "text": f"Customer sales over the last 4 weeks are {'up' if trend['revenue_change_pct'] >= 0 else 'down'} {abs(trend['revenue_change_pct'])}% on the 4 weeks before."})
    if inactive:
        notes.append({"status": "watch", "text": f"{inactive} customer(s) have not purchased in over {LESS_ACTIVE_DAYS} days and {less_active} are slowing down: a reminder or offer could win them back."})

    return {
        "status": "ok",
        "meta": _meta(len(sales), data_days, len(items), first_day, today),
        "window_days": days,
        "kpis": {
            "customers_registered": len(customers), "customers_purchased": n_customers, "invoices": len(sales),
            "total_revenue": round(total_revenue, 2), "avg_spend_per_customer": spending["avg_per_customer"],
            "avg_bill_value": spending["avg_bill_value"], "repeat_rate": repeat["repeat_rate"],
            "avg_purchases_per_customer": frequency["avg_purchases_per_customer"],
        },
        "highlights": notes,
        "products": products_out,
        "categories": {"most": most_cats, "least": least_cats, "all": cat_out},
        "frequency": frequency,
        "spending": spending,
        "repeat": repeat,
        "combinations": combos,
        "trend": trend,
        "preferences": preferences,
        "payment_mix": payment_mix,
        "activity": activity,
    }
