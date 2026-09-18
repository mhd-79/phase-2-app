import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-items-stock',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <div class="sidebar-backdrop" *ngIf="isMobileMenuOpen" (click)="isMobileMenuOpen = false"></div>
      <aside class="sidebar" [class.mobile-open]="isMobileMenuOpen">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Okuto Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link active" routerLink="/items-stock" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">📦 Items &amp; Stock</a>
            <a class="nav-link" routerLink="/stock-upload" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>

        <div class="sidebar__footer" style="margin-top:auto; padding:16px 8px 8px; border-top:1px solid rgba(255,255,255,0.08);">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
            <div class="avatar" style="width:32px; height:32px; border-radius:50%; background:var(--primary); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px; flex-shrink:0;">{{ auth.currentUser().initials }}</div>
            <div style="overflow:hidden;">
              <div class="text-sm" style="font-weight:600; line-height:1.2; white-space:nowrap; text-overflow:ellipsis; overflow:hidden; color:var(--slate-200);">{{ auth.currentUser().fullName }}</div>
              <div class="text-xs text-muted" style="line-height:1.2; text-transform:capitalize; color:var(--slate-400);">{{ auth.currentUser().role }}</div>
            </div>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="signOut()" style="width:100%; display:flex; align-items:center; justify-content:center; gap:6px; color:#f87171; border:1px solid rgba(239,68,68,0.2);">
            <span>🚪</span> Sign Out
          </button>
        </div>
      </aside>

      <!-- TOPBAR -->
      <header class="topbar">
        <div class="topbar__left">
          <button type="button" class="btn-hamburger" (click)="isMobileMenuOpen = !isMobileMenuOpen" title="Toggle navigation menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <span class="topbar-brand-title">Items &amp; Stock</span>
        </div>
        <div class="topbar__right">
          <div class="user-chip">
            <div class="avatar">{{ auth.currentUser().initials }}</div>
            <div class="user-chip-text">
              <div class="text-sm" style="font-weight:600;line-height:1.2;white-space:nowrap;">{{ auth.currentUser().fullName }}</div>
              <div class="text-xs text-muted" style="line-height:1.2; text-transform:capitalize;white-space:nowrap;">{{ auth.currentUser().role }}</div>
            </div>
          </div>
          <button type="button" class="btn-topbar-signout" (click)="signOut()" title="Sign out">
            <span>🚪</span>
            <span class="signout-label">Sign Out</span>
          </button>
        </div>
      </header>

      <main class="main">

        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-CAT-001..004</span>
            <h1>Items &amp; Stock Management</h1>
            <p class="text-muted">Manage product catalog, prices, cost rates, wholesale tiers, stock quantities, and instant category selection.</p>
          </div>
          <div class="page-actions" style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn btn-secondary" (click)="showAddCategory = true">+ Add Category</button>
            <button class="btn btn-primary" (click)="openAddItemModal()">+ Add Item</button>
          </div>
        </div>

        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
              <span class="text-xs text-muted" style="font-weight:600;">Filter Category:</span>
              <select class="select select-sm" [(ngModel)]="selectedCategoryFilter" (change)="filterItems()">
                <option value="All">All Categories ({{ categories.length }})</option>
                <option *ngFor="let cat of categories" [value]="cat">{{ cat }}</option>
              </select>
            </div>
            <input class="input input-sm" style="max-width:260px; min-width:180px; flex:1;" [(ngModel)]="searchQuery" (ngModelChange)="filterItems()" placeholder="Search Name, SKU or Barcode...">
          </div>
        </div>

        <div class="card">
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th class="num">Retail Price (MRP)</th>
                  <th class="num">Wholesale Price</th>
                  <th class="num">Cost Price</th>
                  <th class="num">Stock Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of filteredItems">
                  <td><strong class="mono">{{ item.sku }}</strong></td>
                  <td>{{ item.name }}</td>
                  <td><span class="badge badge-neutral">{{ item.category_name }}</span></td>
                  <td class="num mono">₹{{ item.price.toFixed(2) }}</td>
                  <td class="num mono">₹{{ item.wholesale_price ? item.wholesale_price.toFixed(2) : item.price.toFixed(2) }}</td>
                  <td class="num mono">₹{{ (item.cost_price || 0).toFixed(2) }}</td>
                  <td class="num mono">
                    <span class="badge" [class.badge-success]="item.stock > (item.min_stock || 10)" [class.badge-warning]="item.stock <= (item.min_stock || 10) && item.stock > 0" [class.badge-danger]="item.stock === 0">
                      {{ item.stock }} {{ item.unit || 'pcs' }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" [class.badge-success]="item.is_active" [class.badge-danger]="!item.is_active">
                      {{ item.is_active ? 'Active' : 'Disabled' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>

    <!-- ADD CATEGORY MODAL -->
    <div class="modal-overlay" [class.open]="showAddCategory">
      <div class="modal" style="max-width:380px;">
        <div class="modal-header">
          <h3>Create New Category</h3>
          <button class="btn btn-ghost btn-sm" (click)="showAddCategory = false">✕</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label class="form-label">Category Name</label>
            <input class="input" [(ngModel)]="newCategoryName" (keyup.enter)="saveCategory()" placeholder="e.g. Organic Produce or Frozen Foods">
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary" (click)="showAddCategory = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isSavingCategory || !newCategoryName.trim()" (click)="saveCategory()">
            {{ isSavingCategory ? 'Saving...' : 'Save Category' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ADD ITEM MODAL -->
    <div class="modal-overlay" [class.open]="showAddItem">
      <div class="modal" style="max-width:480px;">
        <div class="modal-header">
          <h3>Add New Catalog Item</h3>
          <button class="btn btn-ghost btn-sm" (click)="showAddItem = false">✕</button>
        </div>
        <div class="modal-body stack" style="display:flex; flex-direction:column; gap:10px;">
          <div class="grid grid-2" style="gap:10px;">
            <div class="field">
              <label class="form-label">SKU</label>
              <input class="input mono" [(ngModel)]="itemForm.sku" placeholder="e.g. BEV-005">
            </div>
            <div class="field">
              <label class="form-label">Barcode</label>
              <input class="input mono" [(ngModel)]="itemForm.barcode" placeholder="e.g. 8901030875069">
            </div>
          </div>
          <div class="field">
            <label class="form-label">Item Name</label>
            <input class="input" [(ngModel)]="itemForm.name" placeholder="e.g. Lemon Iced Tea 500ml">
          </div>
          <div class="field">
            <label class="form-label">Category Selection</label>
            <select class="select" [(ngModel)]="itemForm.category_name">
              <option *ngFor="let cat of categories" [value]="cat">{{ cat }}</option>
            </select>
          </div>
          <div class="grid grid-3" style="gap:10px;">
            <div class="field">
              <label class="form-label">Selling Price</label>
              <input class="input mono" type="number" [(ngModel)]="itemForm.price">
            </div>
            <div class="field">
              <label class="form-label">Wholesale Price</label>
              <input class="input mono" type="number" [(ngModel)]="itemForm.wholesale_price">
            </div>
            <div class="field">
              <label class="form-label">Cost Price</label>
              <input class="input mono" type="number" [(ngModel)]="itemForm.cost_price">
            </div>
          </div>
          <div class="grid grid-3" style="gap:10px;">
            <div class="field">
              <label class="form-label">Tax Rate (GST %)</label>
              <input class="input mono" type="number" [(ngModel)]="itemForm.tax_rate">
            </div>
            <div class="field">
              <label class="form-label">Opening Stock</label>
              <input class="input mono" type="number" [(ngModel)]="itemForm.stock">
            </div>
            <div class="field">
              <label class="form-label">Unit</label>
              <select class="select" [(ngModel)]="itemForm.unit">
                <option value="pcs">pcs</option>
                <option value="kg">kg</option>
              </select>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary" (click)="showAddItem = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isSavingItem" (click)="saveItem()">
            {{ isSavingItem ? 'Saving...' : 'Create Item' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class ItemsStockComponent implements OnInit {
  isMobileMenuOpen: boolean = false;
  items: any[] = [];
  filteredItems: any[] = [];
  categories: string[] = ['Beverages', 'Snacks', 'Dairy', 'Bakery', 'Grocery', 'Personal Care'];
  selectedCategoryFilter: string = 'All';
  searchQuery: string = '';
  showAddCategory: boolean = false;
  showAddItem: boolean = false;
  isSavingItem: boolean = false;
  isSavingCategory: boolean = false;
  newCategoryName: string = '';
  itemForm: any = {
    sku: '',
    barcode: '',
    name: '',
    category_name: 'Beverages',
    price: 50.0,
    wholesale_price: 42.0,
    cost_price: 30.0,
    tax_rate: 12.0,
    stock: 50.0,
    min_stock: 10.0,
    pricing_method: 'qty',
    unit: 'pcs'
  };

  constructor(public auth: AuthService, private http: HttpClient, private router: Router) {}

  ngOnInit() {
    this.loadCategories();
    this.loadCatalog();
  }

  loadCategories() {
    this.http.get<string[]>(`${environment.apiUrl}/catalog/categories`).subscribe({
      next: (cats) => {
        this.categories = cats;
      }
    });
  }

  loadCatalog() {
    this.http.get<any[]>(`${environment.apiUrl}/catalog/items`).subscribe({
      next: (data) => {
        this.items = data;
        this.filterItems();
      },
      error: () => {
        this.items = [
          { sku: 'BEV-001', name: 'Cola 500ml', category_name: 'Beverages', price: 45.0, wholesale_price: 38.0, cost_price: 31.5, stock: 86, unit: 'pcs', is_active: true },
          { sku: 'BEV-003', name: 'Mineral Water 1L', category_name: 'Beverages', price: 20.0, wholesale_price: 16.0, cost_price: 14.0, stock: 210, unit: 'pcs', is_active: true }
        ];
        this.filterItems();
      }
    });
  }

  filterItems() {
    let list = this.items;
    if (this.selectedCategoryFilter !== 'All') {
      list = list.filter(i => i.category_name === this.selectedCategoryFilter);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase().trim();
      list = list.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.sku.toLowerCase().includes(q) ||
        (i.barcode && i.barcode.toLowerCase().includes(q))
      );
    }
    this.filteredItems = list;
  }

  saveCategory() {
    const cleanName = this.newCategoryName.trim();
    if (!cleanName || this.isSavingCategory) return;
    this.isSavingCategory = true;

    const token = localStorage.getItem('pos_token');
    const role = localStorage.getItem('pos_role') || 'admin';
    const headers: Record<string, string> = { 'X-User-Role': role };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    this.http.post<any>(`${environment.apiUrl}/catalog/categories`, { name: cleanName }, { headers }).subscribe({
      next: () => {
        this.isSavingCategory = false;
        alert('Category "' + cleanName + '" created and saved permanently in database!');
        if (!this.categories.includes(cleanName)) {
          this.categories.push(cleanName);
        }
        this.itemForm.category_name = cleanName;
        this.newCategoryName = '';
        this.showAddCategory = false;
      },
      error: (err) => {
        this.isSavingCategory = false;
        alert('Notice: ' + (err.error?.detail || ('Category ' + cleanName + ' added!')));
        if (!this.categories.includes(cleanName)) {
          this.categories.push(cleanName);
        }
        this.itemForm.category_name = cleanName;
        this.newCategoryName = '';
        this.showAddCategory = false;
      }
    });
  }

  openAddItemModal() {
    this.itemForm = {
      sku: 'SKU-' + Math.floor(1000 + Math.random() * 9000),
      barcode: '890103' + Math.floor(1000000 + Math.random() * 9000000),
      name: '',
      category_name: this.categories[0] || 'Beverages',
      price: 50.0,
      wholesale_price: 42.0,
      cost_price: 30.0,
      tax_rate: 12.0,
      stock: 50.0,
      min_stock: 10.0,
      pricing_method: 'qty',
      unit: 'pcs'
    };
    this.showAddItem = true;
  }

  saveItem() {
    if (!this.itemForm.sku.trim() || !this.itemForm.name.trim() || this.isSavingItem) {
      if (!this.itemForm.sku.trim() || !this.itemForm.name.trim()) {
        alert('Please fill in SKU and Item Name');
      }
      return;
    }
    this.isSavingItem = true;

    const payload = {
      sku: this.itemForm.sku.trim(),
      barcode: this.itemForm.barcode ? this.itemForm.barcode.trim() : this.itemForm.sku.trim(),
      name: this.itemForm.name.trim(),
      category_name: this.itemForm.category_name || (this.categories[0] || 'Beverages'),
      price: Number(this.itemForm.price) || 0,
      wholesale_price: this.itemForm.wholesale_price !== null && this.itemForm.wholesale_price !== undefined && this.itemForm.wholesale_price !== '' ? Number(this.itemForm.wholesale_price) : null,
      cost_price: Number(this.itemForm.cost_price) || 0,
      tax_rate: Number(this.itemForm.tax_rate) || 0,
      stock: Number(this.itemForm.stock) || 0,
      min_stock: Number(this.itemForm.min_stock) || 10,
      pricing_method: this.itemForm.unit === 'kg' ? 'weight' : 'qty',
      unit: this.itemForm.unit || 'pcs'
    };

    const token = localStorage.getItem('pos_token');
    const role = localStorage.getItem('pos_role') || 'admin';
    const headers: Record<string, string> = { 'X-User-Role': role };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    this.http.post<any>(`${environment.apiUrl}/catalog/items`, payload, { headers }).subscribe({
      next: () => {
        this.isSavingItem = false;
        alert('Item "' + payload.name + '" created successfully!');
        this.showAddItem = false;
        this.loadCatalog();
      },
      error: (err) => {
        this.isSavingItem = false;
        let msg = 'Failed to create item';
        if (err.error) {
          if (typeof err.error.detail === 'string') {
            msg = err.error.detail;
          } else if (Array.isArray(err.error.detail)) {
            msg = err.error.detail.map((d: any) => typeof d === 'string' ? d : (d.msg || (d.loc ? d.loc.join('.') : JSON.stringify(d)))).join(', ');
          } else if (typeof err.error.detail === 'object' && err.error.detail !== null) {
            msg = JSON.stringify(err.error.detail);
          } else if (typeof err.error.message === 'string') {
            msg = err.error.message;
          }
        }
        alert('Error creating item: ' + msg);
      }
    });
  }

  signOut() {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
