"""Unit tests for the AI Insights engine using a synthetic, fully known dataset (no database needed)."""
from datetime import date, timedelta

import pytest

from app import insights_engine as eng

TODAY = date(2026, 9, 30)


def _item(sku, cat, price, cost, stock, min_stock, vendor, created=date(2026, 1, 1)):
    return {"sku": sku, "name": sku.title(), "category": cat, "price": price, "cost": cost, "landed_cost": cost,
            "stock": stock, "min_stock": min_stock, "unit": "pcs", "vendor_id": vendor, "created": created}


def _dataset(sales_days=42, with_history=True):
    items = {
        "FAST": _item("FAST", "Beverages", 100, 60, 10, 10, "V1"),             # 10/day demand, low stock
        "SLOW": _item("SLOW", "Snacks", 50, 35, 200, 10, "V2"),                # nearly no demand, lots of stock
        "RISE": _item("RISE", "Snacks", 40, 25, 50, 10, "V2"),                 # accelerating
        "NEWA": _item("NEWA", "Beverages", 80, 50, 30, 10, "V1", created=TODAY - timedelta(days=20)),  # new, selling well
        "NEWB": _item("NEWB", "Snacks", 80, 50, 30, 10, "V2", created=TODAY - timedelta(days=20)),     # new, no sales
    }
    vendors = {
        "V1": {"id": "V1", "name": "Alpha", "category": "Bev", "terms": "Net 15", "status": "Active", "payable": 5000.0},
        "V2": {"id": "V2", "name": "Beta", "category": "Snk", "terms": "Net 30", "status": "Active", "payable": 0.0},
    }
    lines, bills, tenders = [], [], []
    inv = 0
    for back in range(sales_days - 1, -1, -1):
        d = TODAY - timedelta(days=back)
        wk = 1.4 if d.weekday() >= 5 else 1.0          # weekend uplift
        plan = {"FAST": round(10 * wk), "SLOW": 1 if back % 10 == 0 else 0,
                "RISE": 2 if back > 14 else 6, "NEWA": 4 if back < 20 else 0}
        inv += 1
        invoice = f"INV-{inv}"
        bills.append({"invoice": invoice, "day": d, "hour": 11 + (back % 6), "total": 0})
        tenders.append({"invoice": invoice, "mode": "UPI", "amount": 100})
        for sku, q in plan.items():
            if q > 0:
                lines.append({"sku": sku, "name": sku, "day": d, "hour": 11, "qty": q, "revenue": q * items[sku]["price"],
                              "taxable": q * items[sku]["price"] * 0.9, "discount": 0, "invoice": invoice})
    pos = grns = preturns = []
    if with_history:
        pos = [
            {"id": "PO1", "vendor_id": "V1", "date": date(2026, 9, 1), "expected": date(2026, 9, 5), "status": "Closed",
             "lines": [{"sku": "FAST", "ordered": 100, "received": 100, "cost": 60}]},
            {"id": "PO2", "vendor_id": "V2", "date": date(2026, 9, 1), "expected": date(2026, 9, 4), "status": "Closed",
             "lines": [{"sku": "RISE", "ordered": 100, "received": 70, "cost": 25}]},
            {"id": "PO3", "vendor_id": "V2", "date": date(2026, 9, 2), "expected": date(2026, 9, 8), "status": "Approved",
             "lines": [{"sku": "FAST", "ordered": 50, "received": 0, "cost": 55}]},  # V2 quotes FAST cheaper, overdue
            {"id": "PO4", "vendor_id": "V1", "date": date(2026, 9, 28), "expected": date(2026, 10, 3), "status": "Draft",
             "lines": [{"sku": "SLOW", "ordered": 10, "received": 0, "cost": 35}]},
        ]
        grns = [
            {"id": "G1", "po_id": "PO1", "vendor_id": "V1", "date": date(2026, 9, 5), "total": 6000.0,
             "lines": [{"sku": "FAST", "qty": 100, "cost": 60}]},
            {"id": "G2", "po_id": "PO2", "vendor_id": "V2", "date": date(2026, 9, 9), "total": 1750.0,   # 5 days late
             "lines": [{"sku": "RISE", "qty": 70, "cost": 25}]},
        ]
        preturns = [{"vendor_id": "V2", "date": date(2026, 9, 12), "lines": [{"sku": "RISE", "qty": 7, "cost": 25}]}]
    batches = [
        {"sku": "SLOW", "name": "Slow", "batch_no": "B1", "expiry": TODAY + timedelta(days=10), "qty": 100},
        {"sku": "FAST", "name": "Fast", "batch_no": "B2", "expiry": TODAY - timedelta(days=3), "qty": 4},
    ]
    return eng.Dataset(today=TODAY, history_days=120, items=items, vendors=vendors, lines=lines, bills=bills,
                       tenders=tenders, returns=[], pos=pos, grns=grns, preturns=preturns, batches=batches,
                       discounts=[])


def test_demand_rate_tracks_actual_sales():
    ds = _dataset()
    d, _ = eng.demand_rate(ds, "FAST")
    assert 9 <= d <= 14           # ~10/day with weekend uplift
    assert eng.demand_rate(ds, "NEWB")[0] == 0


def test_low_stock_list_and_restock_quantity():
    ds = _dataset()
    res = eng.low_stock_reorder_list(ds)
    skus = [i["sku"] for i in res["items"]]
    assert "FAST" in skus and "SLOW" not in skus
    fast = next(i for i in res["items"] if i["sku"] == "FAST")
    assert fast["on_order"] == 0 and fast["overdue_on_order"] == 50   # PO3 is 22 days overdue: not reliable supply
    rec = eng.restock_recommendations(ds)
    r = next(i for i in rec["items"] if i["sku"] == "FAST")
    # target = demand*(lead+7)+safety ; qty = target - (stock + on order)
    expected = max(0, int(-(-(r["target_level"] - 10) // 1)))
    assert abs(r["recommended_qty"] - expected) <= 1
    assert r["recommended_qty"] > 0 and r["est_cost"] == pytest.approx(r["recommended_qty"] * 60, rel=0.01)


def test_reorder_timing_marks_low_stock_as_order_now():
    ds = _dataset()
    rows = eng.reorder_timing(ds)["items"]
    fast = next(r for r in rows if r["sku"] == "FAST")
    assert fast["window"] == "Order now"
    slow = [r for r in rows if r["sku"] == "SLOW"]
    assert all(r["window"] != "Order now" for r in slow)


def test_vendor_intelligence_scores_late_partial_vendor_lower():
    ds = _dataset()
    vm = {v["vendor_id"]: v for v in eng.vendor_intelligence(ds)["vendors"]}
    assert vm["V1"]["fill_rate_pct"] == 100.0
    assert vm["V2"]["fill_rate_pct"] == 70.0
    assert vm["V2"]["on_time_rate_pct"] == 0.0         # PO2 late, PO3 overdue and unreceived
    assert vm["V2"]["return_rate_pct"] == 10.0
    assert vm["V2"]["overdue_open_pos"] == 1
    assert vm["V1"]["score"] > vm["V2"]["score"]
    assert vm["V1"]["avg_lead_days"] == 4.0 and vm["V1"]["lead_time_source"] == "actual"


def test_price_comparison_finds_cheaper_vendor():
    ds = _dataset()
    res = eng.vendor_price_comparison(ds)
    fast = next(r for r in res["items"] if r["sku"] == "FAST")
    assert fast["comparable"] and fast["cheapest_vendor"] == "Beta" and fast["cheapest_cost"] == 55
    assert fast["preferred_vendor"] == "Alpha" and fast["saving_per_unit"] == 5.0
    assert fast["saving_pct"] == pytest.approx(8.3, abs=0.1)


def test_vendor_recommendations_output_shape():
    ds = _dataset()
    res = eng.vendor_recommendations(ds)
    assert res["status"] == "ok"
    types = {a["type"] for a in res["vendor_actions"]}
    assert "payable" in types
    assert all(r["action"] in ("keep", "switch") for r in res["item_recommendations"])


def test_sales_visualizations_totals_match_source_lines():
    ds = _dataset()
    res = eng.sales_visualizations(ds, 30)
    window = set(ds.window(30))
    expected = sum(l["revenue"] for l in ds.lines if l["day"] in window)
    assert res["kpis"]["revenue"] == pytest.approx(expected)
    assert sum(d["revenue"] for d in res["daily"]) == pytest.approx(expected)
    assert len(res["daily"]) == 30
    assert sum(c["revenue"] for c in res["categories"]) == pytest.approx(expected)
    assert res["top_by_revenue"][0]["sku"] == "FAST"
    assert res["payment_mix"][0]["mode"] == "UPI"


def test_trending_detects_rising_product():
    ds = _dataset()
    res = eng.trending_products(ds, 14)
    assert res["status"] == "ok"
    assert any(r["sku"] == "RISE" and r["growth_pct"] > 100 for r in res["rising"])


def test_trending_needs_two_windows():
    ds = _dataset(sales_days=8)
    assert eng.trending_products(ds, 14)["status"] == "insufficient_data"


def test_discounts_cover_expiry_excess_and_expired():
    ds = _dataset()
    res = eng.discount_recommendations(ds)
    kinds = {(r["sku"], r["type"]) for r in res["items"]}
    assert ("SLOW", "expiry") in kinds              # 100 units, ~0/day, expires in 10 days
    assert ("FAST", "write_off") in kinds           # expired batch must not be discounted
    wo = next(r for r in res["items"] if r["type"] == "write_off")
    assert wo["suggested_discount_pct"] == 0
    exp = next(r for r in res["items"] if r["type"] == "expiry")
    assert 5 <= exp["suggested_discount_pct"] <= 0.6 * 30    # SLOW margin is 30% -> cap 18%


def test_new_product_prediction_ranks_selling_above_not_selling():
    ds = _dataset()
    res = eng.new_product_prediction(ds, 60)
    by = {i["sku"]: i for i in res["items"]}
    assert set(by) == {"NEWA", "NEWB"}
    assert by["NEWA"]["success_score"] > by["NEWB"]["success_score"]
    assert by["NEWB"]["verdict"] == "At risk" and by["NEWA"]["verdict"] in ("Likely success", "Watch")


def test_forecast_is_seasonal_and_backtested():
    ds = _dataset()
    res = eng.demand_forecast(ds, 14)
    assert res["status"] == "ok" and res["model"]["seasonal"] is True
    assert res["model"]["backtest_wape_pct"] is not None and res["model"]["backtest_wape_pct"] < 35
    assert len(res["forecast"]) == 14
    for f in res["forecast"]:
        assert f["revenue_low"] <= f["revenue"] <= f["revenue_high"]
    by_dow = {}
    for f in res["forecast"]:
        by_dow.setdefault(date.fromisoformat(f["date"]).weekday() >= 5, []).append(f["revenue"])
    assert sum(by_dow[True]) / len(by_dow[True]) > sum(by_dow[False]) / len(by_dow[False])   # weekends higher


def test_forecast_refuses_with_too_little_history():
    ds = _dataset(sales_days=3)
    assert eng.demand_forecast(ds, 14)["status"] == "insufficient_data"


def test_business_summary_composes_real_signals():
    ds = _dataset()
    res = eng.business_summary(ds, 30)
    assert res["status"] == "ok" and res["sections"] and res["kpis"]["bills"] == 30
    assert res["kpis"]["low_stock_items"] >= 1
    assert any(p["area"] == "Inventory" for p in res["priorities"])


def test_empty_database_never_fabricates():
    ds = eng.Dataset(today=TODAY, history_days=120, items={}, vendors={}, lines=[], bills=[], tenders=[], returns=[],
                     pos=[], grns=[], preturns=[], batches=[], discounts=[])
    assert eng.sales_visualizations(ds)["status"] == "insufficient_data"
    assert eng.demand_forecast(ds)["status"] == "insufficient_data"
    assert eng.business_summary(ds)["status"] == "insufficient_data"
    assert eng.low_stock_reorder_list(ds)["items"] == []
    assert eng.vendor_intelligence(ds)["vendors"] == []
    assert eng.meta(ds)["confidence"] == "none"


# ----------------------------------------------------------------------------- router (fake Prisma rows)
from datetime import datetime, timezone
from types import SimpleNamespace as NS

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import ai_insights_module as mod
from app.security import get_current_user


class _Model:
    def __init__(self, rows):
        self.rows = rows
        self.last_where = None

    async def find_many(self, **kwargs):
        self.last_where = kwargs.get("where")
        return self.rows


def _fake_db():
    now = datetime.now(timezone.utc)
    items = [NS(sku="A-1", name="Cola", category_name="Beverages", price=45.0, cost_price=30.0, landed_cost=30.0,
                stock=6.0, min_stock=10.0, unit="pcs", preferred_vendor_id="V-1", created_at=now - timedelta(days=90)),
             NS(sku="N-1", name="New Bar", category_name="Snacks", price=60.0, cost_price=40.0, landed_cost=0.0,
                stock=20.0, min_stock=5.0, unit="pcs", preferred_vendor_id=None, created_at=now - timedelta(days=10))]
    vendors = [NS(id="V-1", name="Acme", category="Bev", terms="Net 15", status="Active", payable=1200.0)]
    sales = []
    for back in range(20):
        t = now - timedelta(days=back)
        sales.append(NS(invoice_no=f"INV-{back}", time=t, grand_total=300.0,
                        items=[NS(sku="A-1", name="Cola", qty=6.0, final_amount=270.0, taxable_amount=240.0, discount_amount=0.0),
                               NS(sku="N-1", name="New Bar", qty=1.0, final_amount=60.0, taxable_amount=55.0, discount_amount=0.0)],
                        tenders=[NS(mode="Cash", amount=330.0)]))
    returns = [NS(time=now, items=[NS(sku="A-1", qty=1.0, refund_amount=45.0)])]
    po = NS(id="PO-1", vendor_id="V-1", date="2026-09-01", expected="2026-09-05", status="Closed",
            lines=[NS(sku="A-1", ordered_qty=50.0, received_qty=50.0, cost=30.0)])
    grn = NS(id="G-1", po_id="PO-1", vendor_id="V-1", date="2026-09-05", total=1500.0, lines=[NS(sku="A-1", qty=50.0, cost=30.0)])
    pret = NS(vendor_id="V-1", date="2026-09-07", lines=[NS(sku="A-1", qty=1.0, cost=30.0)])
    batch = NS(sku="N-1", name="New Bar", batch_no="B-9", expiry_date=(datetime.now().date() + timedelta(days=9)).isoformat(), qty=20.0)
    disc = NS(name="Fest", type="percent", value=5.0, applies_to="selected", product_skus='["A-1"]',
              start_date=None, end_date=None, status="active")
    return NS(is_connected=lambda: True, item=_Model(items), vendor=_Model(vendors), sale=_Model(sales),
              salereturn=_Model(returns), purchaseorder=_Model([po]), goodsreceiptnote=_Model([grn]),
              purchasereturn=_Model([pret]), batch=_Model([batch]), discount=_Model([disc]))


@pytest.fixture()
def api(monkeypatch):
    db = _fake_db()
    monkeypatch.setattr(mod, "get_db", lambda: db)
    app = FastAPI()
    app.include_router(mod.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: NS(role="admin", username="owner.arjun")
    return TestClient(app), db


ENDPOINTS = ["vendor-intelligence", "new-product-prediction", "low-stock-reorder-list", "restock-recommendations",
             "sales-visualizations", "vendor-recommendations", "discount-recommendations", "trending-products",
             "demand-forecast", "vendor-price-comparison", "business-summary", "reorder-timing"]


@pytest.mark.parametrize("ep", ENDPOINTS)
def test_every_endpoint_serves_db_rows(api, ep):
    client, _ = api
    res = client.get(f"/api/v1/ai-insights/{ep}")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] in ("ok", "insufficient_data")
    assert body["meta"]["bills_analysed"] == 20 and body["meta"]["source"].startswith("PostgreSQL")


def test_router_maps_rows_and_queries_only_recent_sales(api):
    client, db = api
    viz = client.get("/api/v1/ai-insights/sales-visualizations?days=30").json()
    # 20 bills x 330 revenue minus one ₹45 refund
    assert viz["kpis"]["bills"] == 20 and viz["kpis"]["revenue"] == pytest.approx(20 * 330 - 45)
    assert "time" in db.sale.last_where and "gte" in db.sale.last_where["time"]
    low = client.get("/api/v1/ai-insights/low-stock-reorder-list").json()
    assert [i["sku"] for i in low["items"]] == ["A-1"]
    disc = client.get("/api/v1/ai-insights/discount-recommendations").json()
    assert any(r["sku"] == "N-1" and r["type"] == "expiry" for r in disc["items"])


def test_router_returns_503_when_database_is_down(monkeypatch):
    monkeypatch.setattr(mod, "get_db", lambda: NS(is_connected=lambda: False))
    app = FastAPI()
    app.include_router(mod.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: NS(role="admin")
    res = TestClient(app).get("/api/v1/ai-insights/business-summary")
    assert res.status_code == 503


def test_router_is_admin_only():
    app = FastAPI()
    app.include_router(mod.router, prefix="/api/v1")
    # the module check runs on the signed-in user; a cashier must be rejected
    app.dependency_overrides[get_current_user] = lambda: NS(role="cashier")
    assert TestClient(app).get("/api/v1/ai-insights/vendor-intelligence").status_code == 403


# ----------------------------------------------------------------------------- sample (demo) data
from app.insights_demo import build_demo_dataset


def _demo():
    return build_demo_dataset(TODAY)


def test_demo_dataset_is_deterministic_and_clearly_marked():
    a, b = _demo(), _demo()
    assert len(a.lines) == len(b.lines) and a.lines[0] == b.lines[0] and a.lines[-1] == b.lines[-1]
    assert a.is_demo and eng.meta(a)["is_demo"] is True and "SAMPLE" in eng.meta(a)["source"]
    assert all(s.startswith("DEMO-") for s in a.items)
    assert all(v.endswith("(Demo)") for v in (x["name"] for x in a.vendors.values()))
    assert all(l["invoice"].startswith("DEMO-INV-") for l in a.lines)
    assert eng.meta(a)["confidence"] == "high" and a.data_days == 90


def test_demo_dataset_exercises_every_insight():
    ds = _demo()
    low = eng.low_stock_reorder_list(ds)
    assert low["summary"]["items"] >= 4 and low["summary"]["out_of_stock"] >= 1 and low["vendor_groups"]
    assert any(i["overdue_on_order"] > 0 for i in low["items"])                     # overdue PO scenario
    assert eng.restock_recommendations(ds)["summary"]["items"] >= 4
    timing = eng.reorder_timing(ds)
    assert timing["summary"]["Order now"] >= 1 and timing["summary"]["This week"] >= 1
    vi = eng.vendor_intelligence(ds)
    grades = {v["grade"] for v in vi["vendors"]}
    assert len(grades) >= 3 and vi["summary"]["overdue_open_pos"] >= 1 and vi["summary"]["total_payable"] > 0
    assert eng.vendor_recommendations(ds)["summary"]["switch_suggestions"] >= 1
    pc = eng.vendor_price_comparison(ds)
    assert pc["summary"]["comparable_items"] >= 5 and pc["summary"]["items_with_saving"] >= 1
    disc = eng.discount_recommendations(ds)["summary"]
    assert disc["expiring"] >= 1 and disc["excess"] >= 1 and disc["write_offs"] >= 1
    tr = eng.trending_products(ds, 14)
    assert tr["status"] == "ok" and tr["summary"]["rising"] >= 2 and tr["summary"]["cooling"] >= 1
    verdicts = {i["verdict"] for i in eng.new_product_prediction(ds, 60)["items"]}
    assert {"Likely success", "At risk"} <= verdicts
    fc = eng.demand_forecast(ds, 14)
    assert fc["status"] == "ok" and fc["model"]["seasonal"] and fc["model"]["backtest_wape_pct"] < 30
    viz = eng.sales_visualizations(ds, 30)
    assert viz["kpis"]["bills"] > 500 and len(viz["categories"]) == 6 and len(viz["payment_mix"]) == 3
    summary = eng.business_summary(ds, 30)
    assert summary["status"] == "ok" and len(summary["priorities"]) >= 3
    assert "SAMPLE" in summary["note"] and "live database" not in summary["note"]


def test_demo_items_do_not_leak_into_live_dataset_structures():
    live, demo = _dataset(), _demo()
    assert not set(live.items) & set(demo.items)
    assert live.is_demo is False and eng.meta(live)["is_demo"] is False


class _ExplodingDb:
    """Any attribute access means the demo path touched the database."""
    def is_connected(self):
        raise AssertionError("demo mode must not check/use the database")

    def __getattr__(self, name):
        raise AssertionError(f"demo mode accessed db.{name}")


@pytest.mark.parametrize("ep", ENDPOINTS)
def test_demo_endpoints_never_touch_the_database(monkeypatch, ep):
    monkeypatch.setattr(mod, "get_db", lambda: _ExplodingDb())
    app = FastAPI()
    app.include_router(mod.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: NS(role="admin")
    res = TestClient(app).get(f"/api/v1/ai-insights/{ep}?demo=true")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["status"] == "ok" and body["meta"]["is_demo"] is True
    assert "SAMPLE" in body["meta"]["source"]


def test_demo_is_off_by_default_and_still_admin_only(api):
    client, _ = api
    assert client.get("/api/v1/ai-insights/business-summary").json()["meta"]["is_demo"] is False
    app = FastAPI()
    app.include_router(mod.router, prefix="/api/v1")
    app.dependency_overrides[get_current_user] = lambda: NS(role="cashier")
    assert TestClient(app).get("/api/v1/ai-insights/business-summary?demo=true").status_code == 403


# ----------------------------------------------------------------------------- regression: real-data findings
def test_period_comparison_only_when_previous_period_is_covered():
    ds = _dataset()                                   # 42 days of history
    seven = eng.sales_visualizations(ds, 7)["kpis"]
    assert seven["previous_period_covered"] is True and seven["revenue_change_pct"] is not None
    thirty = eng.sales_visualizations(ds, 30)["kpis"]   # previous 30 days only 12/30 observed
    assert thirty["previous_period_covered"] is False
    assert thirty["revenue_change_pct"] is None and thirty["previous_revenue"] is None
    demo = _demo()                                    # 90 days of history
    assert eng.sales_visualizations(demo, 30)["kpis"]["revenue_change_pct"] is not None
    k90 = eng.sales_visualizations(demo, 90)["kpis"]
    assert k90["revenue_change_pct"] is None          # never "+3,970%" against two days of data
    assert "no earlier period" in eng.business_summary(demo, 90)["sections"][0]["text"]


def test_period_filters_change_the_numbers():
    demo = _demo()
    rev = {d: eng.sales_visualizations(demo, d)["kpis"]["revenue"] for d in (7, 30, 90)}
    assert rev[7] < rev[30] < rev[90]
    bills = {d: eng.business_summary(demo, d)["kpis"]["bills"] for d in (7, 30, 90)}
    assert bills[7] < bills[30] < bills[90]
    assert len(eng.sales_visualizations(demo, 7)["daily"]) == 7 and len(eng.sales_visualizations(demo, 90)["daily"]) == 90


def test_forecast_summary_is_correct_for_short_horizons():
    demo = _demo()
    f7, f14 = eng.demand_forecast(demo, 7), eng.demand_forecast(demo, 14)
    assert len(f7["forecast"]) == 7 and len(f14["forecast"]) == 14
    assert f7["summary"]["next_14d_revenue"] > f7["summary"]["next_7d_revenue"] * 1.5      # no longer a copy of the 7-day figure
    assert f7["summary"]["next_14d_revenue"] == pytest.approx(f14["summary"]["next_14d_revenue"])
    assert len(eng.demand_forecast(demo, 28)["forecast"]) == 28


def test_stale_prisma_client_gives_an_actionable_503_not_a_bare_failure(api, monkeypatch):
    client, db = api

    class _OldClient:                       # a Phase 1 client has no `vendor` model
        def is_connected(self):
            return True

        def __getattr__(self, name):
            raise AttributeError(f"'Prisma' object has no attribute '{name}'")
    monkeypatch.setattr(mod, "get_db", lambda: _OldClient())
    res = client.get("/api/v1/ai-insights/business-summary")
    assert res.status_code == 503
    detail = res.json()["detail"]
    assert "prisma generate" in detail and "prisma db push" in detail and "AttributeError" in detail


def test_unexpected_engine_errors_return_json_detail(api, monkeypatch):
    client, _ = api
    monkeypatch.setattr(eng, "sales_visualizations", lambda *a, **k: (_ for _ in ()).throw(ValueError("boom")))
    res = client.get("/api/v1/ai-insights/sales-visualizations")
    assert res.status_code == 500 and "ValueError" in res.json()["detail"]
    assert res.headers["content-type"].startswith("application/json")


def test_api_still_starts_when_startup_seeding_fails(monkeypatch):
    """A failing seed_all (unreachable DB / stale Prisma client) used to crash the whole API at startup."""
    from app import main as app_main

    async def _noop():
        return None

    async def _boom():
        raise RuntimeError("The column `User.auto_lock_minutes` does not exist")
    monkeypatch.setattr(app_main, "connect_db", _noop)
    monkeypatch.setattr(app_main, "disconnect_db", _noop)
    monkeypatch.setattr(app_main, "seed_all", _boom)
    with TestClient(app_main.app) as c:
        assert c.get("/health").status_code == 200
        assert c.get("/").json()["status"] == "online"


def test_schema_drift_in_the_auth_dependency_is_explained(api):
    """With a stale Prisma client the failure happens inside require_admin (before our code): it must still say why."""
    client, _ = api
    from prisma.errors import DataError
    err = DataError({"user_facing_error": {"message": "The column `User.auto_lock_minutes` does not exist in the current database.",
                                           "meta": {}, "error_code": "P2022"}, "error": "x"})

    def _broken_admin():
        raise err
    client.app.dependency_overrides[get_current_user] = _broken_admin
    res = client.get("/api/v1/ai-insights/business-summary")
    assert res.status_code == 500 and res.headers["content-type"].startswith("application/json")
    assert "prisma generate" in res.json()["detail"] and "auto_lock_minutes" in res.json()["detail"]
