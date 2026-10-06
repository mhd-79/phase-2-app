import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-POS-008 &middot; FR-P1-STK-003</span>
          <h1>Returns &amp; Refunds</h1>
          <p>Lookup past invoices to process full or partial item returns and restore stock.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--space-6)">
        <div class="row" style="gap:var(--space-3)">
          <input class="input input-lg" [(ngModel)]="searchInvoiceNo" placeholder="Enter invoice number (e.g. INV-FY26-01025)" style="max-width:400px" (keyup.enter)="lookupInvoice()">
          <button class="btn btn-primary btn-lg" (click)="lookupInvoice()">Search Invoice</button>
        </div>
      </div>

      @if (sale) {
        <div class="card card-flush">
          <div class="card-header">
            <h3>Invoice {{ sale.invoiceNo }} &middot; {{ sale.time | date:'medium' }}</h3>
            <span class="badge" [class.badge-success]="sale.status === 'COMPLETED'" [class.badge-warning]="sale.status !== 'COMPLETED'">{{ sale.status }}</span>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>Return</th>
                  <th>Item Name</th>
                  <th>SKU</th>
                  <th>Original Qty</th>
                  <th>Return Qty</th>
                  <th>Condition</th>
                  <th>Return Reason</th>
                  <th>Action</th>
                  <th class="num">Unit Price</th>
                  <th class="num">Total</th>
                </tr>
              </thead>
              <tbody>
                @for (item of sale.lines; track item.sku) {
                  <tr>
                    <td><input type="checkbox" [(ngModel)]="item.selected"></td>
                    <td>{{ item.name }}</td>
                    <td class="mono">{{ item.sku }}</td>
                    <td>{{ item.qty }} {{ item.unit }}</td>
                    <td>
                      <input class="input" type="number" min="0.1" [max]="item.qty" [(ngModel)]="item.returnQty" style="width:90px" [disabled]="!item.selected">
                    </td>
                    <td>
                      <select class="select" [(ngModel)]="item.condition" [disabled]="!item.selected" style="min-width:120px" aria-label="Item condition">
                        <option value="Good">Good</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Warranty">Warranty</option>
                      </select>
                    </td>
                    <td>
                      <select class="select" [(ngModel)]="item.reason" (ngModelChange)="onReasonChange(item)" [disabled]="!item.selected" style="min-width:150px" aria-label="Return reason">
                        <option value="">No reason</option>
                        <option value="Customer Return">Customer Return</option>
                        <option value="Damaged">Damaged</option>
                        <option value="Not Willing">Not Willing</option>
                        <option value="Warranty">Warranty</option>
                        <option value="Other">Other</option>
                      </select>
                      @if (item.reason === 'Other') {
                        <input class="input" [(ngModel)]="item.otherReason" [disabled]="!item.selected" placeholder="Enter reason" maxlength="120" style="min-width:150px;margin-top:var(--space-1)" aria-label="Other return reason">
                      }
                    </td>
                    <td>
                      @if (policy === 'BOTH') {
                        <select class="select" [(ngModel)]="item.action" [disabled]="!item.selected" style="min-width:110px" aria-label="Return or exchange">
                          <option value="Return">Return</option>
                          <option value="Exchange">Exchange</option>
                        </select>
                      } @else { <span class="text-sm">{{ policy === 'RETURN' ? 'Return' : 'Exchange' }}</span> }
                    </td>
                    <td class="num mono">₹{{ item.price.toFixed(2) }}</td>
                    <td class="num mono">₹{{ (item.price * (item.returnQty || item.qty)).toFixed(2) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card-body row-between" style="border-top:1px solid var(--border)">
            <span class="hint" style="max-width:520px">@if (hasHeldItems()) { Damaged / Warranty items are not added back to stock until an Admin reviews them (Stock Adjustment). }</span>
            <button class="btn btn-danger btn-lg" [disabled]="isProcessing" (click)="processReturn()">
              {{ isProcessing ? 'Processing Refund...' : 'Process Refund & Restore Stock' }}
            </button>
          </div>
        </div>
      }

      @if (resultMsg) {
        <div class="card" style="margin-top:var(--space-6);background:var(--success-50);border-color:var(--success-500)">
          <h4 style="color:var(--success-700)">{{ resultMsg }}</h4>
        </div>
      }
    </main>
  `
})
export class ReturnsComponent implements OnInit {
  api = inject(ApiService);
  private route = inject(ActivatedRoute);
  searchInvoiceNo = 'INV-FY26-01025';
  sale: any = null;
  policy: 'RETURN' | 'EXCHANGE' | 'BOTH' = 'BOTH';
  resultMsg: string | null = null;
  isProcessing = false;

  async ngOnInit() {
    this.policy = await this.api.getReturnPolicy();
    // Opened from a customer's purchase history: go straight to that invoice
    const invoice = this.route.snapshot.queryParamMap.get('invoice');
    if (invoice) {
      this.searchInvoiceNo = invoice;
      void this.lookupInvoice();
    }
  }

  async lookupInvoice() {
    this.resultMsg = null;
    if (!this.searchInvoiceNo) return;
    const res = await this.api.getSaleByInvoice(this.searchInvoiceNo.trim());
    if (res) {
      this.sale = {
        ...res,
        invoiceNo: res.invoiceNo || res.invoice_no,   // the API sends invoice_no
        lines: (res.lines || []).map((l: any) => ({
          ...l,
          selected: false,
          returnQty: l.qty,
          condition: 'Good',
          reason: '',
          otherReason: '',
          action: this.policy === 'EXCHANGE' ? 'Exchange' : 'Return'
        }))
      };
    } else {
      alert('Invoice not found');
    }
  }

  hasHeldItems(): boolean {
    return !!this.sale?.lines?.some((l: any) => l.selected && l.condition !== 'Good');
  }

  /** Picking the reason Damaged / Warranty on an item suggests that condition (the cashier can still change it). */
  onReasonChange(item: any) {
    if (item.condition === 'Good' && (item.reason === 'Damaged' || item.reason === 'Warranty')) item.condition = item.reason;
  }

  async processReturn() {
    if (this.isProcessing || !this.sale) return;
    const selected = this.sale.lines.filter((l: any) => l.selected);
    if (selected.length === 0) {
      alert('Select at least one item to return');
      return;
    }
    this.isProcessing = true;
    try {
      const returnItems = selected.map((l: any) => ({
        sku: l.sku, qty: l.returnQty || l.qty, condition: l.condition || 'Good', action: l.action || 'Return',
        reason: (l.reason === 'Other' ? (l.otherReason || '').trim() || 'Other' : l.reason) || null
      }));
      const payload = {
        invoice_no: this.sale.invoiceNo,
        items: returnItems
      };
      const res = await this.api.processReturn(payload);
      this.resultMsg = res.message || 'Return processed successfully';
      this.sale = null;
    } catch (err: any) {
      alert(err?.error?.detail || err?.message || 'Failed to process return');
    } finally {
      this.isProcessing = false;
    }
  }
}
