import { Component, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { BillingService } from "../../core/services/billing.service";
import { SaleTransaction } from "../../core/models/cart.model";

@Component({
  selector: "app-returns",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:1000px;margin:0 auto">
      <div style="margin-bottom:24px">
        <h2>Returns &amp; Refunds</h2>
        <p class="text-sm text-muted">Search previous invoice and process item returns</p>
      </div>

      <div class="card" style="padding:20px;margin-bottom:24px;display:flex;gap:12px">
        <input type="text" class="form-input mono" [(ngModel)]="searchInvoice" placeholder="Enter Invoice Number (e.g. INV-2026...)" style="flex:1">
        <button type="button" class="btn btn-primary" (click)="findInvoice()">Search Invoice</button>
      </div>

      <div class="card" *ngIf="matchedSale">
        <div style="display:flex;justify-content:space-between;padding:16px;border-bottom:1px solid var(--color-border)">
          <div>
            <h3>Invoice: {{ matchedSale.invoiceNo }}</h3>
            <div class="text-xs text-muted">{{ matchedSale.timestamp | date:'medium' }} &middot; Cashier: {{ matchedSale.cashierName }}</div>
          </div>
          <button type="button" class="btn btn-danger" (click)="refundInvoice()">Process Full Refund (₹{{ matchedSale.roundedTotal }})</button>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th>Item</th>
              <th class="num">Price (₹)</th>
              <th class="num">Qty Sold</th>
              <th class="num">Line Total (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let item of matchedSale.items">
              <td>{{ item.name }}</td>
              <td class="num mono">₹{{ item.price }}</td>
              <td class="num mono">{{ item.qty }}</td>
              <td class="num mono font-bold">₹{{ item.lineTotal }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class ReturnsComponent {
  billing = inject(BillingService);
  searchInvoice = "";
  matchedSale: SaleTransaction | null = null;

  findInvoice(): void {
    const found = this.billing.salesHistory().find(s => s.invoiceNo.toLowerCase() === this.searchInvoice.trim().toLowerCase());
    if (found) {
      this.matchedSale = found;
    } else {
      alert("Invoice not found");
      this.matchedSale = null;
    }
  }

  refundInvoice(): void {
    if (!this.matchedSale) return;
    if (confirm(`Confirm refund of ₹${this.matchedSale.roundedTotal}?`)) {
      this.matchedSale.status = "RETURNED";
      alert("Refund processed successfully!");
      this.matchedSale = null;
      this.searchInvoice = "";
    }
  }
}
