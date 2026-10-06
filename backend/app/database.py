from contextvars import ContextVar

try:
    from app.generated.prisma import Prisma
except ImportError:
    from prisma import Prisma

# The default client: the original single store (default schema) and the platform control plane.
_default_client = Prisma()
control_db = _default_client          # tenants, invitations, plans, platform users, notifications, platform audit log

# The Prisma client of the tenant that owns the current request (set by app.tenant_middleware).
# None means "no tenant" = the default store, exactly how the app behaved before multi-tenancy.
_current_client: ContextVar = ContextVar("current_tenant_client", default=None)
# Schema name of that tenant (None = default store). Used to keep in-memory caches such as idempotency keys per tenant.
current_tenant_schema: ContextVar = ContextVar("current_tenant_schema", default=None)


def is_default_store() -> bool:
    """True for the original single store (no tenant context). Demo seeding / offline demo data is for that store only."""
    return current_tenant_schema.get() is None


class TenantDb:
    """Drop-in replacement for the module-level Prisma client.

    Every existing router keeps writing `db.item.find_many(...)`; the call is forwarded to the client of the tenant
    that owns the request, so each tenant only ever touches its own PostgreSQL schema.
    """

    def _client(self):
        return _current_client.get() or _default_client

    def __getattr__(self, name):
        return getattr(self._client(), name)

    def is_connected(self) -> bool:
        return self._client().is_connected()

    async def connect(self):
        await _default_client.connect()

    async def disconnect(self):
        await _default_client.disconnect()


db = TenantDb()


async def connect_db():
    if not _default_client.is_connected():
        try:
            await _default_client.connect()
            print("Connected to PostgreSQL database successfully.")
        except Exception as e:
            print(f"[Database] Could not connect to PostgreSQL ({e}). Operating in memory / fallback mode.")

async def disconnect_db():
    try:
        if _default_client.is_connected():
            await _default_client.disconnect()
    except Exception:
        pass

def get_db():
    return db
