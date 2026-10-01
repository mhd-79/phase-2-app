import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-po-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-PUR-002, 003</span>
        <h1><span>{{ po()?.id || 'Purchase Order' }}</span></h1>
        <p>Approve the order, then record goods receipt as deliveries arrive — partial receipts and variances are tracked automatically.</p>
      </div>
      <div class="page-actions">
        <a class="btn btn-secondary" routerLink="/purchase-orders">&larr; All Purchase Orders</a>
      </div>
    </div>

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
          <div>
            @if (po().status === 'Draft' || po().status === 'Pending Approval') {
              <button class="btn btn-primary btn-sm" [disabled]="isApproving" (click)="approvePo()">
                {{ isApproving ? 'Approving...' : 'Approve Purchase Order' }}
              </button>
            } @else if (po().status === 'Approved' || po().status === 'Partially Received') {
              <button class="btn btn-success btn-sm" (click)="openGrnModal()">Record Goods Receipt</button>
            } @else {
              <span class="badge badge-success">Fully received &amp; reconciled</span>
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
                <th class="num">Unit Cost</th>
                <th class="num">Line Total</th>
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
                  <td class="num mono">₹{{ l.cost.toFixed(2) }}</td>
                  <td class="num mono">₹{{ ((l.orderedQty || l.qty) * l.cost).toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="card-body row-between" style="border-top:1px solid var(--border)">
          <span class="text-muted">Order Total</span>
          <strong class="mono" style="font-size:var(--text-lg)">₹{{ calcOrderTotal().toLocaleString('en-IN') }}</strong>
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
            </p>
            <div class="table-scroll">
              <table class="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th class="num">Pending</th>
                    <th class="num">Receiving Now</th>
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

  poId = '';
  po = signal<any>(null);
  grnHistory = signal<any[]>([]);

  showGrnModal = false;
  grnInputLines: any[] = [];
  isApproving = false;
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

    const grns = await this.api.getGrnLog();
    this.grnHistory.set(grns.filter((g: any) => g.poId === this.poId));
  }

  statusBadgeClass(status: string): string {
    const map: any = {
      Draft: 'badge-neutral',
      'Pending Approval': 'badge-warning',
      Approved: 'badge-info',
      'Partially Received': 'badge-warning',
      Received: 'badge-success',
      Closed: 'badge-success'
    };
    return map[status] || 'badge-neutral';
  }

  calcOrderTotal(): number {
    if (!this.po() || !this.po().lines) return 0;
    return this.po().lines.reduce((s: number, l: any) => s + (l.orderedQty || l.qty) * l.cost, 0);
  }

  async approvePo() {
    if (this.isApproving) return;
    this.isApproving = true;
    try {
      await this.api.approvePurchaseOrder(this.poId);
      await this.loadPoDetail();
    } finally {
      this.isApproving = false;
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
          qty: pending
        });
      }
    });

    this.showGrnModal = true;
  }

  async submitGrn() {
    if (this.isSubmittingGrn) return;
    const validLines = this.grnInputLines.filter(l => l.qty > 0);
    if (validLines.length === 0) return;

    this.isSubmittingGrn = true;
    try {
      await this.api.recordGoodsReceipt(this.poId, validLines, this.po().vendorId);
      this.showGrnModal = false;
      await this.loadPoDetail();
    } finally {
      this.isSubmittingGrn = false;
    }
  }
}
