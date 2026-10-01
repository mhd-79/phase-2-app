"""Tests for the 3-month demo history generator and its database CLI (no real database needed)."""
import asyncio
import json
from datetime import date, datetime, timedelta
from types import SimpleNamespace as NS

import pytest

from scripts import demo_history as dh
from scripts import demo_history_cli as cli

NOW = datetime(2026, 9, 30, 16, 30, tzinfo=dh.IST)


@pytest.fixture(scope="module")
def tables():
    return dh.generate(today=NOW.date(), now=NOW)


# ------------------------------------------------------------------------------------------------ generator
def test_generated_history_is_fully_consistent(tables):
    assert dh.verify_tables(tables, now=NOW) == []


@pytest.mark.parametrize("seed,mode,cashiers", [(1, "exclusive", ["priya.k", "ravi.s"]), (2, "inclusive", ["priya.k"]), (3, "exclusive", ["a", "b"])])
def test_consistent_for_other_seeds_and_pricing_modes(seed, mode, cashiers):
    t = dh.generate(today=NOW.date(), now=NOW, seed=seed, pricing_mode=mode, cashiers=cashiers)
    assert dh.verify_tables(t, now=NOW) == []
    assert {s["created_by_username"] for s in t["sale"]} <= set(cashiers)
    assert {s["pricing_mode"] for s in t["sale"]} == {mode}


def test_deterministic(tables):
    again = dh.generate(today=NOW.date(), now=NOW)
    assert dh.summarize(again) == dh.summarize(tables)
    assert again["sale"][100]["grand_total"] == tables["sale"][100]["grand_total"]


def test_everything_is_identifiable_and_isolated(tables):
    assert all(i["sku"].startswith("DEMO-") and i["name"].endswith("(Demo)") for i in tables["item"])
    assert all(v["id"].startswith("DEMO-") and v["name"].endswith("(Demo)") for v in tables["vendor"])
    assert all(s["invoice_no"].startswith("DEMO-INV-") for s in tables["sale"])
    assert all(r["return_no"].startswith("DEMO-RET-") for r in tables["salereturn"])
    for table in ("purchaseorder", "goodsreceiptnote", "purchasereturn", "vendorpayment", "stockadjustment"):
        assert all(r["id"].startswith("DEMO-") for r in tables[table]), table
    assert all(d["name"].startswith("[DEMO] ") for d in tables["discount"])
    assert all(b["sku"].startswith("DEMO-") and b["batch_no"].startswith("DEMO-") for b in tables["batch"])
    # promotions target demo SKUs only, so they can never discount a real product
    for d in tables["discount"]:
        assert d["applies_to"] == "selected" and all(s.startswith("DEMO-") for s in json.loads(d["product_skus"]))
    # every foreign key points at demo rows; the only outside reference is the cashier username
    assert all(i["preferred_vendor_id"].startswith("DEMO-") for i in tables["item"])
    assert all(p["vendor_id"].startswith("DEMO-") for p in tables["purchaseorder"])


def test_covers_three_months_with_realistic_shape(tables):
    s = dh.summarize(tables)
    days = {r["time"].astimezone(dh.IST).date() for r in tables["sale"]}
    assert len(days) >= 88 and min(days) <= NOW.date() - timedelta(days=88) and max(days) == NOW.date()
    assert all(r["time"] <= NOW for r in tables["sale"])
    assert 2500 < s["rows"]["sale"] < 4500 and s["rows"]["saleitem"] > 10000
    per_day = {}
    for r in tables["sale"]:
        d = r["time"].astimezone(dh.IST).date()
        per_day[d] = per_day.get(d, 0) + r["grand_total"]
    vals = [v for d, v in per_day.items() if d != NOW.date()]                    # today is a partial day
    assert max(vals) / min(vals) > 1.3                                             # daily sales vary
    sat = [v for d, v in per_day.items() if d.weekday() == 5]
    tue = [v for d, v in per_day.items() if d.weekday() == 1]
    assert sum(sat) / len(sat) > sum(tue) / len(tue)                               # weekend uplift
    assert {t["mode"] for t in tables["saletender"]} == {"Cash", "Card", "UPI"}
    assert s["discounts_given"] > 0 and s["gst_collected"] > 0 and s["returns_refunded"] > 0
    assert any(x["manual_discount_total"] > 0 for x in tables["sale"])
    assert any(x["auto_discount_total"] > 0 for x in tables["sale"])
    assert any(x["status"] == "RETURNED" for x in tables["sale"])
    assert {r["tax_rate"] for r in tables["saleitem"]} >= {5.0, 12.0, 18.0}


def test_business_scenarios_exist(tables):
    items = {i["sku"]: i for i in tables["item"]}
    s = dh.summarize(tables)
    assert len(s["low_stock_items"]) >= 3 and len(s["out_of_stock_items"]) >= 1
    sold = {}
    for l in tables["saleitem"]:
        sold[l["sku"]] = sold.get(l["sku"], 0) + l["qty"]
    assert sold["DEMO-DAI-001"] > 10 * sold["DEMO-BEV-004"]                        # fast vs slow mover
    assert items["DEMO-BEV-004"]["stock"] > 10 * items["DEMO-BEV-004"]["min_stock"]  # overstocked slow mover
    status = {p["id"]: p["status"] for p in tables["purchaseorder"]}
    assert {"Received", "Closed", "Approved", "Draft", "Pending Approval"} <= set(status.values())
    assert any(l["received_qty"] < l["ordered_qty"] and status[l["po_id"]] in ("Closed", "Partially Received")
               for l in tables["purchaseorderline"])                                # short deliveries
    assert len(tables["purchasereturn"]) >= 10 and len(tables["vendorpayment"]) >= 30
    assert {p["mode"] for p in tables["vendorpayment"]} >= {"Bank Transfer", "UPI"}
    grn_vendor = {g["id"]: g["vendor_id"] for g in tables["goodsreceiptnote"]}
    by_sku = {}
    for l in tables["goodsreceiptnoteline"]:
        by_sku.setdefault(l["sku"], set()).add(grn_vendor[l["grn_id"]])
    assert sum(1 for v in by_sku.values() if len(v) >= 2) >= 4                     # price history from 2+ vendors
    expiries = [date.fromisoformat(b["expiry_date"]) for b in tables["batch"]]
    assert any(e <= NOW.date() + timedelta(days=7) for e in expiries)              # expiry pressure
    assert {a["reason"] for a in tables["stockadjustment"]} >= {"Count correction", "Damaged / broken", "Expired write-off"}


def test_existing_business_logic_is_reused(tables):
    """Invoice maths must equal app.pricing_engine.compute_cart_totals for the same cart."""
    from app.pricing_engine import compute_cart_totals
    lines_by_sale = {}
    for l in tables["saleitem"]:
        lines_by_sale.setdefault(l["sale_id"], []).append(l)
    checked = 0
    for s in tables["sale"][::97]:
        if s["manual_discount_total"] or s["auto_discount_total"]:
            continue
        cart = [{"sku": l["sku"], "name": l["name"], "price": l["price"], "tax": l["tax_rate"], "qty": l["qty"],
                 "unit": "pcs", "pricing_method": "qty"} for l in lines_by_sale[s["id"]]]
        t = compute_cart_totals(cart, s["pricing_mode"], None, [])
        assert t["grand_total"] == s["grand_total"] and t["gst_total"] == s["gst_total"]
        checked += 1
    assert checked > 10


# ------------------------------------------------------------------------------------------------ verifier catches corruption
def _copy(t):
    return {k: [dict(r) for r in v] for k, v in t.items()}


def test_verifier_detects_tampering(tables):
    t = _copy(tables)
    t["item"][0]["stock"] += 5
    assert any("stock mismatch" in p for p in dh.verify_tables(t))
    t = _copy(tables)
    t["sale"][0]["grand_total"] += 10
    assert any("grand_total" in p for p in dh.verify_tables(t))
    t = _copy(tables)
    t["vendor"][0]["payable"] += 100
    assert any("payable mismatch" in p for p in dh.verify_tables(t))
    t = _copy(tables)
    t["batch"][0]["qty"] += 1
    assert any("batch total" in p for p in dh.verify_tables(t))
    t = _copy(tables)
    t["saleitem"].append(dict(t["saleitem"][0], id="x", sale_id="not-demo"))
    assert any("non-demo invoice" in p for p in dh.verify_tables(t))


# ------------------------------------------------------------------------------------------------ AI Insights on this data
class _Coll:
    def __init__(self, rows):
        self.rows = rows

    async def find_many(self, **kw):
        return self.rows


def _ns_db(t):
    def by(rows, key):
        out = {}
        for r in rows:
            out.setdefault(r[key], []).append(r)
        return out
    lines, tenders = by(t["saleitem"], "sale_id"), by(t["saletender"], "sale_id")
    sales = [NS(**s, items=[NS(**l) for l in lines.get(s["id"], [])], tenders=[NS(**x) for x in tenders.get(s["id"], [])]) for s in t["sale"]]
    ritems = by(t["returnitem"], "return_id")
    rets = [NS(**r, items=[NS(**i) for i in ritems.get(r["id"], [])]) for r in t["salereturn"]]
    pol = by(t["purchaseorderline"], "po_id")
    pos = [NS(**p, lines=[NS(**l) for l in pol.get(p["id"], [])]) for p in t["purchaseorder"]]
    gl = by(t["goodsreceiptnoteline"], "grn_id")
    grns = [NS(**g, lines=[NS(**l) for l in gl.get(g["id"], [])]) for g in t["goodsreceiptnote"]]
    pl = by(t["purchasereturnline"], "return_id")
    prs = [NS(**p, lines=[NS(**l) for l in pl.get(p["id"], [])]) for p in t["purchasereturn"]]
    return NS(is_connected=lambda: True, item=_Coll([NS(**i) for i in t["item"]]), vendor=_Coll([NS(**v) for v in t["vendor"]]),
              sale=_Coll(sales), salereturn=_Coll(rets), purchaseorder=_Coll(pos), goodsreceiptnote=_Coll(grns),
              purchasereturn=_Coll(prs), batch=_Coll([NS(**b) for b in t["batch"]]), discount=_Coll([NS(**d) for d in t["discount"]]))


def test_every_ai_insight_has_meaningful_output_from_database_rows(monkeypatch):
    """Generate history ending *now*, feed it through the router's real DB-loading code, and run every insight."""
    from app import insights_engine as eng
    from app.routers import ai_insights_module as mod
    t = dh.generate()                                        # anchored to the wall clock like the live router
    monkeypatch.setattr(mod, "get_db", lambda: _ns_db(t))
    ds = asyncio.run(mod.load_dataset())
    m = eng.meta(ds)
    assert m["confidence"] == "high" and m["is_demo"] is False and m["data_days"] >= 88
    assert eng.sales_visualizations(ds)["kpis"]["bills"] > 500
    fc = eng.demand_forecast(ds)
    assert fc["status"] == "ok" and fc["model"]["backtest_wape_pct"] < 30
    assert eng.low_stock_reorder_list(ds)["summary"]["items"] >= 3
    assert eng.restock_recommendations(ds)["summary"]["items"] >= 3
    assert eng.reorder_timing(ds)["summary"]["Order now"] >= 1
    vi = eng.vendor_intelligence(ds)
    assert len({v["grade"] for v in vi["vendors"]}) >= 2 and vi["summary"]["scored"] == 8
    assert eng.vendor_price_comparison(ds)["summary"]["comparable_items"] >= 4
    assert eng.vendor_recommendations(ds)["summary"]["vendor_actions"] >= 3
    assert eng.discount_recommendations(ds)["summary"]["recommendations"] >= 2
    tr = eng.trending_products(ds, 14)
    assert tr["summary"]["rising"] >= 2 and tr["summary"]["cooling"] >= 1
    assert len({i["verdict"] for i in eng.new_product_prediction(ds, 60)["items"]}) >= 2
    bs = eng.business_summary(ds, 30)
    assert bs["status"] == "ok" and len(bs["priorities"]) >= 3


# ------------------------------------------------------------------------------------------------ CLI against a fake database
class Rec:
    def __init__(self, d):
        self.__dict__.update(d)
        self._d = d

    def dict(self):
        return dict(self._d)


def _match(row, where):
    for k, v in (where or {}).items():
        if k == "NOT":
            if _match(row, v):
                return False
        elif isinstance(v, dict) and "startswith" in v:
            if not str(row.get(k) or "").startswith(v["startswith"]):
                return False
        elif row.get(k) != v:
            return False
    return True


CASCADE = {"sale": [("saleitem", "sale_id"), ("saletender", "sale_id")], "salereturn": [("returnitem", "return_id")],
           "goodsreceiptnote": [("goodsreceiptnoteline", "grn_id")], "purchaseorder": [("purchaseorderline", "po_id")],
           "purchasereturn": [("purchasereturnline", "return_id")]}


class FakeModel:
    def __init__(self, db, name):
        self.db, self.name, self.rows, self.fail = db, name, [], False

    async def create_many(self, data):
        if self.fail:
            raise RuntimeError(f"boom inserting {self.name}")
        self.rows.extend(dict(d) for d in data)

    async def create(self, data):
        d = dict(data)
        d.setdefault("timestamp", datetime.now(dh.UTC) + timedelta(microseconds=len(self.rows)))
        self.rows.append(d)
        return Rec(d)

    async def count(self, where=None):
        return sum(_match(r, where) for r in self.rows)

    async def find_many(self, where=None, **kw):
        return [Rec(r) for r in self.rows if _match(r, where)]

    async def find_first(self, where=None, order=None):
        rows = [r for r in self.rows if _match(r, where)]
        if order:
            (k, direction), = order.items()
            rows.sort(key=lambda r: r[k], reverse=(direction == "desc"))
        return Rec(rows[0]) if rows else None

    async def find_unique(self, where):
        return next((Rec(r) for r in self.rows if _match(r, where)), None)

    async def delete_many(self, where):
        gone = [r for r in self.rows if _match(r, where)]
        self.rows = [r for r in self.rows if r not in gone]
        ids = {r.get("id") for r in gone}
        for child, fk in CASCADE.get(self.name, []):
            cm = getattr(self.db, child)
            cm.rows = [r for r in cm.rows if r[fk] not in ids]
        return len(gone)


class FakeDb:
    def __init__(self, with_users=True):
        for name in cli.INSERT_ORDER + ["user", "storesettings", "auditlog"]:
            setattr(self, name, FakeModel(self, name))
        if with_users:
            self.user.rows = [{"username": "owner.arjun", "role": "admin", "is_active": True},
                              {"username": "priya.k", "role": "cashier", "is_active": True},
                              {"username": "ravi.s", "role": "cashier", "is_active": True}]
        self.storesettings.rows = [{"id": "store_main", "pricing_mode": "exclusive"}]
        # pre-existing REAL data that must never be touched
        self.item.rows = [{"sku": "BEV-001", "stock": 86.0}]
        self.vendor.rows = [{"id": "V-001", "payable": 84500.0}]
        self.sale.rows = [{"id": "real-1", "invoice_no": "INV-FY26-01025"}]
        self.saleitem.rows = [{"id": "ri", "sale_id": "real-1", "sku": "BEV-001"}]

    def real_snapshot(self):
        return ([dict(r) for r in self.item.rows if not r["sku"].startswith("DEMO-")],
                [dict(r) for r in self.vendor.rows if not r["id"].startswith("DEMO-")],
                [dict(r) for r in self.sale.rows if not r["invoice_no"].startswith("DEMO-")],
                [dict(r) for r in self.saleitem.rows if not r["sku"].startswith("DEMO-")])


def run(coro):
    return asyncio.run(coro)


CLI_NOW = datetime.now(dh.IST) - timedelta(minutes=2)       # always in the past, so "not in the future" holds for the real clock


def _apply(db, **kw):
    logs = []
    code = run(cli.apply(db, yes=kw.pop("yes", True), replace=kw.pop("replace", False), log=logs.append, now=CLI_NOW, **kw))
    return code, logs


def test_apply_inserts_everything_verifies_and_leaves_real_rows_untouched():
    db = FakeDb()
    before = db.real_snapshot()
    code, logs = _apply(db)
    assert code == 0, logs
    t = dh.generate(now=CLI_NOW, today=CLI_NOW.date())
    counts = run(cli.demo_counts(db))
    assert counts["sale"] == len(t["sale"]) and counts["saleitem"] == len(t["saleitem"]) and counts["item"] == 28
    assert len(db.saletender.rows) == len(t["saletender"])
    assert db.real_snapshot() == before                                            # real rows byte-for-byte unchanged
    assert run(cli.verify_db(db, log=lambda *_: None)) == []
    seed = json.loads(next(a for a in db.auditlog.rows if a["action"] == "DEMO_DATA_SEED")["details_json"])
    assert seed["baseline_real_counts"]["sale"] == 1


def test_apply_requires_explicit_confirmation_and_refuses_duplicates():
    db = FakeDb()
    code, _ = _apply(db, yes=False)
    assert code == 2 and run(cli.demo_counts(db))["sale"] == 0
    assert _apply(db)[0] == 0
    code, logs = _apply(db)
    assert code == 2 and "already present" in " ".join(logs)
    code, _ = _apply(db, replace=True)
    assert code == 0 and run(cli.demo_counts(db))["sale"] == len(dh.generate(now=CLI_NOW, today=CLI_NOW.date())["sale"])


def test_failed_insert_rolls_back_completely():
    db = FakeDb()
    before = db.real_snapshot()
    db.saleitem.fail = True
    code, logs = _apply(db)
    assert code == 1 and "Rolling back" in " ".join(logs)
    assert not any(run(cli.demo_counts(db)).values())
    assert db.real_snapshot() == before


def test_apply_needs_cashier_users():
    db = FakeDb(with_users=False)
    code, _ = _apply(db)
    assert code == 2 and not any(run(cli.demo_counts(db)).values())


def test_purge_removes_only_demo_rows_and_is_complete():
    db = FakeDb()
    before = db.real_snapshot()
    _apply(db)
    logs = []
    assert run(cli.purge_cmd(db, yes=False, force=False, log=logs.append)) == 2
    assert run(cli.demo_counts(db))["sale"] > 0
    assert run(cli.purge_cmd(db, yes=True, force=False, log=logs.append)) == 0
    assert not any(run(cli.demo_counts(db)).values())
    assert db.real_snapshot() == before
    assert len(db.saleitem.rows) == 1 and not db.saletender.rows and not db.returnitem.rows
    assert not db.goodsreceiptnoteline.rows and not db.purchaseorderline.rows and not db.purchasereturnline.rows
    assert {a["action"] for a in db.auditlog.rows} == {"DEMO_DATA_SEED", "DEMO_DATA_PURGE"}


def test_purge_refuses_when_real_activity_happened_after_apply():
    db = FakeDb()
    _apply(db)
    db.sale.rows.append({"id": "real-2", "invoice_no": "INV-FY26-04500"})        # a cashier rang a real bill
    logs = []
    assert run(cli.purge_cmd(db, yes=True, force=False, log=logs.append)) == 3
    assert "sale: 1 -> 2" in " ".join(logs) and run(cli.demo_counts(db))["sale"] > 0
    assert run(cli.purge_cmd(db, yes=True, force=True, log=logs.append)) == 0      # explicit override
    assert {r["id"] for r in db.sale.rows} == {"real-1", "real-2"}


def test_verify_flags_changes_made_to_demo_stock_after_apply():
    db = FakeDb()
    _apply(db)
    next(r for r in db.item.rows if r["sku"] == "DEMO-BEV-001")["stock"] += 3
    problems = run(cli.verify_db(db, log=lambda *_: None))
    assert any("stock mismatch DEMO-BEV-001" in p for p in problems)


def test_plan_command_needs_no_database(capsys):
    assert cli.main(["plan"]) == 0
    out = capsys.readouterr().out
    assert "nothing is written" in out and "PASS" in out


# ------------------------------------------------------------------------------------------------ schema conformance
def _parse_schema():
    """{Model: {field: (type, optional, has_default, is_relation_or_list)}} read straight from prisma/schema.prisma."""
    import re
    from pathlib import Path
    text = (Path(__file__).resolve().parents[1] / "prisma" / "schema.prisma").read_text(encoding="utf-8")
    models = {}
    for name, body in re.findall(r"^model\s+(\w+)\s*\{(.*?)^\}", text, re.S | re.M):
        fields = {}
        for line in body.splitlines():
            line = line.split("//")[0].strip()
            if not line or line.startswith("@@"):
                continue
            parts = line.split()
            fname, ftype = parts[0], parts[1]
            fields[fname] = (ftype.rstrip("?[]"), ftype.endswith("?"), "@default" in line or "@updatedAt" in line or "@id" in line and "@default" in line,
                             ftype.endswith("[]") or "@relation" in line)
        models[name] = fields
    return models


def test_every_row_conforms_to_schema_prisma(tables):
    """Column names, required columns and scalar types are checked against schema.prisma (the source of truth)."""
    schema = _parse_schema()
    names = {"item": "Item", "vendor": "Vendor", "discount": "Discount", "purchaseorder": "PurchaseOrder",
             "purchaseorderline": "PurchaseOrderLine", "goodsreceiptnote": "GoodsReceiptNote",
             "goodsreceiptnoteline": "GoodsReceiptNoteLine", "purchasereturn": "PurchaseReturn",
             "purchasereturnline": "PurchaseReturnLine", "vendorpayment": "VendorPayment", "stockadjustment": "StockAdjustment",
             "batch": "Batch", "sale": "Sale", "saleitem": "SaleItem", "saletender": "SaleTender", "salereturn": "SaleReturn",
             "returnitem": "ReturnItem"}
    assert set(names) == set(cli.INSERT_ORDER)
    pytypes = {"String": str, "Float": (int, float), "Int": int, "Boolean": bool, "DateTime": datetime}
    for table, model in names.items():
        fields = schema[model]
        scalars = {f: v for f, v in fields.items() if not v[3] and v[0] in pytypes}
        for row in tables[table]:
            unknown = set(row) - set(scalars)
            assert not unknown, f"{table}: columns not in schema.prisma: {unknown}"
            for f, (ftype, optional, has_default, _rel) in scalars.items():
                if f not in row:
                    assert optional or has_default, f"{table}: required column {f} is missing"
                    continue
                if row[f] is None:
                    assert optional, f"{table}.{f} is null but required"
                    continue
                assert isinstance(row[f], pytypes[ftype]), f"{table}.{f}: {type(row[f]).__name__} is not {ftype}"
                if ftype == "DateTime":
                    assert row[f].tzinfo is not None, f"{table}.{f} must be timezone-aware"
            assert len({(r.get("id") or r.get("sku")) for r in tables[table]}) == len(tables[table]), f"{table}: duplicate primary keys"
        # unique columns
    assert len({s["invoice_no"] for s in tables["sale"]}) == len(tables["sale"])
    assert len({s["return_no"] for s in tables["salereturn"]}) == len(tables["salereturn"])


def test_cli_refuses_to_write_without_yes_before_touching_any_database(capsys):
    assert cli.main(["apply"]) == 2
    assert cli.main(["purge"]) == 2
    out = capsys.readouterr().out
    assert "without --yes" in out and "Target database" not in out
