import asyncio
import sys
sys.path.insert(0, ".")
from dotenv import load_dotenv
load_dotenv()

from app.database import db, connect_db, disconnect_db

async def main():
    try:
        print("Connecting to Neon database...")
        await connect_db()
        print("Connected!")
        users = await db.user.find_many()
        print(f"Users in DB count: {len(users)}")
        for u in users:
            print(f"User: {u.username}, role: {u.role}, pin: {u.pin_hash}")
    except Exception as e:
        print(f"DB Error: {type(e).__name__}: {e}")
    finally:
        await disconnect_db()

if __name__ == "__main__":
    asyncio.run(main())
