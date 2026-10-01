import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P2-PUR-002, 004</span>
          <h1>Purchase Orders</h1>
          <p>Create a purchase order and route it through approval, or record stock received without a prior PO.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary" (click)="openDirectReceiptModal()">+ Direct Stock Receipt</button>
          <button class="btn btn-primary" (click)="openNewPoModal()">+ New Purchase Order</button>
        </div>
      </div>

      <!-- Date Range Filter Bar for POs -->
      <div class="filter-bar" style="background:#fff;border:1px solid var(--border);border-radius:var(--radius-md);padding:var(--space-3) var(--space-4);margin-bottom:var(--space-4);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:var(--space-3)">
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:var(--space-3)">
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <span class="text-xs text-muted" style="font-weight:600">From Date:</span>
            <input class="input" type="date" [(ngModel)]="fromDate" style="width:145px">
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            <span class="text-xs text-muted" style="font-weight:600">To Date:</span>
            <input class="input" type="date" [(ngModel)]="toDate" style="width:145px">
          </div>
          <div class="chip-group" style="display:flex;gap:var(--space-1)">
            <button type="button" class="chip" [class.active]="quickRange === 'all'" (click)="setQuickDateRange('all')">All</button>
            <button type="button" class="chip" [class.active]="quickRange === 'today'" (click)="setQuickDateRange('today')">Today</button>
            <button type="button" class="chip" [class.active]="quickRange === 'yesterday'" (click)="setQuickDateRange('yesterday')">Yesterday</button>
            <button type="button" class="chip" [class.active]="quickRange === 'this_week'" (click)="setQuickDateRange('this_week')">This Week</button>
            <button type="button" class="chip" [class.active]="quickRange === 'this_month'" (click)="setQuickDateRange('this_month')">This Month</button>
          </div>
        </div>
        <div style="display:flex;gap:var(--space-2)">
          <button type="button" class="btn btn-primary btn-sm" (click)="applyFilters()">Apply</button>
          <button type="button" class="btn btn-secondary btn-sm" (click)="clearDateRange()">Clear</button>
        </div>
      </div>

      <div class="card card-flush">
        <div class="card-header row-between" style="flex-wrap:wrap;gap:var(--space-2)">
          <h3>All Purchase Orders</h3>
          <div class="row wrap" style="gap:var(--space-2)">
            <select class="select" [(ngModel)]="statusFilter" (change)="applyFilters()" style="width:180px">
              <option value="">All Statuses</option>
              <option>Draft</option>
              <option>Pending Approval</option>
              <option>Approved</option>
              <option>Partially Received</option>
              <option>Received</option>
              <option>Closed</option>
            </select>
            <input class="input" [(ngModel)]="searchQuery" (input)="applyFilters()" placeholder="Search PO # or vendor" style="width:220px">
          </div>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th (click)="sort('id')" style="cursor:pointer;user-select:none">
                  PO # <span class="sort-icon">{{ sortKey === 'id' ? (sortAsc ? '▲' : '▼') : '↕' }}</span>
                </th>
                <th (click)="sort('vendorName')" style="cursor:pointer;user-select:none">
                  Vendor <span class="sort-icon">{{ sortKey === 'vendorName' ? (sortAsc ? '▲' : '▼') : '↕' }}</span>
                </th>
                <th (click)="sort('date')" style="cursor:pointer;user-select:none">
                  Date <span class="sort-icon">{{ sortKey === 'date' ? (sortAsc ? '▲' : '▼') : '↕' }}</span>
                </th>
                <th (click)="sort('expected')" style="cursor:pointer;user-select:none">
                  Expected <span class="sort-icon">{{ sortKey === 'expected' ? (sortAsc ? '▲' : '▼') : '↕' }}</span>
                </th>
                <th class="num" (click)="sort('linesCount')" style="cursor:pointer;user-select:none">
                  Lines <span class="sort-icon">{{ sortKey === 'linesCount' ? (sortAsc ? '▲' : '▼') : '↕' }}</span>
                </th>
                <th class="num" (click)="sort('totalValue')" style="cursor:pointer;user-select:none">
                  Total Value <span class="sort-icon">{{ sortKey === 'totalValue' ? (sortAsc ? '▲' : '▼') : '↕' }}</span>
                </th>
                <th (click)="sort('status')" style="cursor:pointer;user-select:none">
                  Status <span class="sort-icon">{{ sortKey === 'status' ? (sortAsc ? '▲' : '▼') : '↕' }}</span>
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (po of filteredPos(); track po.id) {
                <tr>
                  <td class="mono"><strong>{{ po.id }}</strong></td>
                  <td>{{ po.vendorName || po.vendorId }}</td>
                  <td class="mono text-xs">{{ po.date }}</td>
                  <td class="mono text-xs">{{ po.expected }}</td>
                  <td class="num mono">{{ po.lines?.length || 0 }}</td>
                  <td class="num mono font-bold">₹{{ calcPoTotal(po).toLocaleString('en-IN') }}</td>
                  <td>
                    <span class="badge" [ngClass]="statusBadgeClass(po.status)">{{ po.status }}</span>
                  </td>
                  <td>
                    <a class="btn btn-ghost btn-sm" [routerLink]="['/po-detail']" [queryParams]="{ po: po.id }">View</a>
                  </td>
                </tr>
              }
              @if (filteredPos().length === 0) {
                <tr><td colspan="8" class="text-center text-muted" style="padding:var(--space-4)">No purchase orders matching criteria.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- New PO Modal -->
    @if (showPoModal) {
      <div class="modal-overlay open">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h3>New Purchase Order</h3>
            <button class="icon-btn" (click)="showPoModal = false">✕</button>
          </div>
          <div class="modal-body stack">
            <div class="field">
              <label>Vendor</label>
              <select class="select" [(ngModel)]="newPoVendorId">
                @for (v of vendors(); track v.id) {
                  <option [value]="v.id">{{ v.name }} ({{ v.category }})</option>
                }
              </select>
            </div>
            <div class="field">
              <label>Expected Delivery Date</label>
              <input class="input" type="date" [(ngModel)]="newPoExpected">
            </div>
            <div>
              <div class="row-between" style="margin-bottom:var(--space-2)">
                <label style="font-weight:600;font-size:var(--text-sm)">Line Items</label>
                <button class="btn btn-ghost btn-sm" (click)="addPoLine()">+ Add Line</button>
              </div>
              <div class="stack" style="gap:var(--space-2)">
                @for (line of poLines; track $index; let i = $index) {
                  <div class="row" style="gap:var(--space-2)">
                    <div style="flex:2">
                      <select class="select" [(ngModel)]="line.sku" (change)="onPoLineSkuChange(line)">
                        @for (item of catalog(); track item.sku) {
                          <option [value]="item.sku">{{ item.name }} ({{ item.sku }})</option>
                        }
                      </select>
                    </div>
                    <input class="input" type="number" min="1" [(ngModel)]="line.qty" style="width:90px" placeholder="Qty">
                    <input class="input mono" type="number" min="0" step="0.01" [(ngModel)]="line.cost" style="width:110px" placeholder="Unit Cost">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="removePoLine(i)">✕</button>
                  </div>
                }
              </div>
            </div>
            <div class="row-between" style="background:var(--slate-50);padding:var(--space-3);border-radius:var(--radius-md)">
              <span class="text-muted">Order Total</span>
              <strong class="mono" style="font-size:var(--text-lg)">₹{{ getNewPoTotal().toFixed(2) }}</strong>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" [disabled]="isSubmittingPo" (click)="showPoModal = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="isSubmittingPo" (click)="submitNewPo()">
              {{ isSubmittingPo ? 'Creating...' : 'Create & Send for Approval' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Direct Receipt Modal -->
    @if (showDrModal) {
      <div class="modal-overlay open">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h3>Direct / Ad-hoc Stock Receipt</h3>
            <button class="icon-btn" (click)="showDrModal = false">✕</button>
          </div>
          <div class="modal-body stack">
            <p class="text-sm text-muted">For stock received without a prior purchase order — e.g. a walk-in or informal supplier drop-off (FR-P2-PUR-004).</p>
            <div class="field">
              <label>Vendor / Supplier</label>
              <select class="select" [(ngModel)]="drVendorId">
                @for (v of vendors(); track v.id) {
                  <option [value]="v.id">{{ v.name }} ({{ v.category }})</option>
                }
              </select>
            </div>
            <div>
              <div class="row-between" style="margin-bottom:var(--space-2)">
                <label style="font-weight:600;font-size:var(--text-sm)">Items Received</label>
                <button class="btn btn-ghost btn-sm" (click)="addDrLine()">+ Add Line</button>
              </div>
              <div class="stack" style="gap:var(--space-2)">
                @for (line of drLines; track $index; let i = $index) {
                  <div class="row" style="gap:var(--space-2)">
                    <div style="flex:2">
                      <select class="select" [(ngModel)]="line.sku" (change)="onDrLineSkuChange(line)">
                        @for (item of catalog(); track item.sku) {
                          <option [value]="item.sku">{{ item.name }} ({{ item.sku }})</option>
                        }
                      </select>
                    </div>
                    <input class="input" type="number" min="1" [(ngModel)]="line.qty" style="width:90px" placeholder="Qty">
                    <input class="input mono" type="number" min="0" step="0.01" [(ngModel)]="line.cost" style="width:110px" placeholder="Unit Cost">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="removeDrLine(i)">✕</button>
                  </div>
                }
              </div>
            </div>
            <div class="row-between" style="background:var(--slate-50);padding:var(--space-3);border-radius:var(--radius-md)">
              <span class="text-muted">Receipt Total</span>
              <strong class="mono" style="font-size:var(--text-lg)">₹{{ getDrTotal().toFixed(2) }}</strong>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" [disabled]="isSubmittingDr" (click)="showDrModal = false">Cancel</button>
            <button class="btn btn-success" [disabled]="isSubmittingDr" (click)="submitDirectReceipt()">
              {{ isSubmittingDr ? 'Receiving...' : 'Receive Stock' }}
            </button>
          </div>
        </div>
      </div>
    }

    @if (toastMessage) {
      <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toastMessage }}</span></div></div>
    }
  `
})
export class PurchaseOrdersComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  purchaseOrders = signal<any[]>([]);
  filteredPos = signal<any[]>([]);
  vendors = signal<any[]>([]);
  catalog = signal<any[]>([]);

  statusFilter = '';
  searchQuery = '';
  fromDate = '';
  toDate = '';
  quickRange = 'all';

  sortKey = 'date';
  sortAsc = false;

  showPoModal = false;
  newPoVendorId = '';
  newPoExpected = '2026-09-15';
  poLines: any[] = [];
  isSubmittingPo = false;

  showDrModal = false;
  drVendorId = '';
  drLines: any[] = [];
  isSubmittingDr = false;

  toastMessage: string | null = null;

  async ngOnInit() {
    await this.loadData();

    this.route.queryParams.subscribe(params => {
      if (params['prefillVendor']) {
        this.openNewPoModal(
          params['prefillVendor'],
          params['prefillSku'],
          parseInt(params['prefillQty'], 10) || 10,
          parseFloat(params['prefillCost']) || 0
        );
      }
    });
  }

  async loadData() {
    const pos = await this.api.getPurchaseOrders();
    this.purchaseOrders.set(pos);

    const vList = await this.api.getVendors();
    this.vendors.set(vList);
    if (vList.length > 0) {
      this.newPoVendorId = vList[0].id;
      this.drVendorId = vList[0].id;
    }

    const cat = await this.api.getCatalog();
    this.catalog.set(cat);

    this.applyFilters();
  }

  setQuickDateRange(key: string) {
    this.quickRange = key;
    if (key === 'all') {
      this.fromDate = '';
      this.toDate = '';
    } else if (key === 'today') {
      this.fromDate = '2026-09-10';
      this.toDate = '2026-09-10';
    } else if (key === 'yesterday') {
      this.fromDate = '2026-09-09';
      this.toDate = '2026-09-09';
    } else if (key === 'this_week') {
      this.fromDate = '2026-09-07';
      this.toDate = '2026-09-10';
    } else if (key === 'this_month') {
      this.fromDate = '2026-09-01';
      this.toDate = '2026-09-10';
    }
    this.applyFilters();
  }

  clearDateRange() {
    this.setQuickDateRange('all');
  }

  sort(key: string) {
    if (this.sortKey === key) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortKey = key;
      this.sortAsc = key === 'id' || key === 'vendorName' || key === 'status';
    }
    this.applyFilters();
  }

  applyFilters() {
    let list = [...this.purchaseOrders()];

    if (this.statusFilter) {
      list = list.filter(p => p.status === this.statusFilter);
    }
    if (this.searchQuery.trim()) {
      const term = this.searchQuery.toLowerCase().trim();
      list = list.filter(p =>
        p.id.toLowerCase().includes(term) || (p.vendorName || '').toLowerCase().includes(term)
      );
    }
    if (this.fromDate) {
      list = list.filter(p => p.date >= this.fromDate);
    }
    if (this.toDate) {
      list = list.filter(p => p.date <= this.toDate);
    }

    list.sort((a, b) => {
      let va = a[this.sortKey];
      let vb = b[this.sortKey];
      if (this.sortKey === 'linesCount') {
        va = (a.lines || []).length;
        vb = (b.lines || []).length;
      } else if (this.sortKey === 'totalValue') {
        va = this.calcPoTotal(a);
        vb = this.calcPoTotal(b);
      }
      if (va < vb) return this.sortAsc ? -1 : 1;
      if (va > vb) return this.sortAsc ? 1 : -1;
      return 0;
    });

    this.filteredPos.set(list);
  }

  calcPoTotal(po: any): number {
    return (po.lines || []).reduce((s: number, l: any) => s + (l.orderedQty || l.qty || 0) * (l.cost || 0), 0);
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

  openNewPoModal(prefillVendor?: string, prefillSku?: string, prefillQty?: number, prefillCost?: number) {
    if (prefillVendor) this.newPoVendorId = prefillVendor;
    this.poLines = [];

    const defaultSku = prefillSku || (this.catalog()[0]?.sku || '');
    const item = this.catalog().find(i => i.sku === defaultSku) || this.catalog()[0];
    const cost = prefillCost || (item ? (item.costPrice || Math.round(item.price * 0.65)) : 0);

    this.poLines.push({
      sku: defaultSku,
      name: item ? item.name : defaultSku,
      qty: prefillQty || 10,
      cost
    });

    this.showPoModal = true;
  }

  addPoLine() {
    const item = this.catalog()[0];
    if (!item) return;
    this.poLines.push({
      sku: item.sku,
      name: item.name,
      qty: 10,
      cost: item.costPrice || Math.round(item.price * 0.65)
    });
  }

  onPoLineSkuChange(line: any) {
    const item = this.catalog().find(i => i.sku === line.sku);
    if (item) {
      line.name = item.name;
      line.cost = item.costPrice || Math.round(item.price * 0.65);
    }
  }

  removePoLine(idx: number) {
    this.poLines.splice(idx, 1);
  }

  getNewPoTotal(): number {
    return this.poLines.reduce((s, l) => s + (l.qty || 0) * (l.cost || 0), 0);
  }

  async submitNewPo() {
    if (this.isSubmittingPo) return;
    const validLines = this.poLines.filter(l => l.qty > 0);
    if (validLines.length === 0) return;
    this.isSubmittingPo = true;
    try {
      const res = await this.api.createPurchaseOrder({
        vendorId: this.newPoVendorId,
        expected: this.newPoExpected,
        date: new Date().toISOString().slice(0, 10),
        lines: validLines
      });
      this.showPoModal = false;
      this.triggerToast(`Purchase Order ${res?.id || ''} created successfully`);
      await this.loadData();
    } catch (err: any) {
      this.triggerToast(err?.message || 'Error creating Purchase Order');
    } finally {
      this.isSubmittingPo = false;
    }
  }

  openDirectReceiptModal() {
    this.drLines = [];
    const item = this.catalog()[0];
    if (item) {
      this.drLines.push({
        sku: item.sku,
        name: item.name,
        qty: 10,
        cost: item.costPrice || Math.round(item.price * 0.65)
      });
    }
    this.showDrModal = true;
  }

  addDrLine() {
    const item = this.catalog()[0];
    if (!item) return;
    this.drLines.push({
      sku: item.sku,
      name: item.name,
      qty: 10,
      cost: item.costPrice || Math.round(item.price * 0.65)
    });
  }

  onDrLineSkuChange(line: any) {
    const item = this.catalog().find(i => i.sku === line.sku);
    if (item) {
      line.name = item.name;
      line.cost = item.costPrice || Math.round(item.price * 0.65);
    }
  }

  removeDrLine(idx: number) {
    this.drLines.splice(idx, 1);
  }

  getDrTotal(): number {
    return this.drLines.reduce((s, l) => s + (l.qty || 0) * (l.cost || 0), 0);
  }

  async submitDirectReceipt() {
    if (this.isSubmittingDr) return;
    const validLines = this.drLines.filter(l => l.qty > 0);
    if (validLines.length === 0) return;
    this.isSubmittingDr = true;
    try {
      await this.api.recordDirectReceipt(this.drVendorId, validLines);
      this.showDrModal = false;
      this.triggerToast('Direct goods receipt recorded');
      await this.loadData();
    } catch (err: any) {
      this.triggerToast(err?.message || 'Error recording direct receipt');
    } finally {
      this.isSubmittingDr = false;
    }
  }

  triggerToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => {
      if (this.toastMessage === msg) this.toastMessage = null;
    }, 3000);
  }
}
