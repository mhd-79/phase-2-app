"""
seed_all() runs on every API start. It must create missing prototype records but never overwrite live data.

SAFETY: modifies catalog/vendor/user rows, so it only runs against a local database (localhost / 127.0.0.1).
"""
import asyncio
from urllib.parse import urlparse

import pytest

from app.config import settings

_host = urlparse(settings.DATABASE_URL).hostname or ""
pytestmark = pytest.mark.skipif(_host not in ("localhost", "127.0.0.1"),
                                reason="mutates seeded rows; run only against a local scratch PostgreSQL")


def _run(coro_fn):
    from app.database import db

    async def go():
        await db.connect()
        try:
            return await coro_fn(db)
        finally:
            await db.disconnect()
    return asyncio.run(go())


def test_reseeding_keeps_live_stock_payables_users_and_backfills_only_unset_columns():
    from seed import seed_all

    async def scenario(db):
        await seed_all()                                              # make sure the prototype rows exist
        item = await db.item.find_unique(where={"sku": "BEV-001"})
        vendor = await db.vendor.find_unique(where={"id": "V-001"})
        user = await db.user.find_unique(where={"username": "priya.k"})
        orig = (item.stock, item.price, item.cost_price, vendor.payable, user.role, user.full_name, user.is_active, user.pin_hash)
        try:
            # live business activity after go-live
            await db.item.update(where={"sku": "BEV-001"}, data={"stock": 7.0, "price": 51.0, "cost_price": 33.0})
            await db.vendor.update(where={"id": "V-001"}, data={"payable": 123456.0})
            await db.user.update(where={"username": "priya.k"}, data={"full_name": "Priya Renamed", "is_active": False, "role": "admin"})
            # an item that came from an older (Phase 1) database: Phase 2 columns unset
            await db.item.update(where={"sku": "BEV-002"}, data={"preferred_vendor_id": None, "landed_cost": 0.0})
            # a seeded row that was removed
            await db.item.delete_many(where={"sku": "BAK-003"})

            await seed_all()                                          # = a backend restart

            i = await db.item.find_unique(where={"sku": "BEV-001"})
            assert (i.stock, i.price, i.cost_price) == (7.0, 51.0, 33.0)
            assert (await db.vendor.find_unique(where={"id": "V-001"})).payable == 123456.0
            u = await db.user.find_unique(where={"username": "priya.k"})
            assert (u.full_name, u.is_active, u.role) == ("Priya Renamed", False, "admin")
            assert u.pin_hash == orig[7]
            b2 = await db.item.find_unique(where={"sku": "BEV-002"})
            assert b2.preferred_vendor_id == "V-002" and b2.landed_cost == 78.0          # backfilled
            assert (await db.item.find_unique(where={"sku": "BAK-003"})) is not None     # missing row re-created
            await seed_all()                                          # and a second restart changes nothing
            assert (await db.item.find_unique(where={"sku": "BEV-001"})).stock == 7.0
        finally:
            await db.item.update(where={"sku": "BEV-001"}, data={"stock": orig[0], "price": orig[1], "cost_price": orig[2]})
            await db.vendor.update(where={"id": "V-001"}, data={"payable": orig[3]})
            await db.user.update(where={"username": "priya.k"}, data={"role": orig[4], "full_name": orig[5], "is_active": orig[6]})
    _run(scenario)
