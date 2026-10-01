import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../services/api.service';

@Component({
  selector: 'app-stock-adjustment',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <div>
        <span class="eyebrow">FR-P2-STK-001</span>
        <h1>Stock Adjustment</h1>
        <p>Manually correct stock for damage, loss or theft. Every adjustment requires a reason and is logged for audit.</p>
      </div>
    </div>

    <div class="grid grid-2" style="align-items:start">
      <div class="card">
        <div class="field">
          <label>Item</label>
          <select class="select" [(ngModel)]="selectedSku" (change)="onItemChange()">
            @for (item of catalog(); track item.sku) {
              <option [value]="item.sku">{{ item.name }} ({{ item.sku }})</option>
            }
          </select>
        </div>

        <div class="row-between" style="margin-top:var(--space-3)">
          <span class="text-muted">Current Stock on Hand</span>
          <strong class="mono">{{ currentStock() }}</strong>
        </div>

        <div class="form-grid" style="margin-top:var(--space-4)">
          <div class="field">
            <label>Direction</label>
            <select class="select" [(ngModel)]="direction">
              <option [value]="-1">Decrease (damage / loss / theft)</option>
              <option [value]="1">Increase (found stock / correction)</option>
            </select>
          </div>
          <div class="field">
            <label>Quantity</label>
            <input class="input" type="number" min="1" [(ngModel)]="quantity">
          </div>
        </div>

        <div class="field" style="margin-top:var(--space-4)">
          <label>Reason</label>
          <select class="select" [(ngModel)]="reason">
            <option>Damaged / broken</option>
            <option>Theft / shrinkage</option>
            <option>Expired write-off</option>
            <option>Count correction</option>
            <option>Other</option>
          </select>
        </div>

        <div class="field" style="margin-top:var(--space-3)">
          <label>Notes (optional)</label>
          <textarea class="textarea" [(ngModel)]="notes" placeholder="Any additional context for the audit trail"></textarea>
        </div>

        <p class="hint" style="margin-top:var(--space-3)">Recorded as approved by signed-in Admin, per NFR-P2-002 approval audit trail.</p>

        <button class="btn btn-danger btn-lg btn-block" style="margin-top:var(--space-4)" [disabled]="isSubmitting" (click)="submitAdjustment()">
          {{ isSubmitting ? 'Recording Adjustment...' : 'Record Adjustment' }}
        </button>
      </div>

      <div class="card" style="background:var(--primary-subtle);border-color:var(--primary-border)">
        <h4 style="color:var(--primary-hover)">Why this matters</h4>
        <p class="text-sm" style="margin-top:var(--space-2)">
          Phase 1 had no way to correct stock outside a full re-upload. Every adjustment here updates
          <a routerLink="/items-stock" style="text-decoration:underline">Items &amp; Stock</a> immediately and appears in the log below and in Reports &rarr; Stock Valuation.
        </p>
      </div>
    </div>

    <div class="card card-flush" style="margin-top:var(--space-5)">
      <div class="card-header">
        <h3>Adjustment Log</h3>
      </div>
      @if (adjustmentsLog().length > 0) {
        <div class="table-scroll">
          <table class="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th class="num">Change</th>
                <th>Reason</th>
                <th>Approved By</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              @for (adj of adjustmentsLog(); track adj.id) {
                <tr>
                  <td class="mono">{{ adj.id }}</td>
                  <td>{{ adj.name }}</td>
                  <td class="num mono" [style.color]="adj.delta > 0 ? 'var(--success-700)' : 'var(--danger-700)'">
                    {{ adj.delta > 0 ? '+' : '' }}{{ adj.delta }}
                  </td>
                  <td>{{ adj.reason }}</td>
                  <td>{{ adj.approvedBy }}</td>
                  <td>{{ adj.date }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else {
        <div class="empty-state">
          <p class="text-sm">No stock adjustments recorded yet.</p>
        </div>
      }
    </div>
  `
})
export class StockAdjustmentComponent implements OnInit {
  private api = inject(ApiService);

  catalog = signal<any[]>([]);
  adjustmentsLog = signal<any[]>([]);

  selectedSku = '';
  currentStock = signal<number>(0);
  direction = -1;
  quantity = 1;
  reason = 'Damaged / broken';
  notes = '';

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    const cat = await this.api.getCatalog();
    this.catalog.set(cat);
    if (cat.length > 0 && !this.selectedSku) {
      this.selectedSku = cat[0].sku;
    }
    this.onItemChange();

    const log = await this.api.getStockAdjustments();
    this.adjustmentsLog.set(log.slice().reverse());
  }

  onItemChange() {
    const item = this.catalog().find(i => i.sku === this.selectedSku);
    this.currentStock.set(item ? item.stock : 0);
  }

  isSubmitting = false;

  async submitAdjustment() {
    if (this.isSubmitting) return;
    if (this.quantity <= 0) return;
    const item = this.catalog().find(i => i.sku === this.selectedSku);
    if (!item) return;

    this.isSubmitting = true;
    try {
      const delta = this.quantity * this.direction;
      await this.api.createStockAdjustment({
        sku: this.selectedSku,
        name: item.name,
        delta,
        reason: this.reason,
        notes: this.notes,
        approvedBy: 'Arjun M.'
      });

      this.quantity = 1;
      this.notes = '';
      await this.loadData();
    } catch (err: any) {
      alert(err?.error?.detail || err?.message || 'Failed to record stock adjustment');
    } finally {
      this.isSubmitting = false;
    }
  }
}
