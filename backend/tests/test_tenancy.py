"""Multi-tenancy foundation: schema names, tenant routing, middleware enforcement, access policy. No database needed."""
import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import httpx
import pytest
from jose import jwt

from app import database, tenancy
from app import tenant_middleware as tm
from app.config import settings

run = asyncio.run
NOW = datetime(2026, 10, 6, 12, 0, tzinfo=timezone.utc)


def _token(**claims):
    return jwt.encode({"exp": datetime.now(timezone.utc) + timedelta(hours=1), **claims}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


# ---- schema names and URLs ----------------------------------------------------------------------------------------
def test_generated_schema_names_are_valid_and_unique():
    names = {tenancy.new_schema_name() for _ in range(50)}
    assert len(names) == 50 and all(tenancy.is_tenant_schema(n) for n in names)


@pytest.mark.parametrize("bad", ["public", "tenant_", "tenant_XYZ", 'tenant_abc"; DROP SCHEMA public; --', "TENANT_aabbccddeeff",
                                 "tenant_aabbccddeeff1", "", None])
def test_invalid_schema_names_are_rejected(bad):
    assert not tenancy.is_tenant_schema(bad)
    with pytest.raises(ValueError):
        tenancy._require_tenant_schema(bad)


def test_ddl_helpers_refuse_unsafe_names():
    with pytest.raises(ValueError):
        run(tenancy.provision_schema('x"; DROP SCHEMA public; --'))
    with pytest.raises(ValueError):
        run(tenancy.drop_schema("public"))


def test_tenant_database_url_keeps_options_and_sets_schema():
    url = tenancy.tenant_database_url("tenant_aabbccddeeff", "postgresql://u:p%40w@host.example/neondb?sslmode=require&schema=public")
    assert url.startswith("postgresql://u:p%40w@host.example/neondb?")
    assert "sslmode=require" in url and "schema=tenant_aabbccddeeff" in url and "schema=public" not in url
    assert "connection_limit=" in url
    explicit = tenancy.tenant_database_url("tenant_aabbccddeeff", "postgresql://u:p@h/db?connection_limit=9")
    assert "connection_limit=9" in explicit and explicit.count("connection_limit") == 1


# ---- the tenant-aware db proxy ------------------------------------------------------------------------------------
def test_proxy_uses_default_client_without_tenant_and_tenant_client_inside_context(monkeypatch):
    default, tenant = SimpleNamespace(name="default", is_connected=lambda: True), SimpleNamespace(name="A", is_connected=lambda: False)
    monkeypatch.setattr(database, "_default_client", default)
    assert database.db.name == "default" and database.db.is_connected() is True
    token = database._current_client.set(tenant)
    try:
        assert database.db.name == "A" and database.db.is_connected() is False
    finally:
        database._current_client.reset(token)
    assert database.db.name == "default"


def test_proxy_isolates_concurrent_requests_of_different_tenants(monkeypatch):
    clients = {"A": SimpleNamespace(who="A"), "B": SimpleNamespace(who="B")}
    seen = {}

    async def request(tenant):
        token = database._current_client.set(clients[tenant])
        try:
            await asyncio.sleep(0.01 if tenant == "A" else 0)      # interleave the two requests
            seen[tenant] = database.db.who
        finally:
            database._current_client.reset(token)

    async def main():
        await asyncio.gather(request("A"), request("B"))
    run(main())
    assert seen == {"A": "A", "B": "B"}


# ---- client pool --------------------------------------------------------------------------------------------------
class FakePrisma:
    created = []

    def __init__(self, **kw):
        self.url = kw["datasource"]["url"]
        self._connected = False
        FakePrisma.created.append(self)

    async def connect(self):
        self._connected = True

    async def disconnect(self):
        self._connected = False

    def is_connected(self):
        return self._connected


def test_pool_reuses_clients_and_evicts_least_recently_used(monkeypatch):
    monkeypatch.setattr(tenancy, "Prisma", FakePrisma)
    FakePrisma.created.clear()
    pool = tenancy.TenantClientPool(max_clients=2)
    a, b, c = "tenant_aaaaaaaaaaaa", "tenant_bbbbbbbbbbbb", "tenant_cccccccccccc"

    async def use(schema):
        async with pool.lease(schema) as client:
            return client

    async def main():
        ca = await use(a)
        assert await use(a) is ca                          # reused
        await use(b)
        await use(c)                                       # exceeds 2 -> least recently used (a) is disconnected
        return ca

    ca = run(main())
    assert not ca.is_connected() and set(pool.connected_schemas()) == {b, c}
    assert all(f"schema={s}" in cl.url for s, cl in zip([a, b, c], FakePrisma.created))


def test_pool_never_evicts_a_client_that_is_in_use(monkeypatch):
    monkeypatch.setattr(tenancy, "Prisma", FakePrisma)
    pool = tenancy.TenantClientPool(max_clients=1)

    async def main():
        async with pool.lease("tenant_aaaaaaaaaaaa") as busy:
            async with pool.lease("tenant_bbbbbbbbbbbb"):
                assert busy.is_connected()
            assert busy.is_connected()
    run(main())


# ---- access policy ------------------------------------------------------------------------------------------------
def _tenant(status="TRIAL", ready="ready", default=False):
    return SimpleNamespace(id="T1", schema_name="tenant_aaaaaaaaaaaa", status=status, provision_status=ready, is_default=default)


def _sub(trial_end=None, sub_end=None):
    return SimpleNamespace(trial_end_date=trial_end, subscription_end_date=sub_end)


def test_trial_is_usable_until_the_end_date_then_expires():
    ok = tenancy.compute_access(_tenant("TRIAL"), _sub(trial_end=NOW + timedelta(days=1)), NOW)
    assert ok.allowed and not ok.readonly and ok.status == "TRIAL"
    late = tenancy.compute_access(_tenant("TRIAL"), _sub(trial_end=NOW - timedelta(seconds=1)), NOW, policy="readonly")
    assert late.status == "EXPIRED" and late.allowed and late.readonly and late.code == "subscription_expired"


def test_expired_policy_block_denies_everything():
    a = tenancy.compute_access(_tenant("ACTIVE"), _sub(sub_end=NOW - timedelta(days=1)), NOW, policy="block")
    assert a.status == "EXPIRED" and not a.allowed


@pytest.mark.parametrize("status,code", [("SUSPENDED", "tenant_suspended"), ("INVITED", "tenant_not_active"),
                                          ("INVITATION_EXPIRED", "tenant_not_active"), ("REJECTED", "tenant_not_active"),
                                          ("PENDING_APPROVAL", "tenant_not_active")])
def test_blocked_statuses(status, code):
    a = tenancy.compute_access(_tenant(status), _sub(), NOW)
    assert not a.allowed and a.code == code


def test_tenant_whose_schema_is_not_ready_is_blocked():
    assert not tenancy.compute_access(_tenant("TRIAL", ready="failed"), _sub(trial_end=NOW + timedelta(days=5)), NOW).allowed


def test_active_without_end_date_stays_active_and_naive_dates_are_utc():
    assert tenancy.compute_access(_tenant("ACTIVE", default=True), _sub(), NOW).allowed
    naive = _sub(trial_end=datetime(2026, 10, 7))
    assert tenancy.compute_access(_tenant("TRIAL"), naive, NOW).allowed


# ---- middleware ---------------------------------------------------------------------------------------------------
@pytest.fixture
def stack(monkeypatch):
    """The middleware in front of an app that reports which tenant client `db` resolved to."""
    accesses = {}
    entered = []

    async def fake_access(tenant_id):
        return accesses.get(tenant_id)

    @asynccontextmanager
    async def fake_context(schema):
        client = SimpleNamespace(schema=schema)
        entered.append(schema)
        token = database._current_client.set(client)
        try:
            yield client
        finally:
            database._current_client.reset(token)

    monkeypatch.setattr(tenancy, "get_tenant_access", fake_access)
    monkeypatch.setattr(tenancy, "tenant_context", fake_context)
    monkeypatch.setattr(database, "_default_client", SimpleNamespace(schema="DEFAULT", is_connected=lambda: True))

    async def downstream(scope, receive, send):
        body = f"{database.db.schema}".encode()
        await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"text/plain")]})
        await send({"type": "http.response.body", "body": body})

    app = tm.TenantContextMiddleware(downstream)

    async def call(method, path, token=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://t") as c:
            return await c.request(method, path, headers=headers)

    return SimpleNamespace(accesses=accesses, entered=entered, call=lambda *a, **k: run(call(*a, **k)))


def _access(**kw):
    base = dict(tenant_id="T1", schema_name="tenant_aaaaaaaaaaaa", status="TRIAL", allowed=True, readonly=False, code=None, message=None)
    return tenancy.TenantAccess(**{**base, **kw})


def test_no_token_or_legacy_token_uses_the_default_store(stack):
    assert stack.call("GET", "/api/v1/catalog/items").text == "DEFAULT"
    assert stack.call("GET", "/api/v1/catalog/items", _token(sub="owner.arjun", role="admin", phase=2)).text == "DEFAULT"
    assert stack.call("GET", "/api/v1/catalog/items", "not-a-jwt").text == "DEFAULT"
    assert stack.entered == []


def test_tenant_token_runs_on_that_tenants_schema_only(stack):
    stack.accesses["T1"] = _access()
    r = stack.call("GET", "/api/v1/catalog/items", _token(sub="a@x.com", role="admin", tenant_id="T1"))
    assert r.status_code == 200 and r.text == "tenant_aaaaaaaaaaaa"
    assert stack.call("GET", "/api/v1/catalog/items").text == "DEFAULT"          # context does not leak to the next request


def test_forged_tenant_claim_without_valid_signature_is_ignored(stack):
    stack.accesses["T1"] = _access()
    forged = jwt.encode({"sub": "x", "role": "admin", "tenant_id": "T1"}, "some-other-secret", algorithm="HS256")
    assert stack.call("GET", "/api/v1/catalog/items", forged).text == "DEFAULT"
    assert stack.entered == []


def test_unknown_suspended_and_inactive_tenants_are_refused(stack):
    tok = _token(sub="a", role="admin", tenant_id="T1")
    assert stack.call("GET", "/api/v1/catalog/items", tok).status_code == 401           # tenant row is gone
    stack.accesses["T1"] = _access(allowed=False, code="tenant_suspended", message="suspended", status="SUSPENDED")
    r = stack.call("GET", "/api/v1/catalog/items", tok)
    assert r.status_code == 403 and r.json()["code"] == "tenant_suspended"
    stack.accesses["T1"] = _access(allowed=False, code="subscription_expired", message="expired", status="EXPIRED")
    assert stack.call("GET", "/api/v1/catalog/items", tok).status_code == 402
    assert stack.entered == []


def test_expired_read_only_policy_allows_reads_blocks_writes_but_keeps_subscription_and_auth_open(stack):
    stack.accesses["T1"] = _access(readonly=True, status="EXPIRED", code="subscription_expired", message="expired")
    tok = _token(sub="a", role="admin", tenant_id="T1")
    assert stack.call("GET", "/api/v1/catalog/items", tok).status_code == 200
    r = stack.call("POST", "/api/v1/billing/checkout", tok)
    assert r.status_code == 402 and r.json()["code"] == "subscription_expired"
    assert stack.call("DELETE", "/api/v1/catalog/items/X", tok).status_code == 402
    assert stack.call("POST", "/api/v1/subscriptions/checkout", tok).status_code == 200
    assert stack.call("POST", "/api/v1/auth/login", tok).status_code == 200


def test_super_admin_token_is_confined_to_platform_routes(stack):
    tok = _token(sub="root@platform.com", role="super_admin")
    for path in ("/api/v1/catalog/items", "/api/v1/billing/sales/INV-1", "/api/v1/vendors", "/api/v1/ai-insights/business-summary",
                 "/api/v1/reports/summary", "/api/v1/users"):
        r = stack.call("GET", path, tok)
        assert r.status_code == 403 and r.json()["code"] == "platform_only", path
    for path in ("/api/v1/super-admin/tenants", "/api/v1/auth/me", "/api/v1/health", "/health", "/"):
        assert stack.call("GET", path, tok).status_code == 200, path
    assert stack.entered == []


def test_super_admin_prefix_lookalikes_are_not_platform_paths():
    assert not tm.is_platform_path("/api/v1/super-admin-evil")
    assert not tm.is_platform_path("/api/v1/authors")
    assert tm.is_platform_path("/api/v1/super-admin/tenants")


def test_tenant_connection_failure_answers_503_not_a_default_store_fallback(stack, monkeypatch):
    stack.accesses["T1"] = _access()

    @asynccontextmanager
    async def broken(schema):
        raise ConnectionError("db down")
        yield                                                  # pragma: no cover

    monkeypatch.setattr(tenancy, "tenant_context", broken)
    r = stack.call("GET", "/api/v1/catalog/items", _token(sub="a", role="admin", tenant_id="T1"))
    assert r.status_code == 503 and r.json()["code"] == "tenant_db_unavailable"


# ---- security: tokens and platform users --------------------------------------------------------------------------
def test_tenant_token_for_a_deleted_user_is_rejected_without_a_stand_in_account(monkeypatch):
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials
    from app import security

    class NoUsers:
        class user:
            @staticmethod
            async def find_unique(**kw):
                return None
    monkeypatch.setattr(security, "db", NoUsers)
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=_token(sub="ghost", role="admin", tenant_id="T1"))
    with pytest.raises(HTTPException) as e:
        run(security.get_current_user(creds))
    assert e.value.status_code == 401
    # the legacy (no tenant) behaviour is unchanged
    legacy = HTTPAuthorizationCredentials(scheme="Bearer", credentials=_token(sub="ghost", role="admin", phase=2))
    assert run(security.get_current_user(legacy)).username == "ghost"


def test_super_admin_token_resolves_to_a_platform_user_and_tenant_routes_refuse_it(monkeypatch):
    from fastapi import HTTPException
    from fastapi.security import HTTPAuthorizationCredentials
    from app import security

    row = SimpleNamespace(id="P1", email="root@platform.com", full_name="Root", is_active=True)

    class Platform:
        class platformuser:
            @staticmethod
            async def find_unique(where):
                return row if where["email"] == "root@platform.com" else None
    monkeypatch.setattr(security, "control_db", Platform)
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=_token(sub="Root@Platform.com", role="super_admin"))
    user = run(security.get_current_user(creds))
    assert user.role == "super_admin" and user.tenant_id is None
    assert run(security.require_super_admin(user)) is user
    with pytest.raises(HTTPException) as e:
        run(security.require_admin(user))                          # super admin is not a store admin
    assert e.value.status_code == 403
    with pytest.raises(HTTPException) as e:
        run(security.require_super_admin(SimpleNamespace(role="admin")))
    assert e.value.status_code == 403
    row.is_active = False
    with pytest.raises(HTTPException) as e:
        run(security.get_current_user(creds))
    assert e.value.status_code == 401


def test_direct_url_for_schema_creation_skips_the_pooler(monkeypatch):
    monkeypatch.setattr(settings, "DIRECT_DATABASE_URL", "")
    pooled = "postgresql://u:p@ep-abc-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true"
    direct = tenancy.direct_database_url(pooled)
    assert "-pooler" not in direct and "pgbouncer" not in direct and "sslmode=require" in direct and "ep-abc.c-6" in direct
    assert tenancy.direct_database_url("postgresql://u:p@localhost:5432/db") == "postgresql://u:p@localhost:5432/db"
    # the schema is applied on top of the direct address
    env_url = tenancy.tenant_database_url("tenant_aabbccddeeff", direct)
    assert "schema=tenant_aabbccddeeff" in env_url and "-pooler" not in env_url
    # an explicit DIRECT_DATABASE_URL wins
    monkeypatch.setattr(settings, "DIRECT_DATABASE_URL", "postgresql://x:y@direct.example/db")
    assert tenancy.direct_database_url() == "postgresql://x:y@direct.example/db"


# ---- demo data and in-memory fallbacks never cross or seed tenants ---------------------------------------------------
from app import tenant_scoped as ts                                             # noqa: E402


def _as_tenant(schema):
    return database.current_tenant_schema.set(schema)


def test_tenant_list_gives_the_original_store_its_contents_and_every_tenant_a_private_empty_list():
    demo = ts.TenantList([{"id": "V-001"}, {"id": "V-002"}])
    assert len(demo) == 2 and [v["id"] for v in demo] == ["V-001", "V-002"]           # default store: unchanged
    tok = _as_tenant("tenant_aaaaaaaaaaaa")
    try:
        assert len(demo) == 0 and list(demo) == [] and not demo                         # a new tenant inherits nothing
        demo.append({"id": "A-1"})
        assert [v["id"] for v in demo] == ["A-1"]
    finally:
        database.current_tenant_schema.reset(tok)
    tok = _as_tenant("tenant_bbbbbbbbbbbb")
    try:
        assert list(demo) == []                                                         # tenant B cannot see tenant A's entry
        demo.append({"id": "B-1"})
    finally:
        database.current_tenant_schema.reset(tok)
    assert [v["id"] for v in demo] == ["V-001", "V-002"]                                # and neither touched the default store


def test_tenant_list_supports_the_list_operations_the_routers_use():
    lst = ts.TenantList([3, 1, 2])
    lst.append(4); lst.extend([5]); lst.insert(0, 0)
    assert list(lst) == [0, 3, 1, 2, 4, 5] and list(reversed(lst)) == [5, 4, 2, 1, 3, 0] and lst[0] == 0 and 3 in lst
    lst[:] = [x for x in lst if x != 3]                                                 # what delete handlers do
    assert list(lst) == [0, 1, 2, 4, 5] and lst.copy() == [0, 1, 2, 4, 5] and len(lst) == 5
    for item in lst:                                                                    # mutate while iterating is safe (snapshot)
        if item == 1:
            lst.remove(1)
    assert 1 not in lst


def test_tenant_dict_is_partitioned_too():
    users = ts.TenantDict({"priya.k": {"role": "cashier"}})
    assert users.get("priya.k") and "priya.k" in users and len(users) == 1
    tok = _as_tenant("tenant_aaaaaaaaaaaa")
    try:
        assert users.get("priya.k") is None and list(users.values()) == [] and "priya.k" not in users
        users["owner"] = {"role": "admin"}
        assert list(users.keys()) == ["owner"]
    finally:
        database.current_tenant_schema.reset(tok)
    assert list(users.keys()) == ["priya.k"]


def test_demo_seeders_do_nothing_inside_a_tenant(monkeypatch):
    """Vendors / purchase orders / batches were created from built-in demo rows whenever their table was empty."""
    from app.routers import batches, purchase_orders, vendors

    class Boom:
        def __getattr__(self, name):
            raise AssertionError(f"a tenant request touched the database to seed demo data ({name})")
        def is_connected(self):
            return True

    for module, seeder in ((vendors, vendors.seed_vendors_if_needed), (purchase_orders, purchase_orders.seed_pos_if_needed),
                           (batches, batches.seed_batches_if_needed)):
        monkeypatch.setattr(module, "get_db", lambda: Boom())
        tok = _as_tenant("tenant_aaaaaaaaaaaa")
        try:
            run(seeder())                                                                # returns before touching the database
        finally:
            database.current_tenant_schema.reset(tok)


def test_original_store_still_seeds_demo_rows(monkeypatch):
    from app.routers import vendors
    created = []

    class Table:
        async def count(self):
            return 0
        async def create(self, data):
            created.append(data["id"])

    monkeypatch.setattr(vendors, "get_db", lambda: SimpleNamespace(is_connected=lambda: True, vendor=Table()))
    run(vendors.seed_vendors_if_needed())
    assert created[:2] == ["V-001", "V-002"] and len(created) == 8


def test_tenant_categories_exclude_the_built_in_grocery_defaults(monkeypatch):
    from app.routers import catalog

    class Cats:
        async def find_many(self):
            return [SimpleNamespace(name="Frozen Foods")]
    monkeypatch.setattr(catalog, "db", SimpleNamespace(category=Cats()))
    assert "Beverages" in run(catalog.get_categories())                                  # original store keeps its defaults
    tok = _as_tenant("tenant_aaaaaaaaaaaa")
    try:
        assert run(catalog.get_categories()) == ["Frozen Foods"]
    finally:
        database.current_tenant_schema.reset(tok)


def test_legacy_ai_insights_report_is_empty_for_a_tenant_without_sales(monkeypatch):
    from app.routers import ai_insights

    class Empty:
        async def find_many(self, **kw):
            return []
    monkeypatch.setattr(ai_insights, "db", SimpleNamespace(item=Empty(), batch=Empty(), sale=Empty()))
    tok = _as_tenant("tenant_aaaaaaaaaaaa")
    try:
        res = run(ai_insights.get_ai_insights())
    finally:
        database.current_tenant_schema.reset(tok)
    assert res["trends"] == [] and res["top_selling_by_quantity"] == [] and res["slow_moving_items"] == []


def test_demo_login_accounts_are_never_created_inside_a_tenant():
    from app.routers import auth
    tok = _as_tenant("tenant_aaaaaaaaaaaa")
    try:
        auth._init_fallback_users()
        assert len(auth._FALLBACK_USERS) == 0 and auth._FALLBACK_USERS.get("priya.k") is None
    finally:
        database.current_tenant_schema.reset(tok)
    assert auth._FALLBACK_USERS.get("priya.k") is not None                               # the original store still has them
