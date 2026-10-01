import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService, CatalogItem } from '../../services/api.service';

@Component({
  selector: 'app-item-edit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-STK-002</span>
          <h1>{{ isEdit ? 'Edit Item' : 'Add Item' }}</h1>
          <p>Add or edit one item's core details and stock quantity directly — for items not covered by a bulk upload.</p>
        </div>
        <div class="page-actions">
          <a class="btn btn-secondary" routerLink="/items-stock">Cancel</a>
        </div>
      </div>

      <div class="card" style="max-width:760px">
        <form (submit)="saveItem(); $event.preventDefault()" class="stack">
          <div class="form-grid">
            <div class="field">
              <label for="fSku">SKU</label>
              <input class="input mono" id="fSku" [(ngModel)]="item.sku" name="sku" placeholder="e.g. GRO-007" required [disabled]="isEdit">
            </div>
            <div class="field">
              <label for="fBarcode">Barcode</label>
              <input class="input mono" id="fBarcode" [(ngModel)]="item.barcode" name="barcode" placeholder="EAN/UPC">
            </div>
          </div>

          <div class="field">
            <label for="fName">Item Name</label>
            <input class="input" id="fName" [(ngModel)]="item.name" name="name" placeholder="e.g. Multigrain Bread 400g" required>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="fCategory">Category</label>
              <div style="display:flex;gap:var(--space-2)">
                <select class="select" id="fCategory" [(ngModel)]="item.category" name="category" style="flex:1">
                  @for (c of categories; track c) {
                    <option [value]="c">{{ c }}</option>
                  }
                </select>
                <button type="button" class="btn btn-secondary" (click)="openNewCategoryModal()">+ New</button>
              </div>
            </div>
            <div class="field">
              <label for="fTax">Tax Rate</label>
              <select class="select" id="fTax" [(ngModel)]="item.tax" name="tax">
                <option [ngValue]="0">GST 0%</option>
                <option [ngValue]="5">GST 5%</option>
                <option [ngValue]="12">GST 12%</option>
                <option [ngValue]="18">GST 18%</option>
                <option [ngValue]="28">GST 28%</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label>Pricing Method</label>
            <div class="row" style="gap:var(--space-4);min-height:var(--tap-min)">
              <label class="checkbox-row"><input type="radio" name="fPricingMethod" value="qty" [(ngModel)]="item.pricingMethod" (change)="onPricingMethodChange()"> Price by Quantity</label>
              <label class="checkbox-row"><input type="radio" name="fPricingMethod" value="weight" [(ngModel)]="item.pricingMethod" (change)="onPricingMethodChange()"> Price by Weight</label>
            </div>
            <span class="hint">Quantity items are sold in pieces (pcs). Weight items are sold and stocked in kilograms (kg), with grams accepted at billing.</span>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="fCost">Cost Price (₹)</label>
              <input class="input mono" id="fCost" type="number" min="0" step="0.01" [(ngModel)]="item.costPrice" name="costPrice" placeholder="e.g. 70">
            </div>
            <div class="field">
              <label for="fPrice">Selling Price / MRP (₹ per {{ item.pricingMethod === 'weight' ? 'kg' : 'pc' }})</label>
              <input class="input mono" id="fPrice" type="number" min="0" step="0.01" [(ngModel)]="item.price" name="price" required placeholder="e.g. 100">
            </div>
          </div>

          <div class="field">
            <label for="fWholesalePrice">Wholesale Price (₹ per {{ item.pricingMethod === 'weight' ? 'kg' : 'pc' }})</label>
            <input class="input mono" id="fWholesalePrice" type="number" min="0" step="0.01" [(ngModel)]="item.wholesalePrice" name="wholesalePrice" placeholder="Optional — for bulk/wholesale customers">
            <span class="hint">Kept separate from Selling Price / MRP. Editing one never changes the other.</span>
          </div>

          <div class="form-grid">
            <div class="field">
              <label for="fStock">Current Stock Quantity ({{ item.pricingMethod === 'weight' ? 'kg' : 'pcs' }})</label>
              <input class="input mono" id="fStock" type="number" [step]="item.pricingMethod === 'weight' ? '0.001' : '1'" [(ngModel)]="item.stock" name="stock" required>
            </div>
            <div class="field">
              <label for="fMin">Low-Stock Threshold</label>
              <input class="input mono" id="fMin" type="number" min="0" [(ngModel)]="item.min" name="min">
              <span class="hint">Item is flagged "Low Stock" at or below this level.</span>
            </div>
          </div>

          <div class="row" style="justify-content:flex-end;gap:var(--space-3);margin-top:var(--space-2)">
            <a class="btn btn-secondary" routerLink="/items-stock">Discard</a>
            <button type="submit" class="btn btn-primary">Save Item</button>
          </div>
        </form>
      </div>
    </main>

    <!-- New Category Modal -->
    @if (showNewCatModal) {
      <div class="modal-overlay open">
        <div class="modal" style="max-width:400px">
          <div class="modal-header">
            <h3>New Category</h3>
            <button type="button" class="icon-btn" (click)="showNewCatModal = false">✕</button>
          </div>
          <div class="modal-body stack" style="padding:var(--space-4)">
            <div class="field">
              <label for="catName">Category Name</label>
              <input class="input" id="catName" [(ngModel)]="newCategoryName" name="newCategoryName" placeholder="e.g. Frozen Foods" (keyup.enter)="saveCategory()">
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" (click)="showNewCatModal = false">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="saveCategory()">Add Category</button>
          </div>
        </div>
      </div>
    }
  `
})
export class ItemEditComponent implements OnInit {
  api = inject(ApiService);
  router = inject(Router);
  route = inject(ActivatedRoute);

  isEdit = false;
  categories: string[] = [];
  showNewCatModal = false;
  newCategoryName = '';

  item: CatalogItem = {
    sku: 'NEW-001',
    barcode: '8901030000000',
    name: '',
    category: 'Grocery',
    price: 100,
    costPrice: 70,
    wholesalePrice: 90,
    tax: 5,
    stock: 50,
    min: 10,
    pricingMethod: 'qty',
    unit: 'pcs'
  };

  async ngOnInit() {
    this.categories = await this.api.getCategories();
    this.route.queryParams.subscribe(async (params) => {
      if (params['sku']) {
        this.isEdit = true;
        const catalog = await this.api.getCatalog();
        const found = catalog.find((i) => i.sku === params['sku']);
        if (found) {
          this.item = {
            ...found,
            costPrice: found.costPrice || Math.round(found.price * 0.7)
          };
        }
      }
    });
  }

  openNewCategoryModal() {
    this.newCategoryName = '';
    this.showNewCatModal = true;
  }

  async saveCategory() {
    if (!this.newCategoryName.trim()) return;
    const catName = this.newCategoryName.trim();
    await this.api.addCategory(catName);
    this.categories = await this.api.getCategories();
    if (!this.categories.includes(catName)) {
      this.categories.push(catName);
    }
    this.item.category = catName;
    this.showNewCatModal = false;
  }

  onPricingMethodChange() {
    this.item.unit = this.item.pricingMethod === 'weight' ? 'kg' : 'pcs';
  }

  async saveItem() {
    if (!this.item.sku || !this.item.name) {
      alert('Fill required fields');
      return;
    }
    await this.api.saveItem(this.item);
    this.router.navigate(['/items-stock']);
  }
}

