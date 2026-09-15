import asyncio
import asyncpg

async def test():
    users = ["pos_user", "postgres"]
    passwords = ["pos_password", "postgres", "admin", "root", "123456", "password", "1234", ""]
    databases = ["pos_db", "postgres"]
    
    for u in users:
        for p in passwords:
            for db in databases:
                try:
                    conn = await asyncpg.connect(user=u, password=p, database=db, host="localhost", port=5432)
                    print(f"SUCCESS! user='{u}', password='{p}', database='{db}'")
                    await conn.close()
                    return u, p, db
                except Exception as e:
                    pass
    print("No combination worked.")
    return None

asyncio.run(test())
