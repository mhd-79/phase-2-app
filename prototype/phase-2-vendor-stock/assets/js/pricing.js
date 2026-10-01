/* ============================================================
   pricing.js — single source of truth for tax / discount / total
   math shared by POS billing, invoice generation, printed
   receipts and the receipt reprint screen (Phase 2).

   Calculation flow (applied once, in this order, per cart line):
     1. Original Amount = unit price × qty (pieces) or × weight (kg)
     2. Auto Discount    = Admin-configured product/all-product
                           discount, capped to the line amount
     3. Manual Discount  = cashier/admin bill-level discount,
                           allocated pro-rata across lines
     4. Tax              = GST computed once on the net line amount —
                           added on top (Tax Exclusive) or
                           extracted from it (Tax Inclusive)
   ============================================================ */

(function () {
  "use strict";

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  window.MIN_WEIGHT_KG = 0.001;   /* 1 gram */
  window.MAX_WEIGHT_KG = 200;

  window.isValidWeightKg = function (kg) {
    return typeof kg === "number" && isFinite(kg) && kg >= window.MIN_WEIGHT_KG && kg <= window.MAX_WEIGHT_KG;
  };

  window.formatQty = function (line) {
    if (line.unit === "kg") {
      return line.qty < 1 ? (line.qty * 1000).toFixed(0) + " g" : line.qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + " kg";
    }
    return line.qty + " pcs";
  };

  function calcDiscountAmount(discount, base) {
    if (!discount || !discount.value || base <= 0) return 0;
    var amt = discount.type === "percent" ? (base * discount.value / 100) : discount.value;
    return Math.max(0, Math.min(amt, base));
  }
  window.calcDiscountAmount = calcDiscountAmount;

  /* pricingMode: "exclusive" | "inclusive". manualDiscount: {type:"percent"|"flat", value} */
  window.computeCartTotals = function (cart, pricingMode, manualDiscount) {
    var onDate = new Date().toISOString().slice(0, 10);

    var prelim = cart.map(function (l) {
      var originalAmount = l.price * l.qty;
      var autoDiscountRule = window.getActiveDiscountForItem ? window.getActiveDiscountForItem(l.sku, onDate) : null;
      var autoDiscountAmount = round2(calcDiscountAmount(autoDiscountRule, originalAmount));
      var afterAuto = originalAmount - autoDiscountAmount;
      return {
        sku: l.sku, name: l.name, price: l.price, tax: l.tax, qty: l.qty, unit: l.unit, pricingMethod: l.pricingMethod,
        originalAmount: originalAmount, autoDiscountAmount: autoDiscountAmount, autoDiscountName: autoDiscountRule ? autoDiscountRule.name : null,
        afterAuto: afterAuto
      };
    });

    var sumAfterAuto = prelim.reduce(function (s, l) { return s + l.afterAuto; }, 0);
    var manualDiscountTotal = round2(calcDiscountAmount(manualDiscount, sumAfterAuto));

    var subtotalOriginal = 0, autoDiscountTotal = 0, taxableTotal = 0, gstTotal = 0, grandTotal = 0;
    var lines = prelim.map(function (l) {
      var share = sumAfterAuto > 0 ? (l.afterAuto / sumAfterAuto) : 0;
      var lineManualDiscount = round2(manualDiscountTotal * share);
      var lineNet = Math.max(0, l.afterAuto - lineManualDiscount);
      var taxable, gst, gross;
      var rate = l.tax || 0;
      if (pricingMode === "inclusive") {
        gross = lineNet;
        taxable = rate > 0 ? gross / (1 + rate / 100) : gross;
        gst = gross - taxable;
      } else {
        taxable = lineNet;
        gst = taxable * (rate / 100);
        gross = taxable + gst;
      }
      taxable = round2(taxable); gst = round2(gst); gross = round2(gross);
      var discountAmount = round2(l.autoDiscountAmount + lineManualDiscount);

      subtotalOriginal += l.originalAmount;
      autoDiscountTotal += l.autoDiscountAmount;
      taxableTotal += taxable;
      gstTotal += gst;
      grandTotal += gross;

      return {
        sku: l.sku, name: l.name, price: l.price, tax: rate, qty: l.qty, unit: l.unit, pricingMethod: l.pricingMethod,
        originalAmount: round2(l.originalAmount), discountAmount: discountAmount, discountName: l.autoDiscountName,
        taxableAmount: taxable, gstAmount: gst, finalAmount: gross
      };
    });

    return {
      pricingMode: pricingMode,
      lines: lines,
      subtotalOriginal: round2(subtotalOriginal),
      autoDiscountTotal: round2(autoDiscountTotal),
      manualDiscountTotal: manualDiscountTotal,
      discountTotal: round2(autoDiscountTotal + manualDiscountTotal),
      taxableTotal: round2(taxableTotal),
      gstTotal: round2(gstTotal),
      grandTotal: round2(grandTotal)
    };
  };

  /* ---------------- Shared receipt / invoice markup ----------------
     Renders strictly from the values stored on the record at sale time.
     For Tax-Inclusive mode, strictly hides separate Taxable Amount and GST Amount lines. */
  window.renderReceiptHTML = function (record) {
    var lines = record.lines.map(function (l) {
      var qtyLabel = window.formatQty(l);
      var discRow = l.discountAmount > 0
        ? '<div class="row-between text-xs text-muted"><span>&nbsp;&nbsp;Discount' + (l.discountName ? " (" + l.discountName + ")" : "") + '</span><span class="mono">−₹' + l.discountAmount.toFixed(2) + "</span></div>"
        : "";
      return '<div class="row-between text-sm"><span>' + l.name + " &times;" + qtyLabel + '</span><span class="mono">₹' + l.finalAmount.toFixed(2) + "</span></div>" + discRow;
    }).join("");
    var tendersHtml = (record.tenders || []).filter(function (t) { return t.amount > 0; }).map(function (t) {
      return '<div class="row-between text-sm"><span>' + t.mode + '</span><span class="mono">₹' + t.amount.toFixed(2) + "</span></div>";
    }).join("");
    var modeLabel = record.pricingMode === "inclusive" ? "Tax Inclusive" : "Tax Exclusive";
    var isInclusive = record.pricingMode === "inclusive";

    var totalsSection = "";
    if (isInclusive) {
      totalsSection =
        (record.discountTotal > 0 ? '<div class="row-between text-sm"><span>Discount</span><span class="mono">−₹' + record.discountTotal.toFixed(2) + '</span></div>' : '') +
        '<div class="row-between" style="font-weight:700;font-size:var(--text-md)"><span>Grand Total</span><span class="mono">₹' + record.grandTotal.toFixed(2) + '</span></div>' +
        '<div class="text-xs text-muted" style="text-align:center;margin-top:var(--space-2);margin-bottom:var(--space-1);font-style:italic">(Prices inclusive of GST)</div>';
    } else {
      totalsSection =
        '<div class="row-between text-sm"><span>Taxable Amount</span><span class="mono">₹' + record.taxableTotal.toFixed(2) + '</span></div>' +
        '<div class="row-between text-sm"><span>GST Amount</span><span class="mono">₹' + record.gstTotal.toFixed(2) + '</span></div>' +
        (record.discountTotal > 0 ? '<div class="row-between text-sm"><span>Discount</span><span class="mono">−₹' + record.discountTotal.toFixed(2) + '</span></div>' : '') +
        '<div class="row-between" style="font-weight:700;font-size:var(--text-md)"><span>Grand Total</span><span class="mono">₹' + record.grandTotal.toFixed(2) + '</span></div>';
    }

    return (
      '<div style="text-align:center;margin-bottom:var(--space-3)"><strong>Greenfield Mart</strong><div class="text-xs text-muted">12, MG Road, Bengaluru &middot; GSTIN 29ABCDE1234F1Z5</div></div>' +
      '<hr class="divider">' +
      '<div class="row-between text-sm"><span>Invoice</span><span class="mono">' + record.invoiceNo + '</span></div>' +
      '<div class="row-between text-sm"><span>Date</span><span class="mono">' + new Date(record.time).toLocaleString() + '</span></div>' +
      '<div class="row-between text-sm"><span>Pricing Mode</span><span class="mono">' + modeLabel + '</span></div>' +
      '<hr class="divider">' + lines + '<hr class="divider">' +
      totalsSection +
      '<hr class="divider">' + tendersHtml +
      '<p class="text-xs text-muted" style="text-align:center;margin-top:var(--space-3)">Thank you for shopping with us!</p>'
    );
  };
})();
