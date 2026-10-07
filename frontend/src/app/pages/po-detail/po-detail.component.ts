import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-po-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-PUR-002, 003</span>
        <h1><span>{{ po()?.id || 'Purchase Order' }}</span></h1>
        <p>Submit and approve the order, mark it as ordered, then record goods receipt as deliveries arrive — partial receipts and variances are tracked automatically.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-secondary" routerLink="/purchase-orders">&larr; All Purchase Orders</a>
      </div>
    </div>

    @if (actionError) {
      <div class="card" style="margin-bottom:var(--space-4);background:var(--danger-50);border-color:var(--danger-500)">
        <span class="text-sm" style="color:var(--danger-700)">{{ actionError }}</span>
      </div>
    }

    @if (po()) {
      <div class="card" style="margin-bottom:var(--space-5)">
        <div class="row-between wrap" style="gap:var(--space-4)">
          <div>
            <h3>{{ po().vendorName || po().vendorId }}</h3>
          </div>
          <div class="row" style="gap:var(--space-6)">
            <div>
              <div class="text-xs text-muted">Order Date</div>
              <strong>{{ po().date }}</strong>
            </div>
            <div>
              <div class="text-xs text-muted">Expected</div>
              <strong>{{ po().expected }}</strong>
            </div>
            <div>
              <div class="text-xs text-muted">Status</div>
              <span class="badge" [ngClass]="statusBadgeClass(po().status)">{{ po().status }}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card card-flush" style="margin-bottom:var(--space-5)">
        <div class="card-header">
          <h3>Line Items</h3>
          <div class="row wrap" style="gap:var(--space-2)">
            @if (!auth.can('purchase_orders', 'edit')) {
              <span class="text-xs text-muted">You can view this purchase order but not change it.</span>
            } @else {
            @switch (po().status) {
              @case ('Draft') {
                <button class="btn btn-primary btn-sm" [disabled]="busy" (click)="moveTo('submit', 'Submitting...')">Submit for Approval</button>
              }
              @case ('Pending') {
                <button class="btn btn-primary btn-sm" [disabled]="busy" (click)="moveTo('approve', 'Approving...')">Approve Purchase Order</button>
              }
              @case ('Approved') {
                <button class="btn btn-secondary btn-sm" [disabled]="busy" (click)="moveTo('order', 'Updating...')">Mark as Ordered</button>
                <button class="btn btn-success btn-sm" (click)="openGrnModal()">Record Goods Receipt</button>
              }
              @case ('Ordered') {
                <button class="btn btn-success btn-sm" (click)="openGrnModal()">Record Goods Receipt</button>
              }
              @case ('Partially Received') {
                <button class="btn btn-success btn-sm" (click)="openGrnModal()">Record Goods Receipt</button>
              }
              @case ('Cancelled') {
                <span class="badge badge-danger">Cancelled</span>
              }
              @default {
                <span class="badge badge-success">Fully received &amp; reconciled</span>
              }
            }
            @if (canCancel()) {
              <button class="btn btn-ghost btn-sm" style="color:var(--danger-700)" [disabled]="busy" (click)="cancelPo()">Cancel PO</button>
            }
            }
          </div>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Item</th>
                <th class="num">Ordered</th>
                <th class="num">Received</th>
                <th class="num">Pending</th>
                <th>Batch No.</th>
                <th class="num">Unit Cost</th>
                <th class="num">GST %</th>
                <th class="num">Line Total (incl. GST)</th>
              </tr>
            </thead>
            <tbody>
              @for (l of po().lines; track l.sku) {
                <tr>
                  <td>{{ l.name }}</td>
                  <td class="num">{{ l.orderedQty || l.qty }}</td>
                  <td class="num">{{ l.receivedQty || 0 }}</td>
                  <td class="num">
                    @let pending = (l.orderedQty || l.qty) - (l.receivedQty || 0);
                    @if (pending > 0) {
                      <span class="badge badge-warning">{{ pending }}</span>
                    } @else {
                      <span class="badge badge-success">0</span>
                    }
                  </td>
                  <td class="mono text-xs">{{ l.batchNo || '—' }}</td>
                  <td class="num mono">₹{{ l.cost.toFixed(2) }}</td>
                  <td class="num">{{ l.taxRate || 0 }}%</td>
                  <td class="num mono">₹{{ ((l.orderedQty || l.qty) * l.cost * (1 + (l.taxRate || 0) / 100)).toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="card-body" style="border-top:1px solid var(--border)">
          <div class="row-between text-sm"><span class="text-muted">Subtotal</span><span class="mono">₹{{ calcSubtotal().toFixed(2) }}</span></div>
          <div class="row-between text-sm"><span class="text-muted">GST</span><span class="mono">₹{{ (calcOrderTotal() - calcSubtotal()).toFixed(2) }}</span></div>
          <div class="row-between"><span class="text-muted">Order Total</span><strong class="mono" style="font-size:var(--text-lg)">₹{{ calcOrderTotal().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></div>
        </div>
      </div>
    }

    @if (grnHistory().length > 0) {
      <div class="card card-flush">
        <div class="card-header">
          <h3>Goods Receipt History</h3>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>GRN #</th>
                <th>Date</th>
                <th class="num">Lines</th>
                <th class="num">Total</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              @for (g of grnHistory(); track g.id) {
                <tr>
                  <td class="mono">{{ g.id }}</td>
                  <td>{{ g.date }}</td>
                  <td class="num">{{ g.lines.length }}</td>
                  <td class="num mono">₹{{ g.total.toFixed(2) }}</td>
                  <td>
                    @if (g.variances && g.variances.length > 0) {
                      <span class="badge badge-warning">Short shipment variance</span>
                    } @else {
                      <span class="badge badge-success">None</span>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }

    <!-- Record GRN Modal -->
    @if (showGrnModal) {
      <div class="modal-overlay open">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h3>Record Goods Receipt</h3>
            <button class="icon-btn" (click)="showGrnModal = false">✕</button>
          </div>
          <div class="modal-body">
            <p class="text-sm text-muted" style="margin-bottom:var(--space-3)">
              Enter the quantity actually received for each line. Leaving it below the pending amount records a partial receipt and flags the variance.
              Add the batch number and expiry date to track the batch in Batch &amp; Expiry.
            </p>
            @if (grnError) { <p class="text-sm" style="color:var(--danger-700);margin-bottom:var(--space-3)">{{ grnError }}</p> }
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th class="num">Pending</th>
                    <th class="num">Receiving Now</th>
                    <th>Batch No.</th>
                    <th>Mfg Date</th>
                    <th>Expiry Date</th>
                  </tr>
                </thead>
                <tbody>
                  @for (gl of grnInputLines; track gl.sku) {
                    <tr>
                      <td>{{ gl.name }}</td>
                      <td class="num">{{ gl.pending }}</td>
                      <td class="num">
                        <input class="input" type="number" min="0" [max]="gl.pending" [(ngModel)]="gl.qty" style="width:100px;text-align:right">
                      </td>
                      <td><input class="input mono" [(ngModel)]="gl.batchNo" style="width:120px" maxlength="40" placeholder="Optional" aria-label="Batch number"></td>
                      <td><input class="input" type="date" [(ngModel)]="gl.mfgDate" style="width:140px" aria-label="Manufacturing date"></td>
                      <td><input class="input" type="date" [min]="gl.mfgDate || ''" [(ngModel)]="gl.expiryDate" style="width:140px" aria-label="Expiry date"></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" [disabled]="isSubmittingGrn" (click)="showGrnModal = false">Cancel</button>
            <button class="btn btn-success" [disabled]="isSubmittingGrn" (click)="submitGrn()">
              {{ isSubmittingGrn ? 'Confirming...' : 'Confirm Receipt' }}
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class PoDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private api = inject(ApiService);
  auth = inject(AuthService);

  poId = '';
  po = signal<any>(null);
  grnHistory = signal<any[]>([]);

  showGrnModal = false;
  grnInputLines: any[] = [];
  busy = false;
  actionError = '';
  grnError = '';
  isSubmittingGrn = false;

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.poId = params['po'] || '';
      if (this.poId) {
        this.loadPoDetail();
      }
    });
  }

  async loadPoDetail() {
    const data = await this.api.getPurchaseOrderById(this.poId);
    this.po.set(data);

    const grns = await this.api.getGrnLog(data?.vendorId);
    this.grnHistory.set(grns.filter((g: any) => g.poId === this.poId));
  }

  statusBadgeClass(status: string): string {
    const map: any = {
      Draft: 'badge-neutral',
      Pending: 'badge-warning',
      Approved: 'badge-info',
      Ordered: 'badge-info',
      'Partially Received': 'badge-warning',
      Received: 'badge-success',
      Cancelled: 'badge-danger'
    };
    return map[status] || 'badge-neutral';
  }

  calcSubtotal(): number {
    if (!this.po() || !this.po().lines) return 0;
    return this.po().lines.reduce((s: number, l: any) => s + (l.orderedQty || l.qty) * l.cost, 0);
  }

  calcOrderTotal(): number {
    if (!this.po() || !this.po().lines) return 0;
    return this.po().lines.reduce((s: number, l: any) => s + (l.orderedQty || l.qty) * l.cost * (1 + (l.taxRate || 0) / 100), 0);
  }

  /** A PO can be cancelled until goods have been received against it. */
  canCancel(): boolean {
    return ['Draft', 'Pending', 'Approved', 'Ordered'].includes(this.po()?.status);
  }

  private errorText(err: any, fallback: string): string {
    return typeof err?.error?.detail === 'string' ? err.error.detail : fallback;
  }

  /** Moves the order along its status flow (submit, approve, order). */
  async moveTo(action: 'submit' | 'approve' | 'order', _label: string) {
    if (this.busy) return;
    this.busy = true;
    this.actionError = '';
    try {
      await this.api.purchaseOrderAction(this.poId, action);
      await this.loadPoDetail();
    } catch (err: any) {
      this.actionError = this.errorText(err, 'Could not update the purchase order. Please try again.');
    } finally {
      this.busy = false;
    }
  }

  async cancelPo() {
    if (this.busy) return;
    if (!confirm(`Cancel purchase order ${this.poId}? This cannot be undone.`)) return;
    this.busy = true;
    this.actionError = '';
    try {
      await this.api.purchaseOrderAction(this.poId, 'cancel');
      await this.loadPoDetail();
    } catch (err: any) {
      this.actionError = this.errorText(err, 'Could not cancel the purchase order. Please try again.');
    } finally {
      this.busy = false;
    }
  }

  openGrnModal() {
    if (!this.po()) return;
    this.grnInputLines = [];

    this.po().lines.forEach((l: any) => {
      const pending = (l.orderedQty || l.qty) - (l.receivedQty || 0);
      if (pending > 0) {
        this.grnInputLines.push({
          sku: l.sku,
          name: l.name,
          pending,
          qty: pending,
          batchNo: l.batchNo || '',
          mfgDate: '',
          expiryDate: ''
        });
      }
    });

    this.grnError = '';
    this.showGrnModal = true;
  }

  async submitGrn() {
    if (this.isSubmittingGrn) return;
    const validLines = this.grnInputLines.filter(l => l.qty > 0);
    if (validLines.length === 0) { this.grnError = 'Enter the quantity received for at least one item'; return; }
    const tooMany = validLines.find(l => l.qty > l.pending);
    if (tooMany) { this.grnError = `Only ${tooMany.pending} of ${tooMany.name} is still to be received`; return; }
    const badDates = validLines.find(l => l.mfgDate && l.expiryDate && l.expiryDate < l.mfgDate);
    if (badDates) { this.grnError = `Expiry date of ${badDates.name} cannot be before its manufacturing date`; return; }
    this.grnError = '';

    this.isSubmittingGrn = true;
    try {
      const lines = validLines.map(l => ({ sku: l.sku, qty: l.qty, batchNo: (l.batchNo || '').trim() || null, mfgDate: l.mfgDate || null, expiryDate: l.expiryDate || null }));
      await this.api.recordGoodsReceipt(this.poId, lines, this.po().vendorId);
      this.showGrnModal = false;
      await this.loadPoDetail();
    } catch (err: any) {
      this.grnError = this.errorText(err, 'Could not record the goods receipt. Please try again.');
    } finally {
      this.isSubmittingGrn = false;
    }
  }
}
