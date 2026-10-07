import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-vendors',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-PUR-001</span>
        <h1>Vendors</h1>
        <p>Vendor master with contact details, payment terms and running payable balance.</p>
      </div>
      <div class="page-actions">
        @if (auth.can('vendors', 'create')) { <button class="btn btn-primary" (click)="openAdd()">+ Add Vendor</button> }
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:var(--space-5)">
      <div class="card stat-card">
        <span class="stat-label">Total Vendors</span>
        <span class="stat-value">{{ vendors().length }}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-label">Total Payables Outstanding</span>
        <span class="stat-value" style="color:var(--warning-700)">₹{{ totalPayables().toLocaleString('en-IN') }}</span>
      </div>
      <div class="card stat-card">
        <span class="stat-label">Active Purchase Orders</span>
        <span class="stat-value">{{ activePoCount() }}</span>
      </div>
    </div>

    <div class="card card-flush">
      <div class="card-header">
        <h3>Vendor Master</h3>
        <input class="input" [(ngModel)]="searchQuery" (input)="onSearch()" placeholder="Search vendor or category" style="width:240px">
      </div>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Category</th>
              <th>Contact</th>
              <th>Terms</th>
              <th class="num">Payable</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            @for (v of filteredVendors(); track v.id) {
              <tr>
                <td>
                  <strong>{{ v.name }}</strong>
                  <div class="text-xs text-muted mono">{{ v.id }}</div>
                  @if (v.gstin) { <div class="text-xs text-muted mono">GSTIN {{ v.gstin }}</div> }
                </td>
                <td>{{ v.category }}</td>
                <td>
                  {{ v.contact }}
                  <div class="text-xs text-muted">{{ v.phone }}</div>
                </td>
                <td>{{ v.terms }}</td>
                <td class="num mono">₹{{ v.payable.toLocaleString('en-IN') }}</td>
                <td>
                  <span class="badge" [ngClass]="v.status === 'Active' ? 'badge-success' : 'badge-neutral'">{{ v.status }}</span>
                </td>
                <td>
                  <div class="row" style="gap:var(--space-1)">
                    <a class="btn btn-ghost btn-sm" [routerLink]="['/vendor-detail']" [queryParams]="{ vendor: v.id }">View Ledger</a>
                    @if (auth.can('vendors', 'edit')) { <button class="btn btn-ghost btn-sm" (click)="openEdit(v)">Edit</button> }
                    @if (auth.can('vendors', 'edit')) { <button class="btn btn-ghost btn-sm" (click)="toggleStatus(v)">{{ v.status === 'Active' ? 'Deactivate' : 'Activate' }}</button> }
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>

    <!-- Add Vendor Modal -->
    @if (showModal) {
      <div class="modal-overlay open">
        <div class="modal">
          <div class="modal-header">
            <h3>{{ editId ? 'Edit Vendor' : 'Add Vendor' }}</h3>
            <button class="icon-btn" (click)="showModal = false">✕</button>
          </div>
          <div class="modal-body stack">
            <div class="field">
              <label>Vendor Name</label>
              <input class="input" [(ngModel)]="form.name" placeholder="e.g. Hillside Organics">
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Category</label>
                <input class="input" [(ngModel)]="form.category" placeholder="e.g. Grocery">
              </div>
              <div class="field">
                <label>Payment Terms</label>
                <select class="select" [(ngModel)]="form.terms">
                  <option>Net 7</option>
                  <option>Net 15</option>
                  <option>Net 30</option>
                  <option>Net 45</option>
                  <option>Due on Delivery</option>
                </select>
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Contact Person</label>
                <input class="input" [(ngModel)]="form.contact" placeholder="e.g. Neha Verma">
              </div>
              <div class="field">
                <label>Phone</label>
                <input class="input" [(ngModel)]="form.phone" placeholder="+91">
              </div>
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Email</label>
                <input class="input" [(ngModel)]="form.email" placeholder="name@vendor.in">
              </div>
              <div class="field">
                <label>GSTIN</label>
                <input class="input mono" [(ngModel)]="form.gstin" maxlength="15" placeholder="e.g. 29ABCDE1234F1Z5" style="text-transform:uppercase">
              </div>
            </div>
            @if (formError) { <span class="hint" style="color:var(--danger-700)">{{ formError }}</span> }
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" [disabled]="isSaving" (click)="showModal = false">Cancel</button>
            <button class="btn btn-primary" [disabled]="isSaving" (click)="saveVendor()">
              {{ isSaving ? 'Saving...' : 'Save Vendor' }}
            </button>
          </div>
        </div>
      </div>
    }
  `
})
export class VendorsComponent implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);

  vendors = signal<any[]>([]);
  filteredVendors = signal<any[]>([]);
  totalPayables = signal<number>(0);
  activePoCount = signal<number>(0);

  searchQuery = '';
  showModal = false;
  isSaving = false;

  editId: string | null = null;
  formError = '';
  form = this.blankForm();

  private blankForm() {
    return { name: '', category: 'Grocery', terms: 'Net 30', contact: '', phone: '', email: '', gstin: '' };
  }

  openAdd() {
    this.editId = null;
    this.form = this.blankForm();
    this.formError = '';
    this.showModal = true;
  }

  openEdit(v: any) {
    this.editId = v.id;
    const blank = (x: string) => (x && x !== '—' ? x : '');
    this.form = { name: v.name, category: v.category, terms: v.terms, contact: blank(v.contact), phone: blank(v.phone), email: blank(v.email), gstin: v.gstin || '' };
    this.formError = '';
    this.showModal = true;
  }

  async toggleStatus(v: any) {
    const next = v.status === 'Active' ? 'Inactive' : 'Active';
    if (next === 'Inactive' && !confirm(`Deactivate ${v.name}? They will no longer be offered when creating purchase orders or receiving stock.`)) return;
    try {
      await this.api.updateVendor(v.id, { status: next });
      await this.loadData();
    } catch (err: any) {
      alert(typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not change the vendor status. Please try again.');
    }
  }

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const list = await this.api.getVendors();
    this.vendors.set(list);
    this.onSearch();

    const sum = list.reduce((s: number, v: any) => s + (v.payable || 0), 0);
    this.totalPayables.set(sum);

    const pos = await this.api.getPurchaseOrders();
    const activeCount = pos.filter((p: any) => !['Received', 'Closed', 'Cancelled'].includes(p.status)).length;
    this.activePoCount.set(activeCount);
  }

  onSearch() {
    const term = this.searchQuery.trim().toLowerCase();
    if (!term) {
      this.filteredVendors.set(this.vendors());
    } else {
      this.filteredVendors.set(
        this.vendors().filter(v =>
          v.name.toLowerCase().includes(term) || v.category.toLowerCase().includes(term)
        )
      );
    }
  }

  async saveVendor() {
    if (this.isSaving) return;
    if (!this.form.name.trim()) { this.formError = 'Enter the vendor name'; return; }
    const gstin = this.form.gstin.trim().toUpperCase();
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) { this.formError = 'Enter a valid 15-character GSTIN (e.g. 29ABCDE1234F1Z5)'; return; }
    this.formError = '';
    this.isSaving = true;
    try {
      const body = {
        name: this.form.name.trim(),
        category: this.form.category.trim() || 'General',
        terms: this.form.terms,
        contact: this.form.contact.trim() || '—',
        phone: this.form.phone.trim() || '—',
        email: this.form.email.trim() || '—',
        gstin
      };
      if (this.editId) await this.api.updateVendor(this.editId, body);
      else await this.api.createVendor(body);
      this.showModal = false;
      await this.loadData();
    } catch (err: any) {
      this.formError = typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not save the vendor. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }
}
