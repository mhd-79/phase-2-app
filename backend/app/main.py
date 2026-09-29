from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.database import connect_db, disconnect_db, db
from app.routers import auth, catalog, billing, discounts, users, settings as settings_router, reports
from seed_db import seed_all_sample_data

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_url = settings.DATABASE_URL
    masked = db_url[:30] + "..." if len(db_url) > 30 else db_url
    print(f"Connecting to database: {masked}")
    await connect_db()
    try:
        await seed_all_sample_data()
    except Exception as e:
        print(f"Data seed notice: {e}")
    yield
    await disconnect_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(catalog.router, prefix=settings.API_V1_STR)
app.include_router(billing.router, prefix=settings.API_V1_STR)
app.include_router(discounts.router, prefix=settings.API_V1_STR)
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(settings_router.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)

@app.get("/")
async def root():
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs"
    }

@app.get(f"{settings.API_V1_STR}/health")
@app.get("/health")
async def health():
    db_connected = db.is_connected()
    user_count = None
    if db_connected:
        try:
            user_count = await db.user.count()
        except Exception:
            pass
    return {
        "status": "healthy",
        "database": "Railway PostgreSQL",
        "db_connected": db_connected,
        "users_count": user_count,
        "user_count": user_count
    }

