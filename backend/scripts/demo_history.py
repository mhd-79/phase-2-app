"""
Demo trading-history generator (3 months) — pure Python, no database access.

Produces row dictionaries for the existing Prisma models so the CLI (demo_history_cli.py) can insert
them into the real PostgreSQL database. The simulation follows the application's own business rules:

  * Sales use app.pricing_engine.compute_cart_totals (GST, auto/manual discounts, inclusive/exclusive),
    deduct stock, and are blocked when stock is insufficient (like POST /billing/sales).
  * Sale returns restore stock and mark the sale RETURNED (like POST /billing/returns).
  * Purchase orders -> GRNs add stock, update PO line received qty and raise the vendor payable.
  * Purchase returns (debit notes) and vendor payments reduce the payable (clamped at 0, as the app does).
  * Stock adjustments use the reasons offered by the Stock Adjustment screen.
  * Batches are FIFO lots, so batch quantities always add up to item stock.

Everything is identifiable and removable: every id / SKU / invoice / vendor starts with "DEMO-",
discount names start with "[DEMO] ", and nothing pre-existing is referenced except users
(cashier usernames) which sales need for their foreign key.

verify_tables() re-derives every ledger independently from the produced rows (stock, batches, vendor payable,
invoice totals, PO/GRN quantities) and is also used by the CLI to check the database after an insert.
"""
import json
import math
import random
import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from app.pricing_engine import compute_cart_totals

IST = timezone(timedelta(hours=5, minutes=30))
UTC = timezone.utc
PREFIX = "DEMO-"
HISTORY_DAYS = 92
APPROVER = "Arjun M."

TAX = {"Beverages": 12, "Snacks": 12, "Dairy": 5, "Bakery": 5, "Grocery": 5, "Personal Care": 18}
WEEKDAY = [0.90, 0.85, 0.90, 0.95, 1.10, 1.35, 1.25]                       # Mon..Sun
HOUR_W = {9: 2, 10: 3, 11: 5, 12: 7, 13: 8, 14: 6, 15: 5, 16: 5, 17: 6, 18: 8, 19: 9, 20: 7, 21: 4}
TERMS_DAYS = {"Net 7": 7, "Net 15": 15, "Net 30": 30, "Net 45": 45, "Due on Delivery": 0}

# sku, name, category, price, cost, base units/day, pattern, vendor, alt vendor, listed N days ago,
# shelf life days, opening stock cover (days), stop re-ordering during the last N days, order pack size
ITEMS = [
    ("BEV-001", "Cola 500ml", "Beverages", 45, 30, 14, "steady", "V1", "V7", 400, 180, 14, None, 24),
    ("BEV-002", "Orange Juice 1L", "Beverages", 110, 78, 5, "rising", "V1", None, 400, 60, 12, None, 12),
    ("BEV-003", "Mineral Water 1L", "Beverages", 20, 12, 22, "steady", "V1", "V8", 400, 365, 14, None, 24),
    ("BEV-004", "Green Tea 25 Bags", "Beverages", 165, 120, 1.2, "steady", "V1", None, 400, 365, 170, None, 6),
    ("BEV-005", "Energy Drink 250ml", "Beverages", 95, 62, 9, "new_hit", "V1", None, 25, 240, 10, 12, 12),
    ("SNK-001", "Potato Chips 90g", "Snacks", 35, 22, 12, "steady", "V2", "V8", 400, 120, 14, None, 24),
    ("SNK-002", "Choco Cookies 200g", "Snacks", 60, 42, 6, "steady", "V2", "V7", 400, 150, 14, 9, 12),
    ("SNK-003", "Salted Peanuts 150g", "Snacks", 40, 26, 4, "cooling", "V2", None, 400, 180, 20, None, 12),
    ("SNK-004", "Popcorn Butter 100g", "Snacks", 55, 38, 2, "steady", "V2", None, 400, 120, 80, None, 12),
    ("SNK-005", "Protein Bar 50g", "Snacks", 80, 52, 0.6, "new_flop", "V2", None, 30, 240, 130, None, 12),
    ("DAI-001", "Toned Milk 500ml", "Dairy", 28, 20, 26, "steady", "V3", None, 400, 5, 4, None, 24),
    ("DAI-002", "Curd Cup 200g", "Dairy", 25, 16, 8, "steady", "V3", None, 400, 10, 6, 4, 12),
    ("DAI-003", "Paneer 200g", "Dairy", 90, 65, 3, "steady", "V3", None, 400, 14, 10, None, 6),
    ("DAI-004", "Butter 100g", "Dairy", 58, 40, 4, "rising", "V3", None, 400, 120, 14, None, 12),
    ("DAI-005", "Greek Yogurt 100g", "Dairy", 39, 22, 3, "new_mid", "V3", None, 20, 21, 14, None, 12),
    ("BAK-001", "White Bread 400g", "Bakery", 42, 28, 10, "steady", "V4", None, 400, 5, 3, None, 12),
    ("BAK-002", "Brown Bread 400g", "Bakery", 48, 32, 5, "cooling", "V4", None, 400, 5, 4, None, 12),
    ("BAK-003", "Croissant (pc)", "Bakery", 35, 22, 3, "steady", "V4", None, 400, 3, 3, 6, 6),
    ("GRO-001", "Basmati Rice 1kg", "Grocery", 135, 95, 5, "steady", "V5", "V8", 400, 365, 14, None, 10),
    ("GRO-002", "Toor Dal 1kg", "Grocery", 148, 105, 4, "steady", "V5", None, 400, 365, 14, None, 10),
    ("GRO-003", "Sunflower Oil 1L", "Grocery", 175, 130, 5, "rising", "V5", "V8", 400, 270, 14, None, 12),
    ("GRO-004", "Sugar 1kg", "Grocery", 52, 38, 9, "steady", "V5", "V7", 400, 365, 14, None, 20),
    ("GRO-005", "Wheat Atta 5kg", "Grocery", 245, 180, 3, "steady", "V5", None, 400, 180, 20, None, 6),
    ("PC-001", "Toothpaste 100g", "Personal Care", 65, 45, 6, "steady", "V6", "V8", 400, 730, 14, None, 12),
    ("PC-002", "Shampoo 340ml", "Personal Care", 210, 150, 2, "steady", "V6", None, 400, 730, 20, None, 6),
    ("PC-003", "Hand Wash 250ml", "Personal Care", 95, 62, 3, "steady", "V6", None, 400, 730, 14, 10, 12),
    ("PC-004", "Bath Soap (pc)", "Personal Care", 38, 25, 7, "steady", "V6", "V8", 400, 730, 14, None, 24),
    ("PC-005", "Face Wash 100ml", "Personal Care", 149, 100, 1.5, "steady", "V6", None, 400, 730, 120, None, 6),
]

# id -> name, category, contact, terms, fill rate, late probability, promised lead days, price factor,
#       price creep over the period, purchase-return rate
VENDORS = {
    "V1": ("Metro Beverages", "Beverages", "Rohan Mehta", "Net 15", 1.00, 0.10, 3, 1.00, 0.03, 0.005),
    "V2": ("Crunchy Snacks Co", "Snacks", "Neha Kulkarni", "Net 30", 0.78, 0.60, 4, 1.00, 0.04, 0.040),
    "V3": ("DairyBest Foods", "Dairy", "Suresh Pillai", "Net 7", 0.97, 0.20, 2, 1.00, 0.03, 0.060),
    "V4": ("Daily Bakers", "Bakery", "Imran Shaikh", "Due on Delivery", 0.98, 0.10, 1, 1.00, 0.02, 0.010),
    "V5": ("Agro Grains Wholesale", "Grocery", "Ramesh Patel", "Net 45", 0.93, 0.40, 5, 1.00, 0.14, 0.008),
    "V6": ("CarePlus Distributors", "Personal Care", "Deepak Nair", "Net 30", 0.92, 0.25, 6, 1.00, 0.04, 0.012),
    "V7": ("QuickPack Wholesale", "General / Mixed", "Sana Iyer", "Net 30", 0.66, 0.80, 6, 0.93, 0.02, 0.050),
    "V8": ("ValueMart Cash & Carry", "General / Mixed", "Kiran Shah", "Net 15", 1.00, 0.10, 3, 0.95, 0.02, 0.004),
}

# [DEMO] promotions: name, type, value, skus (None = all DEMO beverages etc. resolved below), start ago, end ago, status
PROMOS = [
    ("[DEMO] Weekend Snack Offer 5%", "percent", 5.0, ["SNK-001", "SNK-003", "SNK-004"], 60, None, "active"),
    ("[DEMO] Monsoon Beverage Rs5 Off", "flat", 5.0, ["BEV-001", "BEV-003"], 75, 45, "inactive"),
    ("[DEMO] Dairy Combo 3%", "percent", 3.0, ["DAI-001", "DAI-003", "DAI-004"], 30, None, "active"),
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
    life = 1 - ago / max(listed, 1)
    if p == "new_hit":
        return 0.8 + 0.8 * life
    if p == "new_flop":
        return 1.2 - 1.0 * life
    return 1.0


def _at(d: date, hour: int, minute: int = 0, second: int = 0) -> datetime:
    """IST wall-clock -> timezone-aware UTC datetime (how Prisma stores DateTime)."""
    return datetime(d.year, d.month, d.day, hour, minute, second, tzinfo=IST).astimezone(UTC)


class _Sim:
    def __init__(self, today: date, now: datetime, seed: int, cashiers: List[str], pricing_mode: str):
        self.rng = random.Random(seed)
        self.today = today
        self.now = now.astimezone(UTC)
        self.start = today - timedelta(days=HISTORY_DAYS - 1)
        self.cashiers = cashiers
        self.pricing_mode = pricing_mode
        self.t: Dict[str, List[dict]] = defaultdict(list)
        self.spec: Dict[str, dict] = {}
        self.stock: Dict[str, int] = {}
        self.lots: Dict[str, List[dict]] = defaultdict(list)
        self.payable: Dict[str, float] = {P + v: 0.0 for v in VENDORS for P in [PREFIX]}
        self.queue: Dict[date, List[dict]] = defaultdict(list)        # receipt date -> POs
        self.queued_qty: Dict[str, int] = defaultdict(int)
        self.pr_events: Dict[date, List[dict]] = defaultdict(list)
        self.pmt_events: Dict[date, List[dict]] = defaultdict(list)
        self.returns_due: Dict[date, List[dict]] = defaultdict(list)
        self.n = defaultdict(int)
        self.sale_rows: Dict[str, dict] = {}

    # ------------------------------------------------------------------ helpers
    def uid(self) -> str:
        return str(uuid.UUID(int=self.rng.getrandbits(128), version=4))

    def nid(self, kind: str) -> int:
        self.n[kind] += 1
        return self.n[kind]

    def lot_add(self, sku: str, qty: int, no: str, mfg: date):
        if qty <= 0:
            return
        self.lots[sku].append({"no": no, "mfg": mfg, "exp": mfg + timedelta(days=self.spec[sku]["shelf"]), "qty": qty})
        self.lots[sku].sort(key=lambda l: l["mfg"])
        self.stock[sku] += qty

    def lot_take(self, sku: str, qty: int) -> int:
        """FIFO consume up to qty; returns the quantity actually taken."""
        taken, need = 0, qty
        for lot in self.lots[sku]:
            if need <= 0:
                break
            use = min(lot["qty"], need)
            lot["qty"] -= use
            need -= use
            taken += use
        self.stock[sku] -= taken
        return taken

    def adjust(self, sku: str, delta: int, reason: str, notes: str, d: date):
        if delta < 0:
            delta = -self.lot_take(sku, -delta)
        elif delta > 0:
            self.lot_add(sku, delta, f"{PREFIX}B-ADJ{self.n['adj'] + 1:04d}", d - timedelta(days=1))
        if delta == 0:
            return
        aid = self.nid("adj")
        self.t["stockadjustment"].append({
            "id": f"{PREFIX}ADJ-{aid:04d}", "sku": sku, "name": self.spec[sku]["name"], "delta": float(delta),
            "reason": reason, "notes": notes, "approved_by": APPROVER, "date": d.isoformat(),
            "created_at": _at(d, 10, self.rng.randint(0, 59)),
        })

    # ------------------------------------------------------------------ setup
    def setup(self):
        for (sku, name, cat, price, cost, base, pattern, vid, alt, listed, shelf, cover, stop, pack) in ITEMS:
            full = PREFIX + sku
            listed_day = self.start if listed > HISTORY_DAYS else self.today - timedelta(days=listed)
            self.spec[full] = {"name": name + " (Demo)", "cat": cat, "price": float(price), "cost": float(cost), "base": base,
                               "pattern": pattern, "vendor": PREFIX + vid, "alt": PREFIX + alt if alt else None,
                               "listed": listed_day, "listed_ago": listed, "shelf": shelf, "cover": cover, "stop": stop,
                               "pack": pack, "min": max(8, round(base * 3)), "tax": TAX[cat]}
            self.stock[full] = 0
        for full, s in self.spec.items():                        # opening stock as an audited adjustment
            qty = max(1, round(s["base"] * s["cover"]))
            self.lot_add(full, qty, f"{PREFIX}B-OPEN-{full[len(PREFIX):]}", s["listed"] - timedelta(days=self.rng.randint(1, 3)))
            aid = self.nid("adj")
            self.t["stockadjustment"].append({
                "id": f"{PREFIX}ADJ-{aid:04d}", "sku": full, "name": s["name"], "delta": float(qty), "reason": "Count correction",
                "notes": "Opening stock balance (demo data)", "approved_by": APPROVER, "date": s["listed"].isoformat(),
                "created_at": _at(s["listed"], 9, 0),
            })

    def promos_on(self, d: date) -> List[dict]:
        out = []
        for name, typ, val, skus, s_ago, e_ago, _status in PROMOS:
            s_day = self.today - timedelta(days=s_ago)
            e_day = self.today - timedelta(days=e_ago) if e_ago is not None else None
            if s_day <= d and (e_day is None or d <= e_day):
                out.append({"name": name, "type": typ, "value": val, "applies_to": "selected",
                            "product_skus": json.dumps([PREFIX + s for s in skus]), "start_date": None, "end_date": None,
                            "status": "active"})
        return out

    # ------------------------------------------------------------------ purchasing
    def place_orders(self, d: date):
        ago = (self.today - d).days
        by_vendor: Dict[str, List[tuple]] = defaultdict(list)
        for sku, s in self.spec.items():
            if d < s["listed"] or (s["stop"] is not None and ago < s["stop"]):
                continue
            exp = s["base"] * _pattern(s["pattern"], ago, s["listed_ago"])
            vid = s["alt"] if (s["alt"] and self.rng.random() < 0.25) else s["vendor"]
            lead = VENDORS[vid[len(PREFIX):]][6]
            safety = 1.3 * exp * math.sqrt(lead)
            position = self.stock[sku] + self.queued_qty[sku]
            if position <= max(exp * (lead + 2) + safety, s["min"]):
                want = exp * (lead + 10) - position
                qty = max(s["pack"], math.ceil(want / s["pack"]) * s["pack"])
                by_vendor[vid].append((sku, qty))
        for vid, lines in by_vendor.items():
            prof = VENDORS[vid[len(PREFIX):]]
            num = self.nid("po")
            po_id = f"{PREFIX}PO-{num:04d}"
            expected = d + timedelta(days=prof[6])
            delay = self.rng.randint(1, 5) if self.rng.random() < prof[5] else 0
            receipt = expected + timedelta(days=delay)
            progress = (d - self.start).days / HISTORY_DAYS
            plines = []
            for sku, qty in lines:
                cost = round(self.spec[sku]["cost"] * prof[7] * (1 + prof[8] * progress) * self.rng.uniform(0.985, 1.015), 2)
                fill = 1.0 if (prof[4] >= 0.97 and self.rng.random() < 0.7) else min(1.0, max(0.5, self.rng.gauss(prof[4], 0.06)))
                plines.append({"sku": sku, "ordered": qty, "plan": max(1, round(qty * fill)), "cost": cost})
                self.queued_qty[sku] += qty
            po = {"id": po_id, "vendor_id": vid, "date": d, "expected": expected, "receipt": receipt, "lines": plines}
            self.queue[receipt].append(po)
            self.t["_po"].append(po)

    def receive(self, d: date):
        for po in self.queue.pop(d, []):
            gnum = self.nid("grn")
            grn_id = f"{PREFIX}GRN-{gnum:04d}"
            glines, total = [], 0.0
            for pl in po["lines"]:
                sku = pl["sku"]
                self.queued_qty[sku] -= pl["ordered"]
                pl["received"] = pl["plan"]
                mfg = d - timedelta(days=self.rng.randint(0, 2))
                self.lot_add(sku, pl["plan"], f"{PREFIX}B-{gnum:04d}-{sku[len(PREFIX):]}", mfg)
                glines.append({"id": self.uid(), "grn_id": grn_id, "sku": sku, "name": self.spec[sku]["name"],
                               "qty": float(pl["plan"]), "cost": pl["cost"]})
                total += pl["plan"] * pl["cost"]
            total = round(total, 2)
            po["grn_id"] = grn_id
            self.t["goodsreceiptnote"].append({
                "id": grn_id, "po_id": po["id"], "vendor_id": po["vendor_id"], "date": d.isoformat(), "total": total,
                "landed_cost_allocation": 0.0, "created_at": _at(d, 11, self.rng.randint(0, 59))})
            self.t["goodsreceiptnoteline"].extend(glines)
            self.payable[po["vendor_id"]] += total
            prof = VENDORS[po["vendor_id"][len(PREFIX):]]
            pay_day = d + timedelta(days=TERMS_DAYS[prof[3]] + self.rng.randint(0, 10))
            if self.rng.random() < 0.9 and pay_day <= self.today:
                self.pmt_events[pay_day].append({"vendor_id": po["vendor_id"], "amount": total})
            rate = prof[9]
            ret = []
            for pl in po["lines"]:
                if self.rng.random() < min(0.6, rate * 10):
                    q = max(1, round(pl["plan"] * rate * self.rng.uniform(1.0, 2.5)))
                    ret.append((pl["sku"], q, pl["cost"]))
            rday = d + timedelta(days=self.rng.randint(1, 6))
            if ret and rday <= self.today:
                self.pr_events[rday].append({"vendor_id": po["vendor_id"], "lines": ret})

    def purchase_returns(self, d: date):
        for ev in self.pr_events.pop(d, []):
            lines = []
            for sku, q, cost in ev["lines"]:
                q = min(q, self.stock[sku])
                if q > 0:
                    self.lot_take(sku, q)
                    lines.append((sku, q, cost))
            if not lines:
                continue
            num = self.nid("dn")
            dn = f"{PREFIX}DN-{num:03d}"
            total = round(sum(q * c for _, q, c in lines), 2)
            reason = self.rng.choice(["Damaged on delivery", "Near-expiry on receipt", "Quality issue", "Short shelf life"])
            self.t["purchasereturn"].append({"id": dn, "vendor_id": ev["vendor_id"], "date": d.isoformat(), "reason": reason,
                                             "total": total, "created_at": _at(d, 15, self.rng.randint(0, 59))})
            for sku, q, cost in lines:
                self.t["purchasereturnline"].append({"id": self.uid(), "return_id": dn, "sku": sku,
                                                     "name": self.spec[sku]["name"], "qty": float(q), "cost": cost})
            self.payable[ev["vendor_id"]] = max(0.0, self.payable[ev["vendor_id"]] - total)

    def payments(self, d: date):
        for ev in self.pmt_events.pop(d, []):
            amount = round(min(ev["amount"], self.payable[ev["vendor_id"]]), 2)
            if amount <= 0:
                continue
            num = self.nid("pmt")
            self.t["vendorpayment"].append({
                "id": f"{PREFIX}PMT-{num:03d}", "vendor_id": ev["vendor_id"], "date": d.isoformat(), "amount": amount,
                "mode": self.rng.choices(["Bank Transfer", "UPI", "Cheque", "Cash"], [50, 25, 15, 10])[0],
                "created_at": _at(d, 16, self.rng.randint(0, 59))})
            self.payable[ev["vendor_id"]] = max(0.0, self.payable[ev["vendor_id"]] - amount)

    # ------------------------------------------------------------------ stock maintenance
    def maintenance(self, d: date):
        for sku, s in self.spec.items():
            if d < s["listed"]:
                continue
            for lot in self.lots[sku]:                      # expired stock is written off 3 days after expiry
                if lot["qty"] > 0 and lot["exp"] + timedelta(days=2) < d:
                    q = lot["qty"]
                    lot["qty"] = 0
                    self.stock[sku] -= q
                    aid = self.nid("adj")
                    self.t["stockadjustment"].append({
                        "id": f"{PREFIX}ADJ-{aid:04d}", "sku": sku, "name": s["name"], "delta": float(-q),
                        "reason": "Expired write-off", "notes": f"Batch {lot['no']} expired {lot['exp'].isoformat()}",
                        "approved_by": APPROVER, "date": d.isoformat(), "created_at": _at(d, 10, self.rng.randint(0, 59))})
            if s["shelf"] <= 30 and self.rng.random() < 0.03 and self.stock[sku] > 3:
                self.adjust(sku, -self.rng.randint(1, 3), "Damaged / broken", "Found damaged while stocking shelves", d)
            elif self.rng.random() < 0.004 and self.stock[sku] > 5:
                self.adjust(sku, -self.rng.randint(1, 2), "Theft / shrinkage", "Shrinkage found at stock count", d)
            elif self.rng.random() < 0.004:
                self.adjust(sku, self.rng.choice([-2, -1, 1, 2]), "Count correction", "Cycle-count variance", d)

    # ------------------------------------------------------------------ sales
    def _tenders(self, total: float) -> List[tuple]:
        w = [50, 40, 10] if total < 150 else [30, 45, 25] if total < 800 else [15, 40, 45]
        mode = self.rng.choices(["Cash", "UPI", "Card"], w)[0]
        if total >= 100 and self.rng.random() < 0.08:
            other = self.rng.choice([m for m in ("Cash", "UPI", "Card") if m != mode])
            first = round(round(total * self.rng.uniform(0.2, 0.8) / 10) * 10, 2)
            if 0 < first < total:
                return [(mode, first), (other, round(total - first, 2))]
        return [(mode, round(total, 2))]

    def sales_day(self, d: date):
        ago = (self.today - d).days
        day_factor = WEEKDAY[d.weekday()] * (1.12 if d.day <= 5 else 1.0) * self.rng.lognormvariate(0, 0.10)
        tokens: List[str] = []
        for sku, s in self.spec.items():
            if d >= s["listed"]:
                tokens += [sku] * _poisson(self.rng, s["base"] * _pattern(s["pattern"], ago, s["listed_ago"]) * day_factor)
        self.rng.shuffle(tokens)
        hours, weights = list(HOUR_W), list(HOUR_W.values())
        bills = []
        i = 0
        while i < len(tokens):
            chunk = tokens[i:i + self.rng.randint(2, 9)]
            i += len(chunk)
            ts = _at(d, self.rng.choices(hours, weights)[0], self.rng.randint(0, 59), self.rng.randint(0, 59))
            if ts > self.now:
                ts = self.now - timedelta(minutes=self.rng.randint(1, 45))
            if ts.astimezone(IST).date() != d:
                continue
            bills.append((ts, chunk))
        bills.sort(key=lambda b: b[0])
        promos = self.promos_on(d)
        for ts, chunk in bills:
            counts: Dict[str, int] = defaultdict(int)
            for sku in chunk:
                counts[sku] += 1
            cart = []
            for sku, q in counts.items():
                q = min(q, self.stock[sku])                   # app blocks sales beyond available stock
                if q > 0:
                    s = self.spec[sku]
                    cart.append({"sku": sku, "name": s["name"], "price": s["price"], "tax": float(s["tax"]), "qty": float(q),
                                 "unit": "pcs", "pricing_method": "qty"})
            if not cart:
                continue
            manual = {"type": "percent", "value": 0.0}
            subtotal = sum(l["price"] * l["qty"] for l in cart)
            if subtotal > 300 and self.rng.random() < 0.04:
                manual = self.rng.choice([{"type": "percent", "value": 5.0}, {"type": "percent", "value": 10.0},
                                          {"type": "flat", "value": 20.0}])
            totals = compute_cart_totals(cart, self.pricing_mode, manual, promos)
            for l in totals["lines"]:
                self.lot_take(l["sku"], int(l["qty"]))
            num = self.nid("inv")
            sale_id = self.uid()
            invoice = f"{PREFIX}INV-{num:06d}"
            hour_ist = ts.astimezone(IST).hour
            user = self.cashiers[0] if (len(self.cashiers) == 1 or (hour_ist < 15) == (self.rng.random() < 0.65)) else self.cashiers[1]
            row = {"id": sale_id, "invoice_no": invoice, "created_by_username": user, "time": ts,
                   "pricing_mode": self.pricing_mode, "subtotal_original": totals["subtotal_original"],
                   "auto_discount_total": totals["auto_discount_total"], "manual_discount_total": totals["manual_discount_total"],
                   "discount_total": totals["discount_total"], "taxable_total": totals["taxable_total"],
                   "gst_total": totals["gst_total"], "grand_total": totals["grand_total"], "status": "COMPLETED", "created_at": ts}
            self.t["sale"].append(row)
            self.sale_rows[sale_id] = row
            for l in totals["lines"]:
                self.t["saleitem"].append({
                    "id": self.uid(), "sale_id": sale_id, "sku": l["sku"], "name": l["name"], "price": l["price"],
                    "tax_rate": l["tax"], "qty": l["qty"], "unit": l["unit"], "pricing_method": l["pricing_method"],
                    "original_amount": l["original_amount"], "discount_amount": l["discount_amount"],
                    "discount_name": l["discount_name"], "taxable_amount": l["taxable_amount"],
                    "gst_amount": l["gst_amount"], "final_amount": l["final_amount"]})
            for mode, amt in self._tenders(totals["grand_total"]):
                self.t["saletender"].append({"id": self.uid(), "sale_id": sale_id, "mode": mode, "amount": amt})
            if self.rng.random() < 0.012:
                lines = [l for l in totals["lines"]]
                pick = self.rng.choice(lines)
                when = d + timedelta(days=self.rng.choice([0, 0, 1, 2]))
                if when <= self.today:
                    self.returns_due[when].append({"sale_id": sale_id, "invoice": invoice, "line": pick, "sale_time": ts})

    def sale_returns(self, d: date):
        for ev in sorted(self.returns_due.pop(d, []), key=lambda e: e["sale_time"]):
            ts = max(_at(d, 11, self.rng.randint(0, 59)), ev["sale_time"] + timedelta(minutes=self.rng.randint(10, 90)))
            if ts > self.now or ts.astimezone(IST).date() != d:
                continue
            l = ev["line"]
            qty = float(self.rng.randint(1, int(l["qty"]))) if l["qty"] > 1 else 1.0
            refund = round(qty * (l["final_amount"] / l["qty"]), 2)
            sku = l["sku"]
            if self.lots[sku]:                               # returned stock goes back onto the newest lot
                self.lots[sku][-1]["qty"] += int(qty)
                self.stock[sku] += int(qty)
            else:
                self.lot_add(sku, int(qty), f"{PREFIX}B-RET{self.n['ret'] + 1:04d}", d)
            num = self.nid("ret")
            rid = self.uid()
            self.t["salereturn"].append({
                "id": rid, "return_no": f"{PREFIX}RET-{num:04d}", "invoice_no": ev["invoice"], "sale_id": ev["sale_id"],
                "created_by_username": self.sale_rows[ev["sale_id"]]["created_by_username"], "time": ts, "total_refund": refund,
                "reason": self.rng.choice(["Customer Return", "Damaged product", "Wrong item", "Expired / stale product"]),
                "created_at": ts})
            self.t["returnitem"].append({"id": self.uid(), "return_id": rid, "sku": sku, "qty": qty, "refund_amount": refund})
            self.sale_rows[ev["sale_id"]]["status"] = "RETURNED"

    # ------------------------------------------------------------------ finish
    def finish(self) -> Dict[str, List[dict]]:
        for po in self.t.pop("_po"):
            received = "receipt" in po and any("received" in l for l in po["lines"])
            for l in po["lines"]:
                l.setdefault("received", 0)
            if received and po["receipt"] <= self.today:
                full = all(l["received"] >= l["ordered"] for l in po["lines"])
                age = (self.today - po["expected"]).days
                status = ("Closed" if (age > 10 and self.rng.random() < 0.7) else "Received") if full else \
                         ("Closed" if age > 7 else "Partially Received")
            else:
                status = "Approved"
            self.t["purchaseorder"].append({
                "id": po["id"], "vendor_id": po["vendor_id"], "date": po["date"].isoformat(), "expected": po["expected"].isoformat(),
                "status": status, "approved_by": APPROVER, "created_at": _at(po["date"], 18, self.rng.randint(0, 59))})
            for l in po["lines"]:
                self.t["purchaseorderline"].append({
                    "id": self.uid(), "po_id": po["id"], "sku": l["sku"], "name": self.spec[l["sku"]]["name"],
                    "ordered_qty": float(l["ordered"]), "received_qty": float(l["received"]), "cost": l["cost"]})
        # un-actioned purchase orders (do not affect stock or payables)
        for vid, sku, qty, status, ago in (("V1", "BEV-001", 120, "Draft", 1), ("V6", "PC-003", 24, "Pending Approval", 0)):
            d = self.today - timedelta(days=ago)
            num = self.nid("po")
            po_id = f"{PREFIX}PO-{num:04d}"
            full = PREFIX + sku
            prof = VENDORS[vid]
            self.t["purchaseorder"].append({"id": po_id, "vendor_id": PREFIX + vid, "date": d.isoformat(),
                                            "expected": (d + timedelta(days=prof[6])).isoformat(), "status": status,
                                            "approved_by": None, "created_at": _at(d, 17, 30)})
            self.t["purchaseorderline"].append({"id": self.uid(), "po_id": po_id, "sku": full, "name": self.spec[full]["name"],
                                                "ordered_qty": float(qty), "received_qty": 0.0,
                                                "cost": round(self.spec[full]["cost"] * prof[7], 2)})
        for v, prof in VENDORS.items():
            vid = PREFIX + v
            self.t["vendor"].append({
                "id": vid, "name": prof[0] + " (Demo)", "category": prof[1], "contact": prof[2], "phone": f"+91 90000 000{list(VENDORS).index(v) + 1:02d}",
                "email": f"demo.{v.lower()}@example.com", "terms": prof[3], "status": "Active",
                "payable": round(self.payable[vid], 2), "created_at": _at(self.start - timedelta(days=30), 10, 0)})
        for idx, (sku, s) in enumerate(self.spec.items(), 1):
            self.t["item"].append({
                "sku": sku, "barcode": f"890999{idx:07d}", "name": s["name"], "category_name": s["cat"], "price": s["price"],
                "wholesale_price": round(s["price"] * 0.85, 2), "cost_price": s["cost"], "landed_cost": s["cost"],
                "tax_rate": float(s["tax"]), "stock": float(self.stock[sku]), "min_stock": float(s["min"]),
                "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": s["vendor"], "is_active": True,
                "created_at": _at(s["listed"] - timedelta(days=5 if s["listed_ago"] > HISTORY_DAYS else 0), 9, 0)})
            for lot in self.lots[sku]:
                if lot["qty"] > 0:
                    self.t["batch"].append({"id": self.uid(), "sku": sku, "name": s["name"], "batch_no": lot["no"],
                                            "mfg_date": lot["mfg"].isoformat(), "expiry_date": lot["exp"].isoformat(),
                                            "qty": float(lot["qty"]), "created_at": _at(lot["mfg"], 9, 0)})
        for name, typ, val, skus, s_ago, e_ago, status in PROMOS:
            s_day = self.today - timedelta(days=s_ago)
            self.t["discount"].append({
                "id": self.uid(), "name": name, "type": typ, "value": val, "applies_to": "selected",
                "product_skus": json.dumps([PREFIX + s for s in skus]), "start_date": s_day.isoformat(),
                "end_date": (self.today - timedelta(days=e_ago)).isoformat() if e_ago is not None else None,
                "status": status, "created_at": _at(s_day, 9, 0)})
        return dict(self.t)


def generate(today: Optional[date] = None, now: Optional[datetime] = None, seed: int = 20260930,
             cashiers: Optional[List[str]] = None, pricing_mode: str = "exclusive") -> Dict[str, List[dict]]:
    """Return {model_name: [row dicts]} for the whole 3-month history ending at `now` (IST today by default)."""
    now = now or datetime.now(IST)
    today = today or now.astimezone(IST).date()
    sim = _Sim(today, now, seed, cashiers or ["priya.k", "ravi.s"], pricing_mode)
    sim.setup()
    d = sim.start
    while d <= today:
        sim.receive(d)
        sim.purchase_returns(d)
        sim.payments(d)
        sim.maintenance(d)
        sim.sales_day(d)
        sim.sale_returns(d)
        sim.place_orders(d)
        d += timedelta(days=1)
    return sim.finish()


# ---------------------------------------------------------------------------------------------- verification
def _day(v) -> date:
    if isinstance(v, datetime):
        return v.astimezone(IST).date()
    return date.fromisoformat(str(v)[:10])


def verify_tables(t: Dict[str, List[dict]], now: Optional[datetime] = None) -> List[str]:
    """Independently re-derive every ledger from the rows. Returns a list of problems (empty == consistent)."""
    bad: List[str] = []
    eps = 0.011
    items = {r["sku"]: r for r in t.get("item", [])}
    vendors = {r["id"]: r for r in t.get("vendor", [])}
    sales = {r["id"]: r for r in t.get("sale", [])}
    sitems, stend = defaultdict(list), defaultdict(list)
    for r in t.get("saleitem", []):
        sitems[r["sale_id"]].append(r)
    for r in t.get("saletender", []):
        stend[r["sale_id"]].append(r)

    # --- invoices
    seen = set()
    for sid, s in sales.items():
        if s["invoice_no"] in seen:
            bad.append(f"duplicate invoice {s['invoice_no']}")
        seen.add(s["invoice_no"])
        li = sitems.get(sid, [])
        if not li:
            bad.append(f"{s['invoice_no']}: no lines")
            continue
        if abs(sum(l["final_amount"] for l in li) - s["grand_total"]) > eps * len(li):
            bad.append(f"{s['invoice_no']}: lines != grand_total")
        if abs(sum(l["taxable_amount"] for l in li) - s["taxable_total"]) > eps * len(li):
            bad.append(f"{s['invoice_no']}: taxable mismatch")
        if abs(sum(l["gst_amount"] for l in li) - s["gst_total"]) > eps * len(li):
            bad.append(f"{s['invoice_no']}: gst mismatch")
        if abs(s["taxable_total"] + s["gst_total"] - s["grand_total"]) > eps * 2 and s["pricing_mode"] == "exclusive":
            bad.append(f"{s['invoice_no']}: taxable+gst != grand")
        if abs(s["auto_discount_total"] + s["manual_discount_total"] - s["discount_total"]) > eps:
            bad.append(f"{s['invoice_no']}: discount mismatch")
        if abs(sum(x["amount"] for x in stend.get(sid, [])) - s["grand_total"]) > eps:
            bad.append(f"{s['invoice_no']}: tenders != grand_total")
        if now and s["time"] > now:
            bad.append(f"{s['invoice_no']}: dated in the future")
        for l in li:
            if l["sku"] not in items:
                bad.append(f"{s['invoice_no']}: unknown sku {l['sku']}")
    returned_status = {r["sale_id"] for r in t.get("salereturn", [])}
    for sid in returned_status:
        if sid in sales and sales[sid]["status"] != "RETURNED":
            bad.append(f"sale {sales[sid]['invoice_no']} has a return but status {sales[sid]['status']}")

    # --- stock ledger replayed chronologically (per day: receipts/+adj, then PR/-adj, then sales, then returns)
    events = []   # (day, phase, time, sku, delta)
    for r in t.get("stockadjustment", []):
        events.append((_day(r["date"]), 0 if r["delta"] > 0 else 1, None, r["sku"], r["delta"]))
    grn_day = {g["id"]: _day(g["date"]) for g in t.get("goodsreceiptnote", [])}
    for l in t.get("goodsreceiptnoteline", []):
        events.append((grn_day[l["grn_id"]], 0, None, l["sku"], l["qty"]))
    pr_day = {p["id"]: _day(p["date"]) for p in t.get("purchasereturn", [])}
    for l in t.get("purchasereturnline", []):
        events.append((pr_day[l["return_id"]], 1, None, l["sku"], -l["qty"]))
    for sid, li in sitems.items():
        if sid not in sales:                      # a real (non-demo) sale sold a demo SKU
            bad.append(f"{len(li)} sale line(s) of demo SKUs belong to a non-demo invoice (sale id {sid})")
            continue
        for l in li:
            events.append((_day(sales[sid]["time"]), 2, sales[sid]["time"], l["sku"], -l["qty"]))
    rets = {r["id"]: r for r in t.get("salereturn", [])}
    for l in t.get("returnitem", []):
        events.append((_day(rets[l["return_id"]]["time"]), 3, rets[l["return_id"]]["time"], l["sku"], l["qty"]))
    events.sort(key=lambda e: (e[0], e[1], e[2].timestamp() if e[2] else 0))
    bal: Dict[str, float] = defaultdict(float)
    for day, _phase, _t, sku, delta in events:
        bal[sku] += delta
        if bal[sku] < -1e-6:
            bad.append(f"negative stock for {sku} on {day}")
    for sku, it in items.items():
        if abs(bal.get(sku, 0.0) - it["stock"]) > 1e-6:
            bad.append(f"stock mismatch {sku}: ledger {bal.get(sku, 0.0)} vs item {it['stock']}")
    batch_sum: Dict[str, float] = defaultdict(float)
    for b in t.get("batch", []):
        batch_sum[b["sku"]] += b["qty"]
    for sku, it in items.items():
        if abs(batch_sum.get(sku, 0.0) - it["stock"]) > 1e-6:
            bad.append(f"batch total != stock for {sku}: {batch_sum.get(sku, 0.0)} vs {it['stock']}")

    # --- purchase orders / GRNs
    received: Dict[tuple, float] = defaultdict(float)
    grn_po = {g["id"]: g["po_id"] for g in t.get("goodsreceiptnote", [])}
    for l in t.get("goodsreceiptnoteline", []):
        received[(grn_po[l["grn_id"]], l["sku"])] += l["qty"]
    po_status = {p["id"]: p["status"] for p in t.get("purchaseorder", [])}
    po_lines = defaultdict(list)
    for l in t.get("purchaseorderline", []):
        po_lines[l["po_id"]].append(l)
        if abs(received.get((l["po_id"], l["sku"]), 0.0) - l["received_qty"]) > 1e-6:
            bad.append(f"PO {l['po_id']} {l['sku']}: received_qty != GRN total")
        if l["received_qty"] > l["ordered_qty"] + 1e-6:
            bad.append(f"PO {l['po_id']} {l['sku']}: over-received")
    for pid, ls in po_lines.items():
        if po_status[pid] == "Received" and any(l["received_qty"] < l["ordered_qty"] for l in ls):
            bad.append(f"PO {pid} marked Received but short")
        if po_status[pid] in ("Draft", "Pending Approval", "Approved") and any(l["received_qty"] > 0 for l in ls):
            bad.append(f"PO {pid} {po_status[pid]} but has receipts")
    glines = defaultdict(float)
    for l in t.get("goodsreceiptnoteline", []):
        glines[l["grn_id"]] += l["qty"] * l["cost"]
    for g in t.get("goodsreceiptnote", []):
        if abs(glines[g["id"]] - g["total"]) > 0.05:
            bad.append(f"GRN {g['id']} total mismatch")

    # --- vendor payable replay (per day: GRN, purchase return, payment — same order as the app's flows)
    ev2 = []
    for g in t.get("goodsreceiptnote", []):
        ev2.append((_day(g["date"]), 0, g["vendor_id"], round(glines[g["id"]], 2)))
    for p in t.get("purchasereturn", []):
        ev2.append((_day(p["date"]), 1, p["vendor_id"], -p["total"]))
    for p in t.get("vendorpayment", []):
        ev2.append((_day(p["date"]), 2, p["vendor_id"], -p["amount"]))
    ev2.sort(key=lambda e: (e[0], e[1]))
    pay: Dict[str, float] = defaultdict(float)
    for _d, _k, vid, amt in ev2:
        pay[vid] = max(0.0, pay[vid] + amt)
    for vid, v in vendors.items():
        if abs(pay.get(vid, 0.0) - v["payable"]) > 0.05:
            bad.append(f"payable mismatch {vid}: replay {pay.get(vid, 0.0):.2f} vs vendor {v['payable']:.2f}")

    # --- referential closure
    for p in t.get("purchaseorder", []):
        if p["vendor_id"] not in vendors:
            bad.append(f"PO {p['id']}: unknown vendor")
    for i in items.values():
        if i["preferred_vendor_id"] not in vendors:
            bad.append(f"item {i['sku']}: unknown preferred vendor")
    for table, key in (("goodsreceiptnoteline", "sku"), ("purchaseorderline", "sku"), ("purchasereturnline", "sku"),
                       ("stockadjustment", "sku"), ("batch", "sku"), ("returnitem", "sku")):
        for r in t.get(table, []):
            if r[key] not in items:
                bad.append(f"{table}: unknown sku {r[key]}")
    for r in t.get("salereturn", []):
        if r["sale_id"] not in sales:
            bad.append(f"return {r['return_no']}: unknown sale")
    return bad


def summarize(t: Dict[str, List[dict]]) -> Dict[str, Any]:
    sales = t.get("sale", [])
    times = [s["time"] for s in sales]
    return {
        "rows": {k: len(v) for k, v in sorted(t.items())},
        "first_sale": min(times).astimezone(IST).isoformat(timespec="minutes") if times else None,
        "last_sale": max(times).astimezone(IST).isoformat(timespec="minutes") if times else None,
        "gross_sales": round(sum(s["grand_total"] for s in sales), 2),
        "gst_collected": round(sum(s["gst_total"] for s in sales), 2),
        "discounts_given": round(sum(s["discount_total"] for s in sales), 2),
        "returns_refunded": round(sum(r["total_refund"] for r in t.get("salereturn", [])), 2),
        "vendor_payables": round(sum(v["payable"] for v in t.get("vendor", [])), 2),
        "low_stock_items": sorted(i["sku"] for i in t.get("item", []) if i["stock"] <= i["min_stock"]),
        "out_of_stock_items": sorted(i["sku"] for i in t.get("item", []) if i["stock"] <= 0),
    }
