# Claude Code — project context

## Project: Okuto Mart POS & Billing System (Phase 1)

A full-stack Indian retail Point-of-Sale and billing application. The system supports cashier and admin roles, offline-first PWA operation, GST tax calculations (inclusive/exclusive), inventory management, returns, held bills, Z-reports, and user shift scheduling.

---

## PERMANENT PROJECT RULES

1. **PROJECT REFERENCE** — Use the provided SRS document and `phase-1-prototype.zip` as primary references. Follow the existing prototype's UI, UX, screens, navigation, workflows, styling, components, and terminology. Do not invent new workflows when an existing prototype workflow already exists.

2. **SURGICAL CHANGES ONLY** — Make only the changes explicitly requested. Do NOT redesign, remove functionality, rename existing screens/buttons/routes/variables/APIs/tables/components unless explicitly asked. Do NOT modify unrelated files. Preserve all working features. Identify exactly which files are relevant and modify only those.

3. **TECH STACK — DO NOT CHANGE**
   - **Frontend:** Angular 22, TypeScript, Angular Material, Tailwind CSS, Angular CDK Layout, PWA
   - **Backend:** Python 3.12+, FastAPI, Pydantic v2, Prisma ORM, Alembic
   - **Database:** PostgreSQL 16+, Neon DB
   - **Cloud/Deploy:** Microsoft Azure, Railway, GitHub Actions / Azure DevOps CI/CD

---

## Architecture Overview

```
phase 1 app/
├── backend/          # FastAPI Python backend
├── frontend/         # Angular 19 PWA frontend
├── CLAUDE.md
├── RAILWAY_DEPLOYMENT_GUIDE.md
└── phase-1-prototype.zip
```

**Deployment:** Railway (separate backend + frontend services). No docker-compose. Backend: Python 3.12-slim + Uvicorn. Frontend: Node 22 Alpine build + Nginx Alpine serve.

---

## Frontend

**Tech:** Angular 19, standalone components (no NgModules), Angular Signals, PWA (Service Worker), hash location strategy.

**Package:** `okuto-billing-frontend` v1.0.0 → Angular project named `greenfield-mart-pos`

### Key Files
- [frontend/src/app/app.config.ts](frontend/src/app/app.config.ts) — root providers: Router (hash strategy), HttpClient with interceptors, Service Worker
- [frontend/src/app/app.routes.ts](frontend/src/app/app.routes.ts) — all route definitions (lazy-loaded standalone components)
- [frontend/src/app/app.component.ts](frontend/src/app/app.component.ts) — root shell

### Route Map
| Path | Role | Component |
|------|------|-----------|
| `/login` | Public | LoginComponent |
| `/pos` | Cashier | PosComponent |
| `/hold-bills` | Cashier | HoldBillsComponent |
| `/returns` | Cashier | ReturnsComponent |
| `/receipt` | Cashier | ReceiptComponent |
| `/reports` | Admin | ReportsComponent |
| `/items-stock` | Admin | ItemsStockComponent |
| `/stock-upload` | Admin | StockUploadComponent |
| `/store-settings` | Admin | StoreSettingsComponent |
| `/tax-settings` | Admin | TaxSettingsComponent |
| `/users` | Admin | UsersComponent |
| `/discounts` | Admin | DiscountsComponent |
| `**` | — | Redirect to `/login` |

Default redirect: `''` → `/login`. Admin routes guarded by `adminGuard`.

### Core Services (`frontend/src/app/core/services/`)
| Service | Purpose |
|---------|---------|
| [auth.service.ts](frontend/src/app/core/services/auth.service.ts) | Signals-based auth; PIN login; role checks (`isAdmin`, `isCashier`); screen lock/unlock; stores profile in localStorage |
| [billing.service.ts](frontend/src/app/core/services/billing.service.ts) | Signals-based cart engine; subtotal, discounts, GST (inclusive/exclusive), grand total, held bills, sales history; persists to localStorage |
| [catalog.service.ts](frontend/src/app/core/services/catalog.service.ts) | Signals-based product catalog and categories; ships 24 default products across 6 categories |
| [offline-storage.service.ts](frontend/src/app/core/services/offline-storage.service.ts) | Thin localStorage wrapper with JSON serialization |

### Auth Interceptor
[frontend/src/app/core/interceptors/auth.interceptor.ts](frontend/src/app/core/interceptors/auth.interceptor.ts) — reads `pos_token` (JWT), `pos_role`, `pos_active_user` from localStorage and attaches:
- `Authorization: Bearer <token>`
- `X-User-Role: <role>`
- `X-Username: <username>`

### Environment Config
- **dev:** `http://localhost:8000/api/v1` (or Railway URL if not on localhost)
- **prod:** `https://okuto-billing-production-8a3c.up.railway.app/api/v1`

---

## Backend

**Tech:** FastAPI 0.110+, Python 3.12, Uvicorn, Prisma ORM (async), JWT auth (python-jose HS256), PBKDF2-SHA256 PIN hashing (passlib)

### Key Files
| File | Purpose |
|------|---------|
| [backend/app/main.py](backend/app/main.py) | FastAPI app, CORS, middleware, router inclusion, lifespan |
| [backend/app/config.py](backend/app/config.py) | Pydantic Settings: env vars, JWT config, API prefix `/api/v1` |
| [backend/app/database.py](backend/app/database.py) | Prisma client singleton, async connect/disconnect with retry |
| [backend/app/security.py](backend/app/security.py) | PIN hashing, JWT create/validate, `get_current_user`, `require_admin` |
| [backend/app/schemas.py](backend/app/schemas.py) | All Pydantic request/response models |
| [backend/app/pricing_engine.py](backend/app/pricing_engine.py) | Cart total calculation, GST (inclusive/exclusive), discount application, receipt HTML generation |
| [backend/app/idempotency.py](backend/app/idempotency.py) | In-memory idempotency manager for duplicate checkout prevention |
| [backend/app/azure_services.py](backend/app/azure_services.py) | Azure Blob Storage upload, Key Vault secret retrieval |
| [backend/app/celery_app.py](backend/app/celery_app.py) | Celery config (Redis broker/backend — optional async tasks) |

### API Routers (`backend/app/routers/`)
All endpoints prefixed with `/api/v1`:

| Router | Prefix | Key Endpoints |
|--------|--------|---------------|
| [auth.py](backend/app/routers/auth.py) | `/auth` | `POST /login`, `POST /forgot-pin`, `GET /me` |
| [billing.py](backend/app/routers/billing.py) | `/billing` | `GET /counters`, `POST /calculate-totals`, `POST /checkout`, `POST /hold`, `GET /recall`, `POST /return`, `GET /receipt/{id}` |
| [catalog.py](backend/app/routers/catalog.py) | `/catalog` | Items CRUD, categories CRUD, `GET /csv-template`, `POST /csv-upload/preview`, `POST /csv-upload/commit` |
| [discounts.py](backend/app/routers/discounts.py) | `/discounts` | Full CRUD for discount rules |
| [users.py](backend/app/routers/users.py) | `/users` | CRUD, PIN reset, shift scheduling, leave management, audit log, PIN reset requests |
| [settings.py](backend/app/routers/settings.py) | `/settings` | `GET/PUT /store`, `GET /backup` |
| [reports.py](backend/app/routers/reports.py) | `/reports` | `GET /z-report`, `GET /transactions`, `GET /item-sales`, `GET /cash-counters`, `POST/PUT /cash-counters`, `GET /ai-insights` |

### Auth & Security
- **PIN hashing:** PBKDF2-SHA256 via passlib (auto-upgrades legacy bcrypt/SHA-256 PINs on login)
- **JWT:** HS256, 12-hour expiry
- **`get_current_user`:** validates Bearer JWT first, then falls back to `X-Username`/`X-User-Role` headers
- **`require_admin`:** FastAPI dependency enforcing `role == "admin"`
- **Roles:** `admin`, `cashier`

### CORS
Allows Railway app domains + `localhost:4200/8000`, with `allow_origin_regex` for all `*.railway.app`.

---

## Database

**ORM:** Prisma Client Python (async). Schema: [backend/prisma/schema.prisma](backend/prisma/schema.prisma). **DB:** Neon Serverless PostgreSQL (SSL required).

### Schema Models
| Model | Key Fields |
|-------|-----------|
| `User` | id (UUID), username (unique), pin_hash, role (admin/cashier), full_name, sub_text, auto_lock_minutes, is_active |
| `Category` | id (UUID), name (unique) |
| `Item` | sku (PK), barcode, name, category_name, price, wholesale_price, cost_price, tax_rate, stock, min_stock, pricing_method (qty/weight), unit (pcs/kg), is_active |
| `Discount` | id, name, type (percent/flat), value, applies_to (all/selected), product_skus (JSON string), start_date, end_date, status |
| `Sale` | id, invoice_no (unique, `INV-FY26-XXXXX`), created_by_username, time, pricing_mode (exclusive/inclusive), subtotal_original, discount totals, taxable_total, gst_total, grand_total, status (COMPLETED/RETURNED/PARTIALLY_RETURNED), counter_name |
| `SaleItem` | id, sale_id, sku, name, price, tax_rate, qty, unit, pricing_method, original/discount/taxable/gst/final amounts |
| `SaleTender` | id, sale_id, mode (Cash/Card/UPI), amount |
| `SaleReturn` | id, return_no (unique, `RET-FY26-XXXXX`), invoice_no, sale_id, total_refund, reason |
| `ReturnItem` | id, return_id, sku, qty, refund_amount |
| `HeldBill` | id, held_id (unique), created_by_username, lines_json, discount_json, item_count, total |
| `StoreSettings` | id="store_main", store_name, address, phone, gstin, pricing_mode, idle_timeout_seconds |
| `AuditLog` | id, username, action, details_json, timestamp |
| `CashCounter` | id, counter_name (unique), opening_float, counted_cash, notes, is_active |
| `UserShiftSchedule` | id, username, day_of_week, is_working, start_time, end_time; unique(username, day_of_week) |
| `UserLeave` | id, username, leave_date, reason, created_by; unique(username, leave_date) |
| `PinResetRequest` | id, username, status (PENDING/RESOLVED/REJECTED), reason, requested_at, resolved_at, resolved_by |

**Migrations:** Prisma CLI. `docker-entrypoint.sh` runs `npx prisma migrate deploy` on container start.

---

## Deployment

### Backend Docker ([backend/Dockerfile](backend/Dockerfile))
- Base: `python:3.12-slim`
- Installs libatomic1, openssl, ca-certificates, curl
- `pip install -r requirements.txt`
- Build-time: `python -m prisma generate` + `python -m prisma py fetch`
- Entrypoint: [backend/docker-entrypoint.sh](backend/docker-entrypoint.sh) — runs `prisma migrate deploy`, optional seed
- CMD: `uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}`

### Frontend Docker ([frontend/Dockerfile](frontend/Dockerfile))
- Stage 1 (build): `node:22-alpine` → `npm run build` → `dist/greenfield-mart-pos-angular/browser`
- Stage 2 (serve): `nginx:alpine` with dynamic `$PORT` templating

### Nginx ([frontend/nginx.conf](frontend/nginx.conf))
- Listens on `${PORT}` (Railway dynamic port)
- Gzip enabled
- Reverse-proxies `/api/` to the Railway backend URL
- SPA fallback: `try_files $uri $uri/ /index.html`
- 1-year cache for static assets

### Environment Variables (Backend)
| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | Neon PostgreSQL connection string | Yes |
| `SECRET_KEY` | JWT signing key | Yes (insecure hardcoded default — change in prod) |
| `REDIS_URL` | Redis for Celery (default: `redis://localhost:6379/0`) | No |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob backup upload | No |
| `AZURE_KEYVAULT_URL` | Azure Key Vault secret retrieval | No |
| `RUN_SEED` | If `true`, seeds DB on container start | No |

---

## Key Dependencies

### Backend (`backend/requirements.txt`)
- `fastapi>=0.110.0`, `uvicorn[standard]>=0.28.0`, `pydantic>=2.6.0`, `pydantic-settings>=2.2.0`
- `prisma>=0.13.0` (async ORM)
- `passlib[bcrypt]>=1.7.4` (PIN hashing), `python-jose[cryptography]>=3.3.0` (JWT)
- `python-multipart>=0.0.9` (file uploads)
- `celery>=5.3.6`, `redis>=5.0.3` (background tasks)
- `azure-storage-blob>=12.19.0`, `azure-identity>=1.15.0`, `azure-keyvault-secrets>=4.8.0`, `opencensus-ext-azure>=1.1.13`
- `pytest>=8.0.0`, `httpx>=0.27.0` (testing)

### Frontend (`frontend/package.json`)
- `@angular/core` ^19.0.0 + platform-browser, router, forms, common/http, cdk, service-worker
- `rxjs ~7.8.0`, `zone.js ~0.15.0`

---

## Tests

Backend tests in [backend/tests/](backend/tests/):
- `test_auth_pin_reset.py` — PIN reset flow
- `test_billing.py` — checkout/billing logic
- `test_idempotency.py` — duplicate request prevention

Seed script: [backend/seed_db.py](backend/seed_db.py)

---

<!-- cloude-code-toolbox:mcp-skills-awareness-begin -->

### MCP & Skills awareness (Cloude Code ToolBox)

_Last synced: 2026-09-14T08:48:46.854Z._

- **Full report:** `.claude/cloude-code-toolbox-mcp-skills-awareness.md` in this workspace (auto-overwritten on each scan). Use it as ground truth for configured servers and skill folders.
- **MCP:** For **live tools** in Claude Code, enable the matching server via `/mcp`. Servers are configured in `~/.claude.json` (user) and `.mcp.json` (project).
- **When the user's task matches a server** (e.g. Confluence work and a **Confluence** / **Atlassian** MCP is listed), **prefer that server id** and plan on tool use—not only file search.
- **Skills:** Folders below contain `SKILL.md`; attach or cite paths in chat when relevant.

#### Workspace MCP

- `c:\Yunus\Internship\Billing Software\phase 1 app\.mcp.json` _(workspace: phase 1 app)_ — _file missing_

_No active workspace servers in mcp.json._

#### User MCP

- `C:\Users\Asus\.claude.json` — _no servers defined_

_No active user-scoped servers in mcp.json._

#### Project skills

_None found (or no workspace open)._

#### User skills

- **developing-with-streamlit** — `C:\Users\Asus\.agents\skills\developing-with-streamlit` — Use for ALL Streamlit tasks: creating, editing, debugging, beautifying, styling, theming, optimizing, or deploying Streamlit apps. Also custom components, st.components.v2, HTML/JS/CSS work. Discovers and loads version-m

<!-- cloude-code-toolbox:mcp-skills-awareness-end -->
