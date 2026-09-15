import { Component } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-tax-settings",
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div style="padding:24px;max-width:800px;margin:0 auto">
      <div style="margin-bottom:24px">
        <h2>GST Tax Slabs Configuration</h2>
        <p class="text-sm text-muted">Configure active GST tax slabs for supermarket items</p>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Tax Slab Name</th>
              <th class="num">Rate (%)</th>
              <th class="num">CGST (%)</th>
              <th class="num">SGST (%)</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let slab of slabs">
              <td style="font-weight:600">{{ slab.name }}</td>
              <td class="num mono font-bold">{{ slab.rate }}%</td>
              <td class="num mono">{{ slab.rate / 2 }}%</td>
              <td class="num mono">{{ slab.rate / 2 }}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `
})
export class TaxSettingsComponent {
  slabs = [
    { name: "GST 0% (Essential / Exempt)", rate: 0 },
    { name: "GST 5% (Grocery / Staples)", rate: 5 },
    { name: "GST 12% (Processed Foods / Dairy)", rate: 12 },
    { name: "GST 18% (Personal Care / Confectionery)", rate: 18 },
    { name: "GST 28% (Luxury / Aerated Drinks)", rate: 28 }
  ];
}
