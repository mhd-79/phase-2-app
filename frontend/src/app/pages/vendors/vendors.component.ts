import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

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
        <button class="btn btn-primary" (click)="showModal = true">+ Add Vendor</button>
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
                  <a class="btn btn-ghost btn-sm" [routerLink]="['/vendor-detail']" [queryParams]="{ vendor: v.id }">View Ledger</a>
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
            <h3>Add Vendor</h3>
            <button class="icon-btn" (click)="showModal = false">✕</button>
          </div>
          <div class="modal-body stack">
            <div class="field">
              <label>Vendor Name</label>
              <input class="input" [(ngModel)]="newVendor.name" placeholder="e.g. Hillside Organics">
            </div>
            <div class="form-grid">
              <div class="field">
                <label>Category</label>
                <input class="input" [(ngModel)]="newVendor.category" placeholder="e.g. Grocery">
              </div>
              <div class="field">
                <label>Payment Terms</label>
                <select class="select" [(ngModel)]="newVendor.terms">
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
                <input class="input" [(ngModel)]="newVendor.contact" placeholder="e.g. Neha Verma">
              </div>
              <div class="field">
                <label>Phone</label>
                <input class="input" [(ngModel)]="newVendor.phone" placeholder="+91">
              </div>
            </div>
            <div class="field">
              <label>Email</label>
              <input class="input" [(ngModel)]="newVendor.email" placeholder="name@vendor.in">
            </div>
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

  vendors = signal<any[]>([]);
  filteredVendors = signal<any[]>([]);
  totalPayables = signal<number>(0);
  activePoCount = signal<number>(0);

  searchQuery = '';
  showModal = false;
  isSaving = false;

  newVendor = {
    name: '',
    category: 'Grocery',
    terms: 'Net 30',
    contact: '',
    phone: '',
    email: ''
  };

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
    const activeCount = pos.filter((p: any) => p.status !== 'Closed' && p.status !== 'Received').length;
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
    if (!this.newVendor.name.trim()) return;
    this.isSaving = true;
    try {
      await this.api.createVendor({
        name: this.newVendor.name.trim(),
        category: this.newVendor.category.trim() || 'General',
        terms: this.newVendor.terms,
        contact: this.newVendor.contact.trim() || '—',
        phone: this.newVendor.phone.trim() || '—',
        email: this.newVendor.email.trim() || '—'
      });
      this.showModal = false;
      this.newVendor = { name: '', category: 'Grocery', terms: 'Net 30', contact: '', phone: '', email: '' };
      await this.loadData();
    } finally {
      this.isSaving = false;
    }
  }
}
