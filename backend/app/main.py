from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings
from app.security import require_phase2, require_admin
from app.database import connect_db, disconnect_db, db
from app.routers import (
    auth, catalog, billing, discounts, users, settings as settings_router, reports,
    vendors, purchase_orders, grn, purchase_returns, stock_adjustments, batches, reorder_alerts, stock_audit, reports_p2, ai_insights, ai_insights_module, customers
)
from seed import seed_all

@asynccontextmanager
async def lifespan(app: FastAPI):
    db_url = settings.DATABASE_URL
    masked = db_url[:30] + "..." if len(db_url) > 30 else db_url
    print(f"Connecting to database: {masked}")
    await connect_db()
    try:
        from prisma.models import User as _UserModel
        if "phase_access" not in _UserModel.model_fields:
            print("[Startup] WARNING: the generated Prisma client is older than prisma/schema.prisma (User.phase_access is missing). "
                  "Phase 1 / Phase 2 admin restrictions cannot be enforced until you run `prisma generate` and restart the API.")
    except Exception:
        pass
    try:
        await seed_all()
    except Exception as exc:  # DB unreachable / Prisma client or schema out of date: keep the API up so screens can report why
        print(f"[Startup] Database seeding failed ({type(exc).__name__}: {str(exc)[:300]}). "
              "Check DATABASE_URL, then run `prisma generate` and `prisma db push` in backend/.")
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

# Phase 2 APIs: Phase 1 admins (and anonymous callers) are rejected here, for every route of these routers.
PHASE2_ONLY = [Depends(require_phase2)]

app.include_router(auth.router, prefix=settings.API_V1_STR)
app.include_router(catalog.router, prefix=settings.API_V1_STR)
app.include_router(billing.router, prefix=settings.API_V1_STR)
app.include_router(discounts.router, prefix=settings.API_V1_STR)
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(settings_router.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(vendors.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(purchase_orders.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(grn.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(purchase_returns.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(stock_adjustments.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(batches.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(reorder_alerts.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(stock_audit.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(reports_p2.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(ai_insights.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(ai_insights_module.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
# Customer Management: Phase 2 admins only (Phase 1 admins and cashiers get 403)
app.include_router(customers.router, prefix=settings.API_V1_STR, dependencies=[Depends(require_phase2), Depends(require_admin)])


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

