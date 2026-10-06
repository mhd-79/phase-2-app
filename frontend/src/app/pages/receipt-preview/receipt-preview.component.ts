import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-receipt-preview',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-POS-007</span>
          <h1>Receipt Preview</h1>
          <p>Thermal print preview for historical or current sale invoices.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" (click)="printReceipt()">Print Thermal Receipt</button>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--space-6)">
        <div class="row" style="gap:var(--space-3)">
          <input class="input" [(ngModel)]="invoiceNo" placeholder="Invoice Number (e.g. INV-FY26-01025)" style="width:300px" (keyup.enter)="loadReceipt()">
          <button class="btn btn-secondary" (click)="loadReceipt()">Load Invoice</button>
        </div>
      </div>

      <div class="card mono" style="max-width:400px;margin:0 auto;padding:var(--space-6);background:#fff;border:1px solid var(--border)">
        <div style="text-align:center;margin-bottom:var(--space-3)">
          <strong>{{ storeName }}</strong>
          <div class="text-xs text-muted">{{ storeLine }}</div>
        </div>
        <hr class="divider">
        <div class="row-between text-sm"><span>Invoice</span><span class="mono">{{ invoiceNo }}</span></div>
        <div class="row-between text-sm"><span>Date</span><span class="mono">{{ saleDate | date:'medium' }}</span></div>
        <hr class="divider">
        @for (line of lines; track line.sku) {
          <div class="row-between text-sm">
            <span>{{ line.name }} &times;{{ line.qty }}</span>
            <span class="mono">₹{{ (line.price * line.qty).toFixed(2) }}</span>
          </div>
        }
        <hr class="divider">
        <div class="row-between" style="font-weight:700"><span>Grand Total</span><span class="mono">₹{{ grandTotal.toFixed(2) }}</span></div>
        <hr class="divider">
        <p class="text-xs text-muted" style="text-align:center">Thank you for shopping with us!</p>
      </div>
    </main>
  `
})
export class ReceiptPreviewComponent implements OnInit {
  api = inject(ApiService);
  route = inject(ActivatedRoute);

  private auth = inject(AuthService);
  storeName = 'Okuto Mart';
  storeLine = '12, MG Road, Bengaluru · GSTIN 29ABCDE1234F1Z5';

  invoiceNo = 'INV-FY26-01025';
  saleDate = new Date();
  grandTotal = 435.0;
  lines = [
    { sku: 'BEV-001', name: 'Cola 500ml', qty: 2, price: 45 },
    { sku: 'GRO-001', name: 'Basmati Rice 1kg', qty: 2, price: 135 },
    { sku: 'SNK-001', name: 'Potato Chips 90g', qty: 2, price: 37.5 }
  ];

  async ngOnInit() {
    const owner = localStorage.getItem('pos_cache_owner');
    if (owner && owner !== 'default') {
      // sample receipt content is prototype demo data for the original store only
      this.invoiceNo = '';
      this.grandTotal = 0;
      this.lines = [];
      const u = this.auth.currentUser();
      let saved: any = {};
      try { saved = JSON.parse(localStorage.getItem('pos_demo_store_settings') || '{}'); } catch {}
      this.storeName = saved.name || u.tenantName || '';
      this.storeLine = [saved.address, saved.gstin ? `GSTIN ${saved.gstin}` : ''].filter(Boolean).join(' · ');
    }
    this.route.queryParams.subscribe(async (params) => {
      if (params['invoice_no']) {
        this.invoiceNo = params['invoice_no'];
        await this.loadReceipt();
      }
    });
  }

  async loadReceipt() {
    const sale = await this.api.getSaleByInvoice(this.invoiceNo);
    if (sale) {
      this.lines = sale.lines || [];
      this.grandTotal = sale.grandTotal || sale.grand_total || 0;
      this.saleDate = new Date(sale.time);
    }
  }

  printReceipt() {
    window.print();
  }
}
