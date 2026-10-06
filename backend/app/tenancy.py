"""
Multi-tenancy core: one PostgreSQL schema per tenant.

* The original single store is the *default tenant* and keeps living in the default schema ("public").
* Every other tenant gets its own schema (`tenant_<12 hex>`) holding a full copy of the application tables, reached
  through its own Prisma client. Tenant A therefore has no way to read or write Tenant B's tables.
* Tenants, invitations, plans, platform users, notifications and the platform audit log are the *control plane*;
  they live in the default schema and are only accessed through `control_db`.
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import sys
import sysconfig
import time
import uuid
from collections import OrderedDict
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator, Dict, Optional, Tuple
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from app.config import settings
from app.database import Prisma, _current_client, control_db, current_tenant_schema

DEFAULT_SCHEMA = "public"
SCHEMA_RE = re.compile(r"^tenant_[a-f0-9]{12}$")
BACKEND_DIR = Path(__file__).resolve().parent.parent
ACCESS_CACHE_SECONDS = 30


# --------------------------------------------------------------------------- schema names and URLs
def new_schema_name() -> str:
    return f"tenant_{uuid.uuid4().hex[:12]}"


def is_tenant_schema(name: str) -> bool:
    return bool(SCHEMA_RE.match(name or ""))


def _require_tenant_schema(name: str) -> str:
    """DDL cannot be parameterised, so only generated names ever reach SQL."""
    if not is_tenant_schema(name):
        raise ValueError(f"Invalid tenant schema name: {name!r}")
    return name


def tenant_database_url(schema: str, base_url: Optional[str] = None) -> str:
    """The configured DATABASE_URL pointed at one schema (other query parameters such as sslmode are kept)."""
    base = base_url or settings.DATABASE_URL
    parts = urlsplit(base)
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in ("schema",)]
    query.append(("schema", schema))
    if not any(k == "connection_limit" for k, _ in query):
        query.append(("connection_limit", str(max(1, settings.TENANT_CONNECTION_LIMIT))))
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def direct_database_url(base_url: Optional[str] = None) -> str:
    """Connection string for schema creation: never goes through a connection pooler."""
    base = base_url or settings.DIRECT_DATABASE_URL or settings.DATABASE_URL
    if base_url is None and settings.DIRECT_DATABASE_URL:
        return base
    parts = urlsplit(base)
    host = parts.netloc.replace("-pooler.", ".")            # Neon: ep-xxx-pooler.region... -> ep-xxx.region...
    query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in ("pgbouncer",)]
    return urlunsplit((parts.scheme, host, parts.path, urlencode(query), parts.fragment))


# --------------------------------------------------------------------------- client pool
class TenantClientPool:
    """Lazily connected Prisma clients, one per tenant schema, with a bounded number kept connected (LRU)."""

    def __init__(self, max_clients: int = 20):
        self.max_clients = max(1, max_clients)
        self._clients: "OrderedDict[str, Any]" = OrderedDict()
        self._locks: Dict[str, asyncio.Lock] = {}
        self._inflight: Dict[str, int] = {}

    async def _get(self, schema: str):
        lock = self._locks.setdefault(schema, asyncio.Lock())
        async with lock:
            client = self._clients.get(schema)
            if client is None or not client.is_connected():
                client = Prisma(use_dotenv=False, datasource={"url": tenant_database_url(_require_tenant_schema(schema))})
                await client.connect()
                self._clients[schema] = client
            self._clients.move_to_end(schema)
            return client

    @asynccontextmanager
    async def lease(self, schema: str) -> AsyncIterator[Any]:
        """Borrow the client for `schema` for the duration of a request (clients in use are never evicted)."""
        if schema == DEFAULT_SCHEMA:
            if not control_db.is_connected():
                await control_db.connect()
            yield control_db
            return
        client = await self._get(schema)
        self._inflight[schema] = self._inflight.get(schema, 0) + 1
        try:
            yield client
        finally:
            self._inflight[schema] -= 1
            await self._evict()

    async def _evict(self):
        while len(self._clients) > self.max_clients:
            victim = next((s for s in self._clients if self._inflight.get(s, 0) == 0), None)
            if victim is None:
                return
            client = self._clients.pop(victim)
            try:
                await client.disconnect()
            except Exception:                                  # noqa: BLE001
                pass

    async def close(self, schema: Optional[str] = None):
        for s in ([schema] if schema else list(self._clients)):
            client = self._clients.pop(s, None)
            if client is not None:
                try:
                    await client.disconnect()
                except Exception:                              # noqa: BLE001
                    pass

    def connected_schemas(self):
        return list(self._clients)


pool = TenantClientPool(settings.TENANT_CLIENT_POOL_SIZE)


@asynccontextmanager
async def tenant_context(schema_name: str) -> AsyncIterator[Any]:
    """Run code against one tenant's schema: `db.*` inside the block is that tenant's data. Used by the Super Admin
    endpoints for read-only summaries, by provisioning, and by the tenant middleware."""
    async with pool.lease(schema_name or DEFAULT_SCHEMA) as client:
        token = _current_client.set(None if client is control_db else client)
        schema_token = current_tenant_schema.set(None if client is control_db else schema_name)
        try:
            yield client
        finally:
            current_tenant_schema.reset(schema_token)
            _current_client.reset(token)


# --------------------------------------------------------------------------- provisioning
def _prisma_env(schema: str) -> dict:
    env = dict(os.environ)
    env["DATABASE_URL"] = tenant_database_url(schema, direct_database_url())      # direct connection: pooled ones lose the schema setting
    extra = [sysconfig.get_path("scripts"), sysconfig.get_path("scripts", "nt_user") if os.name == "nt" else None]
    env["PATH"] = os.pathsep.join([p for p in extra if p] + [env.get("PATH", "")])
    return env


def _run_db_push(schema: str) -> Tuple[int, str]:
    proc = subprocess.run(
        [sys.executable, "-m", "prisma", "db", "push", "--schema", str(BACKEND_DIR / "prisma" / "schema.prisma"), "--skip-generate"],
        cwd=str(BACKEND_DIR), env=_prisma_env(schema), capture_output=True, text=True, timeout=300)
    return proc.returncode, (proc.stdout + "\n" + proc.stderr).strip()


# Bump when prisma/schema.prisma changes the application tables: every ready tenant schema is then brought up to date
# (prisma db push, additive only) by the background sweeper, so existing businesses get new columns without manual work.
SCHEMA_VERSION = 3


async def provision_schema(schema: str) -> None:
    """Create the schema and all application tables in it. Raises RuntimeError with the tool output on failure."""
    _require_tenant_schema(schema)
    await control_db.execute_raw(f'CREATE SCHEMA IF NOT EXISTS "{schema}"')
    code, output = await asyncio.to_thread(_run_db_push, schema)
    if code != 0:
        raise RuntimeError(f"Creating the tenant tables failed: {output[-600:]}")


async def drop_schema(schema: str) -> None:
    """Remove a tenant schema and everything in it (scratch tenants / failed provisioning only)."""
    _require_tenant_schema(schema)
    await pool.close(schema)
    await control_db.execute_raw(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')


# --------------------------------------------------------------------------- lifecycle and access policy
BLOCKED_STATUSES = {"INVITED", "INVITATION_EXPIRED", "PENDING_APPROVAL", "APPROVED", "REJECTED", "SUSPENDED", "DEACTIVATED"}
USABLE_STATUSES = {"ACTIVATED", "TRIAL", "ACTIVE"}


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def effective_status(status: str, sub: Any, now: datetime) -> str:
    """TRIAL / ACTIVE turn EXPIRED as soon as their end date passes (the sweeper only persists what is already true)."""
    if status == "TRIAL":
        end = _aware(getattr(sub, "trial_end_date", None))
        if end is not None and end <= now:
            return "EXPIRED"
    if status == "ACTIVE":
        end = _aware(getattr(sub, "subscription_end_date", None))
        if end is not None and end <= now:
            return "EXPIRED"
    return status


@dataclass(frozen=True)
class TenantAccess:
    tenant_id: str
    schema_name: str
    status: str                  # effective status
    allowed: bool                # may use the application at all
    readonly: bool               # expired, read-only policy: GET only
    code: Optional[str] = None
    message: Optional[str] = None
    is_default: bool = False


def compute_access(tenant: Any, sub: Any, now: Optional[datetime] = None, policy: Optional[str] = None) -> TenantAccess:
    now = now or datetime.now(timezone.utc)
    policy = (policy or settings.EXPIRED_ACCESS_POLICY or "readonly").lower()
    status = effective_status(tenant.status, sub, now)
    base = dict(tenant_id=tenant.id, schema_name=tenant.schema_name, status=status, is_default=bool(tenant.is_default))
    if status == "SUSPENDED":
        return TenantAccess(**base, allowed=False, readonly=False, code="tenant_suspended",
                            message="This business account has been suspended. Please contact the platform administrator.")
    if status == "DEACTIVATED":
        return TenantAccess(**base, allowed=False, readonly=False, code="tenant_deactivated",
                            message="This business account has been deactivated. Please contact the platform administrator.")
    if status in BLOCKED_STATUSES or tenant.provision_status != "ready":
        return TenantAccess(**base, allowed=False, readonly=False, code="tenant_not_active",
                            message="This business account is not active yet.")
    if status == "EXPIRED":
        msg = "Your trial or subscription has expired. Please choose a plan to continue."
        if policy == "block":
            return TenantAccess(**base, allowed=False, readonly=False, code="subscription_expired", message=msg)
        return TenantAccess(**base, allowed=True, readonly=True, code="subscription_expired", message=msg)
    return TenantAccess(**base, allowed=True, readonly=False)


_access_cache: Dict[str, Tuple[float, TenantAccess]] = {}


def invalidate_tenant(tenant_id: Optional[str] = None) -> None:
    """Forget cached access decisions (call after any status / subscription change)."""
    if tenant_id:
        _access_cache.pop(tenant_id, None)
    else:
        _access_cache.clear()


async def get_tenant_access(tenant_id: str) -> Optional[TenantAccess]:
    hit = _access_cache.get(tenant_id)
    if hit and time.monotonic() - hit[0] < ACCESS_CACHE_SECONDS:
        return hit[1]
    tenant = await control_db.tenant.find_unique(where={"id": tenant_id}, include={"subscription": True})
    if tenant is None:
        return None
    access = compute_access(tenant, tenant.subscription)
    _access_cache[tenant_id] = (time.monotonic(), access)
    return access
