import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div [class.main]="!embedded">
      @if (!embedded) {
        <div class="page-header">
          <div>
            <span class="eyebrow">FR-P2-CUS-001</span>
            <h1>Customer Management</h1>
            <p>Keep a customer master, bill to a customer, review purchase history and process returns against their invoices.</p>
          </div>
          <div class="page-actions">
            <button class="btn btn-primary" (click)="openAdd()">+ Add Customer</button>
          </div>
        </div>
      }

      <div class="card card-flush">
        <div class="card-header row-between" style="flex-wrap:wrap;gap:var(--space-3)">
          <div>
            <h3>Customers</h3>
            <span class="text-sm text-muted">{{ customers().length }} customer(s)</span>
          </div>
          <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
            <input class="input" type="text" placeholder="Search name, mobile or ID" [(ngModel)]="searchTerm" (ngModelChange)="onSearchChange()" style="width:230px">
            <select class="input" [(ngModel)]="typeFilter" (ngModelChange)="load()" style="width:150px">
              <option value="All">All Types</option>
              <option value="Retail">Retail</option>
              <option value="Wholesale">Wholesale</option>
            </select>
            @if (embedded) { <button class="btn btn-primary btn-sm" (click)="openAdd()">+ Add Customer</button> }
          </div>
        </div>
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr><th>Customer ID</th><th>Name</th><th>Mobile</th><th>Email</th><th>Address</th><th>Type</th><th></th></tr>
            </thead>
            <tbody>
              @for (c of customers(); track c.id) {
                <tr>
                  <td class="mono">{{ c.id }}</td>
                  <td><strong>{{ c.name }}</strong></td>
                  <td class="mono">{{ c.mobile }}</td>
                  <td>{{ c.email || '—' }}</td>
                  <td style="max-width:260px;white-space:normal">{{ c.address || '—' }}</td>
                  <td><span class="badge" [class.badge-info]="c.customerType === 'Retail'" [class.badge-warning]="c.customerType === 'Wholesale'">{{ c.customerType }}</span></td>
                  <td>
                    <div class="row" style="gap:var(--space-2);white-space:nowrap">
                      <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--primary)" (click)="openView(c)">View</button>
                      <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--text)" (click)="openEdit(c)">Edit</button>
                      <button class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--danger-700)" (click)="deleteCustomer(c)">Delete</button>
                    </div>
                  </td>
                </tr>
              }
              @if (customers().length === 0) {
                <tr><td colspan="7" class="text-center text-muted" style="padding:var(--space-4)">{{ loadError || 'No customers found.' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Add / Edit Customer Modal -->
    <div class="modal-overlay" [class.open]="showForm">
      <div class="modal">
        <div class="modal-header"><h3>{{ editingId ? 'Edit Customer' : 'Add Customer' }}</h3><button class="icon-btn" (click)="showForm = false">✕</button></div>
        <div class="modal-body stack">
          @if (editingId) {
            <div class="field"><label>Customer ID</label><input class="input mono" [value]="editingId" readonly></div>
          }
          <div class="field">
            <label for="cName">Name</label>
            <input class="input" id="cName" [(ngModel)]="form.name" maxlength="120" placeholder="Customer name">
          </div>
          <div class="field">
            <label for="cMobile">Mobile Number</label>
            <input class="input mono" id="cMobile" [(ngModel)]="form.mobile" inputmode="numeric" placeholder="10-digit mobile number">
          </div>
          <div class="field">
            <label for="cEmail">Email <span class="text-muted">(optional)</span></label>
            <input class="input" id="cEmail" type="email" [(ngModel)]="form.email" placeholder="name@example.com">
          </div>
          <div class="field">
            <label for="cAddress">Address <span class="text-muted">(optional)</span></label>
            <textarea class="input" id="cAddress" rows="2" [(ngModel)]="form.address"></textarea>
          </div>
          <div class="field">
            <label for="cType">Customer Type</label>
            <select class="select" id="cType" [(ngModel)]="form.customerType">
              <option value="Retail">Retail</option>
              <option value="Wholesale">Wholesale</option>
            </select>
          </div>
          @if (formError) { <span class="hint" style="color:var(--danger-700)">{{ formError }}</span> }
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="showForm = false">Cancel</button>
          <button class="btn btn-primary" [disabled]="isSaving" (click)="saveCustomer()">{{ isSaving ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Customer') }}</button>
        </div>
      </div>
    </div>

    <!-- Customer details + purchase history -->
    <div class="modal-overlay" [class.open]="showView">
      <div class="modal modal-lg">
        <div class="modal-header">
          <div>
            <h3>{{ viewCustomer?.name }}</h3>
            <div class="text-xs text-muted">{{ viewCustomer?.id }} &middot; {{ viewCustomer?.mobile }} &middot; {{ viewCustomer?.customerType }}@if (viewCustomer?.email) { &middot; {{ viewCustomer.email }} }</div>
            @if (viewCustomer?.address) { <div class="text-xs text-muted">{{ viewCustomer.address }}</div> }
          </div>
          <button class="icon-btn" (click)="showView = false">✕</button>
        </div>
        <div class="modal-body stack">
          @if (history(); as h) {
            <div class="grid grid-4" style="gap:var(--space-3)">
              <div class="card" style="background:var(--slate-50);padding:var(--space-3)"><div class="text-xs text-muted">Invoices</div><strong class="mono" style="font-size:var(--text-lg)">{{ h.summary.invoices }}</strong></div>
              <div class="card" style="background:var(--slate-50);padding:var(--space-3)"><div class="text-xs text-muted">Total Purchase</div><strong class="mono" style="font-size:var(--text-lg)">₹{{ h.summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></div>
              <div class="card" style="background:var(--slate-50);padding:var(--space-3)"><div class="text-xs text-muted">Avg Bill</div><strong class="mono" style="font-size:var(--text-lg)">₹{{ h.summary.avgBill.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></div>
              <div class="card" style="background:var(--slate-50);padding:var(--space-3)"><div class="text-xs text-muted">Refunded</div><strong class="mono" style="font-size:var(--text-lg);color:var(--danger-700)">₹{{ h.summary.refunded.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</strong></div>
            </div>
            <div class="card card-flush">
              <div class="card-header"><h3>Purchase History</h3></div>
              <div class="table-scroll" style="max-height:340px;overflow-y:auto">
                <table class="table">
                  <thead><tr><th>Invoice</th><th>Date / Time</th><th>Items</th><th class="num">Total</th><th>Payment</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    @for (inv of h.invoices; track inv.invoiceNo) {
                      <tr>
                        <td class="mono">{{ inv.invoiceNo }}</td>
                        <td>{{ inv.time | date:'dd MMM yyyy, HH:mm' }}</td>
                        <td style="white-space:normal">
                          @for (it of inv.items; track it.sku) { <div class="text-sm">{{ it.name }} &times; {{ it.qty }}</div> }
                        </td>
                        <td class="num mono">₹{{ inv.total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</td>
                        <td>{{ inv.paymentMethod }}</td>
                        <td>
                          <span class="badge" [class.badge-success]="inv.status === 'COMPLETED'" [class.badge-warning]="inv.status !== 'COMPLETED'">{{ inv.status === 'COMPLETED' ? 'Completed' : (inv.status === 'RETURNED' ? 'Returned' : 'Partially Returned') }}</span>
                          @if (inv.refunded > 0) { <div class="text-xs text-muted">Refunded ₹{{ inv.refunded.toFixed(2) }}</div> }
                        </td>
                        <td><a class="btn btn-ghost btn-xs" style="padding:0 4px;min-height:auto;font-weight:600;color:var(--primary)" routerLink="/returns" [queryParams]="{ invoice: inv.invoiceNo }" (click)="showView = false">Return Items</a></td>
                      </tr>
                    }
                    @if (h.invoices.length === 0) {
                      <tr><td colspan="7" class="text-center text-muted" style="padding:var(--space-4)">No purchases yet.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          } @else {
            <p class="text-sm text-muted">{{ historyError || 'Loading purchase history...' }}</p>
          }
        </div>
        <div class="modal-footer"><button class="btn btn-secondary" (click)="showView = false">Close</button></div>
      </div>
    </div>

    @if (toastMessage) {
      <div class="toast-stack"><div class="toast"><span class="dot dot-success"></span><span>{{ toastMessage }}</span></div></div>
    }
  `
})
export class CustomersComponent implements OnInit {
  private api = inject(ApiService);

  /** true when shown as a tab inside Reports (no page header, no page padding) */
  @Input() embedded = false;

  customers = signal<any[]>([]);
  searchTerm = '';
  typeFilter = 'All';
  loadError = '';
  private searchTimer: any = null;

  // add / edit
  showForm = false;
  editingId: string | null = null;
  form = { name: '', mobile: '', email: '', address: '', customerType: 'Retail' };
  formError = '';
  isSaving = false;

  // view
  showView = false;
  viewCustomer: any = null;
  history = signal<any | null>(null);
  historyError = '';

  toastMessage: string | null = null;

  async ngOnInit() {
    await this.load();
  }

  async load() {
    try {
      this.customers.set(await this.api.getCustomers(this.searchTerm, this.typeFilter));
      this.loadError = '';
    } catch (err: any) {
      this.customers.set([]);
      this.loadError = err?.status === 403 ? 'Only a Phase 2 admin can manage customers.' : 'Could not load customers. Please try again.';
    }
  }

  onSearchChange() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 250);
  }

  openAdd() {
    this.editingId = null;
    this.form = { name: '', mobile: '', email: '', address: '', customerType: 'Retail' };
    this.formError = '';
    this.showForm = true;
  }

  openEdit(c: any) {
    this.editingId = c.id;
    this.form = { name: c.name, mobile: c.mobile, email: c.email || '', address: c.address || '', customerType: c.customerType };
    this.formError = '';
    this.showForm = true;
  }

  async saveCustomer() {
    if (this.isSaving) return;
    if (!this.form.name.trim()) { this.formError = 'Please enter the customer name'; return; }
    if (!this.form.mobile.trim()) { this.formError = 'Please enter the mobile number'; return; }
    this.isSaving = true;
    this.formError = '';
    try {
      if (this.editingId) {
        await this.api.updateCustomer(this.editingId, this.form);
        this.triggerToast('Customer updated');
      } else {
        const created = await this.api.createCustomer(this.form);
        this.triggerToast(`Customer ${created.id} added`);
      }
      this.showForm = false;
      await this.load();
    } catch (err: any) {
      const detail = err?.error?.detail;
      this.formError = typeof detail === 'string' ? detail
        : Array.isArray(detail) && detail.length ? detail.map((d: any) => d.msg).join(', ') : 'Could not save the customer. Please try again.';
    } finally {
      this.isSaving = false;
    }
  }

  async deleteCustomer(c: any) {
    if (!confirm(`Delete ${c.name} (${c.id})? Their invoices stay on record with the customer name, but the customer is removed.`)) return;
    try {
      await this.api.deleteCustomer(c.id);
      this.triggerToast('Customer deleted');
      await this.load();
    } catch (err: any) {
      alert(typeof err?.error?.detail === 'string' ? err.error.detail : 'Could not delete the customer. Please try again.');
    }
  }

  async openView(c: any) {
    this.viewCustomer = c;
    this.history.set(null);
    this.historyError = '';
    this.showView = true;
    try {
      this.history.set(await this.api.getCustomerPurchases(c.id));
    } catch {
      this.historyError = 'Could not load the purchase history. Please try again.';
    }
  }

  triggerToast(msg: string) {
    this.toastMessage = msg;
    setTimeout(() => { if (this.toastMessage === msg) this.toastMessage = null; }, 3000);
  }
}
