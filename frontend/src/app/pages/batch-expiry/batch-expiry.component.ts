import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-batch-expiry',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-STK-002, FR-P2-RPT-004</span>
        <h1>Batch &amp; Expiry Tracking</h1>
        <p>Every batch carries a manufacture and expiry date. Billing issues the earliest-expiring batch first (FEFO).</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" (click)="showModal = true">+ Add Batch</button>
      </div>
    </div>

    <div class="card card-flush">
      <div class="card-header row-between wrap" style="gap:var(--space-3)">
        <h3 style="margin-right:auto">Batches &amp; Expiry Overview — sorted FEFO</h3>
        <div class="row wrap" style="gap:var(--space-3)">
          <input class="input" [(ngModel)]="searchQuery" (input)="applyFilters()" placeholder="Search SKU, Product, or Batch..." style="width:230px">
          <select class="select" [(ngModel)]="selectedCategory" (change)="applyFilters()" style="width:150px">
            <option value="All">All Categories</option>
            @for (cat of categories(); track cat) {
              <option [value]="cat">{{ cat }}</option>
            }
          </select>
          <select class="select" [(ngModel)]="selectedStatus" (change)="applyFilters()" style="width:170px">
            <option value="all">All Expiry Statuses</option>
            <option value="expired">Expired</option>
            <option value="expiring_soon">Expiring Soon (&le;30 days)</option>
            <option value="good">Good (&gt;30 days)</option>
          </select>
        </div>
      </div>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Product Name</th>
              <th>SKU</th>
              <th>Batch No</th>
              <th class="num">Quantity</th>
              <th>Mfg Date</th>
              <th>Expiry Date</th>
              <th>Expiry Status</th>
            </tr>
          </thead>
          <tbody>
            @for (b of filteredBatches(); track b.batch) {
              <tr>
                <td><strong>{{ b.name }}</strong></td>
                <td class="mono text-xs">{{ b.sku }}</td>
                <td class="mono text-xs">{{ b.batch }}</td>
                <td class="num mono" style="font-weight:700">{{ b.qty }}</td>
                <td class="mono text-xs">{{ b.mfgDate }}</td>
                <td class="mono text-xs">{{ b.expiryDate }}</td>
                <td>
                  @if (b.daysToExpiry < 0) {
                    <span class="badge badge-danger">Expired ({{ Math.abs(b.daysToExpiry) }}d ago)</span>
                  } @else if (b.daysToExpiry <= 30) {
                    <span class="badge badge-warning">Expiring Soon ({{ b.daysToExpiry }}d)</span>
                  } @else {
                    <span class="badge badge-success">Good ({{ b.daysToExpiry }}d)</span>
                  }
                </td>
              </tr>
            }
            @if (filteredBatches().length === 0) {
              <tr>
                <td colspan="7" class="text-center text-muted" style="padding:var(--space-6)">No matching batch records found</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Batch Modal -->
    @if (showModal) {
      <div class="modal-overlay open">
        <div class="modal">
          <div class="modal-header">
            <h3>Add Batch</h3>
            <button class="icon-btn" (click)="showModal = false">✕</button>
          </div>
          <div class="modal-body stack">
            <div class="field">
              <label>Item</label>
              <select class="select" [(ngModel)]="newBatch.sku" (change)="onSkuChange()">
                @for (item of catalog(); track item.sku) {
                  <option [value]="item.sku">{{ item.name }} ({{ item.sku }})</option>
                }
              </select>
            </div>
            <div class="field">
              <label>Batch Number</label>
              <input class="input" [(ngModel)]="newBatch.batch" placeholder="e.g. B-2409Z">
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Mfg Date</label>
                <input class="input" type="date" [(ngModel)]="newBatch.mfgDate">
              </div>
              <div class="field">
                <label>Expiry Date</label>
                <input class="input" type="date" [(ngModel)]="newBatch.expiryDate">
              </div>
            </div>
            <div class="field">
              <label>Quantity</label>
              <input class="input" type="number" min="1" [(ngModel)]="newBatch.qty">
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" (click)="showModal = false">Cancel</button>
            <button class="btn btn-primary" (click)="submitBatch()">Add Batch</button>
          </div>
        </div>
      </div>
    }
  `
})
export class BatchExpiryComponent implements OnInit {
  private api = inject(ApiService);

  Math = Math;
  batches = signal<any[]>([]);
  filteredBatches = signal<any[]>([]);
  categories = signal<string[]>([]);
  catalog = signal<any[]>([]);

  searchQuery = '';
  selectedCategory = 'All';
  selectedStatus = 'all';

  showModal = false;
  newBatch = {
    sku: '',
    name: '',
    batch: '',
    mfgDate: '2026-09-07',
    expiryDate: '2026-09-20',
    qty: 20
  };

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const list = await this.api.getBatches();
    this.batches.set(list);

    const cats = await this.api.getCategories();
    this.categories.set(cats);

    const cat = await this.api.getCatalog();
    this.catalog.set(cat);
    if (cat.length > 0 && !this.newBatch.sku) {
      this.newBatch.sku = cat[0].sku;
      this.newBatch.name = cat[0].name;
    }

    this.applyFilters();
  }

  onSkuChange() {
    const item = this.catalog().find(i => i.sku === this.newBatch.sku);
    if (item) {
      this.newBatch.name = item.name;
    }
  }

  applyFilters() {
    const query = this.searchQuery.toLowerCase().trim();
    let list = this.batches();

    if (this.selectedCategory !== 'All') {
      const catTerm = this.selectedCategory.toLowerCase();
      list = list.filter(b => {
        const item = this.catalog().find(i => i.sku === b.sku);
        const itemCat = (item ? item.category : b.category || '').toLowerCase();
        return itemCat === catTerm;
      });
    }

    if (this.selectedStatus === 'expired') {
      list = list.filter(b => b.daysToExpiry < 0);
    } else if (this.selectedStatus === 'expiring_soon') {
      list = list.filter(b => b.daysToExpiry >= 0 && b.daysToExpiry <= 30);
    } else if (this.selectedStatus === 'good') {
      list = list.filter(b => b.daysToExpiry > 30);
    }

    if (query) {
      list = list.filter(b =>
        (b.name + ' ' + b.sku + ' ' + b.batch).toLowerCase().includes(query)
      );
    }

    this.filteredBatches.set(list);
  }

  async submitBatch() {
    if (!this.newBatch.sku || this.newBatch.qty <= 0) return;
    const batchNo = this.newBatch.batch.trim() || ('B-' + Date.now().toString().slice(-6));
    await this.api.addBatch({
      sku: this.newBatch.sku,
      name: this.newBatch.name,
      batch: batchNo,
      mfgDate: this.newBatch.mfgDate,
      expiryDate: this.newBatch.expiryDate,
      qty: this.newBatch.qty
    });
    this.showModal = false;
    this.newBatch.batch = '';
    await this.loadData();
  }
}
