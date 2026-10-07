import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, CatalogItem } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

import { DiscountRule, isDiscountLive, localToday } from '../../services/pricing';
export type { DiscountRule };

/** The sample rule of the original prototype. It is no longer shown or applied: discounts come from the database. */
export const DEFAULT_DISCOUNT_RULES: DiscountRule[] = [
  { id: 'DISC-101', name: 'Festive Weekend 10% Off', type: 'percent', value: 10, appliesTo: 'all', startDate: '2026-09-11', endDate: '', status: 'active', productSkus: [] }
];

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
          @if (auth.can('discounts', 'create')) { <button class="btn btn-primary" (click)="openAddModal()">+ Add Discount</button> }
        </div>
      </div>

      @if (loadError) { <div class="card" style="margin-bottom:var(--space-4);border-color:var(--danger-500)"><span class="text-sm" style="color:var(--danger-700)">{{ loadError }}</span></div> }
      @if (saveError && !showModal) { <div class="card" style="margin-bottom:var(--space-4);border-color:var(--danger-500)"><span class="text-sm" style="color:var(--danger-700)">{{ saveError }}</span></div> }
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
                    @if (d.status === 'active' && !isLive(d)) {
                      <div class="text-xs text-muted">{{ d.startDate && d.startDate > today ? 'Starts ' + d.startDate : 'Expired ' + d.endDate }}</div>
                    }
                  </td>
                  <td>
                    <div class="row" style="gap:var(--space-2)">
                      @if (auth.can('discounts', 'edit')) { <button class="btn btn-ghost btn-sm" (click)="openEditModal(d)">Edit</button> }
                      @if (auth.can('discounts', 'edit')) { <button class="btn btn-ghost btn-sm" (click)="toggleStatus(d)">{{ d.status === 'active' ? 'Deactivate' : 'Activate' }}</button> }
                      @if (auth.can('discounts', 'delete')) { <button class="btn btn-ghost btn-sm" style="color:var(--danger-700)" (click)="deleteRule(d.id)">Delete</button> }
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
              <div style="position:relative;margin-top:var(--space-2)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
                     style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                <input class="input" type="text" [(ngModel)]="productSearch" name="productSearch" placeholder="Search by product name or SKU"
                       style="padding-left:36px;padding-right:36px" aria-label="Search products">
                @if (productSearch) {
                  <button type="button" class="icon-btn" (click)="productSearch = ''" aria-label="Clear search"
                          style="position:absolute;right:4px;top:50%;transform:translateY(-50%);width:28px;height:28px;min-height:0">✕</button>
                }
              </div>
              <span class="hint">{{ (form.productSkus || []).length }} selected@if (productSearch.trim()) { &middot; {{ filteredProducts().length }} match "{{ productSearch.trim() }}" }</span>
              <div class="table-scroll" style="max-height:220px;border:1px solid var(--border);border-radius:var(--radius-md);margin-top:var(--space-2)">
                <table class="table">
                  <tbody>
                    @if (filteredProducts().length === 0) {
                      <tr><td class="text-sm text-muted" style="white-space:normal">No products match "{{ productSearch.trim() }}".</td></tr>
                    }
                    @for (item of filteredProducts(); track item.sku) {
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
          @if (saveError) { <span class="hint" style="color:var(--danger-700)">{{ saveError }}</span> }
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

  rules: DiscountRule[] = [];
  today = localToday();
  loadError = '';
  saveError = '';
  productSearch = '';

  /** Products matching the search box (name or SKU, as you type); everything when it is empty. Ticked products stay ticked while the list is filtered. */
  filteredProducts(): CatalogItem[] {
    const term = this.productSearch.trim().toLowerCase();
    if (!term) return this.catalog();
    return this.catalog().filter((i) => i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term));
  }

  isLive(d: DiscountRule): boolean {
    return isDiscountLive(d);
  }

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
    await this.loadRules();
  }

  /** Loads the discounts from the database; rules saved by older versions in this browser are moved there once. */
  async loadRules() {
    this.loadError = '';
    let list = await this.api.getDiscounts();
    if (list === null) {
      this.loadError = 'Could not load discounts from the server. Check your connection and refresh.';
      list = [];
    } else {
      list = await this.migrateBrowserRules(list);
    }
    this.rules = list;
  }

  /** Discounts created before Discount Management used the database only exist in this browser: save them to the database so Billing applies them. */
  private async migrateBrowserRules(current: DiscountRule[]): Promise<DiscountRule[]> {
    let old: DiscountRule[] = [];
    try { old = JSON.parse(localStorage.getItem('pos_demo_discounts') || '[]'); } catch {}
    const same = (a: DiscountRule, b: DiscountRule) => a.name.trim().toLowerCase() === b.name.trim().toLowerCase() && a.type === b.type && Number(a.value) === Number(b.value);
    // the prototype's sample rule is not a real discount; anything already in the database is not added twice
    const mine = old.filter(r => r.id !== 'DISC-101' && !current.some(c => same(c, r)));
    let retryLater = false;
    for (const r of mine) {
      try { await this.api.createDiscount(r); } catch (err: any) { if (!err?.status) retryLater = true; }   // a rejected rule is dropped; an unreachable server is retried next time
    }
    if (!retryLater) { try { localStorage.removeItem('pos_demo_discounts'); } catch {} }
    return mine.length ? ((await this.api.getDiscounts()) || current) : current;
  }

  scopeLabel(d: DiscountRule): string {
    if (d.appliesTo === 'all') return 'All Products';
    const count = (d.productSkus || []).length;
    return `Selected (${count} item${count === 1 ? '' : 's'})`;
  }

  openAddModal() {
    this.productSearch = '';
    this.saveError = '';
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
    this.productSearch = '';
    this.saveError = '';
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

  async toggleStatus(rule: DiscountRule) {
    this.saveError = '';
    try {
      await this.api.updateDiscount(rule.id, { ...rule, status: rule.status === 'active' ? 'inactive' : 'active' });
      await this.loadRules();
    } catch (err: any) {
      this.saveError = this.errorText(err, 'Could not change the discount status. Please try again.');
    }
  }

  async deleteRule(id: string) {
    if (!confirm('Delete this discount?')) return;
    this.saveError = '';
    try {
      await this.api.deleteDiscount(id);
      await this.loadRules();
    } catch (err: any) {
      this.saveError = this.errorText(err, 'Could not delete the discount. Please try again.');
    }
  }

  private errorText(err: any, fallback: string): string {
    const detail = err?.error?.detail;
    return typeof detail === 'string' ? detail : fallback;
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
    this.saveError = '';
    try {
      const rule: Partial<DiscountRule> = {
        name: this.form.name.trim(),
        type: this.form.type || 'percent',
        value: this.form.value || 0,
        appliesTo: this.form.appliesTo || 'all',
        productSkus: this.form.appliesTo === 'selected' ? this.form.productSkus : [],
        startDate: this.form.startDate || undefined,
        endDate: this.form.endDate || undefined,
        status: this.formIsActive ? 'active' : 'inactive'
      };
      if (this.editingId) await this.api.updateDiscount(this.editingId, rule);
      else await this.api.createDiscount(rule);
      this.showModal = false;
      await this.loadRules();
    } catch (err: any) {
      this.saveError = this.errorText(err, 'Could not save the discount. Please try again.');
    } finally {
      this.isSaving = false;
    }
  }
}
