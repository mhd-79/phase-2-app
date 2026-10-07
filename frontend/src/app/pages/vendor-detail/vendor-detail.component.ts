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
        @if (vendor()) {
          <a class="btn btn-secondary" routerLink="/purchase-orders" [queryParams]="{ prefillVendor: vendorId }">Create Purchase Order</a>
          <a class="btn btn-secondary" routerLink="/purchase-returns" [queryParams]="{ vendor: vendorId }">Purchase Return</a>
          <button class="btn btn-secondary" (click)="viewProducts()">View Products</button>
          <button class="btn btn-secondary" (click)="exportLedger()">Export Ledger</button>
        }
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
          <div class="row" style="gap:var(--space-6)">
            <div>
              <div class="text-xs text-muted">GSTIN</div>
              <strong class="mono">{{ vendor().gstin || '—' }}</strong>
            </div>
            <div>
              <div class="text-xs text-muted">Payment Terms</div>
              <strong>{{ vendor().terms }}</strong>
            </div>
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

    @if (summary(); as sm) {
      @if (sm.alerts.length > 0) {
        <div class="card" style="margin-bottom:var(--space-5);border-color:var(--warning-500);background:var(--warning-50)">
          <h3 style="margin-bottom:var(--space-2)">Alerts</h3>
          @for (a of sm.alerts; track $index) {
            <div class="row" style="gap:var(--space-2);align-items:flex-start;margin-top:var(--space-1)">
              <span class="badge" [ngClass]="a.severity === 'danger' ? 'badge-danger' : 'badge-warning'">{{ alertLabel(a.type) }}</span>
              <span class="text-sm">{{ a.message }}</span>
            </div>
          }
        </div>
      }

      <h3 style="margin-bottom:var(--space-3)">Financial Summary</h3>
      <div class="grid grid-4" style="margin-bottom:var(--space-3)">
        <div class="card stat-card"><span class="stat-label">Total Outstanding</span><span class="stat-value" style="color:var(--warning-700)">₹{{ money(sm.financial.totalOutstanding) }}</span></div>
        <div class="card stat-card"><span class="stat-label">Due Today</span><span class="stat-value">₹{{ money(sm.financial.dueToday) }}</span></div>
        <div class="card stat-card"><span class="stat-label">Due This Week</span><span class="stat-value">₹{{ money(sm.financial.dueThisWeek) }}</span><span class="stat-delta text-muted">today + next 6 days</span></div>
        <div class="card stat-card"><span class="stat-label">Overdue Amount</span><span class="stat-value" [style.color]="sm.financial.overdue > 0 ? 'var(--danger-700)' : null">₹{{ money(sm.financial.overdue) }}</span></div>
      </div>
      <div class="grid grid-4" style="margin-bottom:var(--space-5)">
        <div class="card stat-card"><span class="stat-label">Next Payment Due</span><span class="stat-value" style="font-size:var(--text-xl)">{{ sm.financial.nextDueDate || '—' }}</span><span class="stat-delta text-muted">{{ sm.financial.paymentTerms }}</span></div>
        <div class="card stat-card"><span class="stat-label">Total Purchases</span><span class="stat-value">₹{{ money(sm.financial.totalPurchases) }}</span></div>
        <div class="card stat-card"><span class="stat-label">Total Returns</span><span class="stat-value">₹{{ money(sm.financial.totalReturns) }}</span></div>
        <div class="card stat-card"><span class="stat-label">Total Payments</span><span class="stat-value">₹{{ money(sm.financial.totalPayments) }}</span></div>
      </div>

      <h3 style="margin-bottom:var(--space-3)">Payable Aging</h3>
      <div class="grid grid-5" style="margin-bottom:var(--space-2);grid-template-columns:repeat(5,minmax(0,1fr))">
        <div class="card stat-card"><span class="stat-label">Current</span><span class="stat-value" style="font-size:var(--text-xl)">₹{{ money(sm.aging.current) }}</span></div>
        <div class="card stat-card"><span class="stat-label">1-30 Days</span><span class="stat-value" style="font-size:var(--text-xl)">₹{{ money(sm.aging.d1_30) }}</span></div>
        <div class="card stat-card"><span class="stat-label">31-60 Days</span><span class="stat-value" style="font-size:var(--text-xl)">₹{{ money(sm.aging.d31_60) }}</span></div>
        <div class="card stat-card"><span class="stat-label">61-90 Days</span><span class="stat-value" style="font-size:var(--text-xl)">₹{{ money(sm.aging.d61_90) }}</span></div>
        <div class="card stat-card"><span class="stat-label">90+ Days</span><span class="stat-value" style="font-size:var(--text-xl);color:var(--danger-700)">₹{{ money(sm.aging.d90_plus) }}</span></div>
      </div>
      <p class="text-xs text-muted" style="margin-bottom:var(--space-5)">
        Days are counted past each receipt's due date (receipt date + payment terms); payments and returns clear the oldest receipts first.
        @if (sm.financial.openingBalance > 0) { Includes ₹{{ money(sm.financial.openingBalance) }} opening balance from before these records, shown as Current. }
      </p>

      <h3 style="margin-bottom:var(--space-3)">Purchase Summary</h3>
      <div class="grid grid-4" style="margin-bottom:var(--space-5)">
        <div class="card stat-card"><span class="stat-label">Total Purchase Value</span><span class="stat-value">₹{{ money(sm.purchase.purchaseValue) }}</span></div>
        <div class="card stat-card"><span class="stat-label">Purchases (receipts)</span><span class="stat-value">{{ sm.purchase.purchaseCount }}</span></div>
        <div class="card stat-card"><span class="stat-label">Return Value</span><span class="stat-value">₹{{ money(sm.purchase.returnValue) }}</span><span class="stat-delta text-muted">{{ sm.purchase.returnCount }} return(s)</span></div>
        <div class="card stat-card"><span class="stat-label">Net Payable</span><span class="stat-value" style="color:var(--warning-700)">₹{{ money(sm.purchase.netPayable) }}</span><span class="stat-delta text-muted">net purchases ₹{{ money(sm.purchase.netPurchases) }}</span></div>
      </div>
    }

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
                <th class="num">Balance</th>
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
                  <td class="num mono">{{ entry.balance != null ? '₹' + money(entry.balance) : '' }}</td>
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

    @if (summary(); as sm) {
      <div class="card" style="margin-top:var(--space-5)">
        <div class="row-between wrap" style="gap:var(--space-3)">
          <h3>Vendor Performance</h3>
          <a class="btn btn-secondary btn-sm" routerLink="/ai-insights" [queryParams]="{ tab: 'prices' }">Compare prices across vendors</a>
        </div>
        <div class="grid grid-4" style="margin-top:var(--space-4)">
          <div class="stat-card"><span class="stat-label">Delivery performance</span><span class="stat-value">{{ pct(sm.performance.onTimePct) }}</span><span class="stat-delta text-muted">POs delivered by the expected date</span></div>
          <div class="stat-card"><span class="stat-label">Fulfilment rate</span><span class="stat-value">{{ pct(sm.performance.fulfillmentPct) }}</span><span class="stat-delta text-muted">quantity received vs ordered</span></div>
          <div class="stat-card"><span class="stat-label">Return rate</span><span class="stat-value">{{ pct(sm.performance.returnRatePct) }}</span><span class="stat-delta text-muted">units returned vs received</span></div>
          <div class="stat-card"><span class="stat-label">Avg delivery time</span><span class="stat-value">{{ sm.performance.avgDeliveryDays != null ? sm.performance.avgDeliveryDays + ' days' : '—' }}</span><span class="stat-delta text-muted">PO date to first receipt</span></div>
        </div>
        @if (perf()) {
          <div class="text-sm" style="margin-top:var(--space-3)"><strong>AI score:</strong> {{ perf().score ?? '—' }}@if (perf().grade) { &middot; Grade {{ perf().grade }} }</div>
          @for (n of perf().notes || []; track $index) { <div class="text-xs text-muted" style="margin-top:var(--space-1)">&bull; {{ n }}</div> }
        }
      </div>
    }

    <div class="card card-flush" style="margin-top:var(--space-5)">
      <div class="card-header">
        <h3>Purchase Orders</h3>
        @if (summary(); as sm) {
          <div class="row wrap" style="gap:var(--space-2)">
            <span class="badge badge-warning">Pending {{ sm.purchaseOrders.pending }}</span>
            <span class="badge badge-warning">Partially Received {{ sm.purchaseOrders.partiallyReceived }}</span>
            <span class="badge badge-success">Received {{ sm.purchaseOrders.received }}</span>
            <span class="badge" [ngClass]="sm.purchaseOrders.overdue > 0 ? 'badge-danger' : 'badge-neutral'">Overdue {{ sm.purchaseOrders.overdue }}</span>
          </div>
        }
      </div>
      @if (purchaseOrders().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>PO</th><th>Date</th><th>Expected</th><th>Status</th><th class="num">Value (incl. GST)</th></tr></thead>
            <tbody>
              @for (po of purchaseOrders(); track po.id) {
                <tr>
                  <td><a class="mono" [routerLink]="['/po-detail']" [queryParams]="{ po: po.id }">{{ po.id }}</a></td>
                  <td>{{ po.date }}</td>
                  <td>{{ po.expected }}</td>
                  <td>
                    <span class="badge badge-neutral">{{ po.status }}</span>
                    @if (poOverdueDays(po.id); as late) { <span class="badge badge-danger" style="margin-left:4px">Overdue {{ late }}d</span> }
                  </td>
                  <td class="num mono">₹{{ (po.total || 0).toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state"><p class="text-sm">No purchase orders raised with this vendor yet.</p></div>
      }
    </div>

    <div class="card card-flush" style="margin-top:var(--space-5)">
      <div class="card-header"><h3>Goods Receipts</h3></div>
      @if (grns().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>Receipt</th><th>Purchase Order</th><th>Date</th><th class="num">Items</th><th class="num">Value (incl. GST)</th></tr></thead>
            <tbody>
              @for (g of grns(); track g.id) {
                <tr>
                  <td class="mono">{{ g.id }}</td>
                  <td class="mono">{{ g.poId || 'Direct' }}</td>
                  <td>{{ g.date }}</td>
                  <td class="num">{{ (g.lines || []).length }}</td>
                  <td class="num mono">₹{{ (g.total || 0).toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state"><p class="text-sm">No stock received from this vendor yet.</p></div>
      }
    </div>

    <div class="card card-flush" style="margin-top:var(--space-5)">
      <div class="card-header"><h3>Payment History</h3></div>
      @if ((summary()?.paymentHistory || []).length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>Date</th><th>Payment</th><th class="num">Amount</th><th>Method</th><th>Reference</th><th class="num">Balance After</th></tr></thead>
            <tbody>
              @for (p of summary().paymentHistory; track p.id) {
                <tr>
                  <td>{{ p.date }}</td>
                  <td class="mono">{{ p.id }}</td>
                  <td class="num mono">₹{{ money(p.amount) }}</td>
                  <td>{{ p.mode || '—' }}</td>
                  <td class="mono">{{ p.reference || '—' }}</td>
                  <td class="num mono">{{ p.balanceAfter != null ? '₹' + money(p.balanceAfter) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state"><p class="text-sm">No payments recorded against this vendor yet.</p></div>
      }
    </div>

    <div id="vendor-products" class="card card-flush" style="margin-top:var(--space-5)">
      <div class="card-header"><h3>Products Supplied</h3></div>
      @if (products().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>SKU</th><th>Item</th><th class="num">Last Cost</th><th class="num">Ordered</th><th class="num">Received</th><th class="num">In Stock</th></tr></thead>
            <tbody>
              @for (pr of products(); track pr.sku) {
                <tr>
                  <td class="mono">{{ pr.sku }}</td>
                  <td>{{ pr.name }} @if (pr.preferred) { <span class="badge badge-info">Preferred</span> }</td>
                  <td class="num mono">{{ pr.lastCost != null ? '₹' + pr.lastCost.toFixed(2) : '—' }}</td>
                  <td class="num">{{ pr.orderedQty }}</td>
                  <td class="num">{{ pr.receivedQty }}</td>
                  <td class="num">{{ pr.stock ?? '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state"><p class="text-sm">No products linked to this vendor yet.</p></div>
      }
    </div>

    <div class="card card-flush" style="margin-top:var(--space-5)">
      <div class="card-header"><h3>Purchase Price History</h3></div>
      @if ((summary()?.priceHistory || []).length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead><tr><th>SKU</th><th>Item</th><th class="num">Current Price</th><th class="num">Previous</th><th class="num">Change</th><th>Price Changes (date &rarr; price)</th></tr></thead>
            <tbody>
              @for (h of summary().priceHistory; track h.sku) {
                <tr>
                  <td class="mono">{{ h.sku }}</td>
                  <td>{{ h.name }}</td>
                  <td class="num mono">₹{{ h.current.toFixed(2) }}</td>
                  <td class="num mono">{{ h.previous != null ? '₹' + h.previous.toFixed(2) : '—' }}</td>
                  <td class="num">
                    @if (h.changePct != null) {
                      <span class="badge" [ngClass]="h.changePct > 0 ? 'badge-danger' : (h.changePct < 0 ? 'badge-success' : 'badge-neutral')">{{ h.changePct > 0 ? '+' : '' }}{{ h.changePct }}%</span>
                    } @else { <span class="text-muted">no change yet</span> }
                  </td>
                  <td class="text-xs mono" style="white-space:normal">
                    @for (pt of h.history; track $index; let last = $last) { {{ pt.date }} &rarr; ₹{{ pt.cost.toFixed(2) }}@if (!last) { &nbsp;&middot;&nbsp; } }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state"><p class="text-sm">No purchase prices recorded for this vendor yet.</p></div>
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
              @if (paymentError) { <span class="hint" style="color:var(--danger-700)">{{ paymentError }}</span> }
            </div>
            <div class="field">
              <label>Reference No.</label>
              <input class="input mono" [(ngModel)]="paymentReference" maxlength="60" placeholder="Optional — cheque / UTR / transaction number">
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
  purchaseOrders = signal<any[]>([]);
  grns = signal<any[]>([]);
  products = signal<any[]>([]);
  perf = signal<any>(null);
  summary = signal<any>(null);
  paymentReference = '';
  paymentError = '';

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
    const [pos, grns, products, perf, summary] = await Promise.all([
      this.api.getPurchaseOrders(undefined, undefined, this.vendorId),
      this.api.getGrnLog(this.vendorId),
      this.api.getVendorProducts(this.vendorId),
      this.api.getVendorPerformance(this.vendorId),
      this.api.getVendorSummary(this.vendorId)
    ]);
    this.purchaseOrders.set(pos);
    this.grns.set(grns);
    this.products.set(products);
    this.perf.set(perf);
    this.summary.set(summary);
  }

  money(n: number | null | undefined): string {
    return (n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  pct(n: number | null | undefined): string {
    return n == null ? '—' : `${n}%`;
  }

  alertLabel(type: string): string {
    return ({ overdue_payment: 'Overdue payment', overdue_po: 'Overdue PO', high_return_rate: 'High returns', price_increase: 'Price increase' } as Record<string, string>)[type] || 'Alert';
  }

  /** Days a purchase order is past its expected delivery date (0 when it is not overdue). */
  poOverdueDays(poId: string): number {
    return this.summary()?.purchaseOrders?.overdueList?.find((o: any) => o.id === poId)?.daysOverdue || 0;
  }

  viewProducts() {
    document.getElementById('vendor-products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Downloads the ledger (with the running balance) as a CSV file. */
  exportLedger() {
    const rows = [...this.ledgerEntries()].reverse();      // oldest first, like a statement
    const cell = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Date', 'Type', 'Reference', 'Amount', 'Balance'].map(cell).join(',')];
    for (const e of rows) lines.push([e.date, e.type, e.ref, Number(e.amount).toFixed(2), e.balance != null ? Number(e.balance).toFixed(2) : ''].map(cell).join(','));
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ledger-${this.vendorId}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async submitPayment() {
    if (this.isRecordingPayment) return;
    this.paymentError = '';
    if (!this.paymentAmount || this.paymentAmount <= 0) { this.paymentError = 'Enter an amount greater than zero'; return; }
    this.isRecordingPayment = true;
    try {
      await this.api.recordVendorPayment(this.vendorId, this.paymentAmount, this.paymentMode, this.paymentReference);
      this.showPaymentModal = false;
      this.paymentAmount = 0;
      this.paymentReference = '';
      await this.loadLedger();
    } catch (err: any) {
      this.paymentError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not record the payment. Please try again.';
    } finally {
      this.isRecordingPayment = false;
    }
  }
}
