"""In-memory stand-in for the Prisma client, limited to the calls the platform code makes (no database needed)."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace


def _now():
    return datetime.now(timezone.utc)


class UniqueViolation(Exception):
    pass


class Table:
    def __init__(self, name, defaults=None, unique=(), includes=None, store=None):
        self.name, self.defaults, self.unique, self.includes, self.store = name, defaults or {}, unique, includes or {}, store
        self.rows = []

    # -- matching
    @staticmethod
    def _ok(value, cond):
        if isinstance(cond, dict):
            for op, arg in cond.items():
                if op == "in" and value not in arg:
                    return False
                if op == "not" and value == arg:
                    return False
                if op == "lte" and not (value is not None and value <= arg):
                    return False
                if op == "lt" and not (value is not None and value < arg):
                    return False
                if op == "gte" and not (value is not None and value >= arg):
                    return False
            return True
        return value == cond

    def _match(self, row, where):
        return all(self._ok(getattr(row, k, None), v) for k, v in (where or {}).items())

    def _with_includes(self, row, include):
        if row is None or not include:
            return row
        out = SimpleNamespace(**vars(row))
        for rel in include:
            kind, table, local, remote = self.includes[rel]
            target = self.store[table]
            if kind == "one-by-remote":          # row.id == other.<remote>
                setattr(out, rel, next((r for r in target.rows if getattr(r, remote) == row.id), None))
            else:                                # row.<local> == other.id
                setattr(out, rel, next((r for r in target.rows if r.id == getattr(row, local)), None))
        return out

    # -- API
    async def create(self, data):
        row = SimpleNamespace(**{"id": str(uuid.uuid4()), "created_at": _now(), "updated_at": _now(), **self.defaults, **data})
        for u in self.unique:
            if any(getattr(r, u) == getattr(row, u) for r in self.rows):
                raise UniqueViolation(f"{self.name}.{u}")
        self.rows.append(row)
        return row

    async def find_unique(self, where, include=None):
        return self._with_includes(next((r for r in self.rows if self._match(r, where)), None), include)

    async def find_first(self, where=None, include=None, order=None):
        return self._with_includes(next((r for r in self.rows if self._match(r, where)), None), include)

    async def find_many(self, where=None, order=None, take=None, skip=None, include=None):
        rows = [r for r in self.rows if self._match(r, where)]
        if order:
            (key, direction), = order.items()
            rows.sort(key=lambda r: getattr(r, key) or 0, reverse=direction == "desc")
        rows = rows[skip or 0:]
        if take:
            rows = rows[:take]
        return [self._with_includes(r, include) for r in rows]

    async def count(self, where=None):
        return len([r for r in self.rows if self._match(r, where)])

    async def update(self, where, data):
        row = next((r for r in self.rows if self._match(r, where)), None)
        if row is None:
            raise LookupError(f"{self.name}: record not found")
        for k, v in data.items():
            setattr(row, k, v)
        row.updated_at = _now()
        return row

    async def update_many(self, where, data):
        n = 0
        for r in self.rows:
            if self._match(r, where):
                for k, v in data.items():
                    setattr(r, k, v)
                n += 1
        return n

    async def upsert(self, where, data):
        row = next((r for r in self.rows if self._match(r, where)), None)
        return await (self.update(where, data["update"]) if row else self.create(data["create"]))


class FakeControlDb:
    """Control-plane tables (default schema)."""

    def __init__(self):
        s = {}
        self.store = s
        s["tenant"] = Table("tenant", dict(status="INVITED", status_before_suspend=None, country="India", is_default=False, provision_status="pending",
                                           provision_error=None, request_id=None, created_by=None, initial_outlet_name=None, schema_version=0),
                            unique=("code", "schema_name"), includes={"subscription": ("one-by-remote", "tenantsubscription", None, "tenant_id")}, store=s)
        s["tenantsubscription"] = Table("tenantsubscription", dict(plan_id=None, current_plan="Trial", trial_start_date=None, trial_end_date=None,
                                                                    trial_duration_days=14, subscription_start_date=None, subscription_end_date=None,
                                                                    payment_status="NOT_PAID", pending_plan_id=None, trial_reminder_sent=False),
                                        unique=("tenant_id",), store=s)
        s["subscriptionplan"] = Table("subscriptionplan", dict(description=None, price=0.0, currency="INR", duration_days=30, max_users=None,
                                                               storage_mb=None, ai_enabled=False, reports_enabled=True, is_active=True),
                                      unique=("code",), store=s)
        s["tenantrequest"] = Table("tenantrequest", dict(country="India", status="PENDING_APPROVAL", reviewed_by=None, reviewed_at=None,
                                                         reject_reason=None, tenant_id=None, ip_address=None, notes=None, source="website",
                                                         initial_outlet_name=None), store=s)
        s["tenantinvitation"] = Table("tenantinvitation", dict(purpose="invite", status="PENDING", used_at=None, accepted_at=None, created_by=None),
                                      unique=("token_hash",), includes={"tenant": ("one-by-local", "tenant", "tenant_id", None)}, store=s)
        s["platformuser"] = Table("platformuser", dict(is_active=True, last_login_at=None), unique=("email",), store=s)
        s["tenantnotification"] = Table("tenantnotification", dict(tenant_id=None, link=None, is_read=False), store=s)
        s["platformauditlog"] = Table("platformauditlog", dict(actor_id=None, actor_email=None, tenant_id=None, ip_address=None, metadata_json=None,
                                                               timestamp=_now()), store=s)
        s["platformsetting"] = Table("platformsetting", store=s)
        s["storesettings"] = Table("storesettings", store=s)
        for name, table in s.items():
            setattr(self, name, table)
        self._connected = True

    def is_connected(self):
        return self._connected

    async def connect(self):
        self._connected = True

    async def execute_raw(self, *a, **k):
        return 0


class FakeTenantClient:
    """One tenant's schema: users, store settings, items, sales."""

    def __init__(self, schema):
        self.schema = schema
        s = {}
        self.user = Table("user", dict(email=None, password_hash=None, is_active=True, on_leave=False, active_counter=None, auto_lock="2 min",
                                       phase_access=2, sub_text=""), unique=("username",), store=s)
        self.storesettings = Table("storesettings", store=s)
        self.item = Table("item", store=s)
        self.sale = Table("sale", store=s)
        self._connected = True

    def is_connected(self):
        return self._connected
