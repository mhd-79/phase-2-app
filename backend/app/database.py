import os
import app.config # Ensures DATABASE_URL is set in os.environ

try:
    from app.generated.prisma import Prisma
except ImportError:
    from prisma import Prisma

db = Prisma()

import asyncio

_db_lock = asyncio.Lock()

async def connect_db(max_retries: int = 4, retry_delay: float = 1.0):
    if db.is_connected():
        return
    async with _db_lock:
        if db.is_connected():
            return
        for attempt in range(1, max_retries + 1):
            try:
                await db.connect()
                return
            except Exception as e:
                try:
                    if db.is_connected():
                        await db.disconnect()
                except Exception:
                    pass
                if attempt < max_retries:
                    await asyncio.sleep(retry_delay)
                else:
                    print(f"Prisma connection notice (retries exhausted): {e}", flush=True)
                    raise e

async def disconnect_db():
    try:
        if db.is_connected():
            await db.disconnect()
    except Exception:
        pass

