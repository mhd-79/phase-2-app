import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { CatalogService } from "../../core/services/catalog.service";
import { CatalogItem } from "../../core/models/item.model";

@Component({
  selector: "app-stock-upload",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:24px;max-width:1000px;margin:0 auto">
      <div style="margin-bottom:24px">
        <h2>Bulk Item / Stock Upload (CSV)</h2>
        <p class="text-sm text-muted">Upload CSV to bulk update quantities or add new items</p>
      </div>

      <div class="card" style="padding:32px;text-align:center;border:2px dashed var(--color-border);margin-bottom:24px">
        <div style="font-size:40px;margin-bottom:12px">📁</div>
        <h3>Select or Drop CSV File</h3>
        <p class="text-sm text-muted" style="margin-bottom:16px">Format: sku, barcode, name, category, selling_price, opening_qty, tax_rate</p>
        <input type="file" (change)="onFileSelected($event)" accept=".csv" id="csvFileInput" style="display:none">
        <label for="csvFileInput" class="btn btn-primary" style="cursor:pointer">Browse CSV File</label>
      </div>

      <div class="card" *ngIf="parsedRows.length > 0">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:16px;border-bottom:1px solid var(--color-border)">
          <h3>Preview Validated Records ({{ parsedRows.length }})</h3>
          <button type="button" class="btn btn-primary" (click)="commitRows()">Commit to Inventory</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Category</th>
              <th class="num">Price (₹)</th>
              <th class="num">Qty</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let row of parsedRows">
              <td class="mono font-semibold">{{ row.sku }}</td>
              <td>{{ row.name }}</td>
              <td>{{ row.category }}</td>
              <td class="num mono">₹{{ row.price }}</td>
              <td class="num mono">{{ row.stock }}</td>
              <td><span class="badge badge-info">Ready</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class StockUploadComponent {
  catalog = inject(CatalogService);
  parsedRows: CatalogItem[] = [];

  onFileSelected(event: any): void {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter((l: string) => l.trim().length);
      if (lines.length < 2) return;
      const rows: CatalogItem[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = lines[i].split(",").map((s: string) => s.trim());
        if (c.length >= 4) {
          rows.push({
            sku: c[0],
            barcode: c[1] || "",
            name: c[2],
            category: c[3] || "Grocery",
            price: parseFloat(c[4]) || 0,
            stock: parseInt(c[5], 10) || 0,
            tax: parseFloat(c[6]) || 5,
            min: 5
          });
        }
      }
      this.parsedRows = rows;
    };
    reader.readAsText(file);
  }

  commitRows(): void {
    this.parsedRows.forEach(item => this.catalog.upsertItem(item));
    alert(`${this.parsedRows.length} items committed to inventory!`);
    this.parsedRows = [];
  }
}
