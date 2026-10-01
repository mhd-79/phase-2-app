import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CatalogItem } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

export interface DiscountRule {
  id: string;
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  appliesTo: 'all' | 'selected';
  productSkus?: string[];
  startDate?: string;
  endDate?: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-discounts',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-DISC-001..004</span>
          <h1>Discount Management</h1>
          <p>Configure percentage or fixed-amount discounts. The POS applies active, in-date discounts automatically.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-primary" (click)="openAddModal()">+ Add Discount</button>
        </div>
      </div>

      <div class="card card-flush">
        <div class="card-header"><h3>Discounts</h3></div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th class="num">Value</th>
                <th>Applies To</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @if (rules.length === 0) {
                <tr><td colspan="8" class="empty-state"><p class="text-sm">No discounts configured yet. Admins can add one with "+ Add Discount".</p></td></tr>
              }
              @for (d of rules; track d.id) {
                <tr>
                  <td><strong>{{ d.name }}</strong></td>
                  <td>{{ d.type === 'percent' ? 'Percentage' : 'Fixed Amount' }}</td>
                  <td class="num mono">{{ d.type === 'percent' ? d.value + '%' : '₹' + d.value.toFixed(2) }}</td>
                  <td>{{ scopeLabel(d) }}</td>
                  <td>{{ d.startDate || '—' }}</td>
                  <td>{{ d.endDate || '—' }}</td>
                  <td>
                    <span class="badge" [class.badge-success]="d.status === 'active'" [class.badge-neutral]="d.status !== 'active'">
                      {{ d.status === 'active' ? 'Active' : 'Inactive' }}
                    </span>
                  </td>
                  <td>
                    <div class="row" style="gap:var(--space-2)">
                      <button class="btn btn-ghost btn-sm" (click)="openEditModal(d)">Edit</button>
                      <button class="btn btn-ghost btn-sm" (click)="toggleStatus(d)">{{ d.status === 'active' ? 'Deactivate' : 'Activate' }}</button>
                      <button class="btn btn-ghost btn-sm" style="color:var(--danger-700)" (click)="deleteRule(d.id)">Delete</button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- ================= ADD / EDIT DISCOUNT MODAL ================= -->
    <div class="modal-overlay" [class.open]="showModal">
      <div class="modal modal-lg">
        <div class="modal-header">
          <h3>{{ editingId ? 'Edit Discount' : 'Add Discount' }}</h3>
          <button class="icon-btn" (click)="showModal = false">✕</button>
        </div>
        <div class="modal-body stack">
          <div class="field">
            <label for="dName">Discount Name</label>
            <input class="input" id="dName" [(ngModel)]="form.name" placeholder="e.g. Festive Weekend 10% Off">
          </div>

          <div class="form-grid">
            <div class="field">
              <label>Discount Type</label>
              <div class="row" style="gap:var(--space-4);min-height:var(--tap-min)">
                <label class="checkbox-row"><input type="radio" name="dType" value="percent" [(ngModel)]="form.type"> Percentage (%)</label>
                <label class="checkbox-row"><input type="radio" name="dType" value="fixed" [(ngModel)]="form.type"> Fixed Amount (₹)</label>
              </div>
            </div>
            <div class="field">
              <label for="dValue">Discount Value</label>
              <input class="input" id="dValue" type="number" min="0" step="0.01" [(ngModel)]="form.value" placeholder="e.g. 10">
            </div>
          </div>

          <div class="field">
            <label>Applicable Products</label>
            <div class="row" style="gap:var(--space-4);min-height:var(--tap-min)">
              <label class="checkbox-row"><input type="radio" name="dScope" value="all" [(ngModel)]="form.appliesTo"> All Products</label>
              <label class="checkbox-row"><input type="radio" name="dScope" value="selected" [(ngModel)]="form.appliesTo"> Selected Products</label>
            </div>
            @if (form.appliesTo === 'selected') {
              <div class="table-scroll" style="max-height:220px;border:1px solid var(--border);border-radius:var(--radius-md);margin-top:var(--space-2)">
                <table class="table">
                  <tbody>
                    @for (item of catalog(); track item.sku) {
                      <tr>
                        <td style="white-space:normal">
                          <label class="checkbox-row">
                            <input type="checkbox" [checked]="isProductSelected(item.sku)" (change)="toggleProductSelection(item.sku)">
                            {{ item.name }} <span class="text-xs text-muted">({{ item.sku }})</span>
                          </label>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>

          <div class="form-grid">
            <div class="field"><label for="dStart">Start Date</label><input class="input" id="dStart" type="date" [(ngModel)]="form.startDate"></div>
            <div class="field"><label for="dEnd">End Date</label><input class="input" id="dEnd" type="date" [(ngModel)]="form.endDate"></div>
          </div>

          <div class="field">
            <label>Status</label>
            <label class="checkbox-row"><input type="checkbox" [(ngModel)]="formIsActive"> Active</label>
            <span class="hint">Only Admin can create, edit, activate, deactivate or delete discounts. Cashiers see the configured value at POS but cannot change it.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showModal = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isSaving" (click)="saveDiscount()">
            {{ isSaving ? 'Saving...' : 'Save Discount' }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class DiscountsComponent implements OnInit {
  api = inject(ApiService);
  auth = inject(AuthService);

  catalog = signal<CatalogItem[]>([]);
  showModal = false;
  editingId: string | null = null;

  rules: DiscountRule[] = [
    { id: 'DISC-101', name: 'Festive Weekend 10% Off', type: 'percent', value: 10, appliesTo: 'all', startDate: '2026-09-11', endDate: '', status: 'active', productSkus: [] }
  ];

  form: Partial<DiscountRule> = {
    name: '',
    type: 'percent',
    value: 10,
    appliesTo: 'all',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: '',
    productSkus: []
  };

  formIsActive = true;

  async ngOnInit() {
    const items = await this.api.getCatalog();
    this.catalog.set(items);
    const saved = localStorage.getItem('pos_demo_discounts');
    if (saved) {
      try { this.rules = JSON.parse(saved); } catch {}
    }
  }

  saveRulesToStorage() {
    localStorage.setItem('pos_demo_discounts', JSON.stringify(this.rules));
  }

  scopeLabel(d: DiscountRule): string {
    if (d.appliesTo === 'all') return 'All Products';
    const count = (d.productSkus || []).length;
    return `Selected (${count} item${count === 1 ? '' : 's'})`;
  }

  openAddModal() {
    this.editingId = null;
    this.form = {
      name: '',
      type: 'percent',
      value: 10,
      appliesTo: 'all',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      productSkus: []
    };
    this.formIsActive = true;
    this.showModal = true;
  }

  openEditModal(d: DiscountRule) {
    this.editingId = d.id;
    this.form = { ...d, productSkus: [...(d.productSkus || [])] };
    this.formIsActive = d.status === 'active';
    this.showModal = true;
  }

  isProductSelected(sku: string): boolean {
    return (this.form.productSkus || []).includes(sku);
  }

  toggleProductSelection(sku: string) {
    const current = this.form.productSkus || [];
    if (current.includes(sku)) {
      this.form.productSkus = current.filter((s) => s !== sku);
    } else {
      this.form.productSkus = [...current, sku];
    }
  }

  toggleStatus(rule: DiscountRule) {
    rule.status = rule.status === 'active' ? 'inactive' : 'active';
    this.saveRulesToStorage();
  }

  deleteRule(id: string) {
    this.rules = this.rules.filter((d) => d.id !== id);
    this.saveRulesToStorage();
  }

  isSaving = false;

  async saveDiscount() {
    if (this.isSaving) return;
    if (!this.form.name?.trim()) {
      alert('Enter a discount name');
      return;
    }
    if (!(this.form.value! > 0)) {
      alert('Discount value must be greater than zero');
      return;
    }
    if (this.form.type === 'percent' && this.form.value! > 100) {
      alert('Percentage discount cannot exceed 100%');
      return;
    }
    if (this.form.appliesTo === 'selected' && (!this.form.productSkus || this.form.productSkus.length === 0)) {
      alert('Select at least one product');
      return;
    }

    this.isSaving = true;
    try {
      const id = this.editingId || `DISC-${Date.now()}`;
      const rule: DiscountRule = {
        id,
        name: this.form.name.trim(),
        type: this.form.type || 'percent',
        value: this.form.value || 0,
        appliesTo: this.form.appliesTo || 'all',
        productSkus: this.form.appliesTo === 'selected' ? this.form.productSkus : [],
        startDate: this.form.startDate || undefined,
        endDate: this.form.endDate || undefined,
        status: this.formIsActive ? 'active' : 'inactive'
      };

      if (this.editingId) {
        const idx = this.rules.findIndex((r) => r.id === id);
        if (idx > -1) this.rules[idx] = rule;
      } else {
        this.rules.push(rule);
      }

      this.saveRulesToStorage();
      this.showModal = false;
    } finally {
      this.isSaving = false;
    }
  }
}
