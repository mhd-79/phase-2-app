"""
Insert / inspect / remove 3 months of demo trading history in the application's PostgreSQL database.

Run from the backend folder (uses DATABASE_URL from backend/.env exactly like the API does):

    python -m scripts.demo_history_cli plan                 # generate + verify in memory, print a summary. No DB access.
    python -m scripts.demo_history_cli status               # what DEMO rows are in the database right now
    python -m scripts.demo_history_cli apply --yes          # insert the data (refuses if DEMO data already exists)
    python -m scripts.demo_history_cli apply --yes --replace   # purge existing DEMO rows, then insert fresh ones
    python -m scripts.demo_history_cli verify               # re-check DEMO rows in the DB (stock, batches, payables, invoices)
    python -m scripts.demo_history_cli purge --yes          # remove every DEMO row

Safety model
  * Only NEW rows are created; no existing row is updated or deleted. Every demo row is identifiable:
    ids / SKUs / invoice numbers start with "DEMO-", discount names with "[DEMO] ", vendor and item names end in "(Demo)".
  * apply verifies the generated data first, inserts in foreign-key order, re-reads the database to verify it again and,
    if anything fails, purges what it inserted (so a failed run leaves nothing behind).
  * purge deletes only DEMO-prefixed rows. It refuses (unless --force) if real, non-demo records were created after the
    demo data was applied, because those may reference demo SKUs/vendors and because invoice / return numbers are derived
    from row counts (removing 3,000+ rows would let new real invoices re-use numbers already issued).
  * Audit-log entries (DEMO_DATA_SEED / DEMO_DATA_PURGE) are kept on purpose as a record of what was done.
"""
import argparse
import asyncio
import json
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from scripts import demo_history as dh

PREFIX = dh.PREFIX
DISCOUNT_PREFIX = "[DEMO] "
CHUNK = 500

# insertion order respects foreign keys
INSERT_ORDER = ["vendor", "item", "discount", "purchaseorder", "purchaseorderline", "goodsreceiptnote",
                "goodsreceiptnoteline", "purchasereturn", "purchasereturnline", "vendorpayment", "stockadjustment",
                "batch", "sale", "saleitem", "saletender", "salereturn", "returnitem"]

# model -> field that carries the DEMO marker (used for counting, loading and deleting)
MARKER = {
    "vendor": ("id", PREFIX), "item": ("sku", PREFIX), "discount": ("name", DISCOUNT_PREFIX),
    "purchaseorder": ("id", PREFIX), "purchaseorderline": ("po_id", PREFIX), "goodsreceiptnote": ("id", PREFIX),
    "goodsreceiptnoteline": ("grn_id", PREFIX), "purchasereturn": ("id", PREFIX), "purchasereturnline": ("return_id", PREFIX),
    "vendorpayment": ("id", PREFIX), "stockadjustment": ("id", PREFIX), "batch": ("sku", PREFIX),
    "sale": ("invoice_no", PREFIX), "saleitem": ("sku", PREFIX), "salereturn": ("return_no", PREFIX),
}
# purge order: children before parents. *items/tenders/lines* go with their parent via ON DELETE CASCADE.
PURGE_ORDER = ["salereturn", "sale", "purchasereturn", "goodsreceiptnote", "purchaseorder", "vendorpayment",
               "stockadjustment", "batch", "discount", "item", "vendor"]
# "real" (non-demo) counters used to detect activity after the demo data went in
REAL_GUARD = ["sale", "salereturn", "purchaseorder", "goodsreceiptnote", "purchasereturn", "vendorpayment", "stockadjustment"]


def _row(record) -> dict:
    return record.model_dump() if hasattr(record, "model_dump") else record.dict()


def _where(model: str) -> dict:
    field, prefix = MARKER[model]
    return {field: {"startswith": prefix}}


def _not_where(model: str) -> dict:
    return {"NOT": _where(model)}


def describe_target(url: str) -> str:
    u = urlparse(url)
    return f"{u.hostname or '?'}:{u.port or ''}{u.path or ''}  (user {u.username or '?'})"


# --------------------------------------------------------------------------------------------- database operations
async def demo_counts(db) -> Dict[str, int]:
    out = {}
    for m in INSERT_ORDER:
        if m in MARKER:
            out[m] = await getattr(db, m).count(where=_where(m))
    return out


async def real_counts(db) -> Dict[str, int]:
    return {m: await getattr(db, m).count(where=_not_where(m)) for m in REAL_GUARD}


async def insert_all(db, tables: Dict[str, List[dict]], log=print):
    for model in INSERT_ORDER:
        rows = tables.get(model, [])
        for i in range(0, len(rows), CHUNK):
            await getattr(db, model).create_many(data=rows[i:i + CHUNK])
        log(f"  inserted {len(rows):>6}  {model}")


async def purge(db, log=print) -> Dict[str, int]:
    removed = {}
    for model in PURGE_ORDER:
        res = await getattr(db, model).delete_many(where=_where(model))
        removed[model] = int(res) if isinstance(res, int) else int(getattr(res, "count", 0) or 0)
        log(f"  deleted {removed[model]:>6}  {model}")
    return removed


async def load_tables(db) -> Dict[str, List[dict]]:
    """Read the DEMO rows back from the database in the same shape the generator produced."""
    t: Dict[str, List[dict]] = {}
    for model in INSERT_ORDER:
        if model in ("saleitem",):
            rows = await db.saleitem.find_many(where=_where("saleitem"))
        elif model in ("saletender", "returnitem"):
            continue
        elif model in MARKER:
            rows = await getattr(db, model).find_many(where=_where(model))
        else:
            continue
        t[model] = [_row(r) for r in rows]
    sale_ids = {s["id"] for s in t.get("sale", [])}
    ret_ids = {r["id"] for r in t.get("salereturn", [])}
    t["saletender"] = [_row(r) for r in await db.saletender.find_many() if r.sale_id in sale_ids]
    t["returnitem"] = [_row(r) for r in await db.returnitem.find_many() if r.return_id in ret_ids]
    return t


async def verify_db(db, log=print) -> List[str]:
    tables = await load_tables(db)
    problems = dh.verify_tables(tables, now=datetime.now(dh.UTC))
    log(f"  checked {sum(len(v) for v in tables.values())} demo rows -> {len(problems)} problem(s)")
    return problems


async def preflight(db) -> Dict[str, Any]:
    users = await db.user.find_many(where={"is_active": True})
    cashiers = sorted(u.username for u in users if u.role == "cashier")
    admins = sorted(u.username for u in users if u.role == "admin")
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    return {"cashiers": cashiers, "admins": admins, "pricing_mode": store.pricing_mode if store else "exclusive"}


async def apply(db, yes: bool, replace: bool, log=print, now: Optional[datetime] = None, seed: int = 20260930) -> int:
    if not yes:
        log("Refusing to write without --yes. Run 'plan' first to see what would be inserted.")
        return 2
    existing = await demo_counts(db)
    if any(existing.values()):
        if not replace:
            log(f"DEMO data already present ({sum(existing.values())} rows). Use 'purge --yes' or 'apply --yes --replace'.")
            return 2
        log("Replacing existing DEMO data:")
        await purge(db, log)
    pre = await preflight(db)
    if not pre["cashiers"]:
        log("No active cashier users found — start the API once (it seeds users) and retry.")
        return 2
    baseline = await real_counts(db)
    now = now or datetime.now(dh.IST)                 # one instant for generation *and* verification
    tables = dh.generate(cashiers=pre["cashiers"][:2], pricing_mode=pre["pricing_mode"], now=now, seed=seed)
    problems = dh.verify_tables(tables, now=now)
    if problems:
        log("Generated data failed verification; nothing was written:")
        for p in problems[:20]:
            log("  - " + p)
        return 1
    log(f"Inserting ({pre['pricing_mode']} pricing, cashiers: {', '.join(pre['cashiers'][:2])}):")
    try:
        await insert_all(db, tables, log)
        log("Verifying what is now in the database:")
        problems = await verify_db(db, log)
        if problems:
            raise RuntimeError("post-insert verification failed: " + "; ".join(problems[:5]))
    except Exception as exc:                      # leave nothing behind
        log(f"FAILED ({exc}). Rolling back by removing the DEMO rows just inserted:")
        await purge(db, log)
        return 1
    if pre["admins"]:
        summary = dh.summarize(tables)
        await db.auditlog.create(data={"username": pre["admins"][0], "action": "DEMO_DATA_SEED", "details_json": json.dumps({
            "rows": summary["rows"], "first_sale": summary["first_sale"], "last_sale": summary["last_sale"],
            "gross_sales": summary["gross_sales"], "baseline_real_counts": baseline})})
    log("Done. Demo data is live. Remove it any time with: python -m scripts.demo_history_cli purge --yes")
    return 0


async def purge_cmd(db, yes: bool, force: bool, log=print) -> int:
    if not yes:
        log("Refusing to delete without --yes.")
        return 2
    counts = await demo_counts(db)
    if not any(counts.values()):
        log("No DEMO rows found — nothing to do.")
        return 0
    seed_log = await db.auditlog.find_first(where={"action": "DEMO_DATA_SEED"}, order={"timestamp": "desc"})
    if seed_log and not force:
        baseline = json.loads(seed_log.details_json or "{}").get("baseline_real_counts", {})
        now = await real_counts(db)
        grown = {m: (baseline[m], now[m]) for m in baseline if m in now and now[m] > baseline[m]}
        if grown:
            log("Refusing to purge: real (non-demo) records were created since the demo data was applied:")
            for m, (a, b) in grown.items():
                log(f"  {m}: {a} -> {b}")
            log("They may reference demo SKUs/vendors, and invoice/return numbers are derived from row counts, so deleting the demo "
                "rows could let new real invoices re-use numbers already issued. Review them, then re-run with --force if you are sure.")
            return 3
    log("Removing DEMO rows:")
    removed = await purge(db, log)
    leftovers = await demo_counts(db)
    leftover_total = sum(v for k, v in leftovers.items() if k in MARKER)
    admin = None
    users = await db.user.find_many(where={"role": "admin"})
    if users:
        admin = users[0].username
        await db.auditlog.create(data={"username": admin, "action": "DEMO_DATA_PURGE",
                                       "details_json": json.dumps({"removed": removed, "leftover": leftover_total})})
    if leftover_total:
        log(f"WARNING: {leftover_total} DEMO row(s) remain: {leftovers}")
        return 1
    log("Done. No DEMO rows remain.")
    return 0


async def status_cmd(db, log=print) -> int:
    counts = await demo_counts(db)
    log("DEMO rows in database:")
    for m, n in counts.items():
        log(f"  {m:<22} {n:>7}")
    if counts.get("sale"):
        first = await db.sale.find_first(where=_where("sale"), order={"time": "asc"})
        last = await db.sale.find_first(where=_where("sale"), order={"time": "desc"})
        log(f"  sales span: {first.time.astimezone(dh.IST).date()} -> {last.time.astimezone(dh.IST).date()}")
    return 0


# --------------------------------------------------------------------------------------------- CLI
def plan_cmd(log=print) -> int:
    tables = dh.generate()
    problems = dh.verify_tables(tables, now=datetime.now(dh.UTC))
    s = dh.summarize(tables)
    log("PLAN (in memory only — nothing is written)")
    log(f"  period        {s['first_sale']}  ->  {s['last_sale']}")
    for k, v in s["rows"].items():
        log(f"  {k:<22}{v:>7}")
    log(f"  gross sales   Rs {s['gross_sales']:,.2f}   GST Rs {s['gst_collected']:,.2f}   discounts Rs {s['discounts_given']:,.2f}   refunds Rs {s['returns_refunded']:,.2f}")
    log(f"  vendor payables after replay: Rs {s['vendor_payables']:,.2f}")
    log(f"  low-stock items at the end: {', '.join(s['low_stock_items']) or '—'}")
    log(f"  out-of-stock items:          {', '.join(s['out_of_stock_items']) or '—'}")
    log(f"  consistency check: {'PASS' if not problems else f'FAIL ({len(problems)})'}")
    for p in problems[:10]:
        log("   - " + p)
    return 0 if not problems else 1


async def _run(args) -> int:
    from app.config import settings
    from app.database import db
    print(f"Target database: {describe_target(settings.DATABASE_URL)}", flush=True)
    try:
        await asyncio.wait_for(db.connect(), timeout=45)       # fail fast instead of hanging on bad credentials / network
    except Exception as exc:
        print(f"Could not connect to the database ({type(exc).__name__}): {str(exc)[:300]}", flush=True)
        print("Nothing was read or written. Check DATABASE_URL in backend/.env.", flush=True)
        return 2
    try:
        if args.command == "status":
            return await status_cmd(db)
        if args.command == "verify":
            problems = await verify_db(db)
            for p in problems[:30]:
                print("  - " + p)
            print("PASS" if not problems else "FAIL")
            return 0 if not problems else 1
        if args.command == "apply":
            return await apply(db, args.yes, args.replace)
        if args.command == "purge":
            return await purge_cmd(db, args.yes, args.force)
        return 2
    finally:
        await db.disconnect()


def main(argv: Optional[List[str]] = None) -> int:
    try:
        sys.stdout.reconfigure(line_buffering=True, encoding="utf-8")
    except Exception:
        pass
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("command", nargs="?", default="plan", choices=["plan", "status", "apply", "verify", "purge"])
    ap.add_argument("--yes", action="store_true", help="confirm that you want to write to / delete from the database")
    ap.add_argument("--replace", action="store_true", help="apply: purge existing DEMO rows first")
    ap.add_argument("--force", action="store_true", help="purge: proceed even if real records were created since apply")
    args = ap.parse_args(argv)
    if args.command == "plan":
        return plan_cmd()
    if args.command in ("apply", "purge") and not args.yes:
        print(f"Refusing to {args.command} without --yes (nothing was contacted). Run 'plan' first to see what would change.")
        return 2
    return asyncio.run(_run(args))


if __name__ == "__main__":
    sys.exit(main())
