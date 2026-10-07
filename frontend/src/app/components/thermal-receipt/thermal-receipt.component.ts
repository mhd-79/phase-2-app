import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface ThermalReceiptLine {
  name: string;
  price: number;
  qty: number;
  unit?: string;
  priceType?: string;
  /** Discount taken off this line (automatic offer plus its share of the bill discount) and the offer's name; the server sends them snake_case. */
  discountAmount?: number;
  discountName?: string | null;
  discount_amount?: number;
  discount_name?: string | null;
}

export interface ThermalReceiptTender {
  mode: string;
  amount: number;
}

/** Narrow thermal-paper bill: centred shop header, NO / DATE row, NAME-RATE-QTY-AMOUNT table, big TOTAL and a thank-you line. */
@Component({
  selector: 'app-thermal-receipt',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tr">
      <div class="tr-head">
        <div class="tr-shop">{{ storeName }}</div>
        @if (storeLine) { <div class="tr-addr">{{ storeLine }}</div> }
      </div>

      <div class="tr-meta">
        <span>NO : {{ invoiceNo }}</span>
        <span class="tr-bold">{{ billType() }}</span>
      </div>
      <div class="tr-meta">
        <span>DATE: {{ time | date:'dd-MM-yyyy' }}</span>
        <span class="tr-bold">{{ time | date:'hh:mm a' }}</span>
      </div>
      @if (customerLine) { <div class="tr-small">CUSTOMER: {{ customerLine }}</div> }

      <div class="tr-table">
        <div class="tr-row tr-th"><span>NAME</span><span class="r">RATE</span><span class="r">QTY</span><span class="r">AMOUNT</span></div>
        @for (l of lines; track $index) {
          <div class="tr-row">
            <span class="tr-name">{{ l.name }}{{ l.priceType === 'wholesale' ? ' (W)' : '' }}</span>
            <span class="r">{{ l.price.toFixed(2) }}</span>
            <span class="r">{{ l.unit === 'kg' ? l.qty.toFixed(3) : l.qty }}</span>
            <span class="r">{{ (l.price * l.qty).toFixed(2) }}</span>
          </div>
          @if (lineDiscount(l) > 0) {
            <div class="tr-disc"><span>{{ lineDiscountName(l) || 'Discount' }}</span><span>-{{ lineDiscount(l).toFixed(2) }}</span></div>
          }
        }
      </div>

      <div class="tr-qtyline"><span>QTY : {{ totalQty() }}</span><span>{{ linesTotal().toFixed(2) }}</span></div>

      @if (discountTotal > 0) { <div class="tr-small tr-between"><span>DISCOUNT</span><span>-{{ discountTotal.toFixed(2) }}</span></div> }
      @if (gstTotal != null) {
        <div class="tr-tax">
          <span>SALES: {{ (taxable ?? 0).toFixed(2) }}</span>
          <span>CGST: {{ (gstTotal / 2).toFixed(2) }}</span>
          <span>SGST: {{ (gstTotal / 2).toFixed(2) }}</span>
        </div>
      }
      <div class="tr-total">TOTAL : {{ grandTotal.toFixed(2) }}</div>
      @if (pricingMode === 'inclusive') { <div class="tr-small tr-center">(Prices inclusive of GST)</div> }

      @for (t of paidTenders(); track $index) {
        <div class="tr-small tr-between"><span>{{ t.mode | uppercase }} PAID</span><span>{{ t.amount.toFixed(2) }}</span></div>
      }
      @if (changeDue > 0) { <div class="tr-small tr-between tr-bold"><span>CHANGE RETURNED</span><span>{{ changeDue.toFixed(2) }}</span></div> }

      <div class="tr-thanks">*THANKYOU VISIT AGAIN*</div>
    </div>
  `,
  styles: [`
    .tr { width: 100%; max-width: 320px; margin: 0 auto; padding: 14px 12px; background: #fff; color: #111; border: 1px solid var(--border);
          font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.35; }
    .tr-head { text-align: center; margin-bottom: 10px; }
    .tr-shop { font-size: 17px; font-weight: 700; letter-spacing: 0.02em; text-transform: uppercase; }
    .tr-addr { font-size: 12px; text-transform: uppercase; margin-top: 2px; }
    .tr-meta { display: flex; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 13px; margin-top: 4px; }
    .tr-bold { font-weight: 700; }
    .tr-small { font-size: 12px; margin-top: 4px; }
    .tr-center { text-align: center; }
    .tr-between { display: flex; justify-content: space-between; gap: 8px; }
    .tr-table { margin-top: 10px; border-top: 1.5px solid #111; border-bottom: 1.5px solid #111; padding: 4px 0; }
    .tr-row { display: grid; grid-template-columns: 1fr 52px 40px 62px; gap: 4px; padding: 2px 0; font-size: 12px; align-items: baseline; }
    .tr-th { font-weight: 700; border-bottom: 1.5px solid #111; padding-bottom: 3px; margin-bottom: 3px; }
    .tr-row .r { text-align: right; font-variant-numeric: tabular-nums; }
    .tr-name { overflow-wrap: anywhere; text-transform: uppercase; }
    .tr-disc { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 600; padding: 0 0 2px 8px; text-transform: uppercase; }
    .tr-qtyline { display: flex; justify-content: space-between; font-weight: 700; margin-top: 6px; }
    .tr-tax { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; font-weight: 700; margin-top: 6px; border-top: 1.5px solid #111; padding-top: 4px; }
    .tr-total { text-align: center; font-size: 22px; font-weight: 800; margin: 10px 0 6px; padding-bottom: 6px; border-bottom: 1.5px solid #111; }
    .tr-thanks { text-align: center; font-size: 12px; font-weight: 700; margin-top: 8px; }
  `]
})
export class ThermalReceiptComponent {
  @Input() storeName = '';
  @Input() storeLine = '';
  @Input() invoiceNo = '';
  @Input() time: Date | string | null = new Date();
  @Input() customerLine = '';
  @Input() lines: ThermalReceiptLine[] = [];
  @Input() taxable: number | null | undefined = null;
  @Input() gstTotal: number | null | undefined = null;
  @Input() discountTotal = 0;
  @Input() grandTotal = 0;
  @Input() pricingMode: string | null | undefined = null;
  @Input() tenders: ThermalReceiptTender[] = [];
  @Input() changeDue = 0;

  lineDiscount(l: ThermalReceiptLine): number { return l.discountAmount ?? l.discount_amount ?? 0; }
  lineDiscountName(l: ThermalReceiptLine): string | null { return l.discountName ?? l.discount_name ?? null; }

  paidTenders(): ThermalReceiptTender[] { return (this.tenders || []).filter(t => t.amount > 0); }

  /** "CASH BILL" / "UPI BILL" when one payment mode was used, otherwise just "BILL". */
  billType(): string {
    const modes = [...new Set(this.paidTenders().map(t => (t.mode || '').toUpperCase()))].filter(Boolean);
    return modes.length === 1 ? `${modes[0]} BILL` : 'BILL';
  }

  totalQty(): number { return Number((this.lines || []).reduce((s, l) => s + l.qty, 0).toFixed(3)); }
  linesTotal(): number { return (this.lines || []).reduce((s, l) => s + l.price * l.qty, 0); }
}
