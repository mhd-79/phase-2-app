import asyncio
import json
from app.database import db, connect_db, disconnect_db
from app.security import get_pin_hash

DEMO_USERS = [
    {
        "username": "admin",
        "pin": "1234",
        "role": "admin",
        "full_name": "Admin Store Manager",
        "sub_text": "Admin · Store Manager",
        "is_active": True
    },
    {
        "username": "cashier",
        "pin": "1234",
        "role": "cashier",
        "full_name": "Primary Cashier",
        "sub_text": "Cashier · Counter 1",
        "is_active": True
    },
    {
        "username": "manager",
        "pin": "1234",
        "role": "manager",
        "full_name": "Floor Manager",
        "sub_text": "Shift Manager",
        "is_active": True
    },
    {
        "username": "priya.k",
        "pin": "1234",
        "role": "cashier",
        "full_name": "Priya K.",
        "sub_text": "Cashier · Counter 1",
        "is_active": True
    },
    {
        "username": "owner.arjun",
        "pin": "9999",
        "role": "admin",
        "full_name": "Arjun M.",
        "sub_text": "Admin · Store Manager",
        "is_active": True
    },
    {
        "username": "ravi.s",
        "pin": "1234",
        "role": "cashier",
        "full_name": "Ravi S.",
        "sub_text": "Cashier · Counter 2",
        "is_active": True
    },
    {
        "username": "meena.t",
        "pin": "1234",
        "role": "cashier",
        "full_name": "Meena T.",
        "sub_text": "Relief Cashier",
        "is_active": False
    },
    {
        "username": "cashier.demo",
        "pin": "1111",
        "role": "cashier",
        "full_name": "Demo Cashier",
        "sub_text": "Cashier · Counter 1",
        "is_active": True
    },
    {
        "username": "admin.phase1",
        "pin": "2222",
        "role": "admin",
        "full_name": "Phase 1 Admin",
        "sub_text": "Admin · Phase 1",
        "is_active": True,
        "phase_access": 1
    },
    {
        "username": "admin.phase2",
        "pin": "3333",
        "role": "admin",
        "full_name": "Phase 2 Admin",
        "sub_text": "Admin · Phase 2",
        "is_active": True,
        "phase_access": 2
    }
]

DEMO_CATEGORIES = [
    "Beverages",
    "Snacks",
    "Dairy",
    "Bakery",
    "Grocery",
    "Personal Care"
]

DEMO_VENDORS = [
    { "id": "V-001", "name": "Sunrise Distributors", "category": "Grocery & Staples", "contact": "Ramesh Gupta", "phone": "+91 98200 11223", "email": "ramesh@sunrisedist.in", "terms": "Net 30", "status": "Active", "payable": 84500.0 },
    { "id": "V-002", "name": "Coastal Beverages Co.", "category": "Beverages", "contact": "Anita Fernandes", "phone": "+91 90040 55211", "email": "anita@coastalbev.in", "terms": "Net 15", "status": "Active", "payable": 32100.0 },
    { "id": "V-003", "name": "Dairy Fresh Farms", "category": "Dairy", "contact": "Suresh Nair", "phone": "+91 89393 40021", "email": "suresh@dairyfresh.in", "terms": "Net 7", "status": "Active", "payable": 18450.0 },
    { "id": "V-004", "name": "GoldenCrust Bakers", "category": "Bakery", "contact": "Imran Sheikh", "phone": "+91 91234 87765", "email": "imran@goldencrust.in", "terms": "Net 15", "status": "Active", "payable": 9800.0 },
    { "id": "V-005", "name": "SnackTime Foods", "category": "Snacks", "contact": "Kavita Rao", "phone": "+91 97865 22110", "email": "kavita@snacktime.in", "terms": "Net 30", "status": "Active", "payable": 46200.0 },
    { "id": "V-006", "name": "CarePlus Toiletries", "category": "Personal Care", "contact": "Deepak Malhotra", "phone": "+91 99887 65432", "email": "deepak@careplus.in", "terms": "Net 45", "status": "Active", "payable": 61250.0 },
    { "id": "V-007", "name": "QuickPack Wholesale", "category": "General / Mixed", "contact": "Sana Iyer", "phone": "+91 96543 21098", "email": "sana@quickpack.in", "terms": "Net 30", "status": "Active", "payable": 0.0 },
    { "id": "V-008", "name": "Metro Cash & Carry", "category": "Ad-hoc Supply", "contact": "Walk-in Counter", "phone": "+91 98111 22334", "email": "—", "terms": "Due on Delivery", "status": "Active", "payable": 5400.0 }
]

DEMO_CATALOG = [
  { "sku": "BEV-001", "barcode": "8901030875021", "name": "Cola 500ml", "category_name": "Beverages", "price": 45.0, "wholesale_price": 38.0, "cost_price": 30.0, "landed_cost": 30.0, "tax_rate": 12.0, "stock": 86.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-002" },
  { "sku": "BEV-002", "barcode": "8901030875038", "name": "Orange Juice 1L", "category_name": "Beverages", "price": 110.0, "wholesale_price": 92.0, "cost_price": 78.0, "landed_cost": 78.0, "tax_rate": 12.0, "stock": 34.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-002" },
  { "sku": "BEV-003", "barcode": "8901030875045", "name": "Mineral Water 1L", "category_name": "Beverages", "price": 20.0, "wholesale_price": 16.0, "cost_price": 12.0, "landed_cost": 12.0, "tax_rate": 5.0, "stock": 210.0, "min_stock": 40.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-002" },
  { "sku": "BEV-004", "barcode": "8901030875052", "name": "Green Tea 25 Bags", "category_name": "Beverages", "price": 165.0, "wholesale_price": 140.0, "cost_price": 120.0, "landed_cost": 120.0, "tax_rate": 5.0, "stock": 12.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-002" },
  { "sku": "BEV-005", "barcode": "8901030875069", "name": "Lemon Iced Tea 500ml", "category_name": "Beverages", "price": 55.0, "wholesale_price": 32.0, "cost_price": 32.0, "landed_cost": 32.0, "tax_rate": 12.0, "stock": 60.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-002" },
  { "sku": "SNK-001", "barcode": "8901030876141", "name": "Potato Chips 90g", "category_name": "Snacks", "price": 35.0, "wholesale_price": 29.0, "cost_price": 22.0, "landed_cost": 22.0, "tax_rate": 12.0, "stock": 120.0, "min_stock": 30.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-005" },
  { "sku": "SNK-002", "barcode": "8901030876158", "name": "Choco Cookies 200g", "category_name": "Snacks", "price": 60.0, "wholesale_price": 50.0, "cost_price": 42.0, "landed_cost": 42.0, "tax_rate": 18.0, "stock": 8.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-005" },
  { "sku": "SNK-003", "barcode": "8901030876165", "name": "Salted Peanuts 150g", "category_name": "Snacks", "price": 40.0, "wholesale_price": 33.0, "cost_price": 26.0, "landed_cost": 26.0, "tax_rate": 12.0, "stock": 55.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-005" },
  { "sku": "SNK-004", "barcode": "8901030876172", "name": "Popcorn Butter 100g", "category_name": "Snacks", "price": 55.0, "wholesale_price": 46.0, "cost_price": 38.0, "landed_cost": 38.0, "tax_rate": 12.0, "stock": 42.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-005" },
  { "sku": "SNK-005", "barcode": "8901030876189", "name": "Trail Mix 120g", "category_name": "Snacks", "price": 70.0, "wholesale_price": 38.0, "cost_price": 38.0, "landed_cost": 38.0, "tax_rate": 12.0, "stock": 45.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-005" },
  { "sku": "DAI-001", "barcode": "8901030877247", "name": "Toned Milk 500ml", "category_name": "Dairy", "price": 28.0, "wholesale_price": 24.0, "cost_price": 20.0, "landed_cost": 20.0, "tax_rate": 0.0, "stock": 64.0, "min_stock": 25.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-003" },
  { "sku": "DAI-002", "barcode": "8901030877254", "name": "Curd Cup 200g", "category_name": "Dairy", "price": 25.0, "wholesale_price": 21.0, "cost_price": 16.0, "landed_cost": 16.0, "tax_rate": 0.0, "stock": 5.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-003" },
  { "sku": "DAI-003", "barcode": "8901030877261", "name": "Paneer 200g", "category_name": "Dairy", "price": 90.0, "wholesale_price": 75.0, "cost_price": 65.0, "landed_cost": 65.0, "tax_rate": 5.0, "stock": 18.0, "min_stock": 10.0, "pricing_method": "weight", "unit": "kg", "preferred_vendor_id": "V-003" },
  { "sku": "DAI-004", "barcode": "8901030877278", "name": "Butter 100g", "category_name": "Dairy", "price": 58.0, "wholesale_price": 48.0, "cost_price": 40.0, "landed_cost": 40.0, "tax_rate": 12.0, "stock": 30.0, "min_stock": 12.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-003" },
  { "sku": "DAI-005", "barcode": "8901030877285", "name": "Greek Yogurt 100g", "category_name": "Dairy", "price": 39.0, "wholesale_price": 22.0, "cost_price": 22.0, "landed_cost": 22.0, "tax_rate": 0.0, "stock": 80.0, "min_stock": 20.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-003" },
  { "sku": "BAK-001", "barcode": "8901030878350", "name": "White Bread 400g", "category_name": "Bakery", "price": 42.0, "wholesale_price": 35.0, "cost_price": 28.0, "landed_cost": 28.0, "tax_rate": 5.0, "stock": 27.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-004" },
  { "sku": "BAK-002", "barcode": "8901030878367", "name": "Brown Bread 400g", "category_name": "Bakery", "price": 48.0, "wholesale_price": 40.0, "cost_price": 32.0, "landed_cost": 32.0, "tax_rate": 5.0, "stock": 22.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-004" },
  { "sku": "BAK-003", "barcode": "8901030878374", "name": "Croissant (pc)", "category_name": "Bakery", "price": 35.0, "wholesale_price": 29.0, "cost_price": 22.0, "landed_cost": 22.0, "tax_rate": 5.0, "stock": 16.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-004" },
  { "sku": "GRO-001", "barcode": "8901030879456", "name": "Basmati Rice 1kg", "category_name": "Grocery", "price": 135.0, "wholesale_price": 112.0, "cost_price": 95.0, "landed_cost": 95.0, "tax_rate": 5.0, "stock": 48.0, "min_stock": 15.0, "pricing_method": "weight", "unit": "kg", "preferred_vendor_id": "V-001" },
  { "sku": "GRO-002", "barcode": "8901030879463", "name": "Toor Dal 1kg", "category_name": "Grocery", "price": 148.0, "wholesale_price": 124.0, "cost_price": 105.0, "landed_cost": 105.0, "tax_rate": 5.0, "stock": 33.0, "min_stock": 15.0, "pricing_method": "weight", "unit": "kg", "preferred_vendor_id": "V-001" },
  { "sku": "GRO-003", "barcode": "8901030879470", "name": "Sunflower Oil 1L", "category_name": "Grocery", "price": 175.0, "wholesale_price": 148.0, "cost_price": 130.0, "landed_cost": 130.0, "tax_rate": 5.0, "stock": 40.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-001" },
  { "sku": "GRO-004", "barcode": "8901030879487", "name": "Sugar 1kg", "category_name": "Grocery", "price": 52.0, "wholesale_price": 43.0, "cost_price": 38.0, "landed_cost": 38.0, "tax_rate": 5.0, "stock": 60.0, "min_stock": 20.0, "pricing_method": "weight", "unit": "kg", "preferred_vendor_id": "V-001" },
  { "sku": "GRO-005", "barcode": "8901030879494", "name": "Wheat Atta 5kg", "category_name": "Grocery", "price": 245.0, "wholesale_price": 205.0, "cost_price": 180.0, "landed_cost": 180.0, "tax_rate": 5.0, "stock": 21.0, "min_stock": 10.0, "pricing_method": "weight", "unit": "kg", "preferred_vendor_id": "V-001" },
  { "sku": "GRO-006", "barcode": "8901030879500", "name": "Red Kidney Beans 500g", "category_name": "Grocery", "price": 89.0, "wholesale_price": 48.0, "cost_price": 48.0, "landed_cost": 48.0, "tax_rate": 5.0, "stock": 36.0, "min_stock": 12.0, "pricing_method": "weight", "unit": "kg", "preferred_vendor_id": "V-001" },
  { "sku": "PC-001", "barcode": "8901030880568", "name": "Toothpaste 100g", "category_name": "Personal Care", "price": 65.0, "wholesale_price": 54.0, "cost_price": 45.0, "landed_cost": 45.0, "tax_rate": 18.0, "stock": 44.0, "min_stock": 15.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-006" },
  { "sku": "PC-002", "barcode": "8901030880575", "name": "Shampoo 340ml", "category_name": "Personal Care", "price": 210.0, "wholesale_price": 178.0, "cost_price": 150.0, "landed_cost": 150.0, "tax_rate": 18.0, "stock": 19.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-006" },
  { "sku": "PC-003", "barcode": "8901030880582", "name": "Hand Wash 250ml", "category_name": "Personal Care", "price": 95.0, "wholesale_price": 80.0, "cost_price": 62.0, "landed_cost": 62.0, "tax_rate": 18.0, "stock": 7.0, "min_stock": 12.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-006" },
  { "sku": "PC-004", "barcode": "8901030880599", "name": "Bath Soap (pc)", "category_name": "Personal Care", "price": 38.0, "wholesale_price": 31.0, "cost_price": 25.0, "landed_cost": 25.0, "tax_rate": 18.0, "stock": 96.0, "min_stock": 25.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-006" },
  { "sku": "PC-005", "barcode": "8901030880605", "name": "Face Wash 100ml", "category_name": "Personal Care", "price": 149.0, "wholesale_price": 72.0, "cost_price": 72.0, "landed_cost": 72.0, "tax_rate": 18.0, "stock": 25.0, "min_stock": 10.0, "pricing_method": "qty", "unit": "pcs", "preferred_vendor_id": "V-006" }
]

DEMO_POS = [
    {
        "id": "PO-2026-0139", "vendor_id": "V-004", "date": "2026-08-20", "expected": "2026-08-24", "status": "Closed", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "BAK-001", "name": "White Bread 400g", "ordered_qty": 60.0, "received_qty": 60.0, "cost": 28.0 },
            { "sku": "BAK-002", "name": "Brown Bread 400g", "ordered_qty": 60.0, "received_qty": 60.0, "cost": 32.0 },
            { "sku": "BAK-003", "name": "Croissant (pc)", "ordered_qty": 100.0, "received_qty": 100.0, "cost": 22.0 }
        ]
    },
    {
        "id": "PO-2026-0142", "vendor_id": "V-001", "date": "2026-08-28", "expected": "2026-09-02", "status": "Closed", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "GRO-001", "name": "Basmati Rice 1kg", "ordered_qty": 100.0, "received_qty": 100.0, "cost": 95.0 },
            { "sku": "GRO-002", "name": "Toor Dal 1kg", "ordered_qty": 80.0, "received_qty": 80.0, "cost": 105.0 },
            { "sku": "GRO-004", "name": "Sugar 1kg", "ordered_qty": 120.0, "received_qty": 120.0, "cost": 38.0 }
        ]
    },
    {
        "id": "PO-2026-0145", "vendor_id": "V-002", "date": "2026-09-02", "expected": "2026-09-06", "status": "Partially Received", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "BEV-001", "name": "Cola 500ml", "ordered_qty": 200.0, "received_qty": 160.0, "cost": 30.0 },
            { "sku": "BEV-002", "name": "Orange Juice 1L", "ordered_qty": 100.0, "received_qty": 100.0, "cost": 78.0 },
            { "sku": "BEV-003", "name": "Mineral Water 1L", "ordered_qty": 300.0, "received_qty": 0.0, "cost": 12.0 }
        ]
    },
    {
        "id": "PO-2026-0148", "vendor_id": "V-003", "date": "2026-09-05", "expected": "2026-09-08", "status": "Approved", "approved_by": "Arjun M.",
        "lines": [
            { "sku": "DAI-001", "name": "Toned Milk 500ml", "ordered_qty": 150.0, "received_qty": 0.0, "cost": 20.0 },
            { "sku": "DAI-002", "name": "Curd Cup 200g", "ordered_qty": 100.0, "received_qty": 0.0, "cost": 16.0 },
            { "sku": "DAI-003", "name": "Paneer 200g", "ordered_qty": 40.0, "received_qty": 0.0, "cost": 65.0 }
        ]
    },
    {
        "id": "PO-2026-0150", "vendor_id": "V-005", "date": "2026-09-06", "expected": "2026-09-10", "status": "Pending Approval", "approved_by": None,
        "lines": [
            { "sku": "SNK-002", "name": "Choco Cookies 200g", "ordered_qty": 80.0, "received_qty": 0.0, "cost": 42.0 },
            { "sku": "SNK-004", "name": "Popcorn Butter 100g", "ordered_qty": 60.0, "received_qty": 0.0, "cost": 38.0 }
        ]
    },
    {
        "id": "PO-2026-0151", "vendor_id": "V-006", "date": "2026-09-07", "expected": "2026-09-12", "status": "Draft", "approved_by": None,
        "lines": [
            { "sku": "PC-002", "name": "Shampoo 340ml", "ordered_qty": 50.0, "received_qty": 0.0, "cost": 150.0 },
            { "sku": "PC-003", "name": "Hand Wash 250ml", "ordered_qty": 70.0, "received_qty": 0.0, "cost": 62.0 }
        ]
    }
]

DEMO_BATCHES = [
    { "sku": "DAI-002", "name": "Curd Cup 200g", "batch_no": "B-CUR-2409A", "mfg_date": "2026-09-01", "expiry_date": "2026-09-09", "qty": 5.0 },
    { "sku": "DAI-003", "name": "Paneer 200g", "batch_no": "B-PNR-2408C", "mfg_date": "2026-08-30", "expiry_date": "2026-09-13", "qty": 18.0 },
    { "sku": "DAI-001", "name": "Toned Milk 500ml", "batch_no": "B-MLK-2409D", "mfg_date": "2026-09-06", "expiry_date": "2026-09-10", "qty": 64.0 },
    { "sku": "DAI-004", "name": "Butter 100g", "batch_no": "B-BTR-2408A", "mfg_date": "2026-08-15", "expiry_date": "2026-11-15", "qty": 30.0 },
    { "sku": "BAK-001", "name": "White Bread 400g", "batch_no": "B-WBR-2409G", "mfg_date": "2026-09-06", "expiry_date": "2026-09-11", "qty": 27.0 },
    { "sku": "BAK-003", "name": "Croissant (pc)", "batch_no": "B-CRS-2409H", "mfg_date": "2026-09-06", "expiry_date": "2026-09-09", "qty": 16.0 },
    { "sku": "GRO-001", "name": "Basmati Rice 1kg", "batch_no": "B-RIC-2408X", "mfg_date": "2026-06-01", "expiry_date": "2027-06-01", "qty": 48.0 },
    { "sku": "SNK-001", "name": "Potato Chips 90g", "batch_no": "B-CHP-2408Y", "mfg_date": "2026-07-10", "expiry_date": "2026-10-10", "qty": 120.0 }
]

DEMO_DISCOUNTS = [
    {
        "id": "DISC-001",
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
        "id": "DISC-002",
        "name": "Beverage Flash Sale ₹5 Off",
        "type": "flat",
        "value": 5.0,
        "applies_to": "selected",
        "product_skus": json.dumps(["BEV-001", "BEV-002"]),
        "start_date": "2026-09-05",
        "end_date": "2026-09-15",
        "status": "active"
    }
]

DEMO_STOCK_ADJUSTMENTS = [
    {
        "id": "ADJ-0091",
        "sku": "SNK-002",
        "name": "Choco Cookies 200g",
        "delta": -2.0,
        "reason": "Damaged in transit",
        "notes": "Found broken packages upon shelf count",
        "approved_by": "Arjun M.",
        "date": "2026-09-06"
    },
    {
        "id": "ADJ-0090",
        "sku": "DAI-002",
        "name": "Curd Cup 200g",
        "delta": -3.0,
        "reason": "Expired / Spoiled",
        "notes": "Leaked packaging during storage",
        "approved_by": "Arjun M.",
        "date": "2026-09-05"
    }
]

DEMO_PURCHASE_RETURNS = [
    {
        "id": "DN-1001",
        "vendor_id": "V-002",
        "date": "2026-09-05",
        "reason": "Expired stock return",
        "total": 300.0,
        "lines": [
            { "sku": "BEV-001", "name": "Cola 500ml", "qty": 10.0, "cost": 30.0 }
        ]
    }
]

DEMO_VENDOR_PAYMENTS = [
    { "id": "PMT-1001", "vendor_id": "V-001", "date": "2026-09-04", "amount": 15000.0, "mode": "Bank Transfer" },
    { "id": "PMT-1002", "vendor_id": "V-003", "date": "2026-09-06", "amount": 5000.0, "mode": "UPI" }
]

DEMO_HELD_BILLS = [
    {
        "id": "1",
        "held_id": "HOLD-3341",
        "created_by_username": "priya.k",
        "lines_json": json.dumps([
            { "sku": "BEV-001", "name": "Cola 500ml", "price": 45.0, "qty": 2.0 },
            { "sku": "GRO-001", "name": "Basmati Rice 1kg", "price": 135.0, "qty": 1.0 }
        ]),
        "discount_json": "{}",
        "item_count": 3.0,
        "total": 225.0
    }
]

async def seed_all():
    await connect_db()
    if not db.is_connected():
        print("[Database] Skipping seed: DB is not connected.")
        return
    print("Seeding prototype data into database...")

    # 1. Users
    for u in DEMO_USERS:
        existing = await db.user.find_unique(where={"username": u["username"]})
        if not existing:
            user_data = {
                "username": u["username"],
                "pin_hash": get_pin_hash(u["pin"]),
                "role": u["role"],
                "full_name": u["full_name"],
                "sub_text": u["sub_text"],
                "is_active": u.get("is_active", True)
            }
            if "phase_access" in u:
                user_data["phase_access"] = u["phase_access"]
            await db.user.create(data=user_data)
        # Existing users are left exactly as they are (names, roles, active status, PINs, phase access are managed in
        # Users & Roles). Seeding only creates users that are missing.

    # 2. Store Settings
    store = await db.storesettings.find_unique(where={"id": "store_main"})
    if not store:
        await db.storesettings.create(data={
            "id": "store_main",
            "store_name": "Okuto Mart",
            "address": "12, MG Road, Bengaluru",
            "phone": "+91 98765 43210",
            "gstin": "29ABCDE1234F1Z5",
            "pricing_mode": "exclusive",
            "idle_timeout_seconds": 45
        })

    # 3. Categories
    for cat_name in DEMO_CATEGORIES:
        existing_cat = await db.category.find_unique(where={"name": cat_name})
        if not existing_cat:
            await db.category.create(data={"name": cat_name})

    # 4. Vendors
    for v in DEMO_VENDORS:
        existing_v = await db.vendor.find_unique(where={"id": v["id"]})
        if not existing_v:
            await db.vendor.create(data=v)
        # Existing vendors are never overwritten: their payable balance etc. is live business data.

    # 5. Items (Catalog)
    for item in DEMO_CATALOG:
        existing_item = await db.item.find_unique(where={"sku": item["sku"]})
        if not existing_item:
            await db.item.create(data=item)
        else:
            # Existing items keep their live stock, prices and costs. Only Phase 2 columns that an older (Phase 1) database
            # never had are back-filled, and only while they are still unset.
            backfill = {}
            if not existing_item.preferred_vendor_id and item.get("preferred_vendor_id"):
                backfill["preferred_vendor_id"] = item["preferred_vendor_id"]
            if not existing_item.landed_cost and item.get("landed_cost"):
                backfill["landed_cost"] = item["landed_cost"]
            if backfill:
                await db.item.update(where={"sku": item["sku"]}, data=backfill)

    # 6. Purchase Orders
    for po in DEMO_POS:
        po_copy = dict(po)
        lines = po_copy.pop("lines")
        existing_po = await db.purchaseorder.find_unique(where={"id": po_copy["id"]})
        if not existing_po:
            await db.purchaseorder.create(data=po_copy)
            for line in lines:
                line_data = dict(line)
                line_data["po_id"] = po_copy["id"]
                await db.purchaseorderline.create(data=line_data)

    # 7. Batches
    for b in DEMO_BATCHES:
        existing_b = await db.batch.find_first(where={"sku": b["sku"], "batch_no": b["batch_no"]})
        if not existing_b:
            await db.batch.create(data=b)

    # 8. Discounts
    for d in DEMO_DISCOUNTS:
        existing_d = await db.discount.find_unique(where={"id": d["id"]})
        if not existing_d:
            await db.discount.create(data=d)

    # 9. Stock Adjustments
    for adj in DEMO_STOCK_ADJUSTMENTS:
        existing_adj = await db.stockadjustment.find_unique(where={"id": adj["id"]})
        if not existing_adj:
            await db.stockadjustment.create(data=adj)

    # 10. Purchase Returns
    for pr in DEMO_PURCHASE_RETURNS:
        pr_copy = dict(pr)
        lines = pr_copy.pop("lines")
        existing_pr = await db.purchasereturn.find_unique(where={"id": pr_copy["id"]})
        if not existing_pr:
            await db.purchasereturn.create(data=pr_copy)
            for line in lines:
                line_data = dict(line)
                line_data["return_id"] = pr_copy["id"]
                await db.purchasereturnline.create(data=line_data)

    # 11. Vendor Payments
    for pmt in DEMO_VENDOR_PAYMENTS:
        existing_pmt = await db.vendorpayment.find_unique(where={"id": pmt["id"]})
        if not existing_pmt:
            await db.vendorpayment.create(data=pmt)

    # 12. Held Bills
    for hb in DEMO_HELD_BILLS:
        existing_hb = await db.heldbill.find_unique(where={"held_id": hb["held_id"]})
        if not existing_hb:
            hb_data = dict(hb)
            hb_data.pop("id", None)
            await db.heldbill.create(data=hb_data)

    print("Seed check complete: missing prototype records were created; existing records were left unchanged.")

if __name__ == "__main__":
    try:
        asyncio.run(seed_all())
    finally:
        asyncio.run(disconnect_db())
