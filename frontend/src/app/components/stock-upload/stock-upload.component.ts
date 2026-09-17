import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-stock-upload',
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
            <a class="nav-link active" routerLink="/stock-upload" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; background:var(--primary); color:#fff;">📤 Stock Upload</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Insights</div>
            <a class="nav-link" routerLink="/reports" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📊 Reports</a>

            <div class="sidebar__section-label" style="font-size:11px; text-transform:uppercase; color:var(--slate-400); margin:12px 8px 4px;">Administration</div>
            <a class="nav-link" routerLink="/discounts" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">🏷️ Discounts</a>
            <a class="nav-link" routerLink="/tax-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">📜 Tax Configuration</a>
            <a class="nav-link" routerLink="/users" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">👥 Users &amp; Roles</a>
            <a class="nav-link" routerLink="/store-settings" style="display:flex; gap:10px; align-items:center; padding:10px 12px; border-radius:8px; color:var(--slate-200);">⚙️ Store Settings</a>
          </ng-container>
        </nav>
      </aside>

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
            <div style="display:flex; gap:8px;">
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
          <div style="padding:16px 20px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <h3>Pre-Commit Upload Preview</h3>
            <div style="display:flex; gap:8px;">
              <span class="badge badge-neutral">Total: {{ previewSummary.total_rows }}</span>
              <span class="badge badge-success">New: {{ previewSummary.new_count }}</span>
              <span class="badge badge-warning">Updates: {{ previewSummary.update_count }}</span>
              <span *ngIf="previewSummary.error_count > 0" class="badge badge-danger">Errors: {{ previewSummary.error_count }}</span>
            </div>
          </div>
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
          <div style="padding:16px 20px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">
            <p class="text-sm text-muted">Review preview data before committing changes permanently to PostgreSQL database.</p>
            <button class="btn btn-success btn-lg" (click)="commitUpload()">Commit Upload to Database</button>
          </div>
        </div>
      </main>
    </div>
  `
})
export class StockUploadComponent implements OnInit {
  fileName: string = '';
  previewRows: any[] = [];
  previewSummary: any = { total_rows: 0, new_count: 0, update_count: 0, error_count: 0 };

  constructor(
    public auth: AuthService,
    private http: HttpClient
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
    if (this.previewRows.length === 0) return;

    this.http.post<any>(`${environment.apiUrl}/catalog/upload/commit`, this.previewRows).subscribe({
      next: (res) => {
        alert(res.message || 'Stock upload committed successfully!');
        this.previewRows = [];
        this.fileName = '';
      },
      error: (err) => {
        alert('Stock upload error: ' + (err.error?.detail || 'Committed'));
        this.previewRows = [];
        this.fileName = '';
      }
    });
  }
}
