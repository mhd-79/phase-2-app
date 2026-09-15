import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { CatalogService } from "../../core/services/catalog.service";
import { CatalogItem } from "../../core/models/item.model";

@Component({
  selector: "app-items-stock",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:1200px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
        <div>
          <h2>Items &amp; Stock Inventory</h2>
          <p class="text-sm text-muted">Manage product prices, tax slabs, and real-time inventory</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="openAddModal()">+ Add New Item</button>
      </div>

      <div style="display:flex;gap:12px;margin-bottom:16px">
        <input type="text" class="form-input" [(ngModel)]="searchTerm" placeholder="Search by name, SKU or barcode..." style="max-width:320px">
        <select class="form-select" [(ngModel)]="selectedCategory" style="max-width:180px">
          <option value="All">All Categories</option>
          <option *ngFor="let cat of catalog.categories()" [value]="cat.name">{{ cat.name }}</option>
        </select>
        <div style="margin-left:auto;display:flex;align-items:center;gap:8px">
          <span class="badge badge-warning" *ngIf="catalog.lowStockCount() > 0">{{ catalog.lowStockCount() }} Low Stock</span>
        </div>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Item Name</th>
              <th>Category</th>
              <th class="num">Retail Price (₹)</th>
              <th class="num">GST %</th>
              <th class="num">Stock Qty</th>
              <th class="num">Min Alert</th>
              <th style="text-align:right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of filteredItems">
              <td class="mono font-semibold">{{ item.sku }}</td>
              <td>
                <div style="font-weight:600">{{ item.name }}</div>
                <div class="text-xs text-muted mono">{{ item.barcode }}</div>
              </td>
              <td><span class="badge badge-info">{{ item.category }}</span></td>
              <td class="num mono font-bold">₹{{ item.price.toFixed(2) }}</td>
              <td class="num mono">{{ item.tax }}%</td>
              <td class="num mono font-bold" [class.text-danger]="item.stock <= item.min">{{ item.stock }} {{ item.unit || 'pcs' }}</td>
              <td class="num mono text-muted">{{ item.min }}</td>
              <td style="text-align:right">
                <button type="button" class="btn btn-secondary btn-sm" (click)="editItem(item)">Edit</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- EDIT / ADD MODAL -->
      <div class="modal-overlay" [class.open]="showEditModal">
        <div class="modal" style="max-width:440px">
          <div class="modal-header">
            <h3>{{ editingItem.id ? 'Edit Item' : 'Add New Item' }}</h3>
            <button type="button" class="btn btn-ghost btn-sm" (click)="showEditModal = false">✕</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">SKU</label>
              <input type="text" class="form-input mono" [(ngModel)]="editingItem.sku">
            </div>
            <div class="form-group">
              <label class="form-label">Barcode</label>
              <input type="text" class="form-input mono" [(ngModel)]="editingItem.barcode">
            </div>
            <div class="form-group">
              <label class="form-label">Item Name</label>
              <input type="text" class="form-input" [(ngModel)]="editingItem.name">
            </div>
            <div class="form-group">
              <label class="form-label">Category</label>
              <input type="text" class="form-input" [(ngModel)]="editingItem.category">
            </div>
            <div style="display:flex;gap:12px">
              <div class="form-group" style="flex:1">
                <label class="form-label">Price (₹)</label>
                <input type="number" class="form-input mono" [(ngModel)]="editingItem.price">
              </div>
              <div class="form-group" style="flex:1">
                <label class="form-label">GST Tax %</label>
                <input type="number" class="form-input mono" [(ngModel)]="editingItem.tax">
              </div>
            </div>
            <div style="display:flex;gap:12px">
              <div class="form-group" style="flex:1">
                <label class="form-label">Stock Qty</label>
                <input type="number" class="form-input mono" [(ngModel)]="editingItem.stock">
              </div>
              <div class="form-group" style="flex:1">
                <label class="form-label">Min Alert Qty</label>
                <input type="number" class="form-input mono" [(ngModel)]="editingItem.min">
              </div>
            </div>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" (click)="showEditModal = false">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="saveItem()">Save Item</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class ItemsStockComponent {
  catalog = inject(CatalogService);
  searchTerm = "";
  selectedCategory = "All";
  showEditModal = false;
  editingItem: CatalogItem = this.getEmptyItem();

  get filteredItems(): CatalogItem[] {
    return this.catalog.items().filter(i => {
      const matchCat = this.selectedCategory === "All" || i.category === this.selectedCategory;
      const matchSearch = !this.searchTerm || 
        i.name.toLowerCase().includes(this.searchTerm.toLowerCase()) || 
        i.sku.toLowerCase().includes(this.searchTerm.toLowerCase()) || 
        i.barcode.includes(this.searchTerm);
      return matchCat && matchSearch;
    });
  }

  getEmptyItem(): CatalogItem {
    return { sku: "", barcode: "", name: "", category: "Grocery", price: 0, tax: 5, stock: 10, min: 5 };
  }

  openAddModal(): void {
    this.editingItem = this.getEmptyItem();
    this.showEditModal = true;
  }

  editItem(item: CatalogItem): void {
    this.editingItem = { ...item };
    this.showEditModal = true;
  }

  saveItem(): void {
    if (!this.editingItem.sku || !this.editingItem.name) {
      alert("SKU and Name are required");
      return;
    }
    this.catalog.upsertItem(this.editingItem);
    this.showEditModal = false;
  }
}
