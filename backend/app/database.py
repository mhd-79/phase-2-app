import os
import app.config # Ensures DATABASE_URL is set in os.environ

try:
    from app.generated.prisma import Prisma
except ImportError:
    from prisma import Prisma

db = Prisma()

import asyncio

_db_lock = asyncio.Lock()

async def connect_db():
    if db.is_connected():
        return
    async with _db_lock:
        if not db.is_connected():
            try:
                await db.connect()
            except Exception as e:
                print(f"Prisma connection notice: {e}", flush=True)
                try:
                    if db.is_connected():
                        await db.disconnect()
                except:
                    pass
                if not db.is_connected():
                    await db.connect()

async def disconnect_db():
    try:
        if db.is_connected():
            await db.disconnect()
    except Exception:
        pass

