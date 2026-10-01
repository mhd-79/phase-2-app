import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-stock-audit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-STK-004</span>
        <h1>Physical Stock Audit</h1>
        <p>Count stock on the shop floor (manually or by barcode scan) and reconcile against book quantity.</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" (click)="resetCounts()">Reset Counts</button>
      </div>
    </div>

    <div class="card card-flush">
      <div class="card-header">
        <h3>Cycle Count — All Items</h3>
        <span class="text-sm text-muted">Session date: 2026-09-07</span>
      </div>
      <div class="table-scroll">
        <table class="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th class="num">Book Qty</th>
              <th class="num">Counted Qty</th>
              <th class="num">Variance</th>
            </tr>
          </thead>
          <tbody>
            @for (item of auditItems; track item.sku) {
              <tr>
                <td>
                  {{ item.name }}
                  <div class="text-xs text-muted mono">{{ item.sku }}</div>
                </td>
                <td>{{ item.category }}</td>
                <td class="num mono">{{ item.bookQty }}</td>
                <td class="num">
                  <input class="input" type="number" min="0" [(ngModel)]="item.countedQty" (input)="onCountChange()" style="width:90px;text-align:right">
                </td>
                <td class="num mono" [style.color]="getVarianceColor(item)" [style.fontWeight]="item.countedQty - item.bookQty !== 0 ? '700' : '400'">
                  {{ (item.countedQty - item.bookQty) > 0 ? '+' : '' }}{{ item.countedQty - item.bookQty }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <div class="card-body row-between" style="border-top:1px solid var(--border)">
        <span class="text-muted"><span>{{ varianceCount() }}</span> line(s) with a variance</span>
        <button class="btn btn-primary btn-lg" (click)="postVariances()">Post Adjustments for Variances</button>
      </div>
    </div>
  `
})
export class StockAuditComponent implements OnInit {
  private api = inject(ApiService);

  auditItems: any[] = [];
  varianceCount = signal<number>(0);

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const catalog = await this.api.getCatalog();
    this.auditItems = catalog.map(i => ({
      sku: i.sku,
      name: i.name,
      category: i.category,
      bookQty: i.stock,
      countedQty: i.stock
    }));
    this.onCountChange();
  }

  onCountChange() {
    const count = this.auditItems.filter(i => (i.countedQty || 0) !== i.bookQty).length;
    this.varianceCount.set(count);
  }

  getVarianceColor(item: any): string {
    const diff = (item.countedQty || 0) - item.bookQty;
    if (diff === 0) return 'var(--text-muted)';
    return diff > 0 ? 'var(--success-700)' : 'var(--danger-700)';
  }

  resetCounts() {
    this.auditItems.forEach(i => i.countedQty = i.bookQty);
    this.onCountChange();
  }

  async postVariances() {
    const variances = this.auditItems.filter(i => (i.countedQty || 0) !== i.bookQty);
    if (variances.length === 0) return;

    await this.api.postAuditVariances(this.auditItems);
    await this.loadData();
  }
}
