import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.config import settings # trigger reload
from app.database import connect_db, disconnect_db, db
from app.security import get_pin_hash
from app.routers import auth, catalog, billing, discounts, users, settings as settings_router, reports

DEMO_USERS = [
    {"username": "priya.k", "pin": "1234", "role": "cashier", "full_name": "Priya K.", "sub_text": "Cashier · Counter 1"},
    {"username": "owner.arjun", "pin": "9999", "role": "admin", "full_name": "Arjun M.", "sub_text": "Admin · Store Manager"}
]

DEMO_CATALOG = [
  { "sku": "BEV-001", "barcode": "8901030875021", "name": "Cola 500ml", "category_name": "Beverages", "price": 45.0, "wholesale_price": 38.0, "tax_rate": 12.0, "stock": 86.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "BEV-002", "barcode": "8901030875038", "name": "Orange Juice 1L", "category_name": "Beverages", "price": 110.0, "wholesale_price": 92.0, "tax_rate": 12.0, "stock": 34.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "BEV-003", "barcode": "8901030875045", "name": "Mineral Water 1L", "category_name": "Beverages", "price": 20.0, "wholesale_price": 16.0, "tax_rate": 5.0, "stock": 210.0, "min_stock": 40.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "BEV-004", "barcode": "8901030875052", "name": "Green Tea 25 Bags", "category_name": "Beverages", "price": 165.0, "wholesale_price": 140.0, "tax_rate": 5.0, "stock": 12.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "SNK-001", "barcode": "8901030876141", "name": "Potato Chips 90g", "category_name": "Snacks", "price": 35.0, "wholesale_price": 29.0, "tax_rate": 12.0, "stock": 120.0, "min_stock": 30.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "SNK-002", "barcode": "8901030876158", "name": "Choco Cookies 200g", "category_name": "Snacks", "price": 60.0, "wholesale_price": 50.0, "tax_rate": 18.0, "stock": 8.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "SNK-003", "barcode": "8901030876165", "name": "Salted Peanuts 150g", "category_name": "Snacks", "price": 40.0, "wholesale_price": 33.0, "tax_rate": 12.0, "stock": 55.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "SNK-004", "barcode": "8901030876172", "name": "Popcorn Butter 100g", "category_name": "Snacks", "price": 55.0, "wholesale_price": 46.0, "tax_rate": 12.0, "stock": 42.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "DAI-001", "barcode": "8901030877247", "name": "Toned Milk 500ml", "category_name": "Dairy", "price": 28.0, "wholesale_price": 24.0, "tax_rate": 0.0, "stock": 64.0, "min_stock": 25.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "DAI-002", "barcode": "8901030877254", "name": "Curd Cup 200g", "category_name": "Dairy", "price": 25.0, "wholesale_price": 21.0, "tax_rate": 0.0, "stock": 5.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "DAI-003", "barcode": "8901030877261", "name": "Paneer 200g", "category_name": "Dairy", "price": 90.0, "wholesale_price": 75.0, "tax_rate": 5.0, "stock": 18.0, "min_stock": 10.0, "pricing_method": "weight", "unit": "kg" },
  { "sku": "DAI-004", "barcode": "8901030877278", "name": "Butter 100g", "category_name": "Dairy", "price": 58.0, "wholesale_price": 48.0, "tax_rate": 12.0, "stock": 30.0, "min_stock": 12.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "BAK-001", "barcode": "8901030878350", "name": "White Bread 400g", "category_name": "Bakery", "price": 42.0, "wholesale_price": 35.0, "tax_rate": 5.0, "stock": 27.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "BAK-002", "barcode": "8901030878367", "name": "Brown Bread 400g", "category_name": "Bakery", "price": 48.0, "wholesale_price": 40.0, "tax_rate": 5.0, "stock": 22.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "BAK-003", "barcode": "8901030878374", "name": "Croissant (pc)", "category_name": "Bakery", "price": 35.0, "wholesale_price": 29.0, "tax_rate": 5.0, "stock": 16.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "GRO-001", "barcode": "8901030879456", "name": "Basmati Rice 1kg", "category_name": "Grocery", "price": 135.0, "wholesale_price": 112.0, "tax_rate": 5.0, "stock": 48.0, "min_stock": 15.0, "pricing_method": "weight", "unit": "kg" },
  { "sku": "GRO-002", "barcode": "8901030879463", "name": "Toor Dal 1kg", "category_name": "Grocery", "price": 148.0, "wholesale_price": 124.0, "tax_rate": 5.0, "stock": 33.0, "min_stock": 15.0, "pricing_method": "weight", "unit": "kg" },
  { "sku": "GRO-003", "barcode": "8901030879470", "name": "Sunflower Oil 1L", "category_name": "Grocery", "price": 175.0, "wholesale_price": 148.0, "tax_rate": 5.0, "stock": 40.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "GRO-004", "barcode": "8901030879487", "name": "Sugar 1kg", "category_name": "Grocery", "price": 52.0, "wholesale_price": 43.0, "tax_rate": 5.0, "stock": 60.0, "min_stock": 20.0, "pricing_method": "weight", "unit": "kg" },
  { "sku": "GRO-005", "barcode": "8901030879494", "name": "Wheat Atta 5kg", "category_name": "Grocery", "price": 245.0, "wholesale_price": 205.0, "tax_rate": 5.0, "stock": 21.0, "min_stock": 10.0, "pricing_method": "weight", "unit": "kg" },
  { "sku": "PC-001", "barcode": "8901030880568", "name": "Toothpaste 100g", "category_name": "Personal Care", "price": 65.0, "wholesale_price": 54.0, "tax_rate": 18.0, "stock": 44.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "PC-002", "barcode": "8901030880575", "name": "Shampoo 340ml", "category_name": "Personal Care", "price": 210.0, "wholesale_price": 178.0, "tax_rate": 18.0, "stock": 19.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "PC-003", "barcode": "8901030880582", "name": "Hand Wash 250ml", "category_name": "Personal Care", "price": 95.0, "wholesale_price": 80.0, "tax_rate": 18.0, "stock": 7.0, "min_stock": 12.0, "pricing_method": "qty", "unit": "pcs" },
  { "sku": "PC-004", "barcode": "8901030880599", "name": "Bath Soap (pc)", "category_name": "Personal Care", "price": 38.0, "wholesale_price": 31.0, "tax_rate": 18.0, "stock": 96.0, "min_stock": 25.0, "pricing_method": "qty", "unit": "pcs" }
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
