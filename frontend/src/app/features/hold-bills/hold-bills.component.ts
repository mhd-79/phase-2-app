import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";
import { BillingService } from "../../core/services/billing.service";

@Component({
  selector: "app-hold-bills",
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:24px;max-width:1000px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <div>
          <h2>Held Bills</h2>
          <p class="text-sm text-muted">Recall or discard pending customer transactions</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="router.navigate(['/pos'])">Back to POS</button>
      </div>

      <div class="card" *ngIf="billing.heldBills().length > 0; else noBills">
        <table class="table">
          <thead>
            <tr>
              <th>Reference / Customer</th>
              <th>Held Time</th>
              <th>Cashier</th>
              <th class="num">Items</th>
              <th class="num">Total (₹)</th>
              <th style="text-align:right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let bill of billing.heldBills()">
              <td style="font-weight:600">{{ bill.referenceName }}</td>
              <td class="text-sm text-muted mono">{{ bill.savedAt }}</td>
              <td class="text-sm">{{ bill.cashier }}</td>
              <td class="num mono">{{ bill.itemCount }}</td>
              <td class="num mono font-bold">₹{{ bill.total.toFixed(2) }}</td>
              <td style="text-align:right">
                <button type="button" class="btn btn-primary btn-sm" (click)="recall(bill.id)" style="margin-right:8px">Recall Cart</button>
                <button type="button" class="btn btn-ghost btn-sm text-danger" (click)="discard(bill.id)">✕</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ng-template #noBills>
        <div class="card" style="text-align:center;padding:60px 20px;color:var(--color-text-muted)">
          <div style="font-size:48px;margin-bottom:12px">⏱️</div>
          <h3>No Held Bills</h3>
          <p class="text-sm">There are no held bills at this time. Hold a bill from the POS screen.</p>
        </div>
      </ng-template>
    </div>
  `
})
export class HoldBillsComponent {
  billing = inject(BillingService);
  router = inject(Router);

  recall(id: string): void {
    this.billing.recallHeldBill(id);
    this.router.navigate(["/pos"]);
  }

  discard(id: string): void {
    if (confirm("Are you sure you want to discard this held bill?")) {
      const remaining = this.billing.heldBills().filter(h => h.id !== id);
      this.billing.heldBills.set(remaining);
    }
  }
}
