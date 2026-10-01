import { Component, inject } from '@angular/core';
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
                    <td class="num mono">₹{{ item.price.toFixed(2) }}</td>
                    <td class="num mono">₹{{ (item.price * (item.returnQty || item.qty)).toFixed(2) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card-body row-between" style="border-top:1px solid var(--border)">
            <div class="field">
              <label>Return Reason</label>
              <input class="input" [(ngModel)]="returnReason" placeholder="e.g. Damaged package / Customer exchange" style="width:320px">
            </div>
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
export class ReturnsComponent {
  api = inject(ApiService);
  searchInvoiceNo = 'INV-FY26-01025';
  sale: any = null;
  returnReason = 'Customer return';
  resultMsg: string | null = null;
  isProcessing = false;

  async lookupInvoice() {
    this.resultMsg = null;
    if (!this.searchInvoiceNo) return;
    const res = await this.api.getSaleByInvoice(this.searchInvoiceNo.trim());
    if (res) {
      this.sale = {
        ...res,
        lines: (res.lines || []).map((l: any) => ({
          ...l,
          selected: false,
          returnQty: l.qty
        }))
      };
    } else {
      alert('Invoice not found');
    }
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
      const returnItems = selected.map((l: any) => ({ sku: l.sku, qty: l.returnQty || l.qty }));
      const payload = {
        invoice_no: this.sale.invoiceNo,
        reason: this.returnReason,
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
