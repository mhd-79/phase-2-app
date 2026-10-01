import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-purchase-returns',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-PUR-005</span>
        <h1>Purchase Returns</h1>
        <p>Return goods to a vendor and automatically generate a debit note against their payable balance.</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:var(--space-5)">
      <div class="field">
        <label>Vendor</label>
        <select class="select" [(ngModel)]="selectedVendorId" style="max-width:360px">
          @for (v of vendors(); track v.id) {
            <option [value]="v.id">{{ v.name }}</option>
          }
        </select>
      </div>

      <div style="margin-top:var(--space-4)">
        <div class="row-between" style="margin-bottom:var(--space-2)">
          <label style="font-weight:600;font-size:var(--text-sm)">Items to Return</label>
          <button class="btn btn-ghost btn-sm" (click)="addReturnLine()">+ Add Line</button>
        </div>
        <div class="stack" style="gap:var(--space-2)">
          @for (line of returnLines; track $index; let i = $index) {
            <div class="row" style="gap:var(--space-2)">
              <div style="flex:2">
                <select class="select" [(ngModel)]="line.sku" (change)="onSkuChange(line)">
                  @for (item of catalog(); track item.sku) {
                    <option [value]="item.sku">{{ item.name }} ({{ item.sku }})</option>
                  }
                </select>
              </div>
              <input class="input" type="number" min="1" [(ngModel)]="line.qty" style="width:90px" placeholder="Qty">
              <input class="input" type="number" min="0" step="0.01" [(ngModel)]="line.cost" style="width:110px" placeholder="Unit Cost">
              <button type="button" class="btn btn-ghost btn-sm" (click)="removeReturnLine(i)">✕</button>
            </div>
          }
        </div>
      </div>

      <div class="form-grid" style="margin-top:var(--space-4)">
        <div class="field">
          <label>Reason</label>
          <select class="select" [(ngModel)]="returnReason">
            <option>Damaged in transit</option>
            <option>Quality issue</option>
            <option>Wrong item supplied</option>
            <option>Excess supply</option>
            <option>Other</option>
          </select>
        </div>
        <div class="field">
          <label>Debit Note Amount</label>
          <input class="input mono" readonly [value]="'₹' + getDebitNoteTotal().toFixed(2)">
        </div>
      </div>

      <button class="btn btn-danger btn-lg" style="margin-top:var(--space-4)" [disabled]="isSubmitting" (click)="submitReturn()">
        {{ isSubmitting ? 'Processing Return...' : 'Process Return & Raise Debit Note' }}
      </button>
    </div>

    <div class="card card-flush">
      <div class="card-header">
        <h3>Purchase Return History</h3>
      </div>
      @if (returnsHistory().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Debit Note #</th>
                <th>Vendor</th>
                <th>Date</th>
                <th>Reason</th>
                <th class="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              @for (r of returnsHistory(); track r.id) {
                <tr>
                  <td class="mono">{{ r.id }}</td>
                  <td>{{ r.vendorName || r.vendorId }}</td>
                  <td>{{ r.date }}</td>
                  <td>{{ r.reason }}</td>
                  <td class="num mono">₹{{ r.total.toFixed(2) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state">
          <p class="text-sm">No purchase returns recorded yet.</p>
        </div>
      }
    </div>
  `
})
export class PurchaseReturnsComponent implements OnInit {
  private api = inject(ApiService);

  vendors = signal<any[]>([]);
  catalog = signal<any[]>([]);
  returnsHistory = signal<any[]>([]);

  selectedVendorId = '';
  returnReason = 'Damaged in transit';
  returnLines: any[] = [];
  isSubmitting = false;

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const vList = await this.api.getVendors();
    this.vendors.set(vList);
    if (vList.length > 0 && !this.selectedVendorId) {
      this.selectedVendorId = vList[0].id;
    }

    const cat = await this.api.getCatalog();
    this.catalog.set(cat);

    const returns = await this.api.getPurchaseReturns();
    this.returnsHistory.set(returns);

    if (this.returnLines.length === 0) {
      this.addReturnLine();
    }
  }

  addReturnLine() {
    const item = this.catalog()[0];
    if (!item) return;
    this.returnLines.push({
      sku: item.sku,
      name: item.name,
      qty: 5,
      cost: Math.round(item.price * 0.65)
    });
  }

  onSkuChange(line: any) {
    const item = this.catalog().find(i => i.sku === line.sku);
    if (item) {
      line.name = item.name;
      line.cost = Math.round(item.price * 0.65);
    }
  }

  removeReturnLine(idx: number) {
    this.returnLines.splice(idx, 1);
  }

  getDebitNoteTotal(): number {
    return this.returnLines.reduce((s, l) => s + (l.qty || 0) * (l.cost || 0), 0);
  }

  async submitReturn() {
    if (this.isSubmitting) return;
    const validLines = this.returnLines.filter(l => l.qty > 0);
    if (validLines.length === 0) return;

    this.isSubmitting = true;
    try {
      await this.api.createPurchaseReturn(this.selectedVendorId, validLines, this.returnReason);
      this.returnLines = [];
      this.addReturnLine();
      await this.loadData();
    } finally {
      this.isSubmitting = false;
    }
  }
}
