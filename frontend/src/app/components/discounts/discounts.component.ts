import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { CatalogService } from '../../core/services/catalog.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-discounts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Greenfield Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📦 Items &amp; Stock</a>
            <a class="nav-link" routerLink="/stock-upload" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link active" routerLink="/discounts" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>
      </aside>

      <main class="main">
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P1-DISC-001..004</span>
            <h1>Discount Rules &amp; Campaigns</h1>
            <p class="text-muted">Configure product-level, category-level, and store-wide discount campaigns.</p>
          </div>
          <button class="btn btn-primary" (click)="openAddModal()">+ Add Discount Rule</button>
        </div>

        <div class="card">
          <table class="table">
            <thead>
              <tr>
                <th>Rule Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Applies To</th>
                <th>Start Date</th>
                <th>End Date</th>
                <th>Status</th>
                <th style="text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let r of rules">
                <td><strong>{{ r.name }}</strong></td>
                <td>{{ r.type === 'percent' ? 'Percentage (%)' : 'Fixed Amount (₹)' }}</td>
                <td>{{ r.type === 'percent' ? r.value + '%' : '₹' + r.value }}</td>
                <td>{{ r.applies_to === 'all' ? 'All Products' : ('Selected (' + (r.product_skus?.length || 0) + ' items)') }}</td>
                <td>{{ r.start_date || '—' }}</td>
                <td>{{ r.end_date || '—' }}</td>
                <td>
                  <span class="badge" [class.badge-success]="r.status === 'active'" [class.badge-neutral]="r.status !== 'active'">
                    {{ r.status === 'active' ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td style="text-align:right;">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="openEditModal(r)">Edit</button>
                </td>
              </tr>
              <tr *ngIf="rules.length === 0">
                <td colspan="8" style="text-align:center; padding:24px; color:var(--text-muted)">
                  No discount rules configured yet. Click "+ Add Discount Rule" to create one.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </main>

      <!-- ================= ADD / EDIT DISCOUNT MODAL ================= -->
      <div class="modal-overlay" [class.open]="showModal" (click)="onBackdropClick($event)">
        <div class="modal modal-lg" style="max-width: 620px;" (click)="$event.stopPropagation()">
          <div class="modal-header">
            <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:var(--text);">
              {{ editingDiscountId ? 'Edit Discount' : 'Add Discount' }}
            </h3>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="closeModal()" aria-label="Close">✕</button>
          </div>

          <div class="modal-body" style="display:flex; flex-direction:column; gap:var(--space-4);">
            <!-- Discount Name -->
            <div class="field">
              <label style="font-weight:600; color:var(--text);">Discount Name</label>
              <input class="input" [(ngModel)]="formName" placeholder="e.g. Festive Weekend 10% Off" />
            </div>

            <!-- Discount Type & Value -->
            <div class="form-grid">
              <div class="field">
                <label style="font-weight:600; color:var(--text);">Discount Type</label>
                <div class="row" style="display:flex; align-items:center; gap:var(--space-4); margin-top:4px;">
                  <label class="checkbox-row" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                    <input type="radio" name="modalDiscountType" value="percent" [(ngModel)]="formType" />
                    <span>Percentage (%)</span>
                  </label>
                  <label class="checkbox-row" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                    <input type="radio" name="modalDiscountType" value="flat" [(ngModel)]="formType" />
                    <span>Fixed Amount (₹)</span>
                  </label>
                </div>
              </div>

              <div class="field">
                <label style="font-weight:600; color:var(--text);">Discount Value</label>
                <input class="input" type="number" min="0" step="any" [(ngModel)]="formValue" placeholder="e.g. 10" />
              </div>
            </div>

            <!-- Applicable Products -->
            <div class="field">
              <label style="font-weight:600; color:var(--text);">Applicable Products</label>
              <div class="row" style="display:flex; align-items:center; gap:var(--space-4); margin-top:4px;">
                <label class="checkbox-row" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                  <input type="radio" name="modalApplicableScope" value="all" [(ngModel)]="formAppliesTo" />
                  <span>All Products</span>
                </label>
                <label class="checkbox-row" style="cursor:pointer; display:flex; align-items:center; gap:6px;">
                  <input type="radio" name="modalApplicableScope" value="selected" [(ngModel)]="formAppliesTo" />
                  <span>Selected Products</span>
                </label>
              </div>

              <!-- Product Picker (shown when Selected Products is chosen) -->
              <div *ngIf="formAppliesTo === 'selected'" style="margin-top:10px; max-height:180px; overflow-y:auto; border:1px solid var(--border); border-radius:var(--radius-md); padding:6px 12px; background:var(--surface-sunken);">
                <div *ngFor="let item of catalogItems" style="padding:4px 0; border-bottom:1px solid rgba(0,0,0,0.05);">
                  <label class="checkbox-row" style="cursor:pointer; display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" [checked]="isSkuSelected(item.sku)" (change)="toggleSku(item.sku)" />
                    <span>{{ item.name }} <span style="font-size:11px; color:var(--text-muted)">({{ item.sku }})</span></span>
                  </label>
                </div>
                <div *ngIf="catalogItems.length === 0" style="font-size:12px; color:var(--text-muted); padding:8px 0;">
                  No products available in catalog.
                </div>
              </div>
            </div>

            <!-- Start Date & End Date -->
            <div class="form-grid">
              <div class="field">
                <label style="font-weight:600; color:var(--text);">Start Date</label>
                <input class="input" type="date" [(ngModel)]="formStartDate" />
              </div>
              <div class="field">
                <label style="font-weight:600; color:var(--text);">End Date</label>
                <input class="input" type="date" [(ngModel)]="formEndDate" placeholder="dd-mm-yyyy" />
              </div>
            </div>

            <!-- Status -->
            <div class="field">
              <label style="font-weight:600; color:var(--text);">Status</label>
              <label class="checkbox-row" style="cursor:pointer; display:flex; align-items:center; gap:8px; margin-top:2px;">
                <input type="checkbox" [(ngModel)]="formIsActive" />
                <span style="font-weight:600;">Active</span>
              </label>
              <p class="hint" style="color:var(--text-muted); font-size:12px; margin:4px 0 0; line-height:1.4;">
                Only Admin can create, edit, activate, deactivate or delete discounts. Cashiers see the configured value at POS but cannot change it.
              </p>
            </div>
          </div>

          <div class="modal-footer" style="padding: var(--space-4) var(--space-5); border-top: 1px solid var(--border); display:flex; justify-content:flex-end; gap:var(--space-3);">
            <button type="button" class="btn btn-secondary" (click)="closeModal()">Cancel</button>
            <button type="button" class="btn btn-primary" (click)="saveDiscount()" [disabled]="saving">
              {{ saving ? 'Saving...' : (editingDiscountId ? 'Save Changes' : 'Save Discount') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class DiscountsComponent implements OnInit {
  rules: any[] = [];
  catalogItems: any[] = [];

  showModal: boolean = false;
  saving: boolean = false;
  editingDiscountId: string | null = null;

  // Modal Form Fields
  formName: string = '';
  formType: 'percent' | 'flat' = 'percent';
  formValue: number | null = null;
  formAppliesTo: 'all' | 'selected' = 'all';
  formSelectedSkus: string[] = [];
  formStartDate: string = '';
  formEndDate: string = '';
  formIsActive: boolean = true;

  constructor(
    public auth: AuthService,
    private http: HttpClient,
    private catalogService: CatalogService
  ) {}

  ngOnInit() {
    this.loadDiscounts();
    this.loadCatalog();
  }

  loadDiscounts() {
    this.http.get<any[]>(`${environment.apiUrl}/discounts`).subscribe({
      next: (data) => {
        this.rules = data || [];
      },
      error: (err) => {
        console.error('Failed to load discounts from API:', err);
      }
    });
  }

  loadCatalog() {
    this.catalogItems = this.catalogService.items();
    this.http.get<any[]>(`${environment.apiUrl}/catalog/items`).subscribe({
      next: (items) => {
        if (items && items.length > 0) {
          this.catalogItems = items;
        }
      },
      error: () => {}
    });
  }

  openAddModal() {
    if (!this.auth.isAdmin()) {
      alert('Only Admin can create discounts.');
      return;
    }

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');

    this.editingDiscountId = null;
    this.formName = '';
    this.formType = 'percent';
    this.formValue = null;
    this.formAppliesTo = 'all';
    this.formSelectedSkus = [];
    this.formStartDate = `${yyyy}-${mm}-${dd}`;
    this.formEndDate = '';
    this.formIsActive = true;
    this.saving = false;

    this.showModal = true;
  }

  openEditModal(r: any) {
    if (!this.auth.isAdmin()) {
      alert('Only Admin can edit discounts.');
      return;
    }

    this.editingDiscountId = r.id;
    this.formName = r.name || '';
    this.formType = (r.type === 'flat' ? 'flat' : 'percent');
    this.formValue = r.value !== undefined ? r.value : null;
    this.formAppliesTo = (r.applies_to === 'selected' ? 'selected' : 'all');
    this.formSelectedSkus = Array.isArray(r.product_skus) ? [...r.product_skus] : [];
    this.formStartDate = r.start_date || '';
    this.formEndDate = r.end_date || '';
    this.formIsActive = (r.status === 'active');
    this.saving = false;

    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.editingDiscountId = null;
  }

  onBackdropClick(event: MouseEvent) {
    this.closeModal();
  }

  isSkuSelected(sku: string): boolean {
    return this.formSelectedSkus.includes(sku);
  }

  toggleSku(sku: string) {
    const idx = this.formSelectedSkus.indexOf(sku);
    if (idx >= 0) {
      this.formSelectedSkus.splice(idx, 1);
    } else {
      this.formSelectedSkus.push(sku);
    }
  }

  saveDiscount() {
    if (!this.formName || !this.formName.trim()) {
      alert('Please enter a discount name.');
      return;
    }

    const val = Number(this.formValue);
    if (this.formValue === null || isNaN(val) || val <= 0) {
      alert('Discount value must be greater than zero.');
      return;
    }

    if (this.formType === 'percent' && val > 100) {
      alert('Percentage discount cannot exceed 100%.');
      return;
    }

    if (this.formAppliesTo === 'selected' && this.formSelectedSkus.length === 0) {
      alert('Please select at least one product.');
      return;
    }

    if (this.formStartDate && this.formEndDate && this.formEndDate < this.formStartDate) {
      alert('End Date cannot be before Start Date.');
      return;
    }

    this.saving = true;

    const token = localStorage.getItem('pos_token');
    const user = this.auth.currentUser();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (user?.role) headers['X-User-Role'] = user.role;
    if (user?.username) headers['X-Username'] = user.username;

    const payload = {
      name: this.formName.trim(),
      type: this.formType,
      value: val,
      applies_to: this.formAppliesTo,
      product_skus: this.formAppliesTo === 'selected' ? this.formSelectedSkus : [],
      start_date: this.formStartDate || null,
      end_date: this.formEndDate || null,
      status: this.formIsActive ? 'active' : 'inactive'
    };

    if (this.editingDiscountId) {
      this.http.put<any>(`${environment.apiUrl}/discounts/${encodeURIComponent(this.editingDiscountId)}`, payload, { headers }).subscribe({
        next: (res) => {
          this.saving = false;
          this.closeModal();
          this.loadDiscounts();
        },
        error: (err) => {
          this.saving = false;
          console.error('Failed to update discount rule:', err);
          alert(err.error?.detail || 'Failed to update discount rule.');
        }
      });
    } else {
      this.http.post<any>(`${environment.apiUrl}/discounts`, payload, { headers }).subscribe({
        next: (res) => {
          this.saving = false;
          this.closeModal();
          this.loadDiscounts();
        },
        error: (err) => {
          this.saving = false;
          console.error('Failed to save discount rule:', err);
          alert(err.error?.detail || 'Failed to save discount rule.');
        }
      });
    }
  }
}

