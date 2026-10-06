import time
import asyncio
from typing import Dict, Any, Optional
from fastapi import Request, HTTPException, status
from app.database import current_tenant_schema

class IdempotencyManager:
    """
    In-memory idempotency and in-flight request lock manager.
    Protects single-response actions from concurrent and duplicate submissions.
    """
    def __init__(self, ttl_seconds: int = 120):
        self.ttl_seconds = ttl_seconds
        self._in_flight: Dict[str, float] = {}
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    def _cleanup(self, now: float):
        # Remove expired records
        expired_in_flight = [k for k, t in self._in_flight.items() if now - t > self.ttl_seconds]
        for k in expired_in_flight:
            self._in_flight.pop(k, None)

        expired_cache = [k for k, v in self._cache.items() if now - v["timestamp"] > self.ttl_seconds]
        for k in expired_cache:
            self._cache.pop(k, None)

    async def acquire_lock(self, key: str) -> bool:
        """
        Acquires an in-flight lock for the given key.
        Returns True if acquired, False if already in-flight or already completed.
        """
        async with self._lock:
            now = time.time()
            self._cleanup(now)
            if key in self._in_flight or key in self._cache:
                return False
            self._in_flight[key] = now
            return True

    async def release_lock(self, key: str, response_data: Optional[Dict[str, Any]] = None):
        """
        Releases the in-flight lock and optionally saves the response to cache.
        """
        async with self._lock:
            now = time.time()
            self._in_flight.pop(key, None)
            if response_data is not None:
                self._cache[key] = {
                    "timestamp": now,
                    "data": response_data
                }

    async def get_cached(self, key: str) -> Optional[Dict[str, Any]]:
        async with self._lock:
            now = time.time()
            entry = self._cache.get(key)
            if entry and (now - entry["timestamp"] <= self.ttl_seconds):
                return entry["data"]
            return None

idempotency_manager = IdempotencyManager()

async def enforce_idempotency(request: Request, action_type: str, body_identifier: Optional[str] = None):
    """
    Extracts Idempotency-Key header or derives a key from action_type + body_identifier.
    Rejects duplicate execution.
    """
    idempotency_key = request.headers.get("Idempotency-Key") or request.headers.get("X-Idempotency-Key")
    if not idempotency_key and body_identifier:
        idempotency_key = f"{action_type}:{body_identifier}"
    
    if not idempotency_key:
        return None
        
    full_key = f"{current_tenant_schema.get() or 'default'}:{action_type}:{idempotency_key}"   # keys never collide across tenants
    
    # Check if previously completed
    cached = await idempotency_manager.get_cached(full_key)
    if cached:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate action rejected: '{action_type}' with key '{idempotency_key}' was already processed."
        )

    # Acquire lock
    acquired = await idempotency_manager.acquire_lock(full_key)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Duplicate action rejected: '{action_type}' is currently in progress."
        )
        
    return full_key
