"""Small in-memory sliding-window limiter for unauthenticated platform endpoints (login, invitations, public requests)."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Deque, Dict

from fastapi import HTTPException, status


class RateLimiter:
    def __init__(self, max_calls: int, window_seconds: float, label: str = "attempts"):
        self.max_calls = max_calls
        self.window = window_seconds
        self.label = label
        self._hits: Dict[str, Deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> Deque[float]:
        q = self._hits[key]
        while q and now - q[0] > self.window:
            q.popleft()
        if not q:
            self._hits.pop(key, None)
            return self._hits[key]
        return q

    def hit(self, key: str) -> None:
        """Count one attempt and refuse (429) once the window is full."""
        now = time.monotonic()
        q = self._prune(key, now)
        if len(q) >= self.max_calls:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                                detail=f"Too many {self.label}. Please wait a few minutes and try again.")
        q.append(now)

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)


login_limiter = RateLimiter(8, 300, "sign-in attempts")
invitation_limiter = RateLimiter(20, 300, "invitation attempts")
request_limiter = RateLimiter(5, 3600, "registration requests")
forgot_limiter = RateLimiter(5, 900, "password reset requests")
