try:
    from app.generated.prisma import Prisma
except ImportError:
    from prisma import Prisma

db = Prisma()

async def connect_db():
    if not db.is_connected():
        try:
            await db.connect()
            print("Connected to PostgreSQL database successfully.")
        except Exception as e:
            print(f"[Database] Could not connect to PostgreSQL ({e}). Operating in memory / fallback mode.")

async def disconnect_db():
    try:
        if db.is_connected():
            await db.disconnect()
    except Exception:
        pass

def get_db():
    return db
