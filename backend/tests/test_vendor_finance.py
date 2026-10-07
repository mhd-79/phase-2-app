"""Vendor finance summary: due dates, aging, purchase / PO / payment summaries, performance, price history and alerts (pure maths, no database)."""
from datetime import date

import pytest

from app.vendor_finance import build_vendor_summary, terms_days

TODAY = date(2026, 10, 7)


def grn(gid, day, total, po=None, lines=None):
    return {"id": gid, "date": day, "total": total, "po_id": po, "lines": lines or [{"sku": "A", "name": "Item A", "qty": 10, "cost": total / 10}]}


def build(**over):
    base = dict(payable=0.0, terms="Net 30", today=TODAY, grns=[], returns=[], payments=[], pos=[])
    base.update(over)
    return build_vendor_summary(**base)


def test_terms_days():
    assert terms_days("Net 30") == 30 and terms_days("Net 7") == 7 and terms_days("Due on Delivery") == 0 and terms_days(None) == 0


def test_aging_buckets_use_receipt_date_plus_terms():
    # Net 30: due dates 2026-09-21 (16 days overdue), 2026-08-08 (60), 2026-06-01 (128), and one not yet due (2026-10-20)
    grns = [grn("G1", "2026-08-22", 100), grn("G2", "2026-07-09", 200), grn("G3", "2026-05-02", 300), grn("G4", "2026-09-20", 400)]
    s = build(payable=1000, grns=grns)
    a = s["aging"]
    assert (a["current"], a["d1_30"], a["d31_60"], a["d61_90"], a["d90_plus"]) == (400, 100, 200, 0, 300)
    assert a["total"] == 1000
    assert s["financial"]["overdue"] == 600 and s["financial"]["totalOutstanding"] == 1000


def test_payments_and_returns_clear_the_oldest_receipts_first():
    grns = [grn("G1", "2026-05-02", 300), grn("G2", "2026-07-09", 200), grn("G3", "2026-09-20", 400)]
    s = build(payable=900 - 500, grns=grns,
              returns=[{"id": "DN-1", "date": "2026-09-01", "total": 100, "lines": [{"qty": 1}]}],
              payments=[{"id": "PMT-1", "date": "2026-09-05", "amount": 400, "mode": "UPI", "reference": "UTR1"}])
    # 500 credit: G1 (300) cleared, G2 (200) cleared; G3 (400) untouched; payable = 900 - 500 = 400
    assert s["financial"]["totalOutstanding"] == 400          # the stored payable is what is shown
    a = s["aging"]
    assert a["current"] == 400 and a["d90_plus"] == 0 and a["d61_90"] == 0 and a["d31_60"] == 0


def test_opening_balance_counts_as_current_and_is_paid_first():
    s = build(payable=1000, grns=[grn("G1", "2026-08-01", 200)])
    assert s["financial"]["openingBalance"] == 800
    assert s["aging"]["current"] == 800 and s["aging"]["d31_60"] == 200 and s["aging"]["d1_30"] == 0       # G1 due 2026-08-31 -> 37 days overdue
    s = build(payable=1000 - 500, grns=[grn("G1", "2026-08-01", 200)], payments=[{"id": "P1", "date": "2026-09-01", "amount": 500, "mode": "Cash"}])
    assert s["financial"]["openingBalance"] == 800
    assert s["aging"]["current"] == 300 and s["aging"]["total"] == 500


@pytest.mark.parametrize("day,due_today,due_week,overdue,next_due", [
    ("2026-09-07", 100, 100, 0, "2026-10-07"),          # Net 30: due exactly today
    ("2026-09-10", 0, 100, 0, "2026-10-10"),            # due in 3 days
    ("2026-09-13", 0, 100, 0, "2026-10-13"),            # due in 6 days (last day of the window)
    ("2026-09-14", 0, 0, 0, "2026-10-14"),              # due in 7 days
    ("2026-09-06", 0, 0, 100, None),                    # due yesterday
])
def test_due_today_this_week_overdue_and_next_due(day, due_today, due_week, overdue, next_due):
    s = build(payable=100, grns=[grn("G1", day, 100)])
    f = s["financial"]
    assert (f["dueToday"], f["dueThisWeek"], f["overdue"], f["nextDueDate"]) == (due_today, due_week, overdue, next_due)


def test_due_on_delivery_is_due_on_the_receipt_date():
    s = build(payable=50, terms="Due on Delivery", grns=[grn("G1", "2026-10-07", 50)])
    assert s["financial"]["dueToday"] == 50


def test_totals_and_purchase_summary():
    s = build(payable=700, grns=[grn("G1", "2026-09-20", 500), grn("G2", "2026-09-25", 500)],
              returns=[{"id": "DN-1", "date": "2026-09-26", "total": 100, "lines": [{"qty": 2}]}],
              payments=[{"id": "P1", "date": "2026-09-30", "amount": 200, "mode": "Cash"}])
    f, p = s["financial"], s["purchase"]
    assert (f["totalPurchases"], f["totalReturns"], f["totalPayments"]) == (1000, 100, 200)
    assert p == {"purchaseValue": 1000, "purchaseCount": 2, "returnValue": 100, "returnCount": 1, "netPurchases": 900, "netPayable": 700}


def test_payment_history_has_reference_and_balance_after():
    s = build(payable=300, grns=[grn("G1", "2026-09-01", 1000)],
              payments=[{"id": "P1", "date": "2026-09-05", "amount": 400, "mode": "Bank Transfer", "reference": "UTR-77"},
                        {"id": "P2", "date": "2026-09-20", "amount": 300, "mode": "Cheque", "reference": None}])
    h = s["paymentHistory"]
    assert [p["id"] for p in h] == ["P2", "P1"]                               # newest first
    assert h[1]["reference"] == "UTR-77" and h[1]["balanceAfter"] == 600 and h[0]["balanceAfter"] == 300
    ledger = s["ledger"]
    assert ledger[0]["type"] == "Payment" and ledger[0]["balance"] == 300 and ledger[-1]["balance"] == 1000
    assert "UTR-77" in ledger[1]["ref"]


def _po(pid, status, expected, ordered=10, received=0, day="2026-09-01", sku="A"):
    return {"id": pid, "date": day, "expected": expected, "status": status,
            "lines": [{"sku": sku, "name": f"Item {sku}", "ordered_qty": ordered, "received_qty": received, "cost": 5}]}


def test_po_counts_and_overdue_list():
    pos = [_po("P1", "Pending", "2026-10-20"), _po("P2", "Approved", "2026-10-01"), _po("P3", "Ordered", "2026-10-30"),
           _po("P4", "Partially Received", "2026-09-30", received=4), _po("P5", "Received", "2026-09-10", received=10),
           _po("P6", "Cancelled", "2026-09-10"), _po("P7", "Draft", "2026-09-10"), _po("P8", "Pending Approval", "2026-10-10")]
    po = build(pos=pos)["purchaseOrders"]
    assert (po["pending"], po["partiallyReceived"], po["received"], po["overdue"]) == (4, 1, 1, 2)       # Pending: P1, P2, P3, P8
    assert [o["id"] for o in po["overdueList"]] == ["P4", "P2"] and po["overdueList"][0]["daysOverdue"] == 7


def test_performance_metrics():
    pos = [_po("P1", "Received", "2026-09-10", received=10, day="2026-09-01"), _po("P2", "Received", "2026-09-15", received=10, day="2026-09-05"),
           _po("P3", "Partially Received", "2026-09-30", ordered=10, received=5, day="2026-09-20")]
    grns = [grn("G1", "2026-09-08", 50, po="P1", lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 5}]),
            grn("G2", "2026-09-20", 50, po="P2", lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 5}]),
            grn("G3", "2026-09-25", 25, po="P3", lines=[{"sku": "A", "name": "Item A", "qty": 5, "cost": 5}])]
    returns = [{"id": "DN-1", "date": "2026-09-26", "total": 10, "lines": [{"qty": 1}]}]
    perf = build(payable=0, pos=pos, grns=grns, returns=returns)["performance"]
    assert perf["onTimePct"] == 66.7                    # P1 and P3 on time, P2 late
    assert perf["fulfillmentPct"] == 83.3               # 25 received of 30 ordered
    assert perf["returnRatePct"] == 4.0                 # 1 of 25 units
    assert perf["avgDeliveryDays"] == 9.0               # 7, 15 and 5 days


def test_performance_is_empty_without_history():
    perf = build()["performance"]
    assert perf["onTimePct"] is None and perf["fulfillmentPct"] is None and perf["returnRatePct"] is None and perf["avgDeliveryDays"] is None


def test_price_history_and_change_percent():
    grns = [grn("G1", "2026-07-01", 100, lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 10}]),
            grn("G2", "2026-08-01", 100, lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 10}]),         # same price: not a change
            grn("G3", "2026-09-01", 120, lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 12}]),
            grn("G4", "2026-09-01", 50, lines=[{"sku": "B", "name": "Item B", "qty": 10, "cost": 5}])]
    rows = {r["sku"]: r for r in build(grns=grns)["priceHistory"]}
    a = rows["A"]
    assert (a["current"], a["previous"], a["changePct"], a["lastChange"]) == (12, 10, 20.0, "2026-09-01")
    assert [h["cost"] for h in a["history"]] == [10, 12]
    assert rows["B"]["previous"] is None and rows["B"]["changePct"] is None


def test_price_history_includes_ordered_prices_of_open_pos_without_receipts():
    pos = [{"id": "P9", "date": "2026-10-01", "expected": "2026-10-20", "status": "Approved",
            "lines": [{"sku": "A", "name": "Item A", "ordered_qty": 5, "received_qty": 0, "cost": 15}]}]
    grns = [grn("G1", "2026-09-01", 100, lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 10}])]
    a = build(grns=grns, pos=pos)["priceHistory"][0]
    assert a["current"] == 15 and a["previous"] == 10 and a["changePct"] == 50.0


def test_alerts():
    # overdue payment, overdue PO, 20% return rate, 20% price rise
    grns = [grn("G1", "2026-07-01", 100, po="P1", lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 10}]),
            grn("G2", "2026-09-01", 120, po="P1", lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 12}])]
    returns = [{"id": "DN-1", "date": "2026-09-05", "total": 40, "lines": [{"qty": 4}]}]
    pos = [_po("P2", "Ordered", "2026-09-30", sku="Z")]
    kinds = {a["type"] for a in build(payable=180, grns=grns, returns=returns, pos=pos)["alerts"]}
    assert kinds == {"overdue_payment", "overdue_po", "high_return_rate", "price_increase"}


def test_no_alerts_when_everything_is_fine():
    grns = [grn("G1", "2026-10-01", 100, lines=[{"sku": "A", "name": "Item A", "qty": 10, "cost": 10}])]
    assert build(payable=100, grns=grns)["alerts"] == []


def test_small_price_rise_and_low_return_rate_do_not_alert():
    grns = [grn("G1", "2026-10-01", 100, lines=[{"sku": "A", "name": "Item A", "qty": 100, "cost": 10}]),
            grn("G2", "2026-10-02", 105, lines=[{"sku": "A", "name": "Item A", "qty": 100, "cost": 10.5}])]
    returns = [{"id": "DN-1", "date": "2026-10-03", "total": 20, "lines": [{"qty": 5}]}]          # 2.5% returned, 5% price rise
    assert build(payable=185, grns=grns, returns=returns)["alerts"] == []


def test_empty_vendor_gives_zeroes():
    s = build()
    assert s["financial"]["totalOutstanding"] == 0 and s["aging"]["total"] == 0 and s["financial"]["nextDueDate"] is None
    assert s["ledger"] == [] and s["paymentHistory"] == [] and s["alerts"] == []
