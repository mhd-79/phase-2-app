import asyncio
import json
from copy import deepcopy
from datetime import datetime, timedelta
from dotenv import load_dotenv
load_dotenv()

from app.database import db, connect_db, disconnect_db
from app.security import get_pin_hash

DEMO_USERS = [
    {"username": "owner.arjun", "pin": "9999", "role": "admin", "full_name": "Arjun M.", "sub_text": "Admin · Store Manager", "auto_lock_minutes": 15, "is_active": True},
    {"username": "priya.k", "pin": "1234", "role": "cashier", "full_name": "Priya K.", "sub_text": "Cashier · Counter 1", "auto_lock_minutes": 2, "is_active": True},
    {"username": "ravi.s", "pin": "2345", "role": "cashier", "full_name": "Ravi S.", "sub_text": "Cashier · Counter 2", "auto_lock_minutes": 2, "is_active": True},
    {"username": "meena.t", "pin": "3456", "role": "cashier", "full_name": "Meena T.", "sub_text": "Relief Cashier", "auto_lock_minutes": 2, "is_active": False}
]

DEMO_CATEGORIES = [
    "Beverages", "Snacks", "Dairy", "Bakery", "Grocery", "Personal Care"
]

DEMO_CATALOG = [
    { "sku": "BEV-001", "barcode": "8901030875021", "name": "Cola 500ml", "category_name": "Beverages", "price": 45.0, "wholesale_price": 38.0, "cost_price": 31.5, "tax_rate": 12.0, "stock": 86.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "BEV-002", "barcode": "8901030875038", "name": "Orange Juice 1L", "category_name": "Beverages", "price": 110.0, "wholesale_price": 92.0, "cost_price": 77.0, "tax_rate": 12.0, "stock": 34.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "BEV-003", "barcode": "8901030875045", "name": "Mineral Water 1L", "category_name": "Beverages", "price": 20.0, "wholesale_price": 16.0, "cost_price": 14.0, "tax_rate": 5.0, "stock": 210.0, "min_stock": 40.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "BEV-004", "barcode": "8901030875052", "name": "Green Tea 25 Bags", "category_name": "Beverages", "price": 165.0, "wholesale_price": 140.0, "cost_price": 115.5, "tax_rate": 5.0, "stock": 12.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "SNK-001", "barcode": "8901030876141", "name": "Potato Chips 90g", "category_name": "Snacks", "price": 35.0, "wholesale_price": 29.0, "cost_price": 24.5, "tax_rate": 12.0, "stock": 120.0, "min_stock": 30.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "SNK-002", "barcode": "8901030876158", "name": "Choco Cookies 200g", "category_name": "Snacks", "price": 60.0, "wholesale_price": 50.0, "cost_price": 42.0, "tax_rate": 18.0, "stock": 8.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "SNK-003", "barcode": "8901030876165", "name": "Salted Peanuts 150g", "category_name": "Snacks", "price": 40.0, "wholesale_price": 33.0, "cost_price": 28.0, "tax_rate": 12.0, "stock": 55.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "SNK-004", "barcode": "8901030876172", "name": "Popcorn Butter 100g", "category_name": "Snacks", "price": 55.0, "wholesale_price": 46.0, "cost_price": 38.5, "tax_rate": 12.0, "stock": 42.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "DAI-001", "barcode": "8901030877247", "name": "Toned Milk 500ml", "category_name": "Dairy", "price": 28.0, "wholesale_price": 24.0, "cost_price": 19.6, "tax_rate": 0.0, "stock": 64.0, "min_stock": 25.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "DAI-002", "barcode": "8901030877254", "name": "Curd Cup 200g", "category_name": "Dairy", "price": 25.0, "wholesale_price": 21.0, "cost_price": 17.5, "tax_rate": 0.0, "stock": 5.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "DAI-003", "barcode": "8901030877261", "name": "Paneer 200g", "category_name": "Dairy", "price": 90.0, "wholesale_price": 75.0, "cost_price": 63.0, "tax_rate": 5.0, "stock": 18.0, "min_stock": 10.0, "pricing_method": "weight", "unit": "kg" },
    { "sku": "DAI-004", "barcode": "8901030877278", "name": "Butter 100g", "category_name": "Dairy", "price": 58.0, "wholesale_price": 48.0, "cost_price": 40.6, "tax_rate": 12.0, "stock": 30.0, "min_stock": 12.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "BAK-001", "barcode": "8901030878350", "name": "White Bread 400g", "category_name": "Bakery", "price": 42.0, "wholesale_price": 35.0, "cost_price": 29.4, "tax_rate": 5.0, "stock": 27.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "BAK-002", "barcode": "8901030878367", "name": "Brown Bread 400g", "category_name": "Bakery", "price": 48.0, "wholesale_price": 40.0, "cost_price": 33.6, "tax_rate": 5.0, "stock": 22.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "BAK-003", "barcode": "8901030878374", "name": "Croissant (pc)", "category_name": "Bakery", "price": 35.0, "wholesale_price": 29.0, "cost_price": 24.5, "tax_rate": 5.0, "stock": 16.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "GRO-001", "barcode": "8901030879456", "name": "Basmati Rice 1kg", "category_name": "Grocery", "price": 135.0, "wholesale_price": 112.0, "cost_price": 94.5, "tax_rate": 5.0, "stock": 48.0, "min_stock": 15.0, "pricing_method": "weight", "unit": "kg" },
    { "sku": "GRO-002", "barcode": "8901030879463", "name": "Toor Dal 1kg", "category_name": "Grocery", "price": 148.0, "wholesale_price": 124.0, "cost_price": 103.6, "tax_rate": 5.0, "stock": 33.0, "min_stock": 15.0, "pricing_method": "weight", "unit": "kg" },
    { "sku": "GRO-003", "barcode": "8901030879470", "name": "Sunflower Oil 1L", "category_name": "Grocery", "price": 175.0, "wholesale_price": 148.0, "cost_price": 122.5, "tax_rate": 5.0, "stock": 40.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "GRO-004", "barcode": "8901030879487", "name": "Sugar 1kg", "category_name": "Grocery", "price": 52.0, "wholesale_price": 43.0, "cost_price": 36.4, "tax_rate": 5.0, "stock": 60.0, "min_stock": 20.0, "pricing_method": "weight", "unit": "kg" },
    { "sku": "GRO-005", "barcode": "8901030879494", "name": "Wheat Atta 5kg", "category_name": "Grocery", "price": 245.0, "wholesale_price": 205.0, "cost_price": 171.5, "tax_rate": 5.0, "stock": 21.0, "min_stock": 10.0, "pricing_method": "weight", "unit": "kg" },
    { "sku": "PC-001", "barcode": "8901030880568", "name": "Toothpaste 100g", "category_name": "Personal Care", "price": 65.0, "wholesale_price": 54.0, "cost_price": 45.5, "tax_rate": 18.0, "stock": 44.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "PC-002", "barcode": "8901030880575", "name": "Shampoo 340ml", "category_name": "Personal Care", "price": 210.0, "wholesale_price": 178.0, "cost_price": 147.0, "tax_rate": 18.0, "stock": 19.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "PC-003", "barcode": "8901030880582", "name": "Hand Wash 250ml", "category_name": "Personal Care", "price": 95.0, "wholesale_price": 80.0, "cost_price": 66.5, "tax_rate": 18.0, "stock": 7.0, "min_stock": 12.0, "pricing_method": "qty", "unit": "pcs" },
    { "sku": "PC-004", "barcode": "8901030880599", "name": "Bath Soap (pc)", "category_name": "Personal Care", "price": 38.0, "wholesale_price": 31.0, "cost_price": 26.6, "tax_rate": 18.0, "stock": 96.0, "min_stock": 25.0, "pricing_method": "qty", "unit": "pcs" }
]

# These are the five additional items supplied by the prototype stock-upload sample.
DEMO_UPLOAD_ITEMS = [
    {"sku": "BEV-005", "barcode": "8901030875069", "name": "Lemon Iced Tea 500ml", "category_name": "Beverages", "price": 55.0, "cost_price": 32.0, "tax_rate": 12.0, "stock": 60.0, "min_stock": 12.0, "pricing_method": "qty", "unit": "pcs"},
    {"sku": "SNK-005", "barcode": "8901030876189", "name": "Trail Mix 120g", "category_name": "Snacks", "price": 70.0, "cost_price": 38.0, "tax_rate": 12.0, "stock": 45.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs"},
    {"sku": "DAI-005", "barcode": "8901030877285", "name": "Greek Yogurt 100g", "category_name": "Dairy", "price": 39.0, "cost_price": 22.0, "tax_rate": 0.0, "stock": 80.0, "min_stock": 16.0, "pricing_method": "qty", "unit": "pcs"},
    {"sku": "GRO-006", "barcode": "8901030879500", "name": "Red Kidney Beans 500g", "category_name": "Grocery", "price": 89.0, "cost_price": 48.0, "tax_rate": 5.0, "stock": 36.0, "min_stock": 10.0, "pricing_method": "weight", "unit": "kg"},
    {"sku": "PC-005", "barcode": "8901030880605", "name": "Face Wash 100ml", "category_name": "Personal Care", "price": 149.0, "cost_price": 72.0, "tax_rate": 18.0, "stock": 25.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs"}
]

DEMO_DISCOUNTS = [
    {
        "name": "Festive Weekend 10% Off",
        "type": "percent",
        "value": 10.0,
        "applies_to": "all",
        "product_skus": "[]",
        "start_date": "2026-09-01",
        "end_date": "2026-09-30",
        "status": "active"
    },
    {
        "name": "Dairy Special 5% Off",
        "type": "percent",
        "value": 5.0,
        "applies_to": "selected",
        "product_skus": json.dumps(["DAI-001", "DAI-002", "DAI-003", "DAI-004"]),
        "start_date": "2026-09-01",
        "end_date": "2026-09-15",
        "status": "active"
    },
    {
        "name": "Bakery Flat ₹10 Off",
        "type": "flat",
        "value": 10.0,
        "applies_to": "selected",
        "product_skus": json.dumps(["BAK-001", "BAK-002", "BAK-003"]),
        "start_date": "2026-08-01",
        "end_date": "2026-08-31",
        "status": "inactive"
    }
]

DEMO_STORE = {
    "id": "store_main",
    "store_name": "Okuto Mart",
    "address": "12, MG Road, Bengaluru, Karnataka 560001",
    "phone": "+91 98450 12345",
    "gstin": "29ABCDE1234F1Z5",
    "pricing_mode": "exclusive",
    "idle_timeout_seconds": 45
}

DEMO_HELD_BILLS = [
    {
        "held_id": "HOLD-3341",
        "created_by_username": "ravi.s",
        "lines_json": json.dumps([
            {"sku": "BEV-001", "name": "Cola 500ml", "price": 45.0, "tax_rate": 12.0, "qty": 2, "unit": "pcs", "pricing_method": "qty"},
            {"sku": "SNK-001", "name": "Potato Chips 90g", "price": 35.0, "tax_rate": 12.0, "qty": 1, "unit": "pcs", "pricing_method": "qty"}
        ]),
        "discount_json": json.dumps({"type": "percent", "value": 0}),
        "item_count": 3.0,
        "total": 140.0
    }
]

DEMO_SALES = [
    {
        "invoice_no": "INV-FY26-01031",
        "created_by_username": "priya.k",
        "pricing_mode": "exclusive",
        "subtotal_original": 540.0,
        "auto_discount_total": 0.0,
        "manual_discount_total": 0.0,
        "discount_total": 0.0,
        "taxable_total": 482.14,
        "gst_total": 57.86,
        "grand_total": 540.0,
        "status": "COMPLETED",
        "items": [
            {"sku": "BEV-001", "name": "Cola 500ml", "price": 45.0, "tax_rate": 12.0, "qty": 4, "unit": "pcs", "pricing_method": "qty", "original_amount": 180.0, "discount_amount": 0.0, "taxable_amount": 160.71, "gst_amount": 19.29, "final_amount": 180.0},
            {"sku": "SNK-001", "name": "Potato Chips 90g", "price": 35.0, "tax_rate": 12.0, "qty": 6, "unit": "pcs", "pricing_method": "qty", "original_amount": 210.0, "discount_amount": 0.0, "taxable_amount": 187.50, "gst_amount": 22.50, "final_amount": 210.0},
            {"sku": "DAI-001", "name": "Toned Milk 500ml", "price": 30.0, "tax_rate": 0.0, "qty": 5, "unit": "pcs", "pricing_method": "qty", "original_amount": 150.0, "discount_amount": 0.0, "taxable_amount": 150.00, "gst_amount": 0.00, "final_amount": 150.0}
        ],
        "tenders": [
            {"mode": "Cash", "amount": 540.0}
        ]
    },
    {
        "invoice_no": "INV-FY26-01032",
        "created_by_username": "ravi.s",
        "pricing_mode": "exclusive",
        "subtotal_original": 1200.0,
        "auto_discount_total": 0.0,
        "manual_discount_total": 0.0,
        "discount_total": 0.0,
        "taxable_total": 1142.86,
        "gst_total": 57.14,
        "grand_total": 1200.0,
        "status": "COMPLETED",
        "items": [
            {"sku": "GRO-001", "name": "Basmati Rice 1kg", "price": 135.0, "tax_rate": 5.0, "qty": 5, "unit": "kg", "pricing_method": "weight", "original_amount": 675.0, "discount_amount": 0.0, "taxable_amount": 642.86, "gst_amount": 32.14, "final_amount": 675.0},
            {"sku": "GRO-003", "name": "Sunflower Oil 1L", "price": 175.0, "tax_rate": 5.0, "qty": 3, "unit": "pcs", "pricing_method": "qty", "original_amount": 525.0, "discount_amount": 0.0, "taxable_amount": 500.00, "gst_amount": 25.00, "final_amount": 525.0}
        ],
        "tenders": [
            {"mode": "UPI", "amount": 1200.0}
        ]
    },
    {
        "invoice_no": "INV-FY26-00988",
        "created_by_username": "priya.k",
        "pricing_mode": "exclusive",
        "subtotal_original": 330.0,
        "auto_discount_total": 0.0,
        "manual_discount_total": 0.0,
        "discount_total": 0.0,
        "taxable_total": 294.64,
        "gst_total": 35.36,
        "grand_total": 330.0,
        "status": "RETURNED",
        "items": [
            {"sku": "BEV-002", "name": "Orange Juice 1L", "price": 110.0, "tax_rate": 12.0, "qty": 3, "unit": "pcs", "pricing_method": "qty", "original_amount": 330.0, "discount_amount": 0.0, "taxable_amount": 294.64, "gst_amount": 35.36, "final_amount": 330.0}
        ],
        "tenders": [
            {"mode": "Card", "amount": 330.0}
        ]
    },
    {
        "invoice_no": "INV-FY26-01025",
        "created_by_username": "priya.k",
        "pricing_mode": "exclusive",
        "subtotal_original": 205.0,
        "auto_discount_total": 0.0,
        "manual_discount_total": 0.0,
        "discount_total": 0.0,
        "taxable_total": 183.04,
        "gst_total": 21.96,
        "grand_total": 205.0,
        "status": "COMPLETED",
        "items": [
            {"sku": "BEV-001", "name": "Cola 500ml", "price": 45.0, "tax_rate": 12.0, "qty": 3, "unit": "pcs", "pricing_method": "qty", "original_amount": 135.0, "discount_amount": 0.0, "taxable_amount": 120.54, "gst_amount": 14.46, "final_amount": 135.0},
            {"sku": "SNK-001", "name": "Potato Chips 90g", "price": 35.0, "tax_rate": 12.0, "qty": 2, "unit": "pcs", "pricing_method": "qty", "original_amount": 70.0, "discount_amount": 0.0, "taxable_amount": 62.50, "gst_amount": 7.50, "final_amount": 70.0}
        ],
        "tenders": [
            {"mode": "Cash", "amount": 205.0}
        ]
    }
]

DEMO_RETURNS = [
    {
        "return_no": "RET-FY26-00001",
        "invoice_no": "INV-FY26-00988",
        "created_by_username": "owner.arjun",
        "total_refund": 330.0,
        "reason": "Defective / damaged",
        "items": [
            {"sku": "BEV-002", "qty": 3.0, "refund_amount": 330.0}
        ]
    }
]

DEMO_COUNTERS = [
    {"counter_name": "Counter 1 - Main Express", "opening_float": 2000.0, "notes": "Main checkout counter"},
    {"counter_name": "Counter 2 - General", "opening_float": 1500.0, "notes": "Secondary counter"}
]

DEMO_AUDIT_LOGS = [
    {"username": "priya.k", "action": "Bill created", "details_json": json.dumps({"reference": "INV-FY26-01031"})},
    {"username": "priya.k", "action": "Bill completed", "details_json": json.dumps({"reference": "INV-FY26-01031"})},
    {"username": "owner.arjun", "action": "Discount approved (15%)", "details_json": json.dumps({"reference": "INV-FY26-00988"})},
    {"username": "owner.arjun", "action": "Return processed", "details_json": json.dumps({"reference": "INV-FY26-00988"})},
    {"username": "ravi.s", "action": "Bill held", "details_json": json.dumps({"reference": "HOLD-3341"})},
    {"username": "ravi.s", "action": "Bill recalled & completed", "details_json": json.dumps({"reference": "INV-FY26-01032"})},
    {"username": "priya.k", "action": "Bill cancelled", "details_json": json.dumps({"reference": "INV-FY26-00962"})},
    {"username": "ravi.s", "action": "Return processed", "details_json": json.dumps({"reference": "INV-FY26-00910"})}
]

async def seed_all_sample_data(disconnect_at_end: bool = False):
    await connect_db()
    print("Connected to database. Inserting prototype sample data...")

    # Enable extensions for Railway monitoring if available
    try:
        await db.execute_raw("CREATE EXTENSION IF NOT EXISTS pg_stat_statements;")
    except Exception as e:
        print(f"pg_stat_statements notice: {e}", flush=True)

    # 1. Users
    for u in DEMO_USERS:
        existing = await db.user.find_unique(where={"username": u["username"]})
        if not existing:
            await db.user.create(data={
                "username": u["username"],
                "pin_hash": get_pin_hash(u["pin"]),
                "role": u["role"],
                "full_name": u["full_name"],
                "sub_text": u["sub_text"],
                "auto_lock_minutes": u.get("auto_lock_minutes", 15),
                "is_active": u["is_active"]
            })
            print(f"Created User: {u['username']}")
        else:
            await db.user.update(where={"username": u["username"]}, data={
                "pin_hash": get_pin_hash(u["pin"]),
                "auto_lock_minutes": u.get("auto_lock_minutes", 15)
            })

    # Ensure all users in DB have securely hashed credentials (never stored as plain text)
    all_users = await db.user.find_many()
    for usr in all_users:
        if usr.pin_hash and not usr.pin_hash.startswith("$pbkdf2") and not usr.pin_hash.startswith("$2"):
            await db.user.update(
                where={"id": usr.id},
                data={"pin_hash": get_pin_hash(usr.pin_hash)}
            )
            print(f"Secured credentials for user: {usr.username}")

    # 2. Store Settings
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    if not store:
        await db.storesettings.create(data=DEMO_STORE)
        print("Created Store Settings")
    else:
        await db.storesettings.update(where={"id": "store_main"}, data=DEMO_STORE)
        print("Updated Store Settings")

    # 3. Categories
    for cat_name in DEMO_CATEGORIES:
        existing_cat = await db.category.find_unique(where={"name": cat_name})
        if not existing_cat:
            await db.category.create(data={"name": cat_name})
            print(f"Created Category: {cat_name}")

    # 4. Catalog Items
    for item in DEMO_CATALOG + DEMO_UPLOAD_ITEMS:
        existing_item = await db.item.find_unique(where={"sku": item["sku"]})
        if not existing_item:
            await db.item.create(data=item)
            print(f"Created Item: {item['sku']} - {item['name']}")
        else:
            await db.item.update(where={"sku": item["sku"]}, data=item)

    # 5. Discounts
    for d in DEMO_DISCOUNTS:
        existing_disc = await db.discount.find_first(where={"name": d["name"]})
        if not existing_disc:
            await db.discount.create(data=d)
            safe_name = d['name'].encode('ascii', 'ignore').decode('ascii')
            print(f"Created Discount: {safe_name}")

    # 6. Held Bills
    for hb in DEMO_HELD_BILLS:
        existing_hb = await db.heldbill.find_unique(where={"held_id": hb["held_id"]})
        if not existing_hb:
            await db.heldbill.create(data=hb)
            print(f"Created Held Bill: {hb['held_id']}")

    # 7. Sales & Tenders & Items
    for sale_data in DEMO_SALES:
        existing_sale = await db.sale.find_unique(where={"invoice_no": sale_data["invoice_no"]})
        if not existing_sale:
            sale_record = deepcopy(sale_data)
            items = sale_record.pop("items")
            tenders = sale_record.pop("tenders")
            
            created_sale = await db.sale.create(data=sale_record)
            for item in items:
                await db.saleitem.create(data={"sale_id": created_sale.id, **item})
            for tender in tenders:
                await db.saletender.create(data={"sale_id": created_sale.id, **tender})
            print(f"Created Sale: {created_sale.invoice_no}")

    # 8. Sale Returns
    for ret_data in DEMO_RETURNS:
        existing_ret = await db.salereturn.find_unique(where={"return_no": ret_data["return_no"]})
        if not existing_ret:
            sale = await db.sale.find_unique(where={"invoice_no": ret_data["invoice_no"]})
            if sale:
                return_record = deepcopy(ret_data)
                items = return_record.pop("items")
                return_record["sale_id"] = sale.id
                created_ret = await db.salereturn.create(data=return_record)
                for r_item in items:
                    await db.returnitem.create(data={"return_id": created_ret.id, **r_item})
    # 9. Audit Logs
    existing_logs_count = await db.auditlog.count()
    if existing_logs_count == 0:
        for log in DEMO_AUDIT_LOGS:
            await db.auditlog.create(data=log)
        print("Created Audit Logs")

    # 10. Cash Counters
    for cc in DEMO_COUNTERS:
        existing_counter = await db.cashcounter.find_unique(where={"counter_name": cc["counter_name"]})
        if not existing_counter:
            await db.cashcounter.create(data=cc)
            print(f"Created Cash Counter: {cc['counter_name']}")

    # Validate the complete fixture against the relationships used by the API.
    expected_skus = {item["sku"] for item in DEMO_CATALOG + DEMO_UPLOAD_ITEMS}
    seeded_items = await db.item.find_many()
    seeded_sales = await db.sale.find_many(include={"items": True, "tenders": True})
    seeded_returns = await db.salereturn.find_many(include={"items": True})
    seeded_held_bills = await db.heldbill.find_many()
    actual_skus = {item.sku for item in seeded_items}
    if not expected_skus.issubset(actual_skus):
        raise RuntimeError(f"Missing seeded SKUs: {sorted(expected_skus - actual_skus)}")
    if any(sale.created_by_username not in {user["username"] for user in DEMO_USERS} for sale in seeded_sales):
        raise RuntimeError("A seeded sale references an unknown user")
    if any(not sale.items or not sale.tenders for sale in seeded_sales):
        raise RuntimeError("A seeded sale is missing line items or tenders")
    if any(ret.sale_id not in {sale.id for sale in seeded_sales} for ret in seeded_returns):
        raise RuntimeError("A seeded return references an unknown sale")
    if any(bill.created_by_username not in {user["username"] for user in DEMO_USERS} for bill in seeded_held_bills):
        raise RuntimeError("A seeded held bill references an unknown user")
    print(
        "Verified seed: "
        f"{len(seeded_items)} items, {len(seeded_sales)} sales, "
        f"{len(seeded_returns)} returns, {len(seeded_held_bills)} held bills"
    )

    if disconnect_at_end:
        await disconnect_db()
    print("Sample data insertion completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed_all_sample_data(disconnect_at_end=True))
