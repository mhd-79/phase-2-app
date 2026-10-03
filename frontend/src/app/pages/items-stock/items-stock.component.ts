import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, CatalogItem } from '../../services/api.service';

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
          <button class="btn btn-secondary" (click)="showNewCatModal = true">+ New Category</button>
          <a class="btn btn-secondary" routerLink="/stock-upload">Bulk Upload</a>
          <a class="btn btn-primary" routerLink="/item-edit">+ Add Item</a>
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
          </div>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr><th>SKU</th><th>Barcode</th><th>Name</th><th>Category</th><th>Pricing</th><th class="num">Price</th><th class="num">Wholesale</th><th class="num">Tax</th><th class="num">Stock</th><th>Mfg Date</th><th>Exp Date</th><th>Status</th><th></th></tr>
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
                  <td class="mono">{{ item.mfgDate ? (item.mfgDate | date:'dd-MM-yyyy') : '—' }}</td>
                  <td class="mono">{{ item.expDate ? (item.expDate | date:'dd-MM-yyyy') : '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-danger]="item.stock === 0" [class.badge-warning]="item.stock > 0 && item.stock <= item.min" [class.badge-success]="item.stock > item.min">
                      {{ item.stock === 0 ? 'Out of Stock' : (item.stock <= item.min ? 'Low Stock' : 'In Stock') }}
                    </span>
                  </td>
                  <td><a class="btn btn-ghost btn-sm" [routerLink]="['/item-edit']" [queryParams]="{sku: item.sku}">Edit</a></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </main>

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
  items = signal<CatalogItem[]>([]);
  categories = signal<string[]>([]);

  searchTerm = '';
  selectedCategory = 'All';
  lowStockOnly = false;

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

    return this.items().filter((i) => {
      const matchTerm = !term || i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term);
      const matchCat = cat === 'All' || i.category === cat;
      const matchLow = !low || i.stock <= i.min;
      return matchTerm && matchCat && matchLow;
    });
  }

  totalSkus = () => this.items().length;
  totalValuation = () => Math.round(this.items().reduce((s, i) => s + i.price * i.stock, 0));
  lowStockCount = () => this.items().filter((i) => i.stock > 0 && i.stock <= i.min).length;
  outStockCount = () => this.items().filter((i) => i.stock === 0).length;

  async saveCategory() {
    if (!this.newCategoryName.trim()) return;
    await this.api.addCategory(this.newCategoryName.trim());
    this.newCategoryName = '';
    this.showNewCatModal = false;
    await this.loadCatalog();
  }
}
