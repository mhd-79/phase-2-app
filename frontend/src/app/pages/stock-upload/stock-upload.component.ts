import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ApiService, CatalogItem } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-stock-upload',
  standalone: true,
  imports: [CommonModule],
  template: `
    <main class="main">
      <div class="page-header">
        <div>
          <span class="eyebrow">FR-P1-STK-001 &middot; FR-P1-STK-006 &middot; FR-P2-STK-002</span>
          <h1>Bulk Item &amp; Stock Upload</h1>
          <p>Upload a CSV/Excel file to initialize or refresh stock. Nothing is committed until you review the preview below.</p>
        </div>
      </div>

      <div class="card" style="margin-bottom:var(--space-6)">
        <div class="row-between wrap" style="gap:var(--space-4);padding:var(--space-4)">
          <div class="row" style="gap:var(--space-4)">
            <div style="width:52px;height:52px;border-radius:var(--radius-md);background:var(--primary-subtle);display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--primary)"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>
            </div>
            <div>
              <h3>Upload a CSV/Excel file</h3>
              <p class="text-sm text-muted">Columns: SKU, Barcode, Batch No, Name, Category, Cost Price, Selling Price, Tax Rate, Opening Qty, Mfg Date, Exp Date</p>
            </div>
          </div>
          <div class="row wrap" style="gap:var(--space-2)">
            <button class="btn btn-secondary" (click)="downloadTemplate()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              Download Template
            </button>
            <button class="btn btn-secondary" (click)="loadSample()">Load Sample File</button>
            <label class="btn btn-primary" style="cursor:pointer">
              Choose File
              <input type="file" #fileInput (change)="onFileSelected($event)" accept=".csv" style="display:none">
            </label>
          </div>
        </div>
        @if (fileName) {
          <div style="padding:0 var(--space-4) var(--space-3)">
            <span class="badge badge-info">Loaded: {{ fileName }}</span>
          </div>
        }
      </div>

      @if (previewRows.length > 0) {
        <div class="card card-flush">
          <div class="card-header row-between">
            <h3>Change Preview</h3>
            <div class="row" style="gap:var(--space-3)">
              <span class="badge badge-info">{{ countNew }} New SKUs</span>
              <span class="badge badge-warning">{{ countUpdate }} Qty Updates</span>
              @if (countError > 0) {
                <span class="badge badge-danger">{{ countError }} Errors</span>
              }
            </div>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Barcode</th>
                  <th>Batch #</th>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th class="num">Cost</th>
                  <th class="num">Price</th>
                  <th class="num">Tax %</th>
                  <th class="num">Opening Qty</th>
                  <th>Exp Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                @for (r of previewRows; track $index) {
                  <tr>
                    <td class="mono">{{ r.row.sku }}</td>
                    <td class="mono text-xs">{{ r.row.barcode || '—' }}</td>
                    <td class="mono text-xs">{{ r.row.batch_no || '—' }}</td>
                    <td><strong>{{ r.row.name }}</strong></td>
                    <td>{{ r.row.category }}</td>
                    <td class="num mono">₹{{ r.row.cost_price }}</td>
                    <td class="num mono">₹{{ r.row.selling_price }}</td>
                    <td class="num">{{ r.row.tax_rate }}%</td>
                    <td class="num mono">{{ r.row.opening_qty }}</td>
                    <td class="mono text-xs">{{ r.row.exp_date || '—' }}</td>
                    <td>
                      <span class="badge" [class.badge-info]="r.status === 'new'" [class.badge-warning]="r.status === 'update'" [class.badge-danger]="r.status === 'error'">
                        {{ r.status === 'new' ? 'New Item' : (r.status === 'update' ? 'Qty Update' : 'Error') }}
                      </span>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="card-body row" style="justify-content:flex-end;border-top:1px solid var(--border)">
            <button class="btn btn-primary btn-lg" (click)="commitUpload()">Commit Stock Upload</button>
          </div>
        </div>
      }

      @if (successMsg) {
        <div class="card" style="margin-top:var(--space-6);background:var(--success-50);border-color:var(--success-500)">
          <h4 style="color:var(--success-700)">{{ successMsg }}</h4>
        </div>
      }
    </main>
  `
})
export class StockUploadComponent {
  api = inject(ApiService);
  auth = inject(AuthService);

  fileName: string | null = null;
  previewRows: any[] = [];
  countNew = 0;
  countUpdate = 0;
  countError = 0;
  successMsg: string | null = null;

  sampleCSV = `SKU,Barcode,Batch No,Name,Category,Cost Price,Selling Price,Tax Rate,Opening Qty,Mfg Date,Exp Date
BEV-005,8901030875069,BAT-2026-001,Lemon Iced Tea 500ml,Beverages,32,55,12,60,2026-01-15,2026-11-30
SNK-005,8901030876189,BAT-2026-002,Trail Mix 120g,Snacks,38,70,12,45,2026-02-10,2026-10-15
DAI-005,8901030877285,BAT-2026-003,Greek Yogurt 100g,Dairy,22,39,0,80,2026-03-01,2026-09-25
GRO-006,8901030879500,BAT-2026-004,Red Kidney Beans 500g,Grocery,48,89,5,36,2026-01-05,2027-01-05
PC-005,8901030880605,BAT-2026-005,Face Wash 100ml,Personal Care,72,149,18,25,2025-11-20,2027-11-20`;

  downloadTemplate() {
    const blob = new Blob([this.sampleCSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'items.sample.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  loadSample() {
    this.fileName = 'items.sample.csv';
    this.parseCSVText(this.sampleCSV);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => this.parseCSVText(e.target.result);
    reader.readAsText(file);
  }

  parseCSVText(text: string) {
    this.successMsg = null;
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ''));
    const catalog = this.api.getLocalCatalog();

    this.countNew = 0;
    this.countUpdate = 0;
    this.countError = 0;
    this.previewRows = [];

    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map((c) => c.trim());
      const row: any = {};
      headers.forEach((h, idx) => (row[h] = cells[idx] || ''));

      const sku = row['sku'] || '';
      const name = row['name'] || '';
      const barcode = row['barcode'] || '';
      const batchNo = row['batchno'] || row['batch'] || '';
      const category = row['category'] || 'Grocery';
      const costPrice = parseFloat(row['costprice'] || row['cost'] || '0') || 0;
      const sellingPrice = parseFloat(row['sellingprice'] || row['price'] || '0') || 0;
      const taxRate = parseFloat(row['taxrate'] || row['tax'] || '0') || 0;
      const openingQty = parseFloat(row['openingqty'] || row['qty'] || row['stock'] || '0') || 0;
      const mfgDate = row['mfgdate'] || '';
      const expDate = row['expdate'] || row['expirydate'] || '';

      const missing: string[] = [];
      if (!sku) missing.push('sku');
      if (!name) missing.push('name');

      const exists = catalog.some((c) => c.sku === sku);
      const status = missing.length ? 'error' : exists ? 'update' : 'new';

      if (status === 'new') this.countNew++;
      if (status === 'update') this.countUpdate++;
      if (status === 'error') this.countError++;

      this.previewRows.push({
        status,
        row: {
          sku,
          barcode,
          batch_no: batchNo,
          name,
          category,
          cost_price: costPrice,
          selling_price: sellingPrice,
          tax_rate: taxRate,
          opening_qty: openingQty,
          mfg_date: mfgDate,
          exp_date: expDate
        }
      });
    }
  }

  async commitUpload() {
    let count = 0;
    for (const r of this.previewRows) {
      if (r.status === 'error') continue;
      const item: CatalogItem = {
        sku: r.row.sku,
        barcode: r.row.barcode || '8900000000000',
        name: r.row.name,
        category: r.row.category || 'Grocery',
        price: r.row.selling_price,
        costPrice: r.row.cost_price,
        tax: r.row.tax_rate || 0,
        stock: r.row.opening_qty,
        min: 10,
        pricingMethod: 'qty',
        unit: 'pcs'
      };
      await this.api.saveItem(item);

      if (this.auth.hasPhase2() && r.row.batch_no && r.row.exp_date) {   // batch & expiry capture is a Phase 2 feature
        await this.api.saveBatch({
          sku: r.row.sku,
          name: r.row.name,
          batch_no: r.row.batch_no,
          mfg_date: r.row.mfg_date || '2026-01-01',
          expiry_date: r.row.exp_date,
          qty: r.row.opening_qty
        });
      }

      count++;
    }
    this.successMsg = this.auth.hasPhase2()
      ? `${count} item row(s) and associated batches committed to database successfully`
      : `${count} item row(s) committed to database successfully`;
    this.previewRows = [];
    this.fileName = null;
  }
}
