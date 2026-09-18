import asyncio
import hashlib
import json
import time
from typing import Any, Callable, Dict, Optional, Tuple

class IdempotencyRecord:
    def __init__(self, data: Any, status_code: int = 200, expires_at: float = 0.0):
        self.data = data
        self.status_code = status_code
        self.expires_at = expires_at

class IdempotencyManager:
    """
    Manages in-memory concurrency locks and response caches for idempotent operations.
    Ensures that if duplicate requests arrive simultaneously:
    1. Only the first request executes the transaction / database writes.
    2. Concurrent requests await the first request's completion.
    3. All subsequent requests within TTL receive the exact same response without re-executing.
    """
    def __init__(self, default_ttl: int = 60):
        self._default_ttl = default_ttl
        self._cache: Dict[str, IdempotencyRecord] = {}
        self._locks: Dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    def _cleanup_expired(self):
        now = time.time()
        expired = [k for k, v in self._cache.items() if v.expires_at < now]
        for k in expired:
            self._cache.pop(k, None)
            self._locks.pop(k, None)

    async def get_lock(self, key: str) -> asyncio.Lock:
        async with self._global_lock:
            self._cleanup_expired()
            if key not in self._locks:
                self._locks[key] = asyncio.Lock()
            return self._locks[key]

    def get_cached(self, key: str) -> Optional[Tuple[Any, int]]:
        record = self._cache.get(key)
        if record and record.expires_at > time.time():
            return record.data, record.status_code
        return None

    def store_response(self, key: str, data: Any, status_code: int = 200, ttl: Optional[int] = None):
        ttl_val = ttl if ttl is not None else self._default_ttl
        self._cache[key] = IdempotencyRecord(
            data=data,
            status_code=status_code,
            expires_at=time.time() + ttl_val
        )

    async def execute(self, key: str, action: Callable, status_code: int = 200, ttl: Optional[int] = None) -> Tuple[Any, bool]:
        """
        Executes action with concurrency locking and caching.
        Returns (result, was_cached: bool).
        """
        # Fast path check before lock
        cached = self.get_cached(key)
        if cached is not None:
            return cached[0], True

        lock = await self.get_lock(key)
        async with lock:
            # Double check after acquiring lock
            cached = self.get_cached(key)
            if cached is not None:
                return cached[0], True

            # Execute action
            result = await action()
            self.store_response(key, result, status_code=status_code, ttl=ttl)
            return result, False

# Global singleton
idempotency_manager = IdempotencyManager(default_ttl=60)

def generate_fingerprint(prefix: str, user: str, payload: Any) -> str:
    """
    Generates a deterministic SHA256 key from action prefix, username, and payload data.
    """
    try:
        if hasattr(payload, "model_dump"):
            serialized = json.dumps(payload.model_dump(), sort_keys=True, default=str)
        elif hasattr(payload, "dict"):
            serialized = json.dumps(payload.dict(), sort_keys=True, default=str)
        elif isinstance(payload, (dict, list)):
            serialized = json.dumps(payload, sort_keys=True, default=str)
        else:
            serialized = str(payload)
    except Exception:
        serialized = str(payload)
    
    raw = f"{prefix}:{user}:{serialized}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"{prefix}:{digest}"
