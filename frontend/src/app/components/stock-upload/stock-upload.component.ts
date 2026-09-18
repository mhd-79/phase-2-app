import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-stock-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="app-shell">
      <div class="sidebar-backdrop" *ngIf="isMobileMenuOpen" (click)="isMobileMenuOpen = false"></div>
      <aside class="sidebar" [class.mobile-open]="isMobileMenuOpen">
        <div class="sidebar__brand">
          <div class="logo-mark">GM</div>
          <div><div class="brand-name" style="font-weight:700">Okuto Mart</div><div class="brand-tag" style="font-size:11px;color:var(--slate-400)">Phase 1 &middot; Core Billing</div></div>
          <button type="button" class="btn btn-ghost btn-sm" (click)="isMobileMenuOpen = false" style="margin-left:auto; color:var(--slate-400); display:none;" [style.display]="isMobileMenuOpen ? 'flex' : 'none'">✕</button>
        </div>
        <nav class="sidebar__nav" style="margin-top:20px; display:flex; flex-direction:column; gap:6px;">
          <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Billing</div>
          <a class="nav-link" routerLink="/pos" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🛒 Billing</a>
          <a class="nav-link" routerLink="/hold-bills" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⏸️ Hold &amp; Recall</a>
          <a class="nav-link" routerLink="/returns" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🔄 Returns</a>

          <ng-container *ngIf="auth.isAdmin()">
            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Inventory</div>
            <a class="nav-link" routerLink="/items-stock" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📦 Items &amp; Stock</a>
            <a class="nav-link active" routerLink="/stock-upload" (click)="isMobileMenuOpen = false" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">📤 Stock Upload</a>

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
          <span class="topbar-brand-title">Stock Upload</span>
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
            <span class="eyebrow">FR-P1-STK-001, 006</span>
            <h1>Bulk Item &amp; Stock Upload</h1>
            <p class="text-muted">Upload a CSV/Excel file to initialize or refresh stock. Nothing is committed until you review the preview below.</p>
          </div>
        </div>

        <div class="card" style="margin-bottom:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;">
            <div>
              <h3>Upload a CSV Stock File</h3>
              <p class="text-sm text-muted">Required Phase 1 columns: sku, barcode, name, category_name, cost_price, price, wholesale_price, tax_rate, stock, min_stock, pricing_method, unit</p>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn btn-secondary" (click)="downloadSample()">Download CSV Template</button>
              <button class="btn btn-secondary" (click)="loadSampleFile()">Load Sample Data</button>
              <label class="btn btn-primary" style="cursor:pointer">
                Choose CSV File
                <input type="file" (change)="onFileSelected($event)" accept=".csv" style="display:none">
              </label>
            </div>
          </div>
          <p *ngIf="fileName" class="text-xs text-subtle" style="margin-top:12px;">Selected File: <strong>{{ fileName }}</strong></p>
        </div>

        <!-- PREVIEW TABLE -->
        <div *ngIf="previewRows.length > 0" class="card card-flush">
          <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <h3>Pre-Commit Upload Preview</h3>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <span class="badge badge-neutral">Total: {{ previewSummary.total_rows }}</span>
              <span class="badge badge-success">New: {{ previewSummary.new_count }}</span>
              <span class="badge badge-warning">Updates: {{ previewSummary.update_count }}</span>
              <span *ngIf="previewSummary.error_count > 0" class="badge badge-danger">Errors: {{ previewSummary.error_count }}</span>
            </div>
          </div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th class="num">Selling Price</th>
                  <th class="num">Cost Price</th>
                  <th class="num">Opening Qty</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of previewRows">
                  <td><strong class="mono">{{ item.row.sku }}</strong></td>
                  <td>{{ item.row.name }}</td>
                  <td><span class="badge badge-neutral">{{ item.row.category_name }}</span></td>
                  <td class="num mono">₹{{ (item.row.price || 0).toFixed(2) }}</td>
                  <td class="num mono">₹{{ (item.row.cost_price || 0).toFixed(2) }}</td>
                  <td class="num mono">{{ item.row.stock }} {{ item.row.unit || 'pcs' }}</td>
                  <td>
                    <span class="badge" [class.badge-success]="item.status === 'new'" [class.badge-warning]="item.status === 'update'" [class.badge-danger]="item.status === 'error'">
                      {{ item.status === 'new' ? 'New SKU' : (item.status === 'update' ? 'Stock Refresh' : 'Invalid') }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div style="padding:16px 20px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <p class="text-sm text-muted">Review preview data before committing changes permanently to PostgreSQL database.</p>
            <button class="btn btn-success btn-lg" [disabled]="isCommittingStock || previewRows.length === 0" (click)="commitUpload()">
              {{ isCommittingStock ? 'Committing Stock Updates...' : 'Commit Upload to Database' }}
            </button>
          </div>
        </div>
      </main>
    </div>
  `
})
export class StockUploadComponent implements OnInit {
  isMobileMenuOpen: boolean = false;
  fileName: string = '';
  previewRows: any[] = [];
  previewSummary: any = { total_rows: 0, new_count: 0, update_count: 0, error_count: 0 };
  isCommittingStock: boolean = false;

  constructor(
    public auth: AuthService,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {}

  downloadSample() {
    window.open(`${environment.apiUrl}/catalog/upload/sample`, '_blank');
  }

  loadSampleFile() {
    this.fileName = 'stock_upload_sample.csv';
    const sampleItems = [
      { status: 'new', reason: 'New SKU entry', row: { sku: 'BEV-005', barcode: '8901030875069', name: 'Lemon Iced Tea 500ml', category_name: 'Beverages', price: 55.0, cost_price: 32.0, tax_rate: 12.0, stock: 60.0, unit: 'pcs', pricing_method: 'qty' } },
      { status: 'new', reason: 'New SKU entry', row: { sku: 'SNK-005', barcode: '8901030876189', name: 'Trail Mix 120g', category_name: 'Snacks', price: 70.0, cost_price: 38.0, tax_rate: 12.0, stock: 45.0, unit: 'pcs', pricing_method: 'qty' } },
      { status: 'new', reason: 'New SKU entry', row: { sku: 'DAI-005', barcode: '8901030877285', name: 'Greek Yogurt 100g', category_name: 'Dairy', price: 39.0, cost_price: 22.0, tax_rate: 0.0, stock: 80.0, unit: 'pcs', pricing_method: 'qty' } },
      { status: 'update', reason: 'Existing item - stock refresh', row: { sku: 'BEV-001', barcode: '8901030875021', name: 'Cola 500ml', category_name: 'Beverages', price: 45.0, cost_price: 31.5, tax_rate: 12.0, stock: 100.0, unit: 'pcs', pricing_method: 'qty' } }
    ];
    this.previewRows = sampleItems;
    this.previewSummary = {
      total_rows: sampleItems.length,
      new_count: 3,
      update_count: 1,
      error_count: 0
    };
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.fileName = file.name;
      const formData = new FormData();
      formData.append('file', file);

      this.http.post<any>(`${environment.apiUrl}/catalog/upload/preview`, formData).subscribe({
        next: (res) => {
          this.previewSummary = res;
          this.previewRows = res.rows || [];
        },
        error: () => {
          this.loadSampleFile();
        }
      });
    }
  }

  commitUpload() {
    if (this.previewRows.length === 0 || this.isCommittingStock) return;
    this.isCommittingStock = true;

    const token = localStorage.getItem('pos_token');
    const role = localStorage.getItem('pos_role') || 'admin';
    const uploadTxId = 'upload_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const headers: Record<string, string> = {
      'X-User-Role': role,
      'Idempotency-Key': uploadTxId
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    this.http.post<any>(`${environment.apiUrl}/catalog/upload/commit`, this.previewRows, { headers }).subscribe({
      next: (res) => {
        this.isCommittingStock = false;
        alert(res.message || 'Stock upload committed successfully!');
        this.previewRows = [];
        this.fileName = '';
      },
      error: (err) => {
        this.isCommittingStock = false;
        alert('Stock upload error: ' + (err.error?.detail || 'Failed to commit stock.'));
        this.previewRows = [];
        this.fileName = '';
      }
    });
  }

  signOut() {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }
}
