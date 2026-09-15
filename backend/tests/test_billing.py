import pytest
from app.pricing_engine import compute_cart_totals, calc_discount_amount, is_valid_weight_kg, format_qty

def test_weight_validation():
    assert is_valid_weight_kg(0.5) is True
    assert is_valid_weight_kg(0.001) is True
    assert is_valid_weight_kg(0.0) is False
    assert is_valid_weight_kg(250.0) is False

def test_qty_formatting():
    assert format_qty(0.250, "kg") == "250 g"
    assert format_qty(1.5, "kg") == "1.5 kg"
    assert format_qty(3.0, "pcs") == "3 pcs"

def test_tax_exclusive_calculation():
    cart = [
        {"sku": "BEV-001", "name": "Cola 500ml", "price": 100.0, "qty": 2.0, "tax": 10.0, "unit": "pcs", "pricing_method": "qty"}
    ]
    # 100 * 2 = 200 taxable. Tax 10% = 20. Total = 220.
    totals = compute_cart_totals(cart, pricing_mode="exclusive")
    assert totals["subtotal_original"] == 200.0
    assert totals["taxable_total"] == 200.0
    assert totals["gst_total"] == 20.0
    assert totals["grand_total"] == 220.0

def test_tax_inclusive_calculation():
    cart = [
        {"sku": "BEV-001", "name": "Cola 500ml", "price": 110.0, "qty": 1.0, "tax": 10.0, "unit": "pcs", "pricing_method": "qty"}
    ]
    # Price 110 gross. 110 / (1 + 0.10) = 100 taxable. GST = 10.
    totals = compute_cart_totals(cart, pricing_mode="inclusive")
    assert totals["taxable_total"] == 100.0
    assert totals["gst_total"] == 10.0
    assert totals["grand_total"] == 110.0

def test_manual_flat_discount():
    cart = [
        {"sku": "SNK-001", "name": "Chips", "price": 100.0, "qty": 2.0, "tax": 0.0, "unit": "pcs", "pricing_method": "qty"}
    ]
    # Base 200 - Flat discount 20 = 180 total
    totals = compute_cart_totals(cart, pricing_mode="exclusive", manual_discount={"type": "flat", "value": 20.0})
    assert totals["discount_total"] == 20.0
    assert totals["taxable_total"] == 180.0
    assert totals["grand_total"] == 180.0

def test_held_bill_schema_compatibility():
    from app.schemas import HeldBillCreate
    # Test camelCase itemCount
    req1 = HeldBillCreate(
        lines=[{"sku": "BEV-001", "qty": 2}],
        itemCount=2.0,
        total=90.0
    )
    assert req1.computed_item_count == 2.0

    # Test snake_case item_count
    req2 = HeldBillCreate(
        lines=[{"sku": "BEV-001", "qty": 3}],
        item_count=3.0,
        total=135.0
    )
    assert req2.computed_item_count == 3.0

    # Test fallback to lines length
    req3 = HeldBillCreate(
        lines=[{"sku": "BEV-001", "qty": 1}, {"sku": "BEV-002", "qty": 1}],
        total=155.0
    )
    assert req3.computed_item_count == 2.0

