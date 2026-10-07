import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, CatalogItem } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { DiscountRule } from '../../services/pricing';

@Component({
  selector: 'app-items-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-STK-002, 004, 005</span>
          <h1>Items &amp; Stock</h1>
          <p>Current stock-on-hand for every item, with low-stock items flagged for attention.</p>
        </div>
        <div class="page-actions">
          @if (auth.can('items_stock', 'create')) { <button class="btn btn-secondary" (click)="showNewCatModal = true">+ New Category</button> }
          @if (auth.can('stock_upload', 'view')) { <a class="btn btn-secondary" routerLink="/stock-upload">Bulk Upload</a> }
          @if (auth.can('items_stock', 'create')) { <a class="btn btn-primary" routerLink="/item-edit">+ Add Item</a> }
        </div>
      </div>

      <div class="grid grid-4" style="margin-bottom:var(--space-5)">
        <div class="card stat-card"><span class="stat-label">Total SKUs</span><span class="stat-value">{{ totalSkus() }}</span></div>
        <div class="card stat-card"><span class="stat-label">Stock Value (MRP)</span><span class="stat-value">₹{{ totalValuation().toLocaleString('en-IN') }}</span></div>
        <div class="card stat-card"><span class="stat-label">Low Stock</span><span class="stat-value" style="color:var(--warning-700)">{{ lowStockCount() }}</span></div>
        <div class="card stat-card"><span class="stat-label">Out of Stock</span><span class="stat-value" style="color:var(--danger-700)">{{ outStockCount() }}</span></div>
      </div>

      <div class="card card-flush">
        <div class="card-header">
          <h3>Item Master</h3>
          <div class="row wrap" style="gap:var(--space-2)">
            <input class="input" [(ngModel)]="searchTerm" placeholder="Search name or SKU" style="width:220px">
            <select class="select" [(ngModel)]="selectedCategory" style="width:160px">
              @for (c of categories(); track c) {
                <option [value]="c">{{ c }}</option>
              }
            </select>
            <label class="checkbox-row text-sm"><input type="checkbox" [(ngModel)]="lowStockOnly"> Low stock only</label>
            <label class="checkbox-row text-sm"><input type="checkbox" [(ngModel)]="outOfStockOnly"> Out of stock only</label>
          </div>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr><th>SKU</th><th>Barcode</th><th>Name</th><th>Category</th><th>Pricing</th><th class="num">Price</th><th class="num">Wholesale</th><th class="num">Tax</th><th class="num">Stock</th><th>Batch No.</th><th>Mfg Date</th>
                  <th (click)="toggleExpSort()" style="cursor:pointer;user-select:none" title="Sort by expiry date" [attr.aria-sort]="expSort === 'asc' ? 'ascending' : (expSort === 'desc' ? 'descending' : 'none')">Exp Date <span aria-hidden="true">{{ expSort === 'asc' ? '▲' : (expSort === 'desc' ? '▼' : '⇅') }}</span></th>
                  <th>Status</th><th></th></tr>
            </thead>
            <tbody>
              @for (item of filteredItems(); track item.sku) {
                <tr>
                  <td class="mono">{{ item.sku }}</td>
                  <td class="mono text-muted">{{ item.barcode }}</td>
                  <td>{{ item.name }}</td>
                  <td>{{ item.category }}</td>
                  <td><span class="badge badge-neutral">{{ item.pricingMethod === 'weight' ? 'Weight' : 'Qty' }}</span></td>
                  <td class="num mono">₹{{ item.price.toFixed(2) }}/{{ item.unit }}</td>
                  <td class="num mono">{{ item.wholesalePrice ? '₹' + item.wholesalePrice.toFixed(2) : '—' }}</td>
                  <td class="num">{{ item.tax }}%</td>
                  <td class="num mono">{{ item.pricingMethod === 'weight' ? item.stock.toFixed(3) : item.stock }} {{ item.unit }}</td>
                  <td class="mono">{{ item.batchNo || '—' }}</td>
                  <td class="mono">{{ item.mfgDate ? (item.mfgDate | date:'dd-MM-yyyy') : '—' }}</td>
                  <td class="mono">{{ item.expDate ? (item.expDate | date:'dd-MM-yyyy') : '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-danger]="item.stock <= 0" [class.badge-warning]="item.stock > 0 && item.stock <= item.min" [class.badge-success]="item.stock > item.min">
                      {{ item.stock <= 0 ? 'Out of Stock' : (item.stock <= item.min ? 'Low Stock' : 'In Stock') }}
                    </span>
                  </td>
                  <td>
                    <div class="row" style="gap:var(--space-1)">
                      @if (auth.can('items_stock', 'edit')) { <a class="btn btn-ghost btn-sm" [routerLink]="['/item-edit']" [queryParams]="{sku: item.sku}">Edit</a> }
                      @if (auth.can('discounts', 'create') || auth.can('discounts', 'edit')) { <button class="btn btn-ghost btn-sm" style="color:var(--primary)" (click)="openDiscountModal(item)">Discount</button> }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- Item discount popup -->
    <div class="modal-overlay" [class.open]="!!discItem">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>Discounts &mdash; {{ discItem?.name }} <span class="text-xs text-muted mono">({{ discItem?.sku }})</span></h3>
          <button class="icon-btn" (click)="closeDiscountModal()">✕</button>
        </div>
        <div class="modal-body stack">
          <div class="table-scroll" style="border:1px solid var(--border);border-radius:var(--radius-md)">
            <table class="table" style="min-width:0">
              <thead><tr><th>Name</th><th>Type</th><th class="num">Value</th><th>Start</th><th>End</th><th>Status</th><th></th></tr></thead>
              <tbody>
                @if (itemRules().length === 0) {
                  <tr><td colspan="7" class="text-sm text-muted">No discount on this item yet. Create one below.</td></tr>
                }
                @for (d of itemRules(); track d.id) {
                  <tr>
                    <td><strong>{{ d.name }}</strong>@if ((d.productSkus || []).length > 1) { <div class="text-xs text-muted">Shared with {{ (d.productSkus || []).length - 1 }} other item(s)</div> }</td>
                    <td>{{ d.type === 'percent' ? 'Percentage' : 'Fixed Amount' }}</td>
                    <td class="num mono">{{ d.type === 'percent' ? d.value + '%' : '₹' + d.value.toFixed(2) }}</td>
                    <td>{{ d.startDate || '—' }}</td>
                    <td>{{ d.endDate || '—' }}</td>
                    <td><span class="badge" [class.badge-success]="d.status === 'active'" [class.badge-neutral]="d.status !== 'active'">{{ d.status === 'active' ? 'Active' : 'Inactive' }}</span></td>
                    <td>
                      <div class="row" style="gap:var(--space-1)">
                        <button class="btn btn-ghost btn-sm" (click)="editDiscount(d)">Edit</button>
                        <button class="btn btn-ghost btn-sm" (click)="toggleDiscount(d)">{{ d.status === 'active' ? 'Deactivate' : 'Activate' }}</button>
                        <button class="btn btn-ghost btn-sm" style="color:var(--danger-700)" (click)="removeDiscount(d)">Remove</button>
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="field" style="border-top:1px solid var(--border);padding-top:var(--space-4)">
            <label style="font-weight:700">{{ discEditingId ? 'Edit Discount' : 'New Discount for this item' }}</label>
            @if (discEditingId && sharedCount() > 0) { <span class="hint">This discount is shared with {{ sharedCount() }} other item(s); changes apply to all of them.</span> }
          </div>
          <div class="form-grid">
            <div class="field"><label for="idName">Discount Name</label><input class="input" id="idName" [(ngModel)]="discName" placeholder="e.g. Clearance 10% Off"></div>
            <div class="field">
              <label>Discount Type</label>
              <div class="row" style="gap:var(--space-4);min-height:var(--tap-min)">
                <label class="checkbox-row"><input type="radio" name="idType" value="percent" [(ngModel)]="discType"> Percentage (%)</label>
                <label class="checkbox-row"><input type="radio" name="idType" value="fixed" [(ngModel)]="discType"> Fixed Amount (₹)</label>
              </div>
            </div>
          </div>
          <div class="form-grid">
            <div class="field"><label for="idValue">Discount Value</label><input class="input" id="idValue" type="number" min="0" step="0.01" [(ngModel)]="discValue"></div>
            <div class="field"><label>Status</label><label class="checkbox-row"><input type="checkbox" [(ngModel)]="discActive"> Active</label></div>
          </div>
          <div class="form-grid">
            <div class="field"><label for="idStart">Start Date</label><input class="input" id="idStart" type="date" [(ngModel)]="discStart"></div>
            <div class="field"><label for="idEnd">End Date</label><input class="input" id="idEnd" type="date" [min]="discStart || ''" [(ngModel)]="discEnd"></div>
          </div>
          @if (discError) { <span class="hint" style="color:var(--danger-700)">{{ discError }}</span> }
        </div>
        <div class="modal-footer">
          @if (discEditingId) { <button class="btn btn-secondary" (click)="resetDiscountForm()">Cancel Edit</button> }
          <button class="btn btn-secondary" (click)="closeDiscountModal()">Close</button>
          <button class="btn btn-primary" (click)="saveDiscount()">{{ discEditingId ? 'Save Changes' : 'Add Discount' }}</button>
        </div>
      </div>
    </div>

    <!-- New Category Modal -->
    <div class="modal-overlay" [class.open]="showNewCatModal">
      <div class="modal">
        <div class="modal-header"><h3>New Category</h3><button class="icon-btn" (click)="showNewCatModal = false">✕</button></div>
        <div class="modal-body stack">
          <div class="field"><label for="catName">Category Name</label><input class="input" id="catName" [(ngModel)]="newCategoryName" placeholder="e.g. Frozen Foods"></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showNewCatModal = false">Cancel</button>
          <button class="btn btn-primary" (click)="saveCategory()">Add Category</button>
        </div>
      </div>
    </div>
  `
})
export class ItemsStockComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);
  items = signal<CatalogItem[]>([]);
  categories = signal<string[]>([]);

  searchTerm = '';
  selectedCategory = 'All';
  lowStockOnly = false;
  outOfStockOnly = false;
  /** Exp Date sort: '' = default SKU order, otherwise earliest-first / latest-first (items without an expiry date always last). */
  expSort: '' | 'asc' | 'desc' = '';

  showNewCatModal = false;
  newCategoryName = '';

  async ngOnInit() {
    await this.loadCatalog();
  }

  async loadCatalog() {
    const list = await this.api.getCatalog();
    this.items.set(list);
    const cats = await this.api.getCategories();
    this.categories.set(['All', ...cats]);
  }

  filteredItems(): CatalogItem[] {
    const term = this.searchTerm.trim().toLowerCase();
    const cat = this.selectedCategory;
    const low = this.lowStockOnly;
    const out = this.outOfStockOnly;

    const rows = this.items().filter((i) => {
      const matchTerm = !term || i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term);
      const matchCat = cat === 'All' || i.category === cat;
      const matchLow = !low || i.stock <= i.min;
      const matchOut = !out || i.stock <= 0;
      return matchTerm && matchCat && matchLow && matchOut;
    });
    // SKU ascending is always the base order (also the tie-break); an active Exp Date sort sits on top of it
    rows.sort((a, b) => a.sku.localeCompare(b.sku, undefined, { numeric: true, sensitivity: 'base' }));
    if (this.expSort) {
      const dir = this.expSort === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        if (!a.expDate && !b.expDate) return 0;
        if (!a.expDate) return 1;
        if (!b.expDate) return -1;
        return a.expDate < b.expDate ? -dir : (a.expDate > b.expDate ? dir : 0);
      });
    }
    return rows;
  }

  toggleExpSort() {
    this.expSort = this.expSort === '' ? 'asc' : (this.expSort === 'asc' ? 'desc' : '');
  }

  totalSkus = () => this.items().length;
  totalValuation = () => Math.round(this.items().reduce((s, i) => s + i.price * i.stock, 0));
  lowStockCount = () => this.items().filter((i) => i.stock > 0 && i.stock <= i.min).length;
  outStockCount = () => this.items().filter((i) => i.stock <= 0).length;

  // ---- Item-level discounts (same store as the Discounts page: applies to "selected" products = this item) ----
  discItem: CatalogItem | null = null;
  private discRules: DiscountRule[] = [];
  discEditingId: string | null = null;
  discName = '';
  discType: 'percent' | 'fixed' = 'percent';
  discValue: number | null = 10;
  discStart = '';
  discEnd = '';
  discActive = true;
  discError = '';

  private async loadDiscountRules() {
    this.discRules = (await this.api.getDiscounts()) || [];
  }

  itemRules(): DiscountRule[] {
    const sku = this.discItem?.sku;
    return this.discRules.filter(r => r.appliesTo === 'selected' && !!sku && (r.productSkus || []).includes(sku));
  }

  sharedCount(): number {
    const rule = this.discRules.find(r => r.id === this.discEditingId);
    return rule ? Math.max(0, (rule.productSkus || []).length - 1) : 0;
  }

  async openDiscountModal(item: CatalogItem) {
    this.discItem = item;
    this.resetDiscountForm();
    await this.loadDiscountRules();
  }

  closeDiscountModal() {
    this.discItem = null;
  }

  resetDiscountForm() {
    this.discEditingId = null;
    this.discName = '';
    this.discType = 'percent';
    this.discValue = 10;
    this.discStart = new Date().toISOString().slice(0, 10);
    this.discEnd = '';
    this.discActive = true;
    this.discError = '';
  }

  editDiscount(d: DiscountRule) {
    this.discEditingId = d.id;
    this.discName = d.name;
    this.discType = d.type;
    this.discValue = d.value;
    this.discStart = d.startDate || '';
    this.discEnd = d.endDate || '';
    this.discActive = d.status === 'active';
    this.discError = '';
  }

  async toggleDiscount(d: DiscountRule) {
    try {
      await this.api.updateDiscount(d.id, { ...d, status: d.status === 'active' ? 'inactive' : 'active' });
      await this.loadDiscountRules();
    } catch (err: any) {
      this.discError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not change the discount. Please try again.';
    }
  }

  /** Takes this item off the discount; a discount left with no items is deleted. */
  async removeDiscount(d: DiscountRule) {
    const sku = this.discItem?.sku;
    if (!sku) return;
    const remaining = (d.productSkus || []).filter(s => s !== sku);
    try {
      if (remaining.length === 0) await this.api.deleteDiscount(d.id);
      else await this.api.updateDiscount(d.id, { ...d, productSkus: remaining });
      if (this.discEditingId === d.id) this.resetDiscountForm();
      await this.loadDiscountRules();
    } catch (err: any) {
      this.discError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not update the discount. Please try again.';
    }
  }

  async saveDiscount() {
    const sku = this.discItem?.sku;
    if (!sku) return;
    const value = Number(this.discValue);
    if (!this.discName.trim()) { this.discError = 'Enter a discount name'; return; }
    if (!(value > 0)) { this.discError = 'Discount value must be greater than zero'; return; }
    if (this.discType === 'percent' && value > 100) { this.discError = 'Percentage discount cannot exceed 100%'; return; }
    if (this.discStart && this.discEnd && this.discEnd < this.discStart) { this.discError = 'End Date cannot be earlier than Start Date'; return; }

    const fields = {
      name: this.discName.trim(), type: this.discType, value,
      startDate: this.discStart || undefined, endDate: this.discEnd || undefined,
      status: (this.discActive ? 'active' : 'inactive') as 'active' | 'inactive'
    };
    try {
      const existing = this.discRules.find(r => r.id === this.discEditingId);
      if (existing) await this.api.updateDiscount(existing.id, { ...existing, ...fields });
      else await this.api.createDiscount({ ...fields, appliesTo: 'selected', productSkus: [sku] });
      await this.loadDiscountRules();
      this.resetDiscountForm();
    } catch (err: any) {
      this.discError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not save the discount. Please try again.';
    }
  }

  async saveCategory() {
    if (!this.newCategoryName.trim()) return;
    await this.api.addCategory(this.newCategoryName.trim());
    this.newCategoryName = '';
    this.showNewCatModal = false;
    await this.loadCatalog();
  }
}
