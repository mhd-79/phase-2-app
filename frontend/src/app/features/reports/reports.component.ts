import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { BillingService } from "../../core/services/billing.service";
import { CatalogService } from "../../core/services/catalog.service";

@Component({
  selector: "app-reports",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:24px;max-width:1100px;margin:0 auto">
      <div style="margin-bottom:24px">
        <h2>Reports &amp; Z-Report (End of Day)</h2>
        <p class="text-sm text-muted">Daily reconciliation, sales volume, and transaction history</p>
      </div>

      <!-- METRIC TILES -->
      <div style="display:grid;grid-template-columns:repeat(4, 1fr);gap:16px;margin-bottom:24px">
        <div class="card" style="padding:16px">
          <div class="text-xs text-muted">TOTAL SALES (TODAY)</div>
          <div class="mono font-bold" style="font-size:24px;color:var(--color-primary);margin-top:4px">₹{{ totalSalesAmount().toFixed(2) }}</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="text-xs text-muted">TRANSACTIONS</div>
          <div class="mono font-bold" style="font-size:24px;margin-top:4px">{{ billing.salesHistory().length }}</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="text-xs text-muted">TOTAL TAX COLLECTED</div>
          <div class="mono font-bold" style="font-size:24px;margin-top:4px">₹{{ totalTaxCollected().toFixed(2) }}</div>
        </div>
        <div class="card" style="padding:16px">
          <div class="text-xs text-muted">LOW STOCK ITEMS</div>
          <div class="mono font-bold" style="font-size:24px;color:var(--color-warning);margin-top:4px">{{ catalog.lowStockCount() }}</div>
        </div>
      </div>

      <!-- TRANSACTION HISTORY -->
      <div class="card">
        <div style="padding:16px;border-bottom:1px solid var(--color-border)">
          <h3>Recent Invoices</h3>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Invoice No</th>
              <th>Timestamp</th>
              <th>Cashier</th>
              <th class="num">Items</th>
              <th class="num">Grand Total (₹)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let s of billing.salesHistory()">
              <td class="mono font-semibold">{{ s.invoiceNo }}</td>
              <td class="text-sm text-muted mono">{{ s.timestamp | date:'short' }}</td>
              <td>{{ s.cashierName }}</td>
              <td class="num mono">{{ s.items.length }}</td>
              <td class="num mono font-bold">₹{{ s.roundedTotal.toFixed(2) }}</td>
              <td><span class="badge badge-success">{{ s.status }}</span></td>
            </tr>
            <tr *ngIf="billing.salesHistory().length === 0">
              <td colspan="6" style="text-align:center;color:var(--color-text-muted);padding:30px">No sales recorded today yet.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class ReportsComponent {
  billing = inject(BillingService);
  catalog = inject(CatalogService);

  totalSalesAmount(): number {
    return this.billing.salesHistory().reduce((sum, s) => sum + s.roundedTotal, 0);
  }

  totalTaxCollected(): number {
    return this.billing.salesHistory().reduce((sum, s) => sum + s.taxTotal, 0);
  }
}
