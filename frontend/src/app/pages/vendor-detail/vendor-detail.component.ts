import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-vendor-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-PUR-006</span>
        <h1><span>{{ vendor()?.name || 'Vendor Ledger' }}</span></h1>
        <p>Running payable balance based on purchases, returns and payments recorded against this vendor.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-secondary" routerLink="/vendors">&larr; All Vendors</a>
      </div>
    </div>

    @if (vendor()) {
      <div class="card" style="margin-bottom:var(--space-5)">
        <div class="row-between wrap" style="gap:var(--space-4)">
          <div>
            <h3>{{ vendor().name }}</h3>
            <p class="text-sm text-muted">
              {{ vendor().category }} &middot; {{ vendor().contact }} &middot; {{ vendor().phone }} &middot; {{ vendor().email }}
            </p>
          </div>
          <div>
            <div class="text-xs text-muted">Payment Terms</div>
            <strong>{{ vendor().terms }}</strong>
          </div>
        </div>
      </div>
    }

    <div class="grid grid-3" style="margin-bottom:var(--space-5)">
      <div class="card stat-card">
        <span class="stat-label">Outstanding Payable</span>
        <span class="stat-value" style="color:var(--warning-700)">₹{{ (vendor()?.payable || 0).toLocaleString('en-IN') }}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-label">Open Purchase Orders</span>
        <span class="stat-value">{{ openPosCount() }}</span>
      </div>
      <div class="card">
        <button class="btn btn-primary btn-block" (click)="showPaymentModal = true">Record Payment</button>
      </div>
    </div>

    <div class="card card-flush">
      <div class="card-header">
        <h3>Ledger — Purchases, Returns &amp; Payments</h3>
      </div>
      @if (ledgerEntries().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Reference</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              @for (entry of ledgerEntries(); track $index) {
                <tr>
                  <td>{{ entry.date }}</td>
                  <td>
                    <span class="badge" [ngClass]="{
                      'badge-info': entry.type === 'Purchase',
                      'badge-warning': entry.type === 'Return',
                      'badge-success': entry.type === 'Payment'
                    }">{{ entry.type }}</span>
                  </td>
                  <td class="mono">{{ entry.ref }}</td>
                  <td class="num mono">
                    {{ entry.amount >= 0 ? '+' : '−' }}₹{{ Math.abs(entry.amount).toFixed(2) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state">
          <p class="text-sm">No purchase, return or payment activity recorded yet. Seeded historical payable balance shown above.</p>
        </div>
      }
    </div>

    <!-- Record Payment Modal -->
    @if (showPaymentModal) {
      <div class="modal-overlay open">
        <div class="modal">
          <div class="modal-header">
            <h3>Record Payment</h3>
            <button class="icon-btn" (click)="showPaymentModal = false">✕</button>
          </div>
          <div class="modal-body stack">
            <div class="field">
              <label>Amount</label>
              <input class="input input-lg" type="number" min="0" [(ngModel)]="paymentAmount">
            </div>
            <div class="field">
              <label>Mode</label>
              <select class="select" [(ngModel)]="paymentMode">
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>UPI</option>
                <option>Cash</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" [disabled]="isRecordingPayment" (click)="showPaymentModal = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="isRecordingPayment" (click)="submitPayment()">
              {{ isRecordingPayment ? 'Recording...' : 'Record Payment' }}
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class VendorDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);

  Math = Math;
  vendorId = '';
  vendor = signal<any>(null);
  ledgerEntries = signal<any[]>([]);
  openPosCount = signal<number>(0);

  showPaymentModal = false;
  paymentAmount = 0;
  paymentMode = 'Bank Transfer';
  isRecordingPayment = false;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.vendorId = params['vendor'] || '';
      if (this.vendorId) {
        this.loadLedger();
      }
    });
  }

  async loadLedger() {
    const data = await this.api.getVendorLedger(this.vendorId);
    this.vendor.set(data.vendor);
    this.ledgerEntries.set(data.ledger || []);
    this.openPosCount.set(data.open_pos || 0);
  }

  async submitPayment() {
    if (this.isRecordingPayment) return;
    if (!this.paymentAmount || this.paymentAmount <= 0) return;
    this.isRecordingPayment = true;
    try {
      await this.api.recordVendorPayment(this.vendorId, this.paymentAmount, this.paymentMode);
      this.showPaymentModal = false;
      this.paymentAmount = 0;
      await this.loadLedger();
    } finally {
      this.isRecordingPayment = false;
    }
  }
}
