import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { DiscountRule } from "../../core/models/discount.model";

@Component({
  selector: "app-discounts",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:1000px;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px">
        <div>
          <h2>Discounts &amp; Promotional Rules</h2>
          <p class="text-sm text-muted">Configure cart-level and category promotions</p>
        </div>
        <button type="button" class="btn btn-primary" (click)="addRule()">+ Add Promotion Rule</button>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Promotion Name</th>
              <th>Type</th>
              <th class="num">Value</th>
              <th class="num">Min Spend (₹)</th>
              <th>Status</th>
              <th style="text-align:right">Action</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let rule of rules">
              <td style="font-weight:600">{{ rule.name }}</td>
              <td><span class="badge badge-info">{{ rule.type }}</span></td>
              <td class="num mono font-bold">{{ rule.type === 'PERCENT' ? rule.value + '%' : '₹' + rule.value }}</td>
              <td class="num mono">₹{{ rule.minSpend || 0 }}</td>
              <td>
                <span class="badge" [class.badge-success]="rule.isActive" [class.badge-danger]="!rule.isActive">
                  {{ rule.isActive ? 'Active' : 'Disabled' }}
                </span>
              </td>
              <td style="text-align:right">
                <button type="button" class="btn btn-ghost btn-sm" (click)="toggleActive(rule)">Toggle</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class DiscountsComponent {
  rules: DiscountRule[] = [
    { id: "disc-1", name: "Festival 10% Off", type: "PERCENT", value: 10, minSpend: 1000, isActive: true },
    { id: "disc-2", name: "Flat ₹50 Super Saver", type: "FLAT", value: 50, minSpend: 500, isActive: true },
    { id: "disc-3", name: "Beverage Bundle Promo", type: "CATEGORY", targetCategory: "Beverages", value: 15, isActive: false }
  ];

  toggleActive(rule: DiscountRule): void {
    rule.isActive = !rule.isActive;
  }

  addRule(): void {
    const name = prompt("Enter Promotion Name:", "Special Weekend Discount");
    if (name) {
      this.rules.push({
        id: `disc-${Date.now()}`,
        name,
        type: "PERCENT",
        value: 5,
        minSpend: 500,
        isActive: true
      });
    }
  }
}
