try:
    from app.generated.prisma import Prisma
except ImportError:
    from prisma import Prisma

db = Prisma()

async def connect_db():
    if not db.is_connected():
        await db.connect()
        print("Connected to Railway PostgreSQL database successfully.")

async def disconnect_db():
    try:
        if db.is_connected():
            await db.disconnect()
    except Exception:
        pass

def get_db():
    return db
