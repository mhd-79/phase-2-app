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
              <p class="text-sm text-muted">Columns: SKU, Barcode, Batch No, Name, Category, Cost Price, Selling Price, Wholesale Price, Tax Rate, Opening Qty, Mfg Date, Exp Date</p>
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
              <span class="badge badge-warning">{{ countUpdate }} Updates</span>
              @if (newCategories.length > 0) {
                <span class="badge badge-success" [attr.title]="newCategories.join(', ')">{{ newCategories.length }} New {{ newCategories.length === 1 ? 'Category' : 'Categories' }}</span>
              }
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
                  <th class="num">Wholesale</th>
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
                    <td class="num mono">{{ r.row.cost_price != null ? '₹' + r.row.cost_price : '—' }}</td>
                    <td class="num mono">{{ r.row.selling_price != null ? '₹' + r.row.selling_price : '—' }}</td>
                    <td class="num mono">{{ r.row.wholesale_price != null ? '₹' + r.row.wholesale_price : '—' }}</td>
                    <td class="num">{{ r.row.tax_rate != null ? r.row.tax_rate + '%' : '—' }}</td>
                    <td class="num mono">{{ r.row.opening_qty != null ? r.row.opening_qty : '—' }}</td>
                    <td class="mono text-xs">{{ r.row.exp_date || '—' }}</td>
                    <td>
                      <span class="badge" [attr.title]="r.reason || null" [class.badge-info]="r.status === 'new'" [class.badge-warning]="r.status === 'update'" [class.badge-danger]="r.status === 'error'">
                        {{ r.status === 'new' ? 'New Item' : (r.status === 'update' ? 'Update' : 'Error') }}
                      </span>
                      @if (r.status === 'error' && r.reason) { <div class="text-xs text-muted" style="max-width:200px;white-space:normal;margin-top:2px">{{ r.reason }}</div> }
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
  /** Items already in the database, keyed by SKU: those rows are updates, everything else is created. */
  private existingItems = new Map<string, CatalogItem>();
  /** Categories already in the database (lower-case name -> stored name) and the new ones this file will add. */
  private knownCategories = new Map<string, string>();
  newCategories: string[] = [];

  sampleCSV = `SKU,Barcode,Batch No,Name,Category,Cost Price,Selling Price,Wholesale Price,Tax Rate,Opening Qty,Mfg Date,Exp Date
BEV-005,8901030875069,BAT-2026-001,Lemon Iced Tea 500ml,Beverages,32,55,48,12,60,2026-01-15,2026-11-30
SNK-005,8901030876189,BAT-2026-002,Trail Mix 120g,Snacks,38,70,60,12,45,2026-02-10,2026-10-15
DAI-005,8901030877285,BAT-2026-003,Greek Yogurt 100g,Dairy,22,39,34,0,80,2026-03-01,2026-09-25
GRO-006,8901030879500,BAT-2026-004,Red Kidney Beans 500g,Grocery,48,89,78,5,36,2026-01-05,2027-01-05
PC-005,8901030880605,BAT-2026-005,Face Wash 100ml,Personal Care,72,149,128,18,25,2025-11-20,2027-11-20`;

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
    void this.parseCSVText(this.sampleCSV);
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.fileName = file.name;
    const reader = new FileReader();
    reader.onload = (e: any) => void this.parseCSVText(e.target.result);
    reader.readAsText(file);
  }

  async parseCSVText(text: string) {
    this.successMsg = null;
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;
    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ''));
    const catalog = await this.api.getCatalog();
    this.existingItems = new Map(catalog.map((c) => [c.sku, c]));
    this.knownCategories = new Map((await this.api.getCategories()).map((c) => [c.toLowerCase(), c]));
    this.newCategories = [];

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
      const rawCategory = (row['category'] || 'Grocery').trim();
      // Match an existing category regardless of letter case; anything else is a new category to be created on commit.
      let category: string = this.knownCategories.get(rawCategory.toLowerCase()) ?? '';
      if (!category) {
        category = this.newCategories.find((c) => c.toLowerCase() === rawCategory.toLowerCase()) ?? '';   // same new category spelled differently in this file
        if (!category) { category = rawCategory; this.newCategories.push(category); }
      }
      const costPrice = this.optionalNumber(row['costprice'] || row['cost']);
      const sellingPrice = this.optionalNumber(row['sellingprice'] || row['mrp'] || row['price']);
      const wholesalePrice = this.optionalNumber(row['wholesaleprice'] || row['wholesale']);
      const taxRate = this.optionalNumber(row['taxrate'] || row['tax'] || row['gst']);
      const openingQty = this.optionalNumber(row['openingqty'] || row['qty'] || row['quantity'] || row['stock']);
      const mfgRaw = row['mfgdate'] || '';
      const expRaw = row['expdate'] || row['expirydate'] || '';
      const mfgDate = this.toIsoDate(mfgRaw);
      const expDate = this.toIsoDate(expRaw);

      const missing: string[] = [];
      if (!sku) missing.push('sku');
      if (!name) missing.push('name');
      if (mfgRaw && !mfgDate) missing.push('Mfg Date');
      if (expRaw && !expDate) missing.push('Exp Date');
      if (mfgDate && expDate && expDate < mfgDate) missing.push('Exp Date before Mfg Date');

      const exists = this.existingItems.has(sku);
      const status = missing.length ? 'error' : exists ? 'update' : 'new';

      if (status === 'new') this.countNew++;
      if (status === 'update') this.countUpdate++;
      if (status === 'error') this.countError++;

      this.previewRows.push({
        status,
        reason: missing.length ? `Missing or invalid: ${missing.join(', ')}` : '',
        row: {
          sku,
          barcode,
          batch_no: batchNo,
          name,
          category,
          cost_price: costPrice,
          selling_price: sellingPrice,
          wholesale_price: wholesalePrice,
          tax_rate: taxRate,
          opening_qty: openingQty,
          mfg_date: mfgDate,
          exp_date: expDate
        }
      });
    }
  }

  /** Reads a date cell and returns YYYY-MM-DD, or '' when blank / not a real date. Accepts YYYY-MM-DD, DD-MM-YYYY (day first; falls back
   *  to month first when the day-first reading is impossible), DD-Mon-YYYY, Mon-YYYY (last day of that month), two-digit years,
   *  an Excel date number, and a trailing time part. */
  private toIsoDate(v: string | undefined): string {
    let s = (v || '').trim().replace(/^"|"$/g, '');
    if (!s) return '';
    s = s.replace(/[T ]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?Z?$/, '');
    const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
    const year = (t: string) => (t.length === 2 ? 2000 + +t : +t);
    const build = (y: number, m: number, d: number): string => {
      const dt = new Date(Date.UTC(y, m - 1, d));
      if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    };
    const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
    let m: RegExpMatchArray | null;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return build(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
      const y = year(m[3]);
      return build(y, +m[2], +m[1]) || build(y, +m[1], +m[2]);
    }
    if ((m = s.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ,]+(\d{2}|\d{4})$/)) && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
      return build(year(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
    }
    if ((m = s.match(/^([A-Za-z]{3,9})[-/ ,]+(\d{2}|\d{4})$/)) && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
      const y = year(m[2]); const mo = MONTHS[m[1].slice(0, 3).toLowerCase()];
      return build(y, mo, lastDay(y, mo));
    }
    if ((m = s.match(/^(\d{1,2})[-/](\d{4})$/)) && +m[1] >= 1 && +m[1] <= 12) return build(+m[2], +m[1], lastDay(+m[2], +m[1]));
    if (/^\d{5}$/.test(s)) {
      const d = new Date(Date.UTC(1899, 11, 30) + +s * 86400000);
      return build(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return '';
  }

  /** Readable reason from a failed save: a plain message, or the field errors of a 422 response. */
  private errorReason(err: any): string {
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) {
      return detail.map((d: any) => `${(d.loc || []).slice(1).join('.') || 'value'}: ${d.msg}`).join(', ');
    }
    return err?.status ? `server error ${err.status}` : 'could not be saved';
  }

  /** Blank / non-numeric cell -> null ("not provided"): for an existing item that value is left unchanged. */
  private optionalNumber(v: string | undefined): number | null {
    if (v === undefined || v.trim() === '') return null;
    const n = parseFloat(v);
    return isNaN(n) ? null : n;
  }

  async commitUpload() {
    let created = 0;
    let updated = 0;
    const failed: string[] = [];
    // New categories first, so the items below can be saved into them
    let categoriesAdded = 0;
    for (const name of this.newCategories) {
      if (this.previewRows.some((r) => r.status !== 'error' && r.row.category === name)) {
        try { await this.api.addCategory(name); categoriesAdded++; } catch { failed.push(`category ${name} (could not be created)`); }
      }
    }
    for (const r of this.previewRows) {
      if (r.status === 'error') continue;
      const existing = this.existingItems.get(r.row.sku);
      try {
        if (existing) {
          // Existing item: refresh quantity, selling price / MRP, cost, wholesale, tax % and dates. Provided values only; everything else stays as is.
          const item: CatalogItem = { ...existing };
          if (r.row.tax_rate != null) item.tax = r.row.tax_rate;
          if (r.row.mfg_date) item.mfgDate = r.row.mfg_date;
          if (r.row.exp_date) item.expDate = r.row.exp_date;
          if (r.row.opening_qty != null) item.stock = r.row.opening_qty;
          if (r.row.selling_price != null) item.price = r.row.selling_price;
          if (r.row.cost_price != null) item.costPrice = r.row.cost_price;
          if (r.row.wholesale_price != null) item.wholesalePrice = r.row.wholesale_price;
          await this.api.saveItem(item, true);
          updated++;
        } else {
          const item: CatalogItem = {
            sku: r.row.sku,
            barcode: r.row.barcode || '8900000000000',
            name: r.row.name,
            category: r.row.category || 'Grocery',
            price: r.row.selling_price ?? 0,
            costPrice: r.row.cost_price ?? 0,
            wholesalePrice: r.row.wholesale_price ?? undefined,
            tax: r.row.tax_rate ?? 0,
            stock: r.row.opening_qty ?? 0,
            min: 10,
            pricingMethod: 'qty',
            unit: 'pcs',
            mfgDate: r.row.mfg_date || null,
            expDate: r.row.exp_date && (!r.row.mfg_date || r.row.exp_date >= r.row.mfg_date) ? r.row.exp_date : null
          };
          await this.api.saveItem(item, false, true);
          created++;
        }
      } catch (err: any) {
        failed.push(`${r.row.sku} (${this.errorReason(err)})`);
        continue;
      }

      if (this.auth.hasPhase2() && r.row.batch_no && r.row.exp_date) {   // batch & expiry capture is a Phase 2 feature
        await this.api.saveBatch({
          sku: r.row.sku,
          name: r.row.name,
          batch_no: r.row.batch_no,
          mfg_date: r.row.mfg_date || '2026-01-01',
          expiry_date: r.row.exp_date,
          qty: r.row.opening_qty ?? 0
        });
      }
    }
    const summary = `${created} new item(s) created, ${updated} existing item(s) updated` + (categoriesAdded ? `, ${categoriesAdded} new categor${categoriesAdded === 1 ? 'y' : 'ies'} added` : '');
    this.successMsg = (this.auth.hasPhase2()
      ? `${summary}, and associated batches committed to database successfully`
      : `${summary} in the database successfully`) + (failed.length ? `. Not saved: ${failed.join('; ')}` : '');
    this.previewRows = [];
    this.newCategories = [];
    this.fileName = null;
  }
}
