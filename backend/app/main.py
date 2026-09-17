import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings
from app.database import connect_db, disconnect_db, db
from app.security import get_pin_hash
from app.routers import auth, catalog, billing, discounts, users, settings as settings_router, reports

tags_metadata = [
    {
        "name": "Auth",
        "description": "Authentication endpoints for Cashier & Admin staff login via PIN / username."
    },
    {
        "name": "Billing & POS",
        "description": "Point-of-Sale checkout billing, invoice creation, invoice search, returns & refunds, stock deduction, and hold/recall."
    },
    {
        "name": "Catalog",
        "description": "Product master data, SKU catalog management, category management, bulk CSV stock upload template, preview & commit."
    },
    {
        "name": "Reports",
        "description": "Daily Sales (Z-Report), Completed Transactions inspection, Item-wise Sales breakdown, Cash Drawer multi-counter management, Tax summary, and AI Insights."
    },
    {
        "name": "Users",
        "description": "Staff user account administration, PIN management, role access control, Auto-Lock configuration, and audit action logs."
    },
    {
        "name": "Discounts",
        "description": "Promotional discount rule management (flat & percentage rates)."
    },
    {
        "name": "Settings",
        "description": "Store profile configuration (address, GSTIN, pricing mode, idle timeout) and database backup."
    }
]

async def seed_data():
    from seed_db import seed_all_sample_data
    await seed_all_sample_data()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    try:
        await seed_data()
    except Exception as e:
        print(f"Data seed notice: {e}")
    yield
    await disconnect_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Full Swagger/OpenAPI documentation for Greenfield Mart Phase 1 Billing & POS REST API engine. Supports fast checkout, tax breakdown, stock deduction, returns, multi-counter cash drawers, custom categories, stock upload, auto-lock timeouts, and AI best-selling insights.",
    version=settings.VERSION,
    openapi_tags=tags_metadata,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def db_session_middleware(request, call_next):
    if not db.is_connected():
        try:
            await connect_db()
        except Exception as e:
            print(f"DB auto-connect notice: {e}")
    return await call_next(request)

app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(catalog.router, prefix=settings.API_V1_STR)
app.include_router(billing.router, prefix=settings.API_V1_STR)
app.include_router(discounts.router, prefix=settings.API_V1_STR)
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(settings_router.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)

@app.get("/", summary="System Health & API Root", description="Returns API operational status and link to interactive Swagger documentation.")
async def root():
    return {
        "status": "online",
        "app": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "db_connected": db.is_connected()
    }

@app.get(f"{settings.API_V1_STR}/health", summary="DB Health Check")
async def health_check():
    await connect_db()
    users_count = await db.user.count()
    return {
        "status": "healthy",
        "database": "Neon PostgreSQL",
        "db_connected": db.is_connected(),
        "users_count": users_count
    }

