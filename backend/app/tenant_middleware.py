"""
Pure-ASGI middleware that pins every request to its tenant.

The tenant comes from the signed JWT only (claim `tenant_id`), never from a header or query string, so a client cannot
choose another tenant. After this runs, `db.*` in any router is the client of that tenant's schema.

* No token / legacy token without `tenant_id`  -> default store (unchanged behaviour).
* Super Admin token                            -> only /auth, /health and /super-admin are reachable; it is never
                                                  allowed onto tenant data routes (which would fall back to the default store).
* Tenant token                                 -> tenant status is checked (suspended / expired / not active) and the
                                                  request runs on that tenant's database client.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from jose import JWTError, jwt

from app.config import settings
from app import tenancy

logger = logging.getLogger("uvicorn.error")

API = settings.API_V1_STR
PLATFORM_PATHS = (f"{API}/super-admin", f"{API}/auth", f"{API}/health", f"{API}/invitations")
PLATFORM_EXACT = {"/", "/health", "/docs", "/openapi.json", "/redoc"}
# stay reachable for a tenant whose subscription has expired (so it can sign in and pick a plan)
EXPIRED_ALLOWED_PREFIXES = (f"{API}/auth", f"{API}/subscriptions")
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _bearer(scope) -> Optional[str]:
    for name, value in scope.get("headers") or []:
        if name == b"authorization":
            text = value.decode("latin-1")
            if text.lower().startswith("bearer "):
                return text[7:].strip()
    return None


def decode_claims(token: Optional[str]) -> Optional[dict]:
    if not token:
        return None
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None


async def _reject(send, status: int, code: str, message: str):
    body = json.dumps({"detail": message, "code": code}).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})


def is_platform_path(path: str) -> bool:
    return path in PLATFORM_EXACT or any(path == p or path.startswith(p + "/") for p in PLATFORM_PATHS)


class TenantContextMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") == "OPTIONS":        # websockets / CORS pre-flight pass through
            return await self.app(scope, receive, send)

        claims = decode_claims(_bearer(scope))
        path = scope.get("path", "")

        if claims and claims.get("role") == "super_admin":
            if not is_platform_path(path):
                return await _reject(send, 403, "platform_only",
                                     "Super Admin accounts can only use the platform administration APIs.")
            return await self.app(scope, receive, send)

        tenant_id = claims.get("tenant_id") if claims else None
        if not tenant_id:
            return await self.app(scope, receive, send)

        try:
            access = await tenancy.get_tenant_access(tenant_id)
        except Exception:                                                         # noqa: BLE001
            logger.exception("Tenant lookup failed")
            return await _reject(send, 503, "tenant_lookup_failed", "Could not verify the business account. Please try again.")
        if access is None:
            return await _reject(send, 401, "tenant_not_found", "This business account no longer exists.")
        if not access.allowed:
            return await _reject(send, 403 if access.code != "subscription_expired" else 402, access.code, access.message)
        if access.readonly and scope.get("method") not in SAFE_METHODS and not path.startswith(EXPIRED_ALLOWED_PREFIXES):
            return await _reject(send, 402, access.code, access.message)

        ctx = tenancy.tenant_context(access.schema_name)
        try:
            await ctx.__aenter__()                         # connects the tenant's database client if needed
        except Exception:                                  # noqa: BLE001
            logger.exception("Tenant database unavailable")
            return await _reject(send, 503, "tenant_db_unavailable", "The business database is temporarily unavailable.")
        try:
            return await self.app(scope, receive, send)
        finally:
            await ctx.__aexit__(None, None, None)
