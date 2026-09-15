import asyncio
from prisma import Prisma

async def test_conn():
    p = Prisma()
    try:
        await p.connect()
        print("SUCCESSFULLY CONNECTED!")
        await p.disconnect()
    except Exception as e:
        print(f"Error connecting: {e}")

asyncio.run(test_conn())
