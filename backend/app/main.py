from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager

from app.config import settings
from app.security import require_module, require_phase2, require_admin
from app.database import connect_db, disconnect_db, db
from app.tenant_middleware import TenantContextMiddleware
from app import platform_service, tenancy
from app.routers import super_admin, platform_public
from app.routers import (
    auth, catalog, billing, discounts, users, settings as settings_router, reports,
    vendors, purchase_orders, grn, purchase_returns, stock_adjustments, batches, reorder_alerts, stock_audit, reports_p2, ai_insights, ai_insights_module, ai_chatbot, customers
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
    # Platform control plane: default plans / default tenant / bootstrap Super Admin, saved settings, background sweeper
    sweeper = None
    try:
        await platform_service.ensure_platform_ready()
        await super_admin.load_platform_settings()
        sweeper = asyncio.create_task(platform_service.sweeper_loop())
    except Exception as exc:  # the control tables may not exist yet (run `prisma generate` + `prisma db push`); the store itself keeps working
        print(f"[Startup] Platform setup failed ({type(exc).__name__}: {str(exc)[:300]}). "
              "Run `prisma generate` and `prisma db push` in backend/ to create the Super Admin / tenant tables.")
    yield
    if sweeper:
        sweeper.cancel()
    await tenancy.pool.close()
    await disconnect_db()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

# Pins each request to its tenant's database schema. Added BEFORE CORS so CORS stays outermost and the browser can
# still read the 402/403 answers this middleware produces.
app.add_middleware(TenantContextMiddleware)

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
# Super Admin platform (tenants, invitations, subscriptions) and the public / tenant-facing platform APIs
app.include_router(super_admin.router, prefix=settings.API_V1_STR)
app.include_router(platform_public.public_router, prefix=settings.API_V1_STR)
app.include_router(platform_public.subscriptions_router, prefix=settings.API_V1_STR)
app.include_router(platform_public.notifications_router, prefix=settings.API_V1_STR)
app.include_router(catalog.router, prefix=settings.API_V1_STR)
app.include_router(billing.router, prefix=settings.API_V1_STR)
app.include_router(discounts.router, prefix=settings.API_V1_STR)
app.include_router(users.router, prefix=settings.API_V1_STR)
app.include_router(settings_router.router, prefix=settings.API_V1_STR)
app.include_router(reports.router, prefix=settings.API_V1_STR)
app.include_router(vendors.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("vendors", "purchase_orders", "purchase_returns"))])
app.include_router(purchase_orders.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("purchase_orders"))])
app.include_router(grn.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("purchase_orders"))])
app.include_router(purchase_returns.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("purchase_returns"))])
app.include_router(stock_adjustments.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(batches.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
app.include_router(reorder_alerts.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("reorder_alerts"))])
app.include_router(stock_audit.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("physical_audit"))])
app.include_router(reports_p2.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("reports"))])
app.include_router(ai_insights.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY + [Depends(require_module("reports", "ai_insights"))])
app.include_router(ai_insights_module.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
# OKUTO IQ chatbot (Phase 2 admins only; AI_CHATBOT_ENABLED=false switches it off without touching anything else)
app.include_router(ai_chatbot.router, prefix=settings.API_V1_STR, dependencies=PHASE2_ONLY)
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

