"""Tax slabs (Tax Configuration): the standard slabs, validation, and the read-only fallback when the database is not connected."""
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.database import db
from app.security import get_current_user


@pytest.fixture
def api(monkeypatch):
    from app.main import app
    monkeypatch.setattr(type(db), "is_connected", lambda self: False)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(username="a", role="admin", full_name="Admin A", phase_access=2)
    yield TestClient(app, headers={"Authorization": "Bearer test"})
    app.dependency_overrides.pop(get_current_user, None)


def test_standard_slabs_are_offered_with_cgst_and_sgst(api):
    r = api.get("/api/v1/settings/tax-slabs")
    assert r.status_code == 200
    slabs = r.json()
    assert [s["rate"] for s in slabs] == [0, 5, 12, 18, 28]
    five = next(s for s in slabs if s["rate"] == 5)
    assert five["name"] == "GST 5% (Essential Retail)" and five["cgst"] == 2.5 and five["sgst"] == 2.5


@pytest.mark.parametrize("body,fragment", [
    ({"name": "   ", "rate": 3}, "slab name"),
    ({"name": "x" * 61, "rate": 3}, "60 characters"),
    ({"name": "Jewellery"}, "GST rate"),
    ({"name": "Jewellery", "rate": -1}, "GST rate"),
    ({"name": "Jewellery", "rate": 101}, "GST rate"),
])
def test_adding_a_slab_is_validated(api, body, fragment):
    r = api.post("/api/v1/settings/tax-slabs", json=body)
    assert r.status_code == 400 and fragment in r.json()["detail"], r.text


def test_writes_need_the_database(api):
    assert api.post("/api/v1/settings/tax-slabs", json={"name": "GST 3% (Jewellery)", "rate": 3}).status_code == 503
    assert api.put("/api/v1/settings/tax-slabs/some-id", json={"name": "Renamed"}).status_code == 503
    assert api.put("/api/v1/settings/tax-slabs/some-id", json={"name": " "}).status_code == 400


# ------------------------------------------------------------------------------------------ delete
def _stub_db(monkeypatch, slabs, item_counts=None):
    """A tiny in-memory stand-in for the slab and item tables (the rules under test are in the router, not in Prisma)."""
    from app.routers import settings as mod
    rows = {s["id"]: SimpleNamespace(**s) for s in slabs}

    async def find_unique(where): return rows.get(where["id"])
    async def count(where=None): return len(rows)
    async def delete(where): rows.pop(where["id"])
    async def item_count(where): return (item_counts or {}).get(where["tax_rate"], 0)
    stub = SimpleNamespace(is_connected=lambda: True, taxslab=SimpleNamespace(find_unique=find_unique, count=count, delete=delete),
                           item=SimpleNamespace(count=item_count))
    monkeypatch.setattr(mod, "db", stub)
    return rows


def test_a_slab_can_be_deleted_and_items_keep_their_rate(api, monkeypatch):
    rows = _stub_db(monkeypatch, [{"id": "a", "name": "GST 5%", "rate": 5.0}, {"id": "b", "name": "GST 12%", "rate": 12.0}], {5.0: 7})
    r = api.delete("/api/v1/settings/tax-slabs/a")
    assert r.status_code == 200 and r.json()["itemsAtThisRate"] == 7 and "a" not in rows


def test_the_last_slab_cannot_be_deleted(api, monkeypatch):
    rows = _stub_db(monkeypatch, [{"id": "a", "name": "GST 5%", "rate": 5.0}])
    r = api.delete("/api/v1/settings/tax-slabs/a")
    assert r.status_code == 400 and "At least one" in r.json()["detail"] and "a" in rows


def test_deleting_an_unknown_slab_is_a_404(api, monkeypatch):
    _stub_db(monkeypatch, [{"id": "a", "name": "GST 5%", "rate": 5.0}, {"id": "b", "name": "GST 12%", "rate": 12.0}])
    assert api.delete("/api/v1/settings/tax-slabs/zzz").status_code == 404


def test_delete_needs_the_database(api):
    assert api.delete("/api/v1/settings/tax-slabs/a").status_code == 503
