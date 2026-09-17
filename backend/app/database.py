import os
import app.config # Ensures DATABASE_URL is set in os.environ

try:
    from app.generated.prisma import Prisma
except ImportError:
    from prisma import Prisma

db = Prisma()

async def connect_db():
    try:
        if not db.is_connected():
            await db.connect()
    except Exception as e:
        print(f"Prisma connection notice: {e}")
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

