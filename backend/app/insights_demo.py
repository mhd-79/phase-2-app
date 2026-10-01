"""
Sample (demo) dataset for the AI Insights module.

Everything here is generated IN MEMORY for a single request and is never read from or written to
the database — it cannot affect sales, stock, vendors, purchase orders, GRNs or any other
production record. It is fed through the same analytics engine as live data so the Admin can see
how every AI Insights screen looks once a store has ~3 months of trading history.

The generator is deterministic (fixed RNG seed); dates are relative to "today" so the sample
always looks current. All SKUs / vendor ids are prefixed DEMO- and vendor names end in "(Demo)".
"""
import math
import random
from collections import defaultdict
from datetime import date, timedelta
from typing import Dict, List

from app import insights_engine as eng

HISTORY = 90
P = "DEMO-"

TAX = {"Beverages": 12, "Snacks": 12, "Dairy": 5, "Bakery": 5, "Grocery": 5, "Personal Care": 18}
WEEKDAY = [0.90, 0.85, 0.90, 0.95, 1.10, 1.35, 1.25]                       # Mon..Sun
HOUR_W = {9: 2, 10: 3, 11: 5, 12: 7, 13: 8, 14: 6, 15: 5, 16: 5, 17: 6, 18: 8, 19: 9, 20: 7, 21: 4}

# sku, name, category, price, cost, base units/day, pattern, stock cover (days), vendor, alt vendor, listed N days ago
ITEMS = [
    ("BEV-001", "Cola 500ml", "Beverages", 45, 30, 14, "steady", 9, "V1", "V7", 200),
    ("BEV-002", "Orange Juice 1L", "Beverages", 110, 78, 5, "rising", 7, "V1", None, 200),
    ("BEV-003", "Mineral Water 1L", "Beverages", 20, 12, 22, "steady", 10, "V1", "V8", 200),
    ("BEV-004", "Green Tea 25 Bags", "Beverages", 165, 120, 1.2, "steady", 160, "V1", None, 200),
    ("BEV-005", "Energy Drink 250ml", "Beverages", 95, 62, 9, "new_hit", 3, "V1", None, 25),
    ("SNK-001", "Potato Chips 90g", "Snacks", 35, 22, 12, "steady", 8, "V2", "V8", 200),
    ("SNK-002", "Choco Cookies 200g", "Snacks", 60, 42, 6, "steady", 1, "V2", "V7", 200),
    ("SNK-003", "Salted Peanuts 150g", "Snacks", 40, 26, 4, "cooling", 30, "V2", None, 200),
    ("SNK-004", "Popcorn Butter 100g", "Snacks", 55, 38, 2, "steady", 70, "V2", None, 200),
    ("SNK-005", "Protein Bar 50g", "Snacks", 80, 52, 0.6, "new_flop", 120, "V2", None, 30),
    ("DAI-001", "Toned Milk 500ml", "Dairy", 28, 20, 26, "steady", 4, "V3", None, 200),
    ("DAI-002", "Curd Cup 200g", "Dairy", 25, 16, 8, "steady", 1.5, "V3", None, 200),
    ("DAI-003", "Paneer 200g", "Dairy", 90, 65, 3, "steady", 6, "V3", None, 200),
    ("DAI-004", "Butter 100g", "Dairy", 58, 40, 4, "rising", 7, "V3", None, 200),
    ("DAI-005", "Greek Yogurt 100g", "Dairy", 39, 22, 3, "new_mid", 10, "V3", None, 20),
    ("BAK-001", "White Bread 400g", "Bakery", 42, 28, 10, "steady", 6, "V4", None, 200),
    ("BAK-002", "Brown Bread 400g", "Bakery", 48, 32, 5, "cooling", 14, "V4", None, 200),
    ("BAK-003", "Croissant (pc)", "Bakery", 35, 22, 3, "steady", 0, "V4", None, 200),
    ("GRO-001", "Basmati Rice 1kg", "Grocery", 135, 95, 5, "steady", 12, "V5", "V8", 200),
    ("GRO-002", "Toor Dal 1kg", "Grocery", 148, 105, 4, "steady", 10, "V5", None, 200),
    ("GRO-003", "Sunflower Oil 1L", "Grocery", 175, 130, 5, "rising", 7, "V5", "V8", 200),
    ("GRO-004", "Sugar 1kg", "Grocery", 52, 38, 9, "steady", 9, "V5", "V7", 200),
    ("GRO-005", "Wheat Atta 5kg", "Grocery", 245, 180, 3, "steady", 14, "V5", None, 200),
    ("PC-001", "Toothpaste 100g", "Personal Care", 65, 45, 6, "steady", 12, "V6", "V8", 200),
    ("PC-002", "Shampoo 340ml", "Personal Care", 210, 150, 2, "steady", 15, "V6", None, 200),
    ("PC-003", "Hand Wash 250ml", "Personal Care", 95, 62, 3, "steady", 2, "V6", None, 200),
    ("PC-004", "Bath Soap (pc)", "Personal Care", 38, 25, 7, "steady", 14, "V6", "V8", 200),
    ("PC-005", "Face Wash 100ml", "Personal Care", 149, 100, 1.5, "steady", 110, "V6", None, 200),
]

# id -> name, category, terms, payable, fill, late_prob, lead days, price factor, yearly price creep, return rate
VENDORS = {
    "V1": ("Metro Beverages (Demo)", "Beverages", "Net 15", 18500, 1.00, 0.10, 3, 1.00, 0.03, 0.005),
    "V2": ("Crunchy Snacks Co (Demo)", "Snacks", "Net 30", 42000, 0.78, 0.60, 4, 1.00, 0.04, 0.040),
    "V3": ("DairyBest Foods (Demo)", "Dairy", "Net 7", 9200, 0.97, 0.20, 2, 1.00, 0.03, 0.060),
    "V4": ("Daily Bakers (Demo)", "Bakery", "Due on Delivery", 0, 0.98, 0.10, 1, 1.00, 0.02, 0.010),
    "V5": ("Agro Grains Wholesale (Demo)", "Grocery", "Net 45", 67500, 0.93, 0.40, 5, 1.00, 0.14, 0.008),
    "V6": ("CarePlus Distributors (Demo)", "Personal Care", "Net 30", 15300, 0.92, 0.25, 6, 1.00, 0.04, 0.012),
    "V7": ("QuickPack Wholesale (Demo)", "General / Mixed", "Net 30", 0, 0.66, 0.80, 6, 0.93, 0.02, 0.050),
    "V8": ("ValueMart Cash & Carry (Demo)", "General / Mixed", "Net 15", 4200, 1.00, 0.10, 3, 0.95, 0.02, 0.004),
}

BATCHES = [  # sku, batch no, expires in N days, qty
    ("DAI-001", "DM-0921", 3, 40), ("DAI-002", "CD-0918", 2, 12), ("DAI-003", "PN-0920", 9, 8),
    ("BAK-001", "WB-0929", 1, 14), ("BAK-002", "BB-0927", 5, 15), ("DAI-005", "GY-0915", 12, 30),
    ("BEV-004", "GT-0801", 20, 60), ("SNK-004", "PC-0702", -4, 6),
]


def _poisson(rng: random.Random, lam: float) -> int:
    if lam <= 0:
        return 0
    if lam > 30:
        return max(0, round(rng.gauss(lam, math.sqrt(lam))))
    limit, k, p = math.exp(-lam), 0, 1.0
    while True:
        k += 1
        p *= rng.random()
        if p <= limit:
            return k - 1


def _pattern(p: str, ago: int, listed: int) -> float:
    ramp = max(0.0, min(1.0, (28 - ago) / 28))
    if p == "rising":
        return 1 + 0.9 * ramp
    if p == "cooling":
        return 1 - 0.55 * ramp
    life = 1 - ago / max(listed, 1)                     # 0 on launch day -> 1 today
    if p == "new_hit":
        return 0.8 + 0.8 * life
    if p == "new_flop":
        return 1.2 - 1.0 * life
    return 1.0


def build_demo_dataset(today: date) -> eng.Dataset:
    rng = random.Random(20260930)
    items: Dict[str, dict] = {}
    spec: Dict[str, tuple] = {}
    for sku, name, cat, price, cost, base, pattern, cover, vid, alt, listed in ITEMS:
        full = P + sku
        spec[full] = (base, pattern, listed, alt and P + alt)
        items[full] = {
            "sku": full, "name": name, "category": cat, "price": float(price), "cost": float(cost),
            "landed_cost": float(cost), "stock": float(round(base * cover)),
            "min_stock": float(max(8, round(base * 3))), "unit": "pcs", "vendor_id": P + vid,
            "created": today - timedelta(days=listed),
        }
    vendors = {P + vid: {"id": P + vid, "name": v[0], "category": v[1], "terms": v[2], "status": "Active", "payable": float(v[3])}
               for vid, v in VENDORS.items()}

    # ------------------------------------------------------------------ sales
    lines, bills, tenders = [], [], []
    hours = list(HOUR_W.keys())
    weights = list(HOUR_W.values())
    inv = 0
    for ago in range(HISTORY - 1, -1, -1):
        d = today - timedelta(days=ago)
        tokens: List[str] = []
        for sku, (base, pattern, listed, _alt) in spec.items():
            if ago >= listed:
                continue
            tokens += [sku] * _poisson(rng, base * _pattern(pattern, ago, listed) * WEEKDAY[d.weekday()])
        rng.shuffle(tokens)
        i = 0
        while i < len(tokens):
            chunk = tokens[i:i + rng.randint(2, 9)]
            i += len(chunk)
            inv += 1
            invoice = f"DEMO-INV-{inv:05d}"
            hour = rng.choices(hours, weights)[0]
            counts: Dict[str, int] = defaultdict(int)
            for s in chunk:
                counts[s] += 1
            total = 0.0
            for s, q in counts.items():
                it = items[s]
                taxable = it["price"] * q
                final = taxable * (1 + TAX[it["category"]] / 100)
                total += final
                lines.append({"sku": s, "name": it["name"], "day": d, "hour": hour, "qty": float(q),
                              "revenue": round(final, 2), "taxable": round(taxable, 2), "discount": 0.0, "invoice": invoice})
            bills.append({"invoice": invoice, "day": d, "hour": hour, "total": round(total, 2)})
            mode = rng.choices(["UPI", "Cash", "Card"], [50, 32, 18])[0]
            tenders.append({"invoice": invoice, "mode": mode, "amount": round(total, 2)})

    returns = []
    for l in rng.sample(lines, 6):
        returns.append({"sku": l["sku"], "day": min(today, l["day"] + timedelta(days=1)), "qty": 1.0,
                        "refund": round(l["revenue"] / l["qty"], 2)})

    # ------------------------------------------------------------------ purchasing
    supplies: Dict[str, List[str]] = defaultdict(list)
    for sku, it in items.items():
        supplies[it["vendor_id"]].append(sku)
        if spec[sku][3]:
            supplies[spec[sku][3]].append(sku)
    pos, grns, preturns = [], [], []
    po_n = grn_n = 100
    received_qty: Dict[str, float] = defaultdict(float)
    received_lines: Dict[str, List[dict]] = defaultdict(list)
    for vid, prof in VENDORS.items():
        full = P + vid
        skus = supplies.get(full, [])
        if not skus:
            continue
        orders = 3 if vid in ("V7", "V8") else 5
        for k in range(orders):
            ago = max(12, 82 - k * (68 // (orders - 1)) + rng.randint(-3, 3))
            d = today - timedelta(days=ago)
            expected = d + timedelta(days=prof[6])
            delay = rng.randint(1, 4) if rng.random() < prof[5] else 0
            receipt = min(today - timedelta(days=1), expected + timedelta(days=delay))
            po_n += 1
            grn_n += 1
            plines, glines = [], []
            for sku in rng.sample(skus, min(len(skus), rng.randint(2, 4))):
                base = spec[sku][0]
                ordered = float(max(10, round(base * rng.uniform(10, 16))))
                fill = 1.0 if (prof[4] >= 0.97 and rng.random() < 0.6) else min(1.0, max(0.5, rng.gauss(prof[4], 0.05)))
                got = float(round(ordered * fill))
                cost = round(items[sku]["cost"] * prof[7] * (1 + prof[8] * (1 - ago / 90)), 2)
                plines.append({"sku": sku, "ordered": ordered, "received": got, "cost": cost})
                glines.append({"sku": sku, "qty": got, "cost": cost})
                received_qty[full] += got
                received_lines[full].append({"sku": sku, "qty": got})
            pos.append({"id": f"DEMO-PO-{po_n}", "vendor_id": full, "date": d, "expected": expected,
                        "status": "Closed", "lines": plines})
            grns.append({"id": f"DEMO-GRN-{grn_n}", "po_id": f"DEMO-PO-{po_n}", "vendor_id": full, "date": receipt,
                         "total": round(sum(g["qty"] * g["cost"] for g in glines), 2), "lines": glines})

    def open_po(vid, sku, qty, status, expected_ago, received=0.0):
        nonlocal po_n, grn_n
        po_n += 1
        full = P + vid
        cost = round(items[P + sku]["cost"] * VENDORS[vid][7], 2)
        d = today - timedelta(days=max(3, expected_ago + VENDORS[vid][6]))
        pos.append({"id": f"DEMO-PO-{po_n}", "vendor_id": full, "date": d, "expected": today - timedelta(days=expected_ago),
                    "status": status, "lines": [{"sku": P + sku, "ordered": float(qty), "received": float(received), "cost": cost}]})
        if received:
            grn_n += 1
            grns.append({"id": f"DEMO-GRN-{grn_n}", "po_id": f"DEMO-PO-{po_n}", "vendor_id": full, "date": today - timedelta(days=1),
                         "total": round(received * cost, 2), "lines": [{"sku": P + sku, "qty": float(received), "cost": cost}]})

    open_po("V2", "SNK-002", 60, "Approved", 6)             # overdue — not counted as reliable supply
    open_po("V3", "DAI-002", 50, "Approved", -1)            # arrives tomorrow
    open_po("V6", "PC-003", 24, "Pending Approval", -4)
    open_po("V5", "GRO-003", 40, "Partially Received", 2, received=15)
    open_po("V1", "BEV-001", 120, "Draft", -5)

    for vid in ("V2", "V3", "V6", "V8"):
        full = P + vid
        rate = VENDORS[vid][9]
        pool = received_lines.get(full, [])
        if not pool:
            continue
        per_return = max(1.0, round(received_qty[full] * rate / 2))
        for n, off in enumerate((21, 8)):
            sku = pool[n % len(pool)]["sku"]
            preturns.append({"vendor_id": full, "date": today - timedelta(days=off),
                             "lines": [{"sku": sku, "qty": per_return, "cost": items[sku]["cost"]}]})

    # ------------------------------------------------------------------ batches & discounts
    batches = []
    for sku, bno, days, qty in BATCHES:
        full = P + sku
        batches.append({"sku": full, "name": items[full]["name"], "batch_no": bno,
                        "expiry": today + timedelta(days=days), "qty": float(min(qty, items[full]["stock"] or qty))})
    discounts = [{"name": "Weekend Snack Offer (Demo)", "type": "percent", "value": 5.0, "applies_to": "selected",
                  "skus": {P + "SNK-001", P + "SNK-003"}, "start": None, "end": None, "status": "active"}]

    return eng.Dataset(today=today, history_days=120, items=items, vendors=vendors, lines=lines, bills=bills,
                       tenders=tenders, returns=returns, pos=pos, grns=grns, preturns=preturns,
                       batches=batches, discounts=discounts, is_demo=True)
