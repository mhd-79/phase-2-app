/**
 * Billing totals and automatic (Discount Management) discounts.
 *
 * `computeCartTotals` mirrors backend/app/pricing_engine.py (compute_cart_totals) rule for rule, so the totals on the Billing screen
 * are the totals the server records on the invoice. Keep the two in step.
 */

export interface DiscountRule {
  id: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  appliesTo: 'all' | 'selected';
  productSkus?: string[];
  startDate?: string;
  endDate?: string;
  status: 'active' | 'inactive';
}

export interface PricingLine {
  sku: string;
  name: string;
  price: number;
  qty: number;
  tax: number;
  unit?: string;
}

export interface PricedLine {
  sku: string;
  name: string;
  price: number;
  qty: number;
  tax: number;
  unit: string;
  originalAmount: number;
  /** Automatic (Discount Management) discount on this line. */
  autoDiscountAmount: number;
  /** Auto discount plus this line's share of the bill discount. */
  discountAmount: number;
  discountName: string | null;
  taxableAmount: number;
  gstAmount: number;
  finalAmount: number;
}

export interface CartTotals {
  lines: PricedLine[];
  subtotalOriginal: number;
  autoDiscountTotal: number;
  manualDiscountTotal: number;
  discountTotal: number;
  taxableTotal: number;
  gstTotal: number;
  grandTotal: number;
}

export interface ManualDiscount {
  type: 'percent' | 'flat';
  value: number;
}

const round2 = (n: number): number => Math.round((n + 1e-9) * 100) / 100;

/** Today as YYYY-MM-DD in local time (the same day the server uses for the Start / End date check). */
export function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True when the discount is Active and today falls inside its Start / End date (both optional, inclusive). */
export function isDiscountLive(d: DiscountRule, onDate: string = localToday()): boolean {
  if (d.status !== 'active') return false;
  if (d.startDate && onDate < d.startDate) return false;
  if (d.endDate && onDate > d.endDate) return false;
  return true;
}

export function calcDiscountAmount(type: string, value: number, base: number): number {
  if (!value || base <= 0) return 0;
  const amount = type === 'percent' ? (base * value) / 100 : value;
  return Math.max(0, Math.min(amount, base));
}

/** The discount that applies to a product: a live "Selected Items" discount naming it wins, otherwise the first live "All Products" one. */
export function findDiscountForItem(sku: string, discounts: DiscountRule[], onDate: string = localToday()): DiscountRule | null {
  const live = discounts.filter((d) => isDiscountLive(d, onDate));
  return live.find((d) => d.appliesTo === 'selected' && (d.productSkus || []).includes(sku)) ?? live.find((d) => d.appliesTo === 'all') ?? null;
}

export function computeCartTotals(
  cart: PricingLine[],
  pricingMode: 'exclusive' | 'inclusive',
  manual: ManualDiscount | null,
  discounts: DiscountRule[],
  onDate: string = localToday()
): CartTotals {
  const prelim = cart.map((l) => {
    const price = Number(l.price);
    const qty = Number(l.qty);
    const originalAmount = price * qty;
    const rule = findDiscountForItem(l.sku, discounts, onDate);
    const autoDiscountAmount = rule ? round2(calcDiscountAmount(rule.type, Number(rule.value || 0), originalAmount)) : 0;
    return { l, price, qty, originalAmount, autoDiscountAmount, autoName: rule ? rule.name : null, afterAuto: originalAmount - autoDiscountAmount };
  });

  const sumAfterAuto = prelim.reduce((s, p) => s + p.afterAuto, 0);
  const manualDiscountTotal = round2(calcDiscountAmount(manual?.type ?? 'percent', Number(manual?.value || 0), sumAfterAuto));

  let subtotalOriginal = 0, autoDiscountTotal = 0, taxableTotal = 0, gstTotal = 0, grandTotal = 0;
  const lines: PricedLine[] = prelim.map((p) => {
    const share = sumAfterAuto > 0 ? p.afterAuto / sumAfterAuto : 0;
    const lineManual = round2(manualDiscountTotal * share);
    const lineNet = Math.max(0, p.afterAuto - lineManual);
    const rate = Number(p.l.tax || 0);
    let taxable: number, gst: number, gross: number;
    if (pricingMode === 'inclusive') {
      gross = lineNet;
      taxable = rate > 0 ? gross / (1 + rate / 100) : gross;
      gst = gross - taxable;
    } else {
      taxable = lineNet;
      gst = taxable * (rate / 100);
      gross = taxable + gst;
    }
    taxable = round2(taxable);
    gst = round2(gst);
    gross = round2(gross);

    subtotalOriginal += p.originalAmount;
    autoDiscountTotal += p.autoDiscountAmount;
    taxableTotal += taxable;
    gstTotal += gst;
    grandTotal += gross;

    return {
      sku: p.l.sku, name: p.l.name, price: p.price, qty: p.qty, tax: rate, unit: p.l.unit || 'pcs',
      originalAmount: round2(p.originalAmount),
      autoDiscountAmount: p.autoDiscountAmount,
      discountAmount: round2(p.autoDiscountAmount + lineManual),
      discountName: p.autoName,
      taxableAmount: taxable, gstAmount: gst, finalAmount: gross
    };
  });

  return {
    lines,
    subtotalOriginal: round2(subtotalOriginal),
    autoDiscountTotal: round2(autoDiscountTotal),
    manualDiscountTotal,
    discountTotal: round2(autoDiscountTotal + manualDiscountTotal),
    taxableTotal: round2(taxableTotal),
    gstTotal: round2(gstTotal),
    grandTotal: round2(grandTotal)
  };
}
