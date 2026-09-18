import math
from typing import List, Dict, Any, Optional
from datetime import datetime

MIN_WEIGHT_KG = 0.001
MAX_WEIGHT_KG = 200.0

def round2(n: float) -> float:
    return round(n + 1e-9, 2)

def is_valid_weight_kg(kg: float) -> bool:
    return isinstance(kg, (int, float)) and not math.isnan(kg) and MIN_WEIGHT_KG <= kg <= MAX_WEIGHT_KG

def format_qty(qty: float, unit: str) -> str:
    if unit == "kg":
        if qty < 1.0:
            return f"{int(qty * 1000)} g"
        # Format decimal cleanly
        formatted = f"{qty:.3f}".rstrip("0").rstrip(".")
        return f"{formatted} kg"
    return f"{int(qty)} pcs"

def calc_discount_amount(discount_type: str, discount_value: float, base: float) -> float:
    if not discount_value or base <= 0:
        return 0.0
    if discount_type == "percent":
        amt = base * discount_value / 100.0
    else:
        amt = discount_value
    return max(0.0, min(amt, base))

def get_active_discount_for_item(sku: str, discounts: List[Dict[str, Any]], on_date: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if not on_date:
        on_date = datetime.now().strftime("%Y-%m-%d")
    
    live_discounts = []
    for d in discounts:
        if d.get("status") != "active":
            continue
        start_date = d.get("start_date")
        end_date = d.get("end_date")
        if start_date and on_date < start_date:
            continue
        if end_date and on_date > end_date:
            continue
        live_discounts.append(d)
        
    # Prefer specific product discount
    for d in live_discounts:
        product_skus = d.get("product_skus") or []
        if isinstance(product_skus, str):
            import json
            try:
                product_skus = json.loads(product_skus)
            except Exception:
                product_skus = []
        if d.get("applies_to") == "selected" and sku in product_skus:
            return d
            
    # Fallback to "all" products
    for d in live_discounts:
        if d.get("applies_to") == "all":
            return d
            
    return None

def compute_cart_totals(
    cart: List[Dict[str, Any]],
    pricing_mode: str, # "exclusive" | "inclusive"
    manual_discount: Optional[Dict[str, Any]] = None, # {"type": "percent"|"flat", "value": float}
    active_discounts: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    if active_discounts is None:
        active_discounts = []
    if manual_discount is None:
        manual_discount = {"type": "percent", "value": 0.0}

    on_date = datetime.now().strftime("%Y-%m-%d")
    
    prelim = []
    for line in cart:
        sku = line["sku"]
        price = float(line["price"])
        qty = float(line["qty"])
        original_amount = price * qty
        
        auto_rule = get_active_discount_for_item(sku, active_discounts, on_date)
        auto_discount_amount = 0.0
        auto_discount_name = None
        if auto_rule:
            auto_discount_amount = round2(calc_discount_amount(auto_rule.get("type", "percent"), float(auto_rule.get("value", 0)), original_amount))
            auto_discount_name = auto_rule.get("name")
            
        after_auto = original_amount - auto_discount_amount
        prelim.append({
            "sku": sku,
            "name": line["name"],
            "price": price,
            "tax": float(line.get("tax", 0.0)),
            "qty": qty,
            "unit": line.get("unit", "pcs"),
            "pricing_method": line.get("pricing_method", "qty"),
            "original_amount": original_amount,
            "auto_discount_amount": auto_discount_amount,
            "auto_discount_name": auto_discount_name,
            "after_auto": after_auto
        })

    sum_after_auto = sum(l["after_auto"] for l in prelim)
    m_type = manual_discount.get("type", "percent")
    m_val = float(manual_discount.get("value", 0.0))
    manual_discount_total = round2(calc_discount_amount(m_type, m_val, sum_after_auto))

    subtotal_original = 0.0
    auto_discount_total = 0.0
    taxable_total = 0.0
    gst_total = 0.0
    grand_total = 0.0

    lines = []
    for l in prelim:
        share = (l["after_auto"] / sum_after_auto) if sum_after_auto > 0 else 0.0
        line_manual_discount = round2(manual_discount_total * share)
        line_net = max(0.0, l["after_auto"] - line_manual_discount)
        
        rate = l["tax"]
        if pricing_mode == "inclusive":
            gross = line_net
            taxable = gross / (1.0 + rate / 100.0) if rate > 0 else gross
            gst = gross - taxable
        else:
            taxable = line_net
            gst = taxable * (rate / 100.0)
            gross = taxable + gst

        taxable = round2(taxable)
        gst = round2(gst)
        gross = round2(gross)
        discount_amount = round2(l["auto_discount_amount"] + line_manual_discount)

        subtotal_original += l["original_amount"]
        auto_discount_total += l["auto_discount_amount"]
        taxable_total += taxable
        gst_total += gst
        grand_total += gross

        lines.append({
            "sku": l["sku"],
            "name": l["name"],
            "price": l["price"],
            "tax": rate,
            "qty": l["qty"],
            "unit": l["unit"],
            "pricing_method": l["pricing_method"],
            "original_amount": round2(l["original_amount"]),
            "discount_amount": discount_amount,
            "discount_name": l["auto_discount_name"],
            "taxable_amount": taxable,
            "gst_amount": gst,
            "final_amount": gross
        })

    return {
        "pricing_mode": pricing_mode,
        "lines": lines,
        "subtotal_original": round2(subtotal_original),
        "auto_discount_total": round2(auto_discount_total),
        "manual_discount_total": manual_discount_total,
        "discount_total": round2(auto_discount_total + manual_discount_total),
        "taxable_total": round2(taxable_total),
        "gst_total": round2(gst_total),
        "grand_total": round2(grand_total)
    }

def render_receipt_html(sale_record: Dict[str, Any], store_info: Optional[Dict[str, Any]] = None) -> str:
    if not store_info:
        store_info = {
            "store_name": "Okuto Mart",
            "address": "12, MG Road, Bengaluru",
            "gstin": "29ABCDE1234F1Z5"
        }
    
    lines_html = ""
    for l in sale_record.get("lines", []):
        qty_str = format_qty(l["qty"], l["unit"])
        disc_row = ""
        if l.get("discount_amount", 0) > 0:
            disc_name = f" ({l['discount_name']})" if l.get("discount_name") else ""
            disc_row = f'<div class="row-between text-xs text-muted"><span>&nbsp;&nbsp;Discount{disc_name}</span><span class="mono">−₹{l["discount_amount"]:.2f}</span></div>'
        lines_html += f'<div class="row-between text-sm"><span>{l["name"]} &times;{qty_str}</span><span class="mono">₹{l["final_amount"]:.2f}</span></div>{disc_row}'

    tenders_html = ""
    for t in sale_record.get("tenders", []):
        if t.get("amount", 0) > 0:
            tenders_html += f'<div class="row-between text-sm"><span>{t["mode"]}</span><span class="mono">₹{t["amount"]:.2f}</span></div>'

    pricing_mode = sale_record.get("pricing_mode", "exclusive")
    mode_label = "Tax Inclusive" if pricing_mode == "inclusive" else "Tax Exclusive"

    if pricing_mode == "inclusive":
        disc_total_row = f'<div class="row-between text-sm"><span>Discount</span><span class="mono">−₹{sale_record["discount_total"]:.2f}</span></div>' if sale_record.get("discount_total", 0) > 0 else ""
        totals_section = f'''
        {disc_total_row}
        <div class="row-between" style="font-weight:700;font-size:var(--text-md)"><span>Grand Total</span><span class="mono">₹{sale_record["grand_total"]:.2f}</span></div>
        <div class="text-xs text-muted" style="text-align:center;margin-top:var(--space-2);margin-bottom:var(--space-1);font-style:italic">(Prices inclusive of GST)</div>
        '''
    else:
        disc_total_row = f'<div class="row-between text-sm"><span>Discount</span><span class="mono">−₹{sale_record["discount_total"]:.2f}</span></div>' if sale_record.get("discount_total", 0) > 0 else ""
        totals_section = f'''
        <div class="row-between text-sm"><span>Taxable Amount</span><span class="mono">₹{sale_record["taxable_total"]:.2f}</span></div>
        <div class="row-between text-sm"><span>GST Amount</span><span class="mono">₹{sale_record["gst_total"]:.2f}</span></div>
        {disc_total_row}
        <div class="row-between" style="font-weight:700;font-size:var(--text-md)"><span>Grand Total</span><span class="mono">₹{sale_record["grand_total"]:.2f}</span></div>
        '''

    sale_time = sale_record.get("time", datetime.now().isoformat())

    counter_name = sale_record.get("counter_name", "Counter 1 - Main Express")

    return f'''
    <div style="text-align:center;margin-bottom:var(--space-3)">
        <strong>{store_info["store_name"]}</strong>
        <div class="text-xs text-muted">{store_info["address"]} &middot; GSTIN {store_info["gstin"]}</div>
    </div>
    <hr class="divider">
    <div class="row-between text-sm"><span>Invoice</span><span class="mono">{sale_record["invoice_no"]}</span></div>
    <div class="row-between text-sm"><span>Date</span><span class="mono">{sale_time}</span></div>
    <div class="row-between text-sm"><span>Counter</span><span class="mono">{counter_name}</span></div>
    <div class="row-between text-sm"><span>Pricing Mode</span><span class="mono">{mode_label}</span></div>
    <hr class="divider">
    {lines_html}
    <hr class="divider">
    {totals_section}
    <hr class="divider">
    {tenders_html}
    <p class="text-xs text-muted" style="text-align:center;margin-top:var(--space-3)">Thank you for shopping with us!</p>
    '''
