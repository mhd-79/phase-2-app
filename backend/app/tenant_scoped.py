"""
Tenant-partitioned in-memory containers.

Several routers keep demo data and offline fallbacks in module-level lists / dicts (SEED_VENDORS, _FALLBACK_SALES, ...).
Those are process-wide, so without partitioning one tenant's fallback writes would be visible to every other tenant, and
every new tenant would "inherit" the prototype's demo records.

`TenantList` / `TenantDict` look like a normal list / dict but keep one separate copy per tenant:
  * the default store (no tenant context) gets the original contents, exactly as before;
  * every other tenant starts EMPTY and only ever sees what it wrote itself.
"""
from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, Iterator, List

from app.database import current_tenant_schema


class TenantList:
    def __init__(self, default: Iterable[Any] = ()):
        self._parts: Dict[Any, List[Any]] = {None: list(default)}

    @property
    def _items(self) -> List[Any]:
        return self._parts.setdefault(current_tenant_schema.get(), [])

    # reads
    def __iter__(self) -> Iterator[Any]:
        return iter(list(self._items))

    def __len__(self) -> int:
        return len(self._items)

    def __bool__(self) -> bool:
        return bool(self._items)

    def __getitem__(self, index):
        return self._items[index]

    def __contains__(self, value) -> bool:
        return value in self._items

    def __repr__(self) -> str:
        return f"TenantList({self._items!r})"

    def copy(self) -> List[Any]:
        return list(self._items)

    # writes (always on the current tenant's own copy)
    def append(self, value) -> None:
        self._items.append(value)

    def extend(self, values: Iterable[Any]) -> None:
        self._items.extend(values)

    def insert(self, index: int, value) -> None:
        self._items.insert(index, value)

    def remove(self, value) -> None:
        self._items.remove(value)

    def pop(self, index: int = -1):
        return self._items.pop(index)

    def clear(self) -> None:
        self._items.clear()

    def __setitem__(self, index, value) -> None:
        self._items[index] = value

    def __delitem__(self, index) -> None:
        del self._items[index]


class TenantDict:
    def __init__(self, default: Dict[Any, Any] | None = None):
        self._parts: Dict[Any, Dict[Any, Any]] = {None: dict(default or {})}

    @property
    def _items(self) -> Dict[Any, Any]:
        return self._parts.setdefault(current_tenant_schema.get(), {})

    def __getitem__(self, key):
        return self._items[key]

    def __setitem__(self, key, value) -> None:
        self._items[key] = value

    def __delitem__(self, key) -> None:
        del self._items[key]

    def __contains__(self, key) -> bool:
        return key in self._items

    def __iter__(self):
        return iter(list(self._items))

    def __len__(self) -> int:
        return len(self._items)

    def __bool__(self) -> bool:
        return bool(self._items)

    def get(self, key, default=None):
        return self._items.get(key, default)

    def keys(self):
        return list(self._items.keys())

    def values(self):
        return list(self._items.values())

    def items(self):
        return list(self._items.items())

    def setdefault(self, key, default=None):
        return self._items.setdefault(key, default)

    def update(self, *args, **kwargs) -> None:
        self._items.update(*args, **kwargs)

    def pop(self, key, *default):
        return self._items.pop(key, *default)

    def clear(self) -> None:
        self._items.clear()
