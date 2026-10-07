import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService, DEFAULT_TAX_SLABS, TaxSlab } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-tax-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-TAX-001 &middot; FR-P1-TAX-002</span>
          <h1>Tax Configuration</h1>
          <p>Configure tax rate slabs and toggle between Tax Inclusive or Exclusive pricing.</p>
        </div>
      </div>

      <div class="card" style="max-width:640px;margin-bottom:var(--space-6)">
        <h3>Global Pricing Tax Mode</h3>
        <p class="text-sm text-muted" style="margin-bottom:var(--space-4)">Choose whether product selling prices include GST or add GST on top at checkout.</p>
        
        <div class="stack">
          <label class="checkbox-row">
            <input type="radio" name="taxMode" value="exclusive" [(ngModel)]="pricingMode" (change)="saveMode()">
            <div>
              <strong>Tax Exclusive Pricing (Default)</strong>
              <div class="text-xs text-muted">Bill calculates taxable amount, then adds GST on top (e.g. ₹100 + 5% = ₹105).</div>
            </div>
          </label>

          <label class="checkbox-row">
            <input type="radio" name="taxMode" value="inclusive" [(ngModel)]="pricingMode" (change)="saveMode()">
            <div>
              <strong>Tax Inclusive Pricing</strong>
              <div class="text-xs text-muted">Tag prices already include GST. Internal tax breakup is extracted (e.g. ₹105 total contains ₹5 GST).</div>
            </div>
          </label>
        </div>
      </div>

      <div class="card card-flush" style="max-width:640px">
        <div class="card-header row-between">
          <h3>Configured Tax Slabs (GST)</h3>
          @if (auth.can('tax_config', 'create')) { <button class="btn btn-primary btn-sm" (click)="openAdd()">+ Add Slab</button> }
        </div>
        <table class="table">
          <thead>
            <tr><th>Slab Name</th><th>Rate (%)</th><th>CGST</th><th>SGST</th><th></th></tr>
          </thead>
          <tbody>
            @for (slab of slabs; track slab.id) {
              <tr>
                <td>{{ slab.name }}</td>
                <td class="mono">{{ slab.rate }}%</td>
                <td class="mono">{{ slab.cgst }}%</td>
                <td class="mono">{{ slab.sgst }}%</td>
                <td>
                  <div class="row" style="gap:var(--space-1)">
                    @if (auth.can('tax_config', 'edit')) { <button class="btn btn-ghost btn-sm" (click)="openEdit(slab)">Edit</button> }
                    @if (auth.can('tax_config', 'delete')) { <button class="btn btn-ghost btn-sm" style="color:var(--danger-700)" [disabled]="slabs.length <= 1" (click)="remove(slab)">Delete</button> }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
        @if (pageError) { <div class="card-body"><span class="text-sm" style="color:var(--danger-700)">{{ pageError }}</span></div> }
      </div>
    </main>

    <!-- Add / Edit slab -->
    @if (showModal) {
      <div class="modal-overlay open">
        <div class="modal modal-sm">
          <div class="modal-header">
            <h3>{{ editing ? 'Edit Tax Slab' : 'Add Tax Slab' }}</h3>
            <button class="icon-btn" (click)="showModal = false">✕</button>
          </div>
          <div class="modal-body stack">
            <div class="field">
              <label for="slabName">Slab Name</label>
              <input class="input" id="slabName" [(ngModel)]="formName" maxlength="60" placeholder="e.g. GST 3% (Jewellery)" (keyup.enter)="save()">
            </div>
            <div class="field">
              <label for="slabRate">GST Rate (%)</label>
              <input class="input mono" id="slabRate" type="number" min="0" max="100" step="0.01" [(ngModel)]="formRate" [disabled]="!!editing" placeholder="e.g. 3" (keyup.enter)="save()">
              @if (editing) {
                <span class="hint">The rate of an existing slab is fixed so the tax already saved on items stays correct. Add a new slab for a new rate.</span>
              } @else if (formRate !== null && formRate >= 0) {
                <span class="hint">CGST {{ formRate / 2 }}% + SGST {{ formRate / 2 }}%</span>
              }
            </div>
            @if (formError) { <span class="hint" style="color:var(--danger-700)">{{ formError }}</span> }
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" [disabled]="isSaving" (click)="showModal = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="isSaving" (click)="save()">{{ isSaving ? 'Saving...' : (editing ? 'Save Changes' : 'Add Slab') }}</button>
          </div>
        </div>
      </div>
    }
  `
})
export class TaxSettingsComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  pricingMode: 'exclusive' | 'inclusive' = 'exclusive';

  slabs: TaxSlab[] = DEFAULT_TAX_SLABS;
  pageError = '';
  showModal = false;
  editing: TaxSlab | null = null;
  formName = '';
  formRate: number | null = null;
  formError = '';
  isSaving = false;

  async loadSlabs() {
    this.slabs = await this.api.getTaxSlabs();
  }

  openAdd() {
    this.editing = null;
    this.formName = '';
    this.formRate = null;
    this.formError = '';
    this.showModal = true;
  }

  openEdit(slab: TaxSlab) {
    this.editing = slab;
    this.formName = slab.name;
    this.formRate = slab.rate;
    this.formError = '';
    this.showModal = true;
  }

  async remove(slab: TaxSlab) {
    this.pageError = '';
    const used = slab.itemCount ? `

${slab.itemCount} item(s) are priced at ${slab.rate}%. They keep that rate; only the slab is removed from the list.` : '';
    if (!confirm(`Delete the tax slab "${slab.name}"?${used}`)) return;
    try {
      await this.api.deleteTaxSlab(slab.id);
      await this.loadSlabs();
    } catch (err: any) {
      this.pageError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not delete the tax slab. Please try again.';
    }
  }

  async save() {
    if (this.isSaving) return;
    const name = this.formName.trim();
    if (!name) { this.formError = 'Enter a slab name'; return; }
    if (!this.editing && (this.formRate === null || this.formRate === undefined || isNaN(Number(this.formRate)) || this.formRate < 0 || this.formRate > 100)) {
      this.formError = 'Enter a GST rate between 0 and 100';
      return;
    }
    this.formError = '';
    this.isSaving = true;
    try {
      if (this.editing) await this.api.renameTaxSlab(this.editing.id, name);
      else await this.api.addTaxSlab(name, Number(this.formRate));
      this.showModal = false;
      await this.loadSlabs();
    } catch (err: any) {
      this.formError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not save the tax slab. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }

  async ngOnInit() {
    void this.loadSlabs();
    try {
      const raw = JSON.parse(localStorage.getItem('pos_demo_tax_settings') || '{}');
      if (raw.pricingMode) this.pricingMode = raw.pricingMode;
    } catch {}
  }

  saveMode() {
    localStorage.setItem('pos_demo_tax_settings', JSON.stringify({ pricingMode: this.pricingMode }));
  }
}
